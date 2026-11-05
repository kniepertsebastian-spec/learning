import { and, asc, eq, gt, inArray, isNotNull, ne } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certificationSources, certifications, contentReports, courseApprovals, type ContentReportReason } from "@/lib/server/db/schema";
import { isNoticeable, per100, QUALITY_METRICS, qualityFactor, ratioToAverage, type QualityMetric } from "@/lib/reviewers/quality";

/**
 * Qualität im Betrieb (docs/roadmaps/roadmap_pruefer.md, Phase 6), nur für Admins: je Prüfer und Freigabe, wie oft Lernende die geprüften Fragen
 * danach gemeldet haben, im Vergleich zum Durchschnitt aller Freigaben. Dazu die Wiedervorlage: Freigaben, nach denen eine neue Ausgabe einer Quelle
 * dazukam. Nichts davon ist für Prüfer oder die Öffentlichkeit gedacht und nichts löst von selbst eine Folge aus.
 */

const METRIC_OF_REASON: Record<ContentReportReason, QualityMetric> = {
  incorrect: "reports",
  unclear: "reports",
  outdated: "reports",
  variant_outlier: "variantOutliers",
  concept_struggle: "conceptStruggles",
};

export type MetricNumbers = Record<QualityMetric, number>;

export interface ApprovalQuality {
  approvalId: string;
  certificationId: string;
  courseName: string;
  reviewerKey: string;
  reviewerName: string;
  versionLabel: string;
  approvedAt: Date;
  /** Beginn der nächsten Freigabe desselben Kurses: ab dort zählen die Meldungen zu ihr. */
  until: Date | null;
  questions: number;
  counts: MetricNumbers;
}

export interface ReviewerQuality {
  key: string;
  name: string;
  approvals: number;
  questions: number;
  counts: MetricNumbers;
  /** Ereignisse je 100 freigegebene Fragen. */
  rates: MetricNumbers;
  /** Verhältnis zum Durchschnitt aller Freigaben; null, wenn es noch keine Ereignisse gibt. */
  ratios: Record<QualityMetric, number | null>;
  /** Kennzahlen, bei denen der Prüfer deutlich über dem Durchschnitt liegt (Hinweis für den Admin, keine Bewertung). */
  noticeable: QualityMetric[];
}

export interface RecheckEntry {
  certificationId: string;
  courseName: string;
  approvedAt: Date;
  sourceTitle: string;
  sourceRegisteredAt: Date;
}

export interface QualityReport {
  factor: number;
  totals: { approvals: number; questions: number };
  averages: MetricNumbers;
  reviewers: ReviewerQuality[];
  approvals: ApprovalQuality[];
  recheck: RecheckEntry[];
}

const zero = (): MetricNumbers => ({ reports: 0, variantOutliers: 0, conceptStruggles: 0 });

