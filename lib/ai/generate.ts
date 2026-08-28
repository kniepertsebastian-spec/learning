import type { ZodType } from "zod";
import { OPENAI_MODEL, getOpenAIClient } from "@/lib/openai";

export class AIGenerationError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AIGenerationError";
  }
}

function extractJson(text: string): string {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return text;
  return text.slice(start, end + 1);
}

async function requestJson(systemPrompt: string, userPrompt: string): Promise<string> {
  const client = getOpenAIClient();
  const response = await client.chat.completions.create({
    model: OPENAI_MODEL,
    max_completion_tokens: 16000,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const text = response.choices[0]?.message?.content;
  if (!text) {
    throw new AIGenerationError("ChatGPT hat keine Textantwort zurückgegeben.");
  }
  return text;
}

const JSON_ONLY_INSTRUCTION =
  "\n\nAntworte AUSSCHLIESSLICH mit validem JSON, ohne Markdown-Codeblöcke und ohne Erklärtext davor oder danach.";

/**
 * Fordert von ChatGPT striktes JSON an und validiert es gegen ein Zod-Schema.
 * Bei fehlerhafter Ausgabe (kein valides JSON oder Schema-Verstoß) wird einmal
 * eine Reparatur-Anfrage gestellt, bevor endgültig ein AIGenerationError geworfen wird.
 */
export async function generateStructured<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: ZodType<T>,
): Promise<T> {
  const jsonSystemPrompt = `${systemPrompt}${JSON_ONLY_INSTRUCTION}`;
  let rawText = await requestJson(jsonSystemPrompt, userPrompt);

  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(rawText));
    } catch (err) {
      if (attempt === maxAttempts) {
        throw new AIGenerationError("KI-Antwort konnte nicht als JSON geparst werden.", err);
      }
      rawText = await requestJson(
        jsonSystemPrompt,
        `Deine vorherige Antwort war kein valides JSON:\n${rawText}\n\nBitte antworte erneut ausschließlich mit validem JSON für folgende Anfrage:\n${userPrompt}`,
      );
      continue;
    }

    const result = schema.safeParse(parsed);
    if (result.success) return result.data;

    if (attempt === maxAttempts) {
      throw new AIGenerationError(
        `KI-Antwort entspricht nicht dem erwarteten Schema: ${result.error.message}`,
      );
    }
    rawText = await requestJson(
      jsonSystemPrompt,
      `Deine vorherige Antwort erfüllte das erwartete Schema nicht (${result.error.message}):\n${rawText}\n\nBitte korrigiere sie und antworte erneut ausschließlich mit validem JSON für folgende Anfrage:\n${userPrompt}`,
    );
  }

  throw new AIGenerationError("KI-Antwort konnte nicht verarbeitet werden.");
}
