import { and, eq, lt } from "drizzle-orm";
import { isSectionHidden, isStudySessionHidden } from "@/lib/server/catalog/access";
import { getDb, inTransaction } from "@/lib/server/db/client";
import { syncEvents, type SyncEventStatus, type SyncEventType } from "@/lib/server/db/schema";
import {
  recordSectionQuizAttempt,
  SectionNotFoundError,
  type SectionQuizAnswerInput,
} from "@/lib/server/sections/attempt-service";
import { recordSimulationSolved, SimulationNotFoundError } from "@/lib/server/simulations/service";
import { createReviewTiming, effectiveTime } from "@/lib/server/sync/effective-time";
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
  /** Endgültig abgelehnt: derselbe Fehler kommt bei jedem erneuten Senden (Client markiert es nach 3 gleichen Antworten als abgelehnt). */
  terminal?: boolean;
}

interface SectionQuizPayload {
  sectionId: string;
  answers: SectionQuizAnswerInput[];
}

interface SimulationResultPayload {
  sectionId: string;
  simIndex: number;
  helps: number;
}

interface StudySessionPayload {
  sessionId: string;
  answers: StudySessionAnswerInput[];
  /** Größenklasse des Bildschirms beim Abschluss (Aufgabe 16); fehlt bei älteren Geräten. */
  deviceClass?: unknown;
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
  options: { now?: Date } = {},
): Promise<SyncEventResult[]> {
  const results: SyncEventResult[] = [];
  for (const event of events) {
    results.push(await processSingleEvent(userId, event, options.now ?? new Date()));
  }
  return results;
}

/** Platzhalter der Claim-Zeile, solange das Ereignis verarbeitet wird (kein endgültiges Ergebnis). */
export const PROCESSING_MESSAGE = "wird verarbeitet";

/**
 * Ab diesem Alter gilt eine Claim-Zeile mit PROCESSING_MESSAGE als verwaist (Prozess während der Verbuchung beendet, z. B. durch
 * einen Deploy) und wird übernommen. Die Schwelle schützt nicht allein vor doppelter Verbuchung: die Verbuchung hält die
 * Claim-Zeile bis zum Commit gesperrt, eine noch laufende Verbuchung wird also nie übernommen, auch wenn sie länger dauert.
 */
export const STALE_CLAIM_MS = 5 * 60_000;

/** Die Claim-Zeile wurde zwischen Anlegen und Verbuchen von einer anderen Anfrage übernommen. */
class ClaimLostError extends Error {}

const BUSY_MESSAGE = "Wird bereits von einer anderen Anfrage synchronisiert - bitte erneut versuchen.";

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}

function busy(event: SyncEventInput): SyncEventResult {
  return { clientEventId: event.clientEventId, status: "error", error: BUSY_MESSAGE };
}

/**
 * Gibt eine verwaiste Claim-Zeile frei: löscht sie nur, wenn sie noch „wird verarbeitet“ sagt und älter als STALE_CLAIM_MS ist.
 * Hält eine laufende Verbuchung die Zeile gesperrt, wartet das DELETE auf deren Ende und prüft die Bedingung danach erneut; die
 * dann abgeschlossene Zeile wird nicht gelöscht.
 */
