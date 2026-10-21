import { asc, eq } from "drizzle-orm";
import { extractSimulationSources, parseSimulation } from "@/lib/markdown/simulation";
import { getDb } from "@/lib/server/db/client";
import { certifications, domains, lessons, objectives, sections } from "@/lib/server/db/schema";
import { ensureAiCheckpoint, finishAiAccept, proposeAi, type Generate } from "./ai";
import { EditConflictError, saveSection } from "./service";

/**
 * Nachtrag für bestehende Lektionen (roadmap3.md, kleinere offene Punkte): Hinweis „Was damit möglich ist“ und die
 * Textverweise (`review`) in Simulationen, die neue Kurse seit Schritt 5/6 von selbst bekommen. Nutzt dieselbe
 * KI-Aktion wie die Werkstatt („possible“), speichert aber ohne Rückfrage, mit gemerktem Kursstand vorher und
 * Revisionen mit Herkunft „KI“; die Werkstatt kann jede Lektion einzeln zurücksetzen.
 */

const POSSIBLE = /^\s*>\s*\[!POSSIBLE\]/m;

export function lessonNeedsPossible(content: string): { possible: boolean; review: boolean } {
  const sims = extractSimulationSources(content).map(parseSimulation);
  return {
    possible: !POSSIBLE.test(content),
    review: sims.some((s) => s.ok && !s.simulation.review?.length),
  };
}

export async function lessonsNeedingPossible(certId: string) {
  const [cert] = await getDb().select({ contentLocale: certifications.contentLocale }).from(certifications).where(eq(certifications.id, certId)).limit(1);
  const locale = cert?.contentLocale === "en" ? "en" : "de";
  const rows = await getDb()
    .select({ sectionId: sections.id, title: sections.title, content: lessons.content })
    .from(sections)
    .innerJoin(lessons, eq(lessons.sectionId, sections.id))
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(eq(domains.certificationId, certId))
    .orderBy(asc(domains.orderNum), asc(objectives.code), asc(sections.orderNum));
  return rows
    .map((r) => ({ sectionId: r.sectionId, title: r.title[locale], needs: lessonNeedsPossible(r.content[locale]) }))
    .filter((r) => r.needs.possible || r.needs.review);
}

export type PossibleBackfillResult = { checked: number; updated: number; skipped: number; failed: number; costUsd: number };

export async function backfillPossible(
  certId: string,
  opts: { limit?: number; dryRun?: boolean; generate?: Generate; log?: (line: string) => void } = {},
): Promise<PossibleBackfillResult> {
  const log = opts.log ?? (() => {});
  const todo = (await lessonsNeedingPossible(certId)).slice(0, opts.limit ?? Infinity);
  const result: PossibleBackfillResult = { checked: todo.length, updated: 0, skipped: 0, failed: 0, costUsd: 0 };
  if (opts.dryRun || todo.length === 0) return result;
  const { name } = await ensureAiCheckpoint(certId, null);
  const changed: string[] = [];
  for (const t of todo) {
    try {
      const p = await proposeAi(certId, { target: "section", id: t.sectionId, action: "possible" }, { generate: opts.generate });
      result.costUsd += p.costUsd ?? 0;
      if (p.kind !== "section") continue;
      // Hat die KI den Hinweis doch nicht ergänzt, lieber nichts ändern.
      const after = lessonNeedsPossible(p.snapshot.content[p.locale]);
      if (after.possible || p.repaired) {
        result.skipped++;
        log(`  – ${t.title}: Vorschlag unvollständig, übersprungen`);
        continue;
      }
      const saved = await saveSection(certId, t.sectionId, p.snapshot, p.baseFingerprint, { userId: null, origin: "ai", note: "KI-Nachtrag: „Was damit möglich ist“ und Textverweise" });
      if (saved.changed) {
        result.updated++;
        changed.push(t.sectionId);
        log(`  ✓ ${t.title}`);
      } else result.skipped++;
    } catch (error) {
      if (error instanceof EditConflictError) {
        result.skipped++;
        log(`  – ${t.title}: inzwischen geändert, übersprungen`);
        continue;
      }
      result.failed++;
      log(`  ✗ ${t.title}: ${error instanceof Error ? error.message : error}`);
    }
  }
  // Übersetzung startet das Skript selbst (ein Hintergrundlauf ginge mit dem Prozess verloren).
  if (changed.length) await finishAiAccept(certId, { sections: changed }, { userId: null, checkpoint: name, startTranslation: false });
  return result;
}
