import { AsyncLocalStorage } from "node:async_hooks";
import { eq, inArray, sql } from "drizzle-orm";
import type { AIUsage } from "@/lib/ai/generate";
import { getDb } from "@/lib/server/db/client";
import { aiCostEntries, certifications, courseGenerationJobs, type AiCostSource } from "@/lib/server/db/schema";
import { estimateCostUsd } from "./ai-cost";

/**
 * Das Kostenbuch (Tabelle ai_cost_entries): jeder KI-Aufruf wird einzeln festgehalten, egal von welcher Funktion er kommt
 * (lib/ai/generate.ts ruft `recordAiUsage` an der einen Stelle, an der Gemini angesprochen wird). Wem die Kosten gehören,
 * sagt der Kontext, den die aufrufende Funktion setzt (`withAiCost`): Kurs, Quelle (Kursgenerierung, Übersetzung, Werkstatt …).
 * Ohne Kontext landet der Aufruf als „other“ ohne Kurs im Buch: Er geht nie verloren, ist nur nicht zugeordnet.
 *
 * Daraus kommen die Gesamtkosten, die Kosten je Kurs (Admin, KI-Kosten) und das Budget GEMINI_BUDGET_USD.
 */

export interface AiCostContext {
  source: AiCostSource;
  /** Feinere Angabe zur Quelle, z. B. die Art des Sammellaufs. */
  detail?: string | null;
  certificationId?: string | null;
  /** Aufträge der Kursgenerierung: den Kurs gibt es beim Generieren noch nicht, er ergibt sich später aus dem Auftrag. */
  generationJobId?: string | null;
}

const storage = new AsyncLocalStorage<AiCostContext>();

/** Führt `fn` mit diesem Kontext aus; ein äußerer Kontext wird ersetzt. Gilt auch für alles, was `fn` im Hintergrund startet. */
export function withAiCost<T>(context: AiCostContext, fn: () => T): T {
  return storage.run(context, fn);
}

/**
 * Setzt im laufenden Kontext nur den Schritt (`detail`, z. B. „tagging“): Quelle, Kurs und Auftrag bleiben. Ohne Kontext
 * passiert nichts (es wird kein Kontext erfunden); der Aufruf landet dann wie bisher als „other“ im Buch.
 */
export function withAiCostDetail<T>(detail: string, fn: () => T): T {
  const current = storage.getStore();
  return current ? storage.run({ ...current, detail }, fn) : fn();
}

/**
 * Wie `withAiCost`, aber ein schon gesetzter Kontext gewinnt: Die Werkstatt-Funktion „KI-Vorschlag“ ist Teil von Sammelläufen und
 * soll deren Quelle nicht überschreiben, bringt aber als Vorgabe den Kurs mit, wenn sie allein aufgerufen wird.
 */
export function withAiCostDefaults<T>(defaults: AiCostContext, fn: () => T): T {
  const current = storage.getStore();
  if (!current) return storage.run(defaults, fn);
  return storage.run(
    {
      source: current.source,
      detail: current.detail ?? defaults.detail,
      certificationId: current.certificationId ?? defaults.certificationId,
      generationJobId: current.generationJobId ?? defaults.generationJobId,
    },
    fn,
  );
}

let warned = false;

/**
 * Hält einen KI-Aufruf fest. Wirft nie: Ein Fehler beim Verbuchen darf den Aufruf, der gerade Geld gekostet hat und dessen
 * Ergebnis gebraucht wird, nicht scheitern lassen (er wird einmal gemeldet). `byok`: der Aufruf lief mit dem Schlüssel einer Firma.
 * `batch`: der Aufruf lief über die Batch-API und wird zum Batch-Preis geschätzt (GEMINI_BATCH_PRICE_FACTOR).
 */
export async function recordAiUsage(usage: AIUsage, options: { byok?: boolean; batch?: boolean } = {}): Promise<void> {
  try {
    const context = storage.getStore();
    const cost = estimateCostUsd(usage.promptTokens, usage.completionTokens, usage.model, usage.cachedTokens ?? 0, { batch: options.batch });
    await getDb()
      .insert(aiCostEntries)
      .values({
        source: context?.source ?? "other",
        detail: context?.detail ?? null,
        certificationId: context?.certificationId ?? null,
        generationJobId: context?.generationJobId ?? null,
        model: usage.model,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        cachedTokens: usage.cachedTokens ?? 0,
        costUsd: cost === null ? null : cost.toFixed(6),
        byok: options.byok ?? false,
      });
  } catch (error) {
    if (!warned) {
      warned = true;
      console.warn("KI-Kosten konnten nicht im Kostenbuch festgehalten werden:", error instanceof Error ? error.message : error);
    }
  }
}

export interface AiCostCourseRow {
  /** null = Aufrufe ohne (noch vorhandenen) Kurs. */
  certificationId: string | null;
  name: string;
  slug: string | null;
  kind: string | null;
  costUsd: number;
  calls: number;
}

