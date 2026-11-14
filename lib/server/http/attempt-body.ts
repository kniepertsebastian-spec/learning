import { NextResponse } from "next/server";
import { z } from "zod";
import { ANSWER_CONFIDENCES } from "@/lib/answer-confidence";
import { MAX_MATCHING_PAIRS, MAX_ORDERING_STEPS } from "@/lib/questions/answer-formats";
import { BodyTooLargeError, readJsonCapped } from "./capped-body";

/**
 * Gemeinsame Prüfung für die Abgabe-Routen (Aufgabe 04a, Review 12.11.2026): Lektionstest, Kapitel-Quiz, Sitzung, Notausstieg,
 * Wiederholung und Prüfung. Vorher wurde der Body mit `as` in den erwarteten Typ gegossen: ungültiges JSON oder falsche Typen
 * endeten als 500, und anders als `/api/sync` gab es keine Größengrenze.
 *
 * Die Schemas prüfen Form und Typen, nicht den Inhalt: ob eine Frage oder Option existiert, entscheidet der Service. Unbekannte
 * Felder werden verworfen.
 */

/** Größter angenommener Body. Eine Sitzung hat einige Dutzend Antworten zu je unter 1 KB, die Grenze liegt weit darüber. */
export const MAX_ATTEMPT_BODY_BYTES = 256 * 1024;
export const MAX_ANSWERS_PER_ATTEMPT = 500;

const id = z.string().min(1).max(100);
/** Auswahlantworten senden die Option, die neuen Formate lassen sie leer. */
const optionId = z.string().max(100).default("");

/** Form der Antwort bei den neuen Formaten. Längen bewusst großzügig: kürzen und verwerfen macht `sanitizeAnswer` beim Auswerten. */
const answerPayload = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ordering"), order: z.array(z.string().max(1000)).max(MAX_ORDERING_STEPS * 4) }),
  z.object({ kind: z.literal("short_answer"), text: z.string().max(5000) }),
  z.object({ kind: z.literal("matching"), matches: z.record(z.string().max(1000), z.string().max(1000)).refine((m) => Object.keys(m).length <= MAX_MATCHING_PAIRS * 4, "zu viele Zuordnungen") }),
]);

const confidence = z.enum(ANSWER_CONFIDENCES);

const answerFields = {
  selectedOptionId: optionId,
  answer: answerPayload.nullish(),
  confidence: confidence.optional(),
  thinkFirst: z.boolean().optional(),
  /** ISO-Zeitpunkt vom Gerät; nur im Sync-Pfad ausgewertet. */
  answeredAt: z.string().max(40).optional(),
  /**
   * Zeit bis zur Antwort in ms (Aufgabe 06a/06b), roh vom Client. Fehlt bei älteren Clients. Ein unbrauchbarer Wert kostet nicht
   * die Antwort: er entfällt. Die Grenzen 300 ms bis 10 Minuten setzt `recordReviewOutcomes`.
   */
  responseTimeMs: z.number().min(0).optional().catch(undefined),
};

/** Antwort einer Sitzung (`StudySessionAnswerInput`). */
export const studySessionAnswerSchema = z.object({ itemId: id, ...answerFields });
/** Antwort eines Lektionstests oder Kapitel-Quiz (`SectionQuizAnswerInput`). */
export const sectionAnswerSchema = z.object({ questionId: id, ...answerFields, woven: z.boolean().optional() });

const list = <T extends z.ZodType>(schema: T) => z.array(schema).max(MAX_ANSWERS_PER_ATTEMPT);

/** POST /api/study-sessions/:id/attempt */
export const studySessionAttemptBody = z.object({ answers: list(studySessionAnswerSchema).default([]) });
/** POST /api/study-sessions/:id/exit */
export const studySessionExitBody = z.object({ answers: list(studySessionAnswerSchema).default([]), openItemId: id.nullish() });
/** POST /api/sections/:id/attempt und /api/chapters/:id/attempt */
export const sectionAttemptBody = z.object({ answers: list(sectionAnswerSchema) });
/** POST /api/sections/:id/exit */
export const sectionExitBody = z.object({ answers: list(sectionAnswerSchema).default([]), openQuestionId: id.nullish() });
/** POST /api/remediation/:id/attempt */
export const remediationAttemptBody = z.object({
  sessionId: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  answers: z.array(z.object({ questionIndex: z.number().int().min(0).max(1000), selectedOptionIndex: z.number().int().min(-1).max(1000) })).max(200),
});

export type BodyResult<T> = { ok: true; data: T } | { ok: false; response: NextResponse };

function tooLarge(): NextResponse {
  return NextResponse.json({ error: "Anfrage zu groß." }, { status: 413 });
}

function invalid(): NextResponse {
  return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
}

/** Liest den Body als JSON mit Obergrenze (auch ohne Content-Length). Zu groß: 413, kein gültiges JSON: 400. */
export async function readAttemptJson(request: Request): Promise<BodyResult<unknown>> {
  try {
    return { ok: true, data: await readJsonCapped(request, MAX_ATTEMPT_BODY_BYTES) };
  } catch (error) {
    if (error instanceof BodyTooLargeError) return { ok: false, response: tooLarge() };
    return { ok: false, response: invalid() };
  }
}

/** Wie `readAttemptJson`, dazu die Prüfung gegen ein Schema. Falsche Form oder falsche Typen: 400. */
export async function parseAttemptBody<S extends z.ZodType>(request: Request, schema: S): Promise<BodyResult<z.output<S>>> {
  const json = await readAttemptJson(request);
  if (!json.ok) return json;
  const parsed = schema.safeParse(json.data);
  return parsed.success ? { ok: true, data: parsed.data } : { ok: false, response: invalid() };
}