async function releaseStaleClaim(claimId: string, now: Date): Promise<boolean> {
  const released = await getDb()
    .delete(syncEvents)
    .where(
      and(
        eq(syncEvents.id, claimId),
        eq(syncEvents.status, "error"),
        eq(syncEvents.errorMessage, PROCESSING_MESSAGE),
        lt(syncEvents.createdAt, new Date(now.getTime() - STALE_CLAIM_MS)),
      ),
    )
    .returning({ id: syncEvents.id });
  return released.length > 0;
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
 *
 * Verbuchung und Abschluss der Claim-Zeile laufen in EINER Transaktion (Aufgabe 02a, Review 12.11.2026). Bricht der Prozess
 * mittendrin ab, ist nichts verbucht und nur die Claim-Zeile bleibt stehen; nach STALE_CLAIM_MS wird sie übernommen und das
 * Ereignis beim nächsten Senden neu verarbeitet, ohne doppelte Verbuchung.
 */
async function processSingleEvent(userId: string, event: SyncEventInput, now: Date): Promise<SyncEventResult> {
  const db = getDb();

  const [existing] = await db
    .select()
    .from(syncEvents)
    .where(and(eq(syncEvents.userId, userId), eq(syncEvents.clientEventId, event.clientEventId)))
    .limit(1);
  // Frühere Konflikte (Session anderswo abgeschlossen) wurden nie verbucht: der erneute Versuch wird mit der heutigen Logik verarbeitet.
  if (existing?.status === "conflict") {
    await db.delete(syncEvents).where(eq(syncEvents.id, existing.id));
  } else if (existing?.status === "error" && existing.errorMessage === PROCESSING_MESSAGE) {
    // Läuft noch (jung) oder wurde gerade von jemand anderem abgeschlossen: erneut versuchen lassen.
    if (!(await releaseStaleClaim(existing.id, now))) return busy(event);
  } else if (existing) {
    return {
      clientEventId: event.clientEventId,
      status: existing.status === "applied" ? "already_applied" : existing.status,
      resultSummary: existing.resultSummary,
      error: existing.errorMessage ?? undefined,
      ...(existing.status === "error" ? { terminal: true } : {}),
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
        errorMessage: PROCESSING_MESSAGE,
      })
      .returning({ id: syncEvents.id });
    claimId = claimed.id;
  } catch (error) {
    if (isUniqueViolation(error)) return busy(event);
    throw error;
  }

  try {
    return await inTransaction(async () => {
      const tx = getDb();
      // Sperrt die Claim-Zeile bis zum Commit: eine Übernahme durch releaseStaleClaim() wartet, bis hier alles entschieden ist.
      const [claim] = await tx.select({ id: syncEvents.id }).from(syncEvents).where(eq(syncEvents.id, claimId)).for("update");
      if (!claim) throw new ClaimLostError();
      const resultSummary = await applyEvent(userId, event);
      const partial = typeof resultSummary === "object" && resultSummary !== null && "partial" in resultSummary && resultSummary.partial === true;
      const status: SyncEventStatus = partial ? "applied_partial" : "applied";
      await tx
        .update(syncEvents)
        .set({ status, resultSummary, errorMessage: null })
        .where(eq(syncEvents.id, claimId));
      return { clientEventId: event.clientEventId, status, resultSummary };
    });
  } catch (error) {
    // Die Transaktion ist zurückgerollt: es wurde nichts verbucht.
    if (error instanceof ClaimLostError) return busy(event);
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
    if (error instanceof StudySessionNotFoundError || error instanceof SectionNotFoundError || error instanceof SimulationNotFoundError) {
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
  return { clientEventId: event.clientEventId, status, error: errorMessage, ...(status === "error" ? { terminal: true } : {}) };
}

async function applyEvent(userId: string, event: SyncEventInput): Promise<unknown> {
  if (event.type === "section_quiz") {
    const payload = event.payload as SectionQuizPayload;
    // Offline aufgezeichnet, später synchronisiert: wer den Lernpfad inzwischen nicht mehr sehen darf
    // (z. B. aus der Firma entfernt), bekommt nichts mehr verbucht.
    if (await isSectionHidden(userId, payload.sectionId)) throw new SectionNotFoundError(payload.sectionId);
    return recordSectionQuizAttempt(userId, payload.sectionId, payload.answers, {
      timing: createReviewTiming({ eventTime: event.clientCreatedAt }),
    });
  }
  if (event.type === "study_session") {
    const payload = event.payload as StudySessionPayload;
    if (await isStudySessionHidden(userId, payload.sessionId)) throw new StudySessionNotFoundError(payload.sessionId);
    return completeStudySession(payload.sessionId, userId, payload.answers, {
      countIfFinished: true,
      deviceClass: payload.deviceClass,
      timing: (session) => createReviewTiming({ eventTime: event.clientCreatedAt, notBefore: session.createdAt }),
    });
  }
  if (event.type === "simulation_result") {
    const payload = event.payload as SimulationResultPayload;
    if (typeof payload?.sectionId !== "string" || !Number.isInteger(payload.simIndex) || typeof payload.helps !== "number") throw new SimulationNotFoundError("Ungültige Simulation.");
    if (await isSectionHidden(userId, payload.sectionId)) throw new SectionNotFoundError(payload.sectionId);
    const { at, tooOld } = effectiveTime(event.clientCreatedAt, {}, new Date());
    const { struggled, pulledForward } = await recordSimulationSolved(userId, payload.sectionId, payload.simIndex, payload.helps, { at, applyState: !tooOld });
    return { struggled, pulledForward };
  }
  throw new Error(`Unbekannter Sync-Ereignistyp: ${event.type}`);
}