/** `certificationIds` begrenzt den Bericht auf diese Kurse (für Tests und gezielte Auswertungen); ohne Angabe zählen alle allgemeinen Kurse. */
export async function getQualityReport(factor: number = qualityFactor(), options: { certificationIds?: string[] } = {}): Promise<QualityReport> {
  const db = getDb();
  const approvalRows = await db
    .select({ approval: courseApprovals, courseName: certifications.name })
    .from(courseApprovals)
    .innerJoin(certifications, eq(certifications.id, courseApprovals.certificationId))
    .where(and(eq(courseApprovals.kind, "approval"), options.certificationIds ? inArray(courseApprovals.certificationId, options.certificationIds) : undefined))
    .orderBy(asc(courseApprovals.certificationId), asc(courseApprovals.approvedAt));
  const reportRows = await db
    .select({ targetId: contentReports.targetId, reason: contentReports.reason, createdAt: contentReports.createdAt })
    .from(contentReports)
    .where(eq(contentReports.targetType, "question"));
  const byQuestion = new Map<string, Array<{ metric: QualityMetric; createdAt: Date }>>();
  for (const r of reportRows) {
    const list = byQuestion.get(r.targetId) ?? [];
    list.push({ metric: METRIC_OF_REASON[r.reason], createdAt: r.createdAt });
    byQuestion.set(r.targetId, list);
  }

  const approvals: ApprovalQuality[] = approvalRows.map(({ approval, courseName }, index) => {
    const next = approvalRows[index + 1]?.approval;
    const until = next && next.certificationId === approval.certificationId ? next.approvedAt : null;
    const questionIds = Object.keys(approval.fingerprints.questions);
    const counts = zero();
    for (const id of questionIds) {
      for (const event of byQuestion.get(id) ?? []) {
        if (event.createdAt >= approval.approvedAt && (!until || event.createdAt < until)) counts[event.metric]++;
      }
    }
    return {
      approvalId: approval.id,
      certificationId: approval.certificationId,
      courseName,
      reviewerKey: approval.reviewerUserId ?? `name:${approval.reviewerDisplayName.trim().toLowerCase()}`,
      reviewerName: approval.reviewerDisplayName,
      versionLabel: approval.versionLabel,
      approvedAt: approval.approvedAt,
      until,
      questions: questionIds.length,
      counts,
    };
  });

  const totalQuestions = approvals.reduce((sum, a) => sum + a.questions, 0);
  const totalCounts = zero();
  for (const a of approvals) for (const m of QUALITY_METRICS) totalCounts[m] += a.counts[m];
  const averages = zero();
  for (const m of QUALITY_METRICS) averages[m] = per100(totalCounts[m], totalQuestions);

  const grouped = new Map<string, ReviewerQuality>();
  for (const a of approvals) {
    const row = grouped.get(a.reviewerKey) ?? { key: a.reviewerKey, name: a.reviewerName, approvals: 0, questions: 0, counts: zero(), rates: zero(), ratios: { reports: null, variantOutliers: null, conceptStruggles: null }, noticeable: [] };
    row.name = a.reviewerName; // der jüngste Name gewinnt (die Liste läuft nach Datum)
    row.approvals++;
    row.questions += a.questions;
    for (const m of QUALITY_METRICS) row.counts[m] += a.counts[m];
    grouped.set(a.reviewerKey, row);
  }
  const reviewers = [...grouped.values()].map((r) => {
    for (const m of QUALITY_METRICS) {
      r.rates[m] = per100(r.counts[m], r.questions);
      r.ratios[m] = ratioToAverage(r.rates[m], averages[m]);
      if (isNoticeable({ events: r.counts[m], questions: r.questions }, averages[m], factor)) r.noticeable.push(m);
    }
    return r;
  });
  reviewers.sort((a, b) => b.noticeable.length - a.noticeable.length || (b.ratios.reports ?? 0) - (a.ratios.reports ?? 0) || a.name.localeCompare(b.name));

  return { factor, totals: { approvals: approvals.length, questions: totalQuestions }, averages, reviewers, approvals, recheck: await listRecheckRecommended(options.certificationIds) };
}

/**
 * Wiedervorlage: Kurse, deren letzte Freigabe älter ist als eine neue Ausgabe einer Quelle (`supersedesSourceId` gesetzt, d. h. eine neue
 * Prüfungsversion bzw. Quellenausgabe wurde nach der Freigabe erfasst). „Prüfung empfohlen“, kein Entzug der Freigabe.
 */
export async function listRecheckRecommended(certificationIds?: string[]): Promise<RecheckEntry[]> {
  const db = getDb();
  const approvals = await db
    .select({ certificationId: courseApprovals.certificationId, approvedAt: courseApprovals.approvedAt, courseName: certifications.name })
    .from(courseApprovals)
    .innerJoin(certifications, eq(certifications.id, courseApprovals.certificationId))
    .where(and(ne(courseApprovals.kind, "editorial"), certificationIds ? inArray(courseApprovals.certificationId, certificationIds) : undefined));
  const latest = new Map<string, { approvedAt: Date; courseName: string }>();
  for (const a of approvals) {
    const current = latest.get(a.certificationId);
    if (!current || a.approvedAt > current.approvedAt) latest.set(a.certificationId, { approvedAt: a.approvedAt, courseName: a.courseName });
  }
  if (latest.size === 0) return [];
  const sources = await db
    .select({ certificationId: certificationSources.certificationId, title: certificationSources.title, retrievedAt: certificationSources.retrievedAt })
    .from(certificationSources)
    .where(and(inArray(certificationSources.certificationId, [...latest.keys()]), isNotNull(certificationSources.supersedesSourceId), ne(certificationSources.status, "failed"), gt(certificationSources.retrievedAt, new Date(0))))
    .orderBy(asc(certificationSources.retrievedAt));
  const out: RecheckEntry[] = [];
  for (const [certificationId, info] of latest) {
    const newer = sources.find((s) => s.certificationId === certificationId && s.retrievedAt > info.approvedAt);
    if (newer) out.push({ certificationId, courseName: info.courseName, approvedAt: info.approvedAt, sourceTitle: newer.title, sourceRegisteredAt: newer.retrievedAt });
  }
  return out.sort((a, b) => a.courseName.localeCompare(b.courseName));
}
