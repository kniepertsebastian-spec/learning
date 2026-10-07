import { GoogleGenAI } from "@google/genai";
import { resolveAiAccess } from "@/lib/server/company/ai-settings";

/** Die Firma hat keinen nutzbaren KI-Zugang. Die Meldung ist für die Firma bestimmt. */
export class AiAccessUnavailableError extends Error {}

const REASONS: Record<"not_configured" | "key_missing" | "key_unreadable", string> = {
  not_configured: "Für die Firma ist noch kein KI-Zugang eingerichtet (Firmenbereich, KI-Zugang).",
  key_missing: "Für den eigenen Schlüssel ist keiner hinterlegt (Firmenbereich, KI-Zugang).",
  key_unreadable: "Der gespeicherte Schlüssel ist nicht lesbar. Bitte neu eingeben (Firmenbereich, KI-Zugang).",
};

/**
 * Der Client, mit dem für diese Firma generiert wird: ihr eigener Schlüssel (BYOK) oder, bei "unser Zugang", der
 * Plattform-Client (`undefined` = Standard). Der Schlüssel lebt nur für diesen Lauf im Speicher und wird nie
 * protokolliert.
 */
export async function clientForOrganization(organizationId: string): Promise<GoogleGenAI | undefined> {
  const access = await resolveAiAccess(organizationId);
  if (access.kind === "none") throw new AiAccessUnavailableError(REASONS[access.reason]);
  if (access.kind === "byok") return new GoogleGenAI({ apiKey: access.apiKey });
  if (!process.env.GEMINI_API_KEY) {
    throw new AiAccessUnavailableError("Unser KI-Zugang ist derzeit nicht verfügbar. Bitte später erneut versuchen.");
  }
  return undefined;
}
