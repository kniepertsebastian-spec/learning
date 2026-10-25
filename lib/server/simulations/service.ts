import { and, asc, eq, gt, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { domains, lessons, objectives, questions, reviewItems, sections, simulationResults } from "@/lib/server/db/schema";
import { extractSimulationSources, parseSimulation } from "@/lib/markdown/simulation";
import { recordInterleavedTask } from "@/lib/server/psrp/implicit";
import { pickWovenQuestions, type WovenQuestion } from "@/lib/server/weaving/candidates";
import type { Localized } from "@/lib/types";

/** Ab so vielen Hilfen (Tipp, Lösung, Fehlversuche) gilt eine Simulation als „mit Mühe gelöst“ und kommt in die Wiederholung. */
export const STRUGGLE_HELPS = 2;

export type SimulationProgress = { simIndex: number; bestHelps: number; solves: number };

export async function listSimulationProgress(userId: string, sectionId: string): Promise<SimulationProgress[]> {
  return getDb()
    .select({ simIndex: simulationResults.simIndex, bestHelps: simulationResults.bestHelps, solves: simulationResults.solves })
    .from(simulationResults)
    .where(and(eq(simulationResults.userId, userId), eq(simulationResults.sectionId, sectionId)));
}

export class SimulationNotFoundError extends Error {}

/**
 * Hält eine gelöste Simulation fest (jede Runde zählt als Lösung, die beste Runde als Bestwert). Löst jemand sie nur mit
 * viel Hilfe, werden die Wiederholungsfragen des Lernziels schon jetzt fällig: was sich nicht von selbst gelöst hat,
 * soll bald wieder auf den Tisch (roadmap3.md, Schritt 5). Es entstehen keine neuen Wiederholungseinträge, nur
 * bestehende werden vorgezogen.
 */
export async function recordSimulationSolved(
  userId: string,
  sectionId: string,
  simIndex: number,
  helps: number,
  /** Offline gelöst, später synchronisiert: Zeitpunkt der Lösung; `applyState` falsch = nur protokollieren (Ereignis zu alt). */
  options: { at?: Date; applyState?: boolean } = {},
): Promise<{ struggled: boolean; pulledForward: number; woven: WovenQuestion[] }> {
  const db = getDb();
  const [row] = await db
    .select({ objectiveId: sections.objectiveId, content: lessons.content })
    .from(sections)
    .innerJoin(lessons, eq(lessons.sectionId, sections.id))
    .where(eq(sections.id, sectionId))
    .limit(1);
  if (!row) throw new SimulationNotFoundError("Lektion nicht gefunden.");
  const count = Math.max(extractSimulationSources(row.content.de).length, extractSimulationSources(row.content.en).length);
  if (simIndex < 0 || simIndex >= count) throw new SimulationNotFoundError("Simulation nicht gefunden.");

  const h = Math.max(0, Math.min(99, Math.floor(helps)));
  const now = options.at ?? new Date();
  const applyState = options.applyState ?? true;
  // Vorziehen und eingewebte Fragen betreffen den Zustand von jetzt, nicht den der Lösung.
  const serverNow = new Date();
  await db
    .insert(simulationResults)
    .values({ userId, sectionId, simIndex, bestHelps: h, lastHelps: h })
    .onConflictDoUpdate({
      target: [simulationResults.userId, simulationResults.sectionId, simulationResults.simIndex],
      set: {
        solves: sql`${simulationResults.solves} + 1`,
        bestHelps: sql`least(${simulationResults.bestHelps}, ${h})`,
        lastHelps: h,
        lastSolvedAt: sql`greatest(${simulationResults.lastSolvedAt}, ${now.toISOString()}::timestamptz)`,
      },
    });

  const struggled = h >= STRUGGLE_HELPS;
  // PSRP-HR Phase 6: referenzierte Items bekommen einen impliziten Review (mit viel Hilfe = nicht souverän gelöst).
  await recordInterleavedTask({ userId, taskType: "simulation", taskRef: `${sectionId}:${simIndex}`, solved: !struggled, now, applyState });
  let pulledForward = 0;
  if (struggled && applyState) {
    const questionIds = (await db.select({ id: questions.id }).from(questions).where(and(eq(questions.objectiveId, row.objectiveId), eq(questions.stale, false)))).map((q) => q.id);
    if (questionIds.length) {
      const moved = await db
        .update(reviewItems)
        .set({ dueAt: serverNow })
        .where(and(eq(reviewItems.userId, userId), inArray(reviewItems.questionId, questionIds), gt(reviewItems.dueAt, serverNow)))
        .returning({ id: reviewItems.id });
      pulledForward = moved.length;
    }
  }
  // Roadmap Didaktik Phase 10: nach einer souverän gelösten Simulation eine fällige Frage aus einer früheren Lektion (Flag woven_reviews).
  // Wer sich durchkämpfen musste, bekommt nichts obendrauf.
  const woven = struggled ? [] : await pickWovenQuestions(userId, sectionId, 0, serverNow, { max: 1 }).catch(() => []);
  return { struggled, pulledForward, woven };
}

export type PracticeSimulation = { sectionId: string; title: Localized<string>; content: Localized<string>; simIndex: number };

/**
 * Praxisaufgabe für eine Übungssitzung (roadmap3.md, kleinere offene Punkte): eine Simulation aus den Lektionen der
 * Lernziele, deren Fragen in der Sitzung vorkommen. Zuerst noch nie gelöste, dann mühsam gelöste (Bestwert ab
 * STRUGGLE_HELPS Hilfen); sicher gelöste kommen nicht. `seed` (z. B. die Sitzungs-ID) wählt stabil unter
 * Gleichrangigen, damit ein Neuladen dieselbe Aufgabe zeigt.
 */
export async function pickPracticeSimulation(userId: string, questionIds: string[], seed: string): Promise<PracticeSimulation | null> {
  if (questionIds.length === 0) return null;
  const db = getDb();
  const objectiveIds = [...new Set((await db.select({ o: questions.objectiveId }).from(questions).where(inArray(questions.id, questionIds))).map((r) => r.o))];
  if (objectiveIds.length === 0) return null;
  const rows = await db
    .select({ sectionId: sections.id, title: sections.title, content: lessons.content })
    .from(sections)
    .innerJoin(lessons, eq(lessons.sectionId, sections.id))
    .where(and(inArray(sections.objectiveId, objectiveIds), sql`${lessons.content}::text like '%simulation%'`))
    .orderBy(asc(sections.id));
  if (rows.length === 0) return null;
  const progress = await db
    .select({ sectionId: simulationResults.sectionId, simIndex: simulationResults.simIndex, bestHelps: simulationResults.bestHelps })
    .from(simulationResults)
    .where(and(eq(simulationResults.userId, userId), inArray(simulationResults.sectionId, rows.map((r) => r.sectionId))));
  const best = new Map(progress.map((p) => [`${p.sectionId}:${p.simIndex}`, p.bestHelps]));

  const candidates: Array<PracticeSimulation & { rank: number }> = [];
  for (const r of rows) {
    extractSimulationSources(r.content.de).forEach((src, simIndex) => {
      if (!parseSimulation(src).ok) return;
      const b = best.get(`${r.sectionId}:${simIndex}`);
      if (b !== undefined && b < STRUGGLE_HELPS) return;
      candidates.push({ sectionId: r.sectionId, title: r.title, content: r.content, simIndex, rank: b === undefined ? 0 : 1 });
    });
  }
  if (candidates.length === 0) return null;
  const top = candidates.filter((c) => c.rank === Math.min(...candidates.map((x) => x.rank)));
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pick = top[h % top.length];
  return { sectionId: pick.sectionId, title: pick.title, content: pick.content, simIndex: pick.simIndex };
}

export type SimulationStatus = "open" | "struggled" | "solved";
export type CourseSimulation = {
  domainId: string;
  domain: string;
  objectiveCode: string;
  objectiveTitle: string;
  sectionId: string;
  sectionTitle: Localized<string>;
  /** Position in der Lektion (1-basiert, wie die Sprungmarke #simulation-n). */
  number: number;
  type: "terminal" | "decision" | "config";
  title: Localized<string>;
  status: SimulationStatus;
  bestHelps: number | null;
  solves: number;
};

/**
 * Alle Simulationen eines Kurses in Kursreihenfolge, mit dem Stand der Person (ohne Anmeldung alle „offen“). Titel je
 * Sprache aus der jeweiligen Fassung der Lektion; fehlt dort die Simulation (Übersetzung weicht ab), gilt der deutsche.
 */
export async function listCourseSimulations(certificationId: string, userId: string | null): Promise<CourseSimulation[]> {
  const db = getDb();
  const rows = await db
    .select({
      domainId: domains.id,
      domain: domains.name,
      objectiveCode: objectives.code,
      objectiveTitle: objectives.title,
      sectionId: sections.id,
      sectionTitle: sections.title,
      content: lessons.content,
    })
    .from(lessons)
    .innerJoin(sections, eq(sections.id, lessons.sectionId))
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(and(eq(domains.certificationId, certificationId), sql`${lessons.content}::text like '%simulation%'`))
    .orderBy(asc(domains.orderNum), asc(objectives.code), asc(sections.orderNum));
  if (rows.length === 0) return [];
  const progress = userId
    ? await db
        .select({ sectionId: simulationResults.sectionId, simIndex: simulationResults.simIndex, bestHelps: simulationResults.bestHelps, solves: simulationResults.solves })
        .from(simulationResults)
        .where(and(eq(simulationResults.userId, userId), inArray(simulationResults.sectionId, rows.map((r) => r.sectionId))))
    : [];
  const byKey = new Map(progress.map((p) => [`${p.sectionId}:${p.simIndex}`, p]));

  const out: CourseSimulation[] = [];
  for (const r of rows) {
    const de = extractSimulationSources(r.content.de).map(parseSimulation);
    const en = extractSimulationSources(r.content.en).map(parseSimulation);
    de.forEach((parsed, i) => {
      if (!parsed.ok) return;
      const other = en[i]?.ok ? en[i] : null;
      const p = byKey.get(`${r.sectionId}:${i}`);
      out.push({
        domainId: r.domainId,
        domain: r.domain,
        objectiveCode: r.objectiveCode,
        objectiveTitle: r.objectiveTitle,
        sectionId: r.sectionId,
        sectionTitle: r.sectionTitle,
        number: i + 1,
        type: parsed.simulation.type,
        title: { de: parsed.simulation.title, en: other && other.ok ? other.simulation.title : parsed.simulation.title },
        status: !p ? "open" : p.bestHelps >= STRUGGLE_HELPS ? "struggled" : "solved",
        bestHelps: p?.bestHelps ?? null,
        solves: p?.solves ?? 0,
      });
    });
  }
  return out;
}
