/**
 * Siegel „Fachlich geprüft von …“ aus den Freigaben (roadmap_pruefer Phase 4). Nur allgemeine, freigegebene Kurse haben eins; interne
 * Lernpfade nie (dort bleibt „Freigegeben von …“ im Firmenbereich). Namen nur bei veröffentlichtem Profil mit Einwilligung, sonst neutral.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, courseApprovals } from "@/lib/server/db/schema";
import type { Seal } from "@/lib/reviewers/seal";
import { ensureLegacyApproval, getApprovalStatus } from "./service";
import { publicIdentities } from "@/lib/server/reviewers/profile-service";

type ApprovalRow = typeof courseApprovals.$inferSelect;

/** Alle Freigaben desselben Inhaltsstands (mehrere Prüfer, die genau diesen Stand geprüft haben), je Person einmal. */
function sameStandReviewers(rows: ApprovalRow[], hash: string): ApprovalRow[] {
  const seen = new Set<string>();
  const out: ApprovalRow[] = [];
  for (const r of rows) {
    if (r.kind === "editorial" || r.contentHash !== hash) continue;
    const key = r.reviewerUserId ?? `name:${r.reviewerDisplayName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

async function toSeal(rows: ApprovalRow[], approval: ApprovalRow, change: { count: number; sections: number; questions: number } | null): Promise<Seal> {
  const same = sameStandReviewers(rows, approval.contentHash);
  const ids = await publicIdentities(same.flatMap((r) => (r.reviewerUserId ? [r.reviewerUserId] : [])));
  const reviewers = same.flatMap((r) => (r.reviewerUserId && ids.has(r.reviewerUserId) ? [ids.get(r.reviewerUserId)!] : []));
  return {
    reviewers,
    anonymousCount: same.length - reviewers.length,
    versionLabel: approval.versionLabel,
    approvedAt: approval.approvedAt.toISOString(),
    changeCount: change ? change.count : null,
    changes: change && change.count > 0 ? { sections: change.sections, questions: change.questions } : null,
  };
}

/** Siegel für die Kursseite und das Offline-Paket, mit Änderungserkennung. `null` ohne Freigabe (kein Siegel). */
export async function getCourseSeal(certId: string): Promise<Seal | null> {
  const status = await getApprovalStatus(certId);
  if (status.state === "none" || !status.approval) return null;
  const rows = await getDb().select().from(courseApprovals).where(eq(courseApprovals.certificationId, certId)).orderBy(desc(courseApprovals.approvedAt), desc(courseApprovals.id));
  const approval = rows.find((r) => r.id === status.approval!.id);
  if (!approval) return null;
  const n = (d: { added: string[]; removed: string[]; changed: string[] }) => d.added.length + d.removed.length + d.changed.length;
  const change = { count: status.changeCount, sections: status.diff ? n(status.diff.sections) : 0, questions: status.diff ? n(status.diff.questions) : 0 };
  return toSeal(rows, approval, change);
}

/**
 * Siegel für Listen (Katalog): ohne Änderungserkennung, das wäre je Kurs ein Durchlauf über alle Inhalte. Es zeigt den Stand der letzten Prüfung;
 * ob seitdem geändert wurde, steht auf der Kursseite.
 */
export async function getSealSummaries(certIds: string[]): Promise<Map<string, Seal>> {
  const out = new Map<string, Seal>();
  if (certIds.length === 0) return out;
  const db = getDb();
  const general = await db
    .select({ id: certifications.id })
    .from(certifications)
    .where(and(inArray(certifications.id, certIds), eq(certifications.kind, "general"), eq(certifications.catalogStatus, "approved")));
  const ids = general.map((c) => c.id);
  if (ids.length === 0) return out;
  let rows = await db.select().from(courseApprovals).where(inArray(courseApprovals.certificationId, ids)).orderBy(desc(courseApprovals.approvedAt), desc(courseApprovals.id));
  // Altbestand ohne Eintrag: einmal übernehmen (idempotent), wie beim ersten Lesen der Kursseite.
  const have = new Set(rows.map((r) => r.certificationId));
  const missing = ids.filter((id) => !have.has(id));
  if (missing.length > 0) {
    let added = false;
    for (const id of missing) added = (await ensureLegacyApproval(id).catch(() => false)) || added;
    if (added) rows = await db.select().from(courseApprovals).where(inArray(courseApprovals.certificationId, ids)).orderBy(desc(courseApprovals.approvedAt), desc(courseApprovals.id));
  }
  for (const id of ids) {
    const mine = rows.filter((r) => r.certificationId === id);
    const approval = mine.find((r) => r.kind !== "editorial");
    if (approval) out.set(id, await toSeal(mine, approval, null));
  }
  return out;
}

