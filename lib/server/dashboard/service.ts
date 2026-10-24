import type { Seal } from "@/lib/reviewers/seal";
import { getSealSummaries } from "@/lib/server/approvals/seal";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  certifications, companyAssignments, courseCategories, domains, examAnswers, examAttempts, lessonCompletions, lessons, objectiveProgress, objectives,
  quizAnswers, quizAttempts, quizzes, sections, studyProfiles, studySessions, type CourseCategoryColor,
} from "@/lib/server/db/schema";
import { visibleCertificationsCondition, type Viewer } from "@/lib/server/catalog/visibility";
import { getDueReviewCount } from "@/lib/server/review/service";
import { getReadiness } from "@/lib/server/readiness/service";
import { getTopWeakObjectives } from "@/lib/server/study/session-service";
import { getProgressView, type ProgressView } from "@/lib/server/progress/snapshots";
import { getLearningContext } from "@/lib/server/study/learning-context";
import {
  accuracy, certState, daysUntil, domainLight, masteryPercent, pickContinueIndex, shortCodeOf, weekBars, weekStart,
  type CertState, type DomainLight,
} from "@/lib/dashboard/logic";
import type { Localized } from "@/lib/types";

export interface DashboardCert {
  id: string;
  slug: string;
  name: string;
  version: string;
  shortCode: string;
  color: CourseCategoryColor;
  doneLessons: number;
  totalLessons: number;
  percent: number;
  state: CertState;
  examInDays: number | null;
  /** Siegel „Fachlich geprüft“ (Stand der letzten Prüfung, ohne Änderungszähler); null ohne Freigabe. */
  seal?: Seal | null;
}

export interface LearnerDashboard {
  certs: DashboardCert[];
  /** Hauptkurs für Bereitschaft, Empfehlung und Wochenziel; null ohne eigene Kurse. */
  main: null | {
    /** Rückblick und Einschätzung mit echten Zahlen (nur für die Person selbst). */
    progress: ProgressView | null;
    cert: DashboardCert;
    readiness: { score: number | null; confidence: number };
    domains: Array<{ name: string; light: DomainLight; percent: number }>;
    recommendation: null | { objectiveId: string; objectiveTitle: string; domainName: string };
    dueCount: number;
  };
  hero: null | {
    certSlug: string;
    certName: string;
    domainName: string;
    sectionId: string;
    sectionTitle: Localized<string>;
    position: number;
    total: number;
    percent: number;
    lastAt: Date | null;
  };
  dueTotal: number;
  streak: number;
  /** Nach einer Pause von mindestens 7 Tagen: Begrüßung statt Rückstand-Zahl. */
  welcomeBack: boolean;
  stats: {
    answeredTotal: number;
    answeredWeek: number;
    accuracyWeek: number | null;
    accuracyDelta: number | null;
    lessonsDone: number;
    lessonsDoneWeek: number;
  };
  week: { counts: number[]; todayIndex: number; activeDays: number; plannedDays: number };
}

const DAY = 86_400_000;

/**
 * Alles für das Lern-Dashboard (UI U3) aus bestehenden Daten: Antworten aus Quiz und Prüfungen, Lektionsabschlüsse,
 * Wiederholungen, Readiness. Keine erfundenen Kennzahlen: Lernzeit wird nicht erfasst und deshalb nicht gezeigt.
 */