export interface AiCostReport {
  /** Gesamtkosten der Plattform (ohne BYOK). Ist die Summe der Kurszeilen. */
  totalUsd: number;
  /** Davon aus der Zeit vor dem Kostenbuch (nur Summen, ohne einzelne Aufrufe). */
  historicUsd: number;
  /** Aufrufe mit dem Schlüssel einer Firma: gehören der Firma und stehen nicht in der Summe. */
  byokUsd: number;
  /** Aufrufe, für deren Modell kein Preis hinterlegt ist: sie zählen als 0 USD und sind hier nur gezählt. */
  unpricedCalls: number;
  bySource: Array<{ source: AiCostSource; costUsd: number }>;
  /** Aufteilung nach Schritt (Quelle + `detail`), teuerste zuerst; `detail` null = Aufrufe ohne Schrittangabe. Token ohne BYOK und ohne übernommene Summen. */
  bySteps: AiCostStepRow[];
  courses: AiCostCourseRow[];
}

export interface AiCostStepRow {
  source: AiCostSource;
  detail: string | null;
  costUsd: number;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  cachedTokens: number;
}

const num = (value: string | null | undefined) => Number(value ?? 0);

/**
 * Gesamtkosten, Aufteilung nach Quelle und Kosten je Kurs, teuerste zuerst. Der Kurs eines Eintrags ist der eigene
 * (`certification_id`) oder, bei der Kursgenerierung, der des Auftrags. Was zu keinem vorhandenen Kurs gehört (gelöschte
 * Kurse, abgebrochene Aufträge, Funktionen ohne Kurs), steht gesammelt in der Zeile „Ohne Kurs“.
 */
export async function getAiCostReport(): Promise<AiCostReport> {
  const db = getDb();
  const course = sql<string | null>`coalesce(${aiCostEntries.certificationId}, ${courseGenerationJobs.resultCertificationId})`;

  const [perCourse, perSource, perStep, [flags]] = await Promise.all([
    db
      .select({
        certificationId: course,
        costUsd: sql<string>`coalesce(sum(${aiCostEntries.costUsd}), 0)`,
        calls: sql<string>`count(*) filter (where not ${aiCostEntries.historic})`,
      })
      .from(aiCostEntries)
      .leftJoin(courseGenerationJobs, eq(aiCostEntries.generationJobId, courseGenerationJobs.id))
      .where(eq(aiCostEntries.byok, false))
      .groupBy(course),
    db
      .select({ source: aiCostEntries.source, costUsd: sql<string>`coalesce(sum(${aiCostEntries.costUsd}), 0)` })
      .from(aiCostEntries)
      .where(eq(aiCostEntries.byok, false))
      .groupBy(aiCostEntries.source),
    db
      .select({
        source: aiCostEntries.source,
        detail: aiCostEntries.detail,
        costUsd: sql<string>`coalesce(sum(${aiCostEntries.costUsd}), 0)`,
        calls: sql<string>`count(*) filter (where not ${aiCostEntries.historic})`,
        promptTokens: sql<string>`coalesce(sum(${aiCostEntries.promptTokens}), 0)`,
        completionTokens: sql<string>`coalesce(sum(${aiCostEntries.completionTokens}), 0)`,
        cachedTokens: sql<string>`coalesce(sum(${aiCostEntries.cachedTokens}), 0)`,
      })
      .from(aiCostEntries)
      .where(eq(aiCostEntries.byok, false))
      .groupBy(aiCostEntries.source, aiCostEntries.detail),
    db
      .select({
        historic: sql<string>`coalesce(sum(${aiCostEntries.costUsd}) filter (where ${aiCostEntries.historic} and not ${aiCostEntries.byok}), 0)`,
        byok: sql<string>`coalesce(sum(${aiCostEntries.costUsd}) filter (where ${aiCostEntries.byok}), 0)`,
        unpriced: sql<string>`count(*) filter (where ${aiCostEntries.costUsd} is null)`,
      })
      .from(aiCostEntries),
  ]);

  const ids = perCourse.map((row) => row.certificationId).filter((id): id is string => id !== null);
  const meta = ids.length
    ? await db.select({ id: certifications.id, name: certifications.name, slug: certifications.slug, kind: certifications.kind }).from(certifications).where(inArray(certifications.id, ids))
    : [];
  const byId = new Map(meta.map((row) => [row.id, row]));

  // Zeilen, deren Kurs es nicht mehr gibt, zählen zu „Ohne Kurs“.
  const courses = new Map<string | null, AiCostCourseRow>();
  for (const row of perCourse) {
    const info = row.certificationId ? byId.get(row.certificationId) : undefined;
    const key = info ? info.id : null;
    const existing = courses.get(key) ?? {
      certificationId: key,
      name: info ? info.name : "",
      slug: info ? info.slug : null,
      kind: info ? info.kind : null,
      costUsd: 0,
      calls: 0,
    };
    existing.costUsd += num(row.costUsd);
    existing.calls += num(row.calls);
    courses.set(key, existing);
  }

  const rows = [...courses.values()].sort((a, b) => b.costUsd - a.costUsd);
  return {
    totalUsd: rows.reduce((sum, row) => sum + row.costUsd, 0),
    historicUsd: num(flags?.historic),
    byokUsd: num(flags?.byok),
    unpricedCalls: num(flags?.unpriced),
    bySource: perSource.map((row) => ({ source: row.source, costUsd: num(row.costUsd) })).sort((a, b) => b.costUsd - a.costUsd),
    bySteps: perStep
      .map((row) => ({
        source: row.source,
        detail: row.detail,
        costUsd: num(row.costUsd),
        calls: num(row.calls),
        promptTokens: num(row.promptTokens),
        completionTokens: num(row.completionTokens),
        cachedTokens: num(row.cachedTokens),
      }))
      .sort((a, b) => b.costUsd - a.costUsd),
    courses: rows,
  };
}
