import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { metricSnapshots } from "@/lib/server/db/schema";
import { compareFigures, flagConfig, keyFigures, type Comparison, type Figures } from "./baseline";
import { baselineSource, exportMetrics } from "./metrics";

export type SnapshotRow = typeof metricSnapshots.$inferSelect;

/** Aktuelle Kennzahlen (wie der Export) und die Größe der Datenbasis. */
export async function currentFigures(options: { asOf?: Date; salt?: string } = {}): Promise<{ figures: Figures; basis: { users: number; reviews: number }; asOf: string }> {
  const metrics = await exportMetrics(options);
  const source = baselineSource(metrics);
  const groups = metrics.groups;
  return { figures: keyFigures(source), basis: { users: groups.reduce((n, g) => n + g.users, 0), reviews: groups.reduce((n, g) => n + g.reviews, 0) }, asOf: source.asOf };
}

export async function saveSnapshot(label: string, options: { asOf?: Date; salt?: string; env?: Record<string, string | undefined> } = {}): Promise<SnapshotRow> {
  const name = label.trim().slice(0, 120);
  if (!name) throw new Error("Bitte eine Bezeichnung angeben.");
  const { figures, basis } = await currentFigures(options);
  const [row] = await getDb().insert(metricSnapshots).values({ label: name, flagConfig: flagConfig(options.env), figures, basis }).returning();
  return row;
}

export async function listSnapshots(): Promise<SnapshotRow[]> {
  return getDb().select().from(metricSnapshots).orderBy(desc(metricSnapshots.takenAt));
}

/** `latest` oder die ID einer Momentaufnahme; null, wenn es sie nicht gibt. */
export async function getSnapshot(ref: string): Promise<SnapshotRow | null> {
  if (ref === "latest") return (await listSnapshots())[0] ?? null;
  if (!/^[0-9a-f-]{36}$/i.test(ref)) return null;
  const [row] = await getDb().select().from(metricSnapshots).where(eq(metricSnapshots.id, ref)).limit(1);
  return row ?? null;
}

/** Zwei Momentaufnahmen vergleichen, oder eine mit dem aktuellen Stand (`after` fehlt). */
export async function compareSnapshots(before: SnapshotRow, after?: SnapshotRow, options: { salt?: string } = {}): Promise<{ rows: Comparison[]; basisBefore: SnapshotRow["basis"]; basisAfter: SnapshotRow["basis"] }> {
  const now = after ? null : await currentFigures(options);
  return {
    rows: compareFigures(before.figures, after ? after.figures : now!.figures),
    basisBefore: before.basis,
    basisAfter: after ? after.basis : now!.basis,
  };
}
