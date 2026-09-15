import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { syncEvents, type SyncEventStatus, type SyncEventType } from "@/lib/server/db/schema";
import {
  recordSectionQuizAttempt,
  SectionNotFoundError,
  type SectionQuizAnswerInput,
} from "@/lib/server/sections/attempt-service";
import {
  completeStudySession,
  StudySessionNotActiveError,
  StudySessionNotFoundError,
  type StudySessionAnswerInput,
} from "@/lib/server/study/session-service";

export interface SyncEventInput {
  clientEventId: string;
  type: SyncEventType;
  clientCreatedAt: string;
  payload: unknown;
}

export interface SyncEventResult {
  clientEventId: string;
  status: SyncEventStatus | "already_applied";
  resultSummary?: unknown;
  error?: string;
}

interface SectionQuizPayload {
  sectionId: string;
  answers: SectionQuizAnswerInput[];
}

interface StudySessionPayload {
  sessionId: string;
  answers: StudySessionAnswerInput[];
}

/**
 * R4.3 (roadmap.md): wendet eine Charge offline aufgezeichneter Ereignisse
 * an. Jedes Ereignis wird EINZELN und idempotent verarbeitet (siehe
 * syncEvents-Tabellenkommentar in lib/server/db/schema.ts) - ein Fehler bei
 * einem Ereignis darf die übrigen nicht blockieren.
 */
export async function processSyncEvents(
  userId: string,
  events: SyncEventInput[],
): Promise<SyncEventResult[]> {
  const results: SyncEventResult[] = [];
  for (const event of events) {
    results.push(await processSingleEvent(userId, event));
  }
  return results;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

/**
 * "Insert-first, apply-second": der Unique-Index (userId, clientEventId)
 * wird als Lock benutzt, NICHT nur als nachträglicher Dedup-Check - sonst
 * könnten zwei gleichzeitige Sync-Anfragen (z. B. das automatische
 * Sync-bei-`online` UND ein manueller Klick kurz danach) dasselbe Ereignis
 * beide anwenden, bevor eine von beiden fertig geschrieben hat. Die
 * "Claim"-Zeile wird VOR der eigentlichen Logik eingefügt; verliert eine
 * Anfrage den Unique-Constraint-Wettlauf, wendet sie das Ereignis gar nicht
 * erst an, sondern meldet einen transienten Fehler (Client versucht es
 * gleich erneut - dann greift der already_applied-Pfad oben).
 */
async function processSingleEvent(userId: string, event: SyncEventInput): Promise<SyncEventResult> {
  const db = getDb();

  const [existing] = await db
    .select()
    .from(syncEvents)
    .where(and(eq(syncEvents.userId, userId), eq(syncEvents.clientEventId, event.clientEventId)))
    .limit(1);
  if (existing) {
    return {
      clientEventId: event.clientEventId,
      status: existing.status === "applied" ? "already_applied" : existing.status,
      resultSummary: existing.resultSummary,
      error: existing.errorMessage ?? undefined,
    };
  }

  let claimId: string;
  try {
    const [claimed] = await db
      .insert(syncEvents)
      .values({
        userId,
        clientEventId: event.clientEventId,
        type: event.type,
        status: "error",
        clientCreatedAt: new Date(event.clientCreatedAt),
        errorMessage: "wird verarbeitet",
      })
      .returning({ id: syncEvents.id });
    claimId = claimed.id;
  } catch (error) {
    if (isUniqueViolation(error)) {
      return {
        clientEventId: event.clientEventId,
        status: "error",
        error: "Wird bereits von einer anderen Anfrage synchronisiert - bitte erneut versuchen.",
      };
    }
    throw error;
  }

  try {
    const resultSummary = await applyEvent(userId, event);
    await db
      .update(syncEvents)
      .set({ status: "applied", resultSummary, errorMessage: null })
      .where(eq(syncEvents.id, claimId));
    return { clientEventId: event.clientEventId, status: "applied", resultSummary };
  } catch (error) {
    // "Konflikte nach Ereigniszeit und Serverstatus nachvollziehbar lösen":
    // ein Konflikt (Session anderswo bereits abgeschlossen) oder eine
    // eindeutig ungültige Referenz (Session/Section nicht mehr vorhanden)
    // wird NIE erfolgreich, egal wie oft erneut synchronisiert wird - die
    // Claim-Zeile bleibt dafür stehen, damit ein Retry es nicht wiederholt.
    // Jeder andere (unerwartete) Fehler löscht die Claim-Zeile wieder, damit
    // der Client es beim nächsten Sync sauber erneut versuchen kann
    // ("Fehlgeschlagene Einträge mit Retry").
    if (error instanceof StudySessionNotActiveError) {
      return finalizeTerminal(claimId, event, "conflict", error.message);
    }
    if (error instanceof StudySessionNotFoundError || error instanceof SectionNotFoundError) {
      return finalizeTerminal(claimId, event, "error", error.message);
    }
    await db.delete(syncEvents).where(eq(syncEvents.id, claimId));
    return {
      clientEventId: event.clientEventId,
      status: "error",
      error: error instanceof Error ? error.message : "Unbekannter Fehler.",
    };
  }
}

async function finalizeTerminal(
  claimId: string,
  event: SyncEventInput,
  status: SyncEventStatus,
  errorMessage: string,
): Promise<SyncEventResult> {
  await getDb()
    .update(syncEvents)
    .set({ status, errorMessage })
    .where(eq(syncEvents.id, claimId));
  return { clientEventId: event.clientEventId, status, error: errorMessage };
}

async function applyEvent(userId: string, event: SyncEventInput): Promise<unknown> {
  if (event.type === "section_quiz") {
    const payload = event.payload as SectionQuizPayload;
    return recordSectionQuizAttempt(userId, payload.sectionId, payload.answers);
  }
  if (event.type === "study_session") {
    const payload = event.payload as StudySessionPayload;
    return completeStudySession(payload.sessionId, userId, payload.answers);
  }
  throw new Error(`Unbekannter Sync-Ereignistyp: ${event.type}`);
}
