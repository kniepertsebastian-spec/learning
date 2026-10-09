/** Kennzahlen der Firmenübersicht (UI U6), nur aus Status-Feldern der Zuweisungen berechnet. */
export type OverviewStatusRow = { memberEmail: string; learningPath: string; status: "assigned" | "in_progress" | "completed"; assignedAt: string; overdue: boolean };

export function overviewTotals(rows: OverviewStatusRow[], memberCount: number, now: Date = new Date()) {
  const recent = rows.filter((r) => now.getTime() - new Date(r.assignedAt).getTime() <= 90 * 86_400_000);
  const open = rows.filter((r) => r.status !== "completed");
  return {
    members: memberCount || new Set(rows.map((r) => r.memberEmail)).size,
    activePaths: open.length,
    certifications: new Set(open.map((r) => r.learningPath)).size,
    overdue: rows.filter((r) => r.overdue).length,
    completionRate: recent.length ? Math.round((recent.filter((r) => r.status === "completed").length / recent.length) * 100) : null,
  };
}

export function daysSince(iso: string, now: Date = new Date()): number {
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
}