export async function getLearnerDashboard(viewer: NonNullable<Viewer>, now: Date = new Date()): Promise<LearnerDashboard> {
  const db = getDb();
  const userId = viewer.id;
  const visible = await db
    .select({ id: certifications.id, slug: certifications.slug, name: certifications.name, examVersion: certifications.examVersion, shortCode: certifications.shortCode, categoryId: certifications.categoryId })
    .from(certifications)
    .where(await visibleCertificationsCondition(viewer))
    .orderBy(certifications.name);
  const certIds = visible.map((c) => c.id);

  const [categoryRows, sectionRows, profileRows, assignmentRows] = await Promise.all([
    db.select({ id: courseCategories.id, color: courseCategories.color }).from(courseCategories),
    certIds.length
      ? db
          .select({ id: sections.id, title: sections.title, certId: domains.certificationId, domainName: domains.name, domainOrder: domains.orderNum, code: objectives.code, order: sections.orderNum })
          .from(sections)
          .innerJoin(lessons, eq(lessons.sectionId, sections.id))
          .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
          .innerJoin(domains, eq(domains.id, objectives.domainId))
          .where(inArray(domains.certificationId, certIds))
          .orderBy(asc(domains.orderNum), asc(objectives.code), asc(sections.orderNum))
      : [],
    db.select({ certId: studyProfiles.certificationId, examDate: studyProfiles.examDate, activeDays: studyProfiles.activeDays }).from(studyProfiles).where(eq(studyProfiles.userId, userId)),
    db.select({ certId: companyAssignments.certificationId }).from(companyAssignments).where(eq(companyAssignments.userId, userId)),
  ]);
  const colorOf = new Map(categoryRows.map((c) => [c.id, c.color]));
  const sectionIds = sectionRows.map((s) => s.id);

  const [completions, quizDone, quizAnswerRows, examAnswerRows, sessionRows] = await Promise.all([
    sectionIds.length ? db.select({ sectionId: lessonCompletions.sectionId, at: lessonCompletions.completedAt }).from(lessonCompletions).where(and(eq(lessonCompletions.userId, userId), inArray(lessonCompletions.sectionId, sectionIds))) : [],
    sectionIds.length
      ? db.select({ sectionId: quizzes.sectionId, at: quizAttempts.completedAt }).from(quizAttempts).innerJoin(quizzes, eq(quizzes.id, quizAttempts.quizId)).where(and(eq(quizAttempts.userId, userId), isNotNull(quizAttempts.completedAt), inArray(quizzes.sectionId, sectionIds)))
      : [],
    db.select({ at: quizAttempts.completedAt, correct: quizAnswers.isCorrect }).from(quizAnswers).innerJoin(quizAttempts, eq(quizAttempts.id, quizAnswers.quizAttemptId)).where(and(eq(quizAttempts.userId, userId), isNotNull(quizAttempts.completedAt))),
    db.select({ at: examAttempts.completedAt, correct: examAnswers.isCorrect }).from(examAnswers).innerJoin(examAttempts, eq(examAttempts.id, examAnswers.examAttemptId)).where(and(eq(examAttempts.userId, userId), isNotNull(examAttempts.completedAt))),
    db.select({ certId: studySessions.certificationId }).from(studySessions).where(and(eq(studySessions.userId, userId), eq(studySessions.status, "completed"))),
  ]);

  // Erledigte Sektionen und zuletzt Bearbeitetes
  const doneAt = new Map<string, Date>();
  for (const r of [...completions, ...quizDone]) {
    if (!r.at) continue;
    const prev = doneAt.get(r.sectionId);
    if (!prev || r.at > prev) doneAt.set(r.sectionId, r.at);
  }
  const lastTouched = [...doneAt.entries()].sort((a, b) => b[1].getTime() - a[1].getTime())[0] ?? null;

  // Antworten (nur mit Zeitpunkt)
  const answers = [...quizAnswerRows, ...examAnswerRows].flatMap((r) => (r.at ? [{ at: r.at, correct: r.correct }] : []));
  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const twoWeeksAgo = new Date(now.getTime() - 14 * DAY);
  const thisWeek = answers.filter((a) => a.at >= weekAgo);
  const prevWeek = answers.filter((a) => a.at >= twoWeeksAgo && a.at < weekAgo);
  const accThis = accuracy(thisWeek);
  const accPrev = accuracy(prevWeek);

  const profileOf = new Map(profileRows.map((p) => [p.certId, p]));
  const assigned = new Set(assignmentRows.map((a) => a.certId));
  const sessionCerts = new Set(sessionRows.map((s) => s.certId));
  const sectionsByCert = new Map<string, typeof sectionRows>();
  for (const s of sectionRows) sectionsByCert.set(s.certId, [...(sectionsByCert.get(s.certId) ?? []), s]);

  const certs: DashboardCert[] = [];
  for (const c of visible) {
    const list = sectionsByCert.get(c.id) ?? [];
    const done = list.filter((s) => doneAt.has(s.id)).length;
    const profile = profileOf.get(c.id);
    const examIn = daysUntil(profile?.examDate ?? null, now);
    const hasActivity = done > 0 || sessionCerts.has(c.id) || Boolean(profile) || assigned.has(c.id);
    if (!hasActivity) continue;
    certs.push({
      id: c.id,
      slug: c.slug,
      name: c.name,
      version: c.examVersion,
      shortCode: shortCodeOf(c.name, c.shortCode),
      color: (c.categoryId && colorOf.get(c.categoryId)) || "info",
      doneLessons: done,
      totalLessons: list.length,
      percent: list.length ? Math.round((done / list.length) * 100) : 0,
      state: certState({ total: list.length, done, hasActivity, examInDays: examIn }),
      examInDays: examIn,
    });
  }

  // Siegel „Fachlich geprüft“ je Kurs (nur allgemeine, freigegebene Kurse).
  const seals = await getSealSummaries(certs.map((c) => c.id)).catch(() => new Map<string, Seal>());
  for (const c of certs) c.seal = seals.get(c.id) ?? null;

  // Hero
  let hero: LearnerDashboard["hero"] = null;
  const mainCertId = lastTouched ? sectionRows.find((s) => s.id === lastTouched[0])?.certId ?? certs[0]?.id : certs[0]?.id;
  if (mainCertId) {
    const list = sectionsByCert.get(mainCertId) ?? [];
    const idx = pickContinueIndex(list.map((s) => ({ id: s.id, done: doneAt.has(s.id) })), lastTouched && list.some((s) => s.id === lastTouched[0]) ? lastTouched[0] : null);
    const target = list[idx];
    const cert = visible.find((c) => c.id === mainCertId);
    if (target && cert) {
      const done = list.filter((s) => doneAt.has(s.id)).length;
      hero = {
        certSlug: cert.slug,
        certName: cert.name,
        domainName: target.domainName,
        sectionId: target.id,
        sectionTitle: target.title,
        position: idx + 1,
        total: list.length,
        percent: list.length ? Math.round((done / list.length) * 100) : 0,
        lastAt: lastTouched ? lastTouched[1] : null,
      };
    }
  }

  // Hauptkurs: Bereitschaft, Domains, Empfehlung
  let main: LearnerDashboard["main"] = null;
  let dueTotal = 0;
  for (const c of certs) dueTotal += await getDueReviewCount(userId, c.id, now);
  const mainCert = certs.find((c) => c.id === mainCertId) ?? certs[0];
  if (mainCert) {
    const [readiness, weak, domainRows, progressRows, due] = await Promise.all([
      getReadiness(userId, mainCert.id, now),
      getTopWeakObjectives(userId, mainCert.id, 1),
      db.select({ id: domains.id, name: domains.name }).from(domains).where(eq(domains.certificationId, mainCert.id)).orderBy(asc(domains.orderNum)),
      db
        .select({ domainId: objectives.domainId, status: objectiveProgress.status })
        .from(objectiveProgress)
        .innerJoin(objectives, eq(objectives.id, objectiveProgress.objectiveId))
        .innerJoin(domains, eq(domains.id, objectives.domainId))
        .where(and(eq(objectiveProgress.userId, userId), eq(domains.certificationId, mainCert.id))),
      getDueReviewCount(userId, mainCert.id, now),
    ]);
    const objectiveCounts = await db
      .select({ domainId: objectives.domainId, n: sql<number>`count(*)::int` })
      .from(objectives)
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .where(eq(domains.certificationId, mainCert.id))
      .groupBy(objectives.domainId);
    const totalOf = new Map(objectiveCounts.map((o) => [o.domainId, o.n]));
    const domainStats = domainRows
      .map((d) => {
        const strong = progressRows.filter((p) => p.domainId === d.id && p.status === "STRONG").length;
        const ok = progressRows.filter((p) => p.domainId === d.id && p.status === "OK").length;
        const percent = masteryPercent(strong, ok, totalOf.get(d.id) ?? 0);
        return { name: d.name, percent, light: domainLight(percent) };
      })
      .sort((a, b) => a.percent - b.percent)
      .slice(0, 3);
    main = {
      cert: mainCert,
      readiness: { score: readiness.score, confidence: readiness.confidence },
      domains: domainStats,
      recommendation: weak[0] ? { objectiveId: weak[0].objectiveId, objectiveTitle: weak[0].objectiveTitle, domainName: weak[0].domainName } : null,
      dueCount: due,
      progress: await getProgressView(userId, mainCert.id, now).catch(() => null),
    };
  }

  const bars = weekBars(answers.map((a) => a.at), now);
  // Wochenziel statt Tagesserie; die Serie (mit Serienschutz) nur, wenn die Person sie eingeschaltet hat („Wie ich lerne“).
  const learning = await getLearningContext(userId, now);

  const weekStartDate = weekStart(now);
  const lessonsDoneWeek = [...doneAt.values()].filter((d) => d >= weekStartDate).length;

  return {
    certs,
    main,
    hero,
    dueTotal,
    streak: learning.preferences.showStreak ? learning.streak : 0,
    welcomeBack: learning.welcomeBack,
    stats: {
      answeredTotal: answers.length,
      answeredWeek: thisWeek.length,
      accuracyWeek: accThis,
      accuracyDelta: accThis !== null && accPrev !== null ? accThis - accPrev : null,
      lessonsDone: doneAt.size,
      lessonsDoneWeek,
    },
    week: { counts: bars.counts, todayIndex: bars.todayIndex, activeDays: learning.weekly.daysLearned, plannedDays: learning.weekly.goal },
  };
}
