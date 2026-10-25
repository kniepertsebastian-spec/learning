import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  contentReports,
  courseGenerationJobs,
  domains,
  examAnswers,
  lessons,
  objectives,
  questions,
  quizAnswers,
  sections,
  type SourceReport,
} from "@/lib/server/db/schema";
import { baselineFor, buildSourceReport, compareCoverage, sourceChange, type CoverageResult, type SourceChange } from "@/lib/server/course-generation/coverage";
import { fetchSources, SourceFetchError, type FetchedSource } from "@/lib/server/course-generation/sources";
import { isHandsOn } from "@/lib/markdown/toc";
import { CHAPTER_POOL_MIN, distributeMissingQuestions } from "@/lib/chapters/logic";
import { editableCourse } from "./service";

/**
 * Qualitätsbericht eines Kurses (roadmap3.md, Schritt 2): Struktur je Domain, Abdeckung der offiziellen Lernziele gegen die
 * Quelle und die Liste „Verbesserungspotenzial“. Alles deterministisch aus der Datenbank, ohne KI. Auswertungen über
 * Antworten sind aggregiert (Anzahl, Trefferquote je Frage), nie personenbezogen.
 */

export const HARD_QUESTION_MIN_ANSWERS = 10;
export const HARD_QUESTION_MAX_ACCURACY = 0.4;
export const MIN_QUESTIONS_PER_OBJECTIVE = 4;
export const THIN_LESSON_CHARS = 500;

export type ImprovementKind = "missing_objective" | "open_report" | "hard_question" | "few_questions" | "small_chapter_pool" | "one_question_type" | "hands_on_without_simulation" | "no_exam_callout" | "thin_lesson";
export type Severity = "high" | "medium" | "low";
export type Improvement = {
  id: string;
  kind: ImprovementKind;
  severity: Severity;
  objectiveId: string | null;
  objectiveCode: string | null;
  sectionId: string | null;
  /** Nur bei Punkten zu einer einzelnen Frage (offene Meldung, hohe Fehlerquote). */
  questionId?: string;
  /** Nur bei „few_questions“: wie viele Fragen zur Empfehlung fehlen. */
  needed?: number;
  /** Nur bei „small_chapter_pool“: Kapitel mit weniger als 30 Fragen und wie viele je Lernziel ergänzt werden sollen. */
  chapterPool?: { domainId: string; size: number; needed: number; perObjective: Array<{ objectiveId: string; count: number }> };
  text: { de: string; en: string };
  /** Nur bei „missing_objective“: das offizielle Lernziel und die Domain, in die es vermutlich gehört (gleiche erste Stelle der Nummer). */
  missing?: { code: string; title: string; domainId: string | null };
};

export type DomainRow = { id: string; name: string; objectives: number; sections: number; questions: number; simulations: number; practice: number };

export type CoverageView = {
  /** Warum es keine Abdeckung gibt (kein Auftrag mit Quellen, individuelles Training), sonst null. */
  unavailable: "no_job" | "custom_course" | null;
  checkedAt: string | null;
  sourceCount: number;
  truncated: SourceReport["truncated"];
  /** Als Prüfungsleitfaden erkannte Quelle (vollständig gelesen). */
  primary: { title: string; url: string } | null;
  /** Hat sich die Quelle seit der Kurserstellung (bzw. dem letzten bestätigten Stand) geändert? */
  change: SourceChange | null;
  result: CoverageResult | null;
  canRefresh: boolean;
};

export type CourseReport = {
  totals: { domains: number; objectives: number; sections: number; questions: number; simulations: number; practice: number; openReports: number };
  domains: DomainRow[];
  coverage: CoverageView;
  improvements: Improvement[];
};

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
const SIM = /^\s*(`{3,}|~{3,})\s*simulation\b/m;
const PRACTICE = /^:{3,}\s*practice\b/m;
const EXAM = /^\s*>\s*\[!EXAM\]/m;

const has = (c: { de: string; en: string }, re: RegExp) => re.test(c.de) || re.test(c.en);

/** Empfohlene Fragenanzahl je Lernziel-Code aus dem Blueprint des Erzeugungsauftrags (falls es einen gibt). */
function recommendedByCode(blueprint: Record<string, unknown> | null): Map<string, number> {
  const out = new Map<string, number>();
  const doms = (blueprint as { domains?: Array<{ objectives?: Array<{ code?: unknown; recommendedQuestions?: unknown }> }> } | null)?.domains ?? [];
  for (const d of doms) for (const o of d.objectives ?? []) if (typeof o.code === "string" && typeof o.recommendedQuestions === "number") out.set(o.code, o.recommendedQuestions);
  return out;
}

async function latestJob(certId: string) {
  const [job] = await getDb().select().from(courseGenerationJobs).where(eq(courseGenerationJobs.resultCertificationId, certId)).orderBy(desc(courseGenerationJobs.createdAt)).limit(1);
  return job ?? null;
}

/** Fragen mit genug Antworten und niedriger Trefferquote (Lektionstests und Abschlussprüfungen zusammen, aggregiert). */
async function answerStats(questionIds: string[]): Promise<Map<string, { n: number; correct: number }>> {
  const stats = new Map<string, { n: number; correct: number }>();
  if (!questionIds.length) return stats;
  const db = getDb();
  const rows = [
    ...(await db.select({ id: quizAnswers.questionId, n: sql<number>`count(*)::int`, c: sql<number>`count(*) filter (where ${quizAnswers.isCorrect})::int` }).from(quizAnswers).where(inArray(quizAnswers.questionId, questionIds)).groupBy(quizAnswers.questionId)),
    ...(await db.select({ id: examAnswers.questionId, n: sql<number>`count(*)::int`, c: sql<number>`count(*) filter (where ${examAnswers.isCorrect})::int` }).from(examAnswers).where(inArray(examAnswers.questionId, questionIds)).groupBy(examAnswers.questionId)),
  ];
  for (const r of rows) {
    const cur = stats.get(r.id) ?? { n: 0, correct: 0 };
    stats.set(r.id, { n: cur.n + Number(r.n), correct: cur.correct + Number(r.c) });
  }
  return stats;
}

export async function getCourseReport(certId: string): Promise<CourseReport> {
  await editableCourse(certId);
  const db = getDb();
  const [meta] = await db.select({ courseType: certifications.courseType }).from(certifications).where(eq(certifications.id, certId)).limit(1);
  const doms = await db.select().from(domains).where(eq(domains.certificationId, certId)).orderBy(asc(domains.orderNum));
  const objs = doms.length ? await db.select().from(objectives).where(inArray(objectives.domainId, doms.map((d) => d.id))).orderBy(asc(objectives.code)) : [];
  const objIds = objs.map((o) => o.id);
  const secs = objIds.length
    ? await db
        .select({ id: sections.id, objectiveId: sections.objectiveId, title: sections.title, orderNum: sections.orderNum, lessonId: lessons.id, content: lessons.content })
        .from(sections)
        .innerJoin(lessons, eq(lessons.sectionId, sections.id))
        .where(inArray(sections.objectiveId, objIds))
        .orderBy(asc(sections.orderNum))
    : [];
  const qs = objIds.length ? await db.select({ id: questions.id, objectiveId: questions.objectiveId, humanId: questions.humanId, type: questions.type }).from(questions).where(inArray(questions.objectiveId, objIds)) : [];
  const stats = await answerStats(qs.map((q) => q.id));
  const targetIds = [...secs.map((s) => s.lessonId), ...qs.map((q) => q.id)];
  const reports = targetIds.length
    ? await db
        .select({ targetType: contentReports.targetType, targetId: contentReports.targetId, n: sql<number>`count(*)::int` })
        .from(contentReports)
        .where(and(eq(contentReports.status, "open"), inArray(contentReports.targetId, targetIds)))
        .groupBy(contentReports.targetType, contentReports.targetId)
    : [];
  const lessonReports = new Map(reports.filter((r) => r.targetType === "lesson").map((r) => [r.targetId, Number(r.n)]));
  const questionReports = new Map(reports.filter((r) => r.targetType === "question").map((r) => [r.targetId, Number(r.n)]));

  const job = await latestJob(certId);
  const recommended = recommendedByCode(job?.blueprintJson ?? null);
  const objById = new Map(objs.map((o) => [o.id, o]));

  const improvements: Improvement[] = [];
  const push = (i: Omit<Improvement, "id">) => improvements.push({ ...i, id: `${i.kind}:${i.sectionId ?? i.objectiveId ?? improvements.length}:${improvements.length}` });

  // Struktur je Domain
  const domainRows: DomainRow[] = doms.map((d) => {
    const dObjs = objs.filter((o) => o.domainId === d.id);
    const dSecs = secs.filter((s) => dObjs.some((o) => o.id === s.objectiveId));
    return {
      id: d.id,
      name: d.name,
      objectives: dObjs.length,
      sections: dSecs.length,
      questions: qs.filter((q) => dObjs.some((o) => o.id === q.objectiveId)).length,
      simulations: dSecs.filter((s) => has(s.content, SIM)).length,
      practice: dSecs.filter((s) => has(s.content, PRACTICE)).length,
    };
  });

  // Kapitel-Quiz: jedes Kapitel braucht einen Pool von mindestens 30 Fragen (daraus werden je Aufruf 10 gezogen).
  for (const d of doms) {
    const dObjs = objs.filter((o) => o.domainId === d.id);
    const size = qs.filter((q) => dObjs.some((o) => o.id === q.objectiveId)).length;
    if (dObjs.length === 0 || size >= CHAPTER_POOL_MIN) continue;
    const needed = CHAPTER_POOL_MIN - size;
    const counts = distributeMissingQuestions(needed, dObjs.length);
    push({
      kind: "small_chapter_pool",
      severity: "medium",
      objectiveId: null,
      objectiveCode: null,
      sectionId: null,
      needed,
      chapterPool: { domainId: d.id, size, needed, perObjective: dObjs.map((o, i) => ({ objectiveId: o.id, count: counts[i] ?? 0 })).filter((x) => x.count > 0) },
      text: { de: `Kapitel „${d.name}“: Fragenpool hat ${size} Fragen, für das Kapitel-Quiz sind mindestens ${CHAPTER_POOL_MIN} nötig.`, en: `Chapter “${d.name}”: question pool has ${size} questions, the chapter quiz needs at least ${CHAPTER_POOL_MIN}.` },
    });
  }

  for (const o of objs) {
    const qCount = qs.filter((q) => q.objectiveId === o.id).length;
    const target = recommended.get(o.code) ?? MIN_QUESTIONS_PER_OBJECTIVE;
    // Abwechslung: ab 4 Fragen nicht alle vom selben Typ (nur Wissensfragen prüfen kein Anwenden).
    const types = new Set(qs.filter((q) => q.objectiveId === o.id).map((q) => q.type));
    if (qCount >= MIN_QUESTIONS_PER_OBJECTIVE && types.size === 1) {
      const [only] = types;
      push({ kind: "one_question_type", severity: "low", objectiveId: o.id, objectiveCode: o.code, sectionId: null, text: { de: `${o.code} ${o.title}: alle ${qCount} Fragen sind vom Typ „${only}“.`, en: `${o.code} ${o.title}: all ${qCount} questions are of type “${only}”.` } });
    }
    if (qCount < target) {
      push({ kind: "few_questions", severity: "medium", objectiveId: o.id, objectiveCode: o.code, sectionId: null, needed: target - qCount, text: { de: `${o.code} ${o.title}: ${qCount} Fragen, empfohlen sind ${target}.`, en: `${o.code} ${o.title}: ${qCount} questions, ${target} recommended.` } });
    }
  }
  for (const s of secs) {
    const o = objById.get(s.objectiveId)!;
    const title = s.title.de;
    const reportsHere = lessonReports.get(s.lessonId) ?? 0;
    if (reportsHere > 0) push({ kind: "open_report", severity: "high", objectiveId: o.id, objectiveCode: o.code, sectionId: s.id, text: { de: `Lektion „${title}“: ${reportsHere} offene Meldung(en) von Lernenden.`, en: `Lesson “${s.title.en}”: ${reportsHere} open report(s) from learners.` } });
    if (!has(s.content, EXAM)) push({ kind: "no_exam_callout", severity: "low", objectiveId: o.id, objectiveCode: o.code, sectionId: s.id, text: { de: `Lektion „${title}“ hat keinen Hinweis „Prüfungsrelevant“.`, en: `Lesson “${s.title.en}” has no “exam relevant” callout.` } });
    if (isHandsOn(s.content.de) && !has(s.content, SIM)) push({ kind: "hands_on_without_simulation", severity: "low", objectiveId: o.id, objectiveCode: o.code, sectionId: s.id, text: { de: `Lektion „${title}“ ist praxisnah, hat aber keine Simulation.`, en: `Lesson “${s.title.en}” is hands-on but has no simulation.` } });
    if (s.content.de.trim().length < THIN_LESSON_CHARS) push({ kind: "thin_lesson", severity: "low", objectiveId: o.id, objectiveCode: o.code, sectionId: s.id, text: { de: `Lektion „${title}“ ist sehr kurz (${s.content.de.trim().length} Zeichen).`, en: `Lesson “${s.title.en}” is very short (${s.content.de.trim().length} characters).` } });
  }
  for (const q of qs) {
    const o = objById.get(q.objectiveId)!;
    const r = questionReports.get(q.id) ?? 0;
    if (r > 0) push({ kind: "open_report", severity: "high", objectiveId: o.id, objectiveCode: o.code, sectionId: null, questionId: q.id, text: { de: `Frage ${q.humanId}: ${r} offene Meldung(en) von Lernenden.`, en: `Question ${q.humanId}: ${r} open report(s) from learners.` } });
    const st = stats.get(q.id);
    if (st && st.n >= HARD_QUESTION_MIN_ANSWERS && st.correct / st.n < HARD_QUESTION_MAX_ACCURACY) {
      const wrong = Math.round((1 - st.correct / st.n) * 100);
      push({ kind: "hard_question", severity: "medium", objectiveId: o.id, objectiveCode: o.code, sectionId: null, questionId: q.id, text: { de: `Frage ${q.humanId} wird von ${wrong} % falsch beantwortet (${st.n} Antworten). Unklar formuliert oder falsche Lösung?`, en: `Question ${q.humanId} is answered wrongly by ${wrong}% (${st.n} answers). Unclear wording or wrong answer?` } });
    }
  }

  // Abdeckung gegen die Quelle
  let coverage: CoverageView;
  if (meta?.courseType === "custom") coverage = { unavailable: "custom_course", checkedAt: null, sourceCount: 0, truncated: [], primary: null, change: null, result: null, canRefresh: false };
  else if (!job) coverage = { unavailable: "no_job", checkedAt: null, sourceCount: 0, truncated: [], primary: null, change: null, result: null, canRefresh: false };
  else {
    const rep = job.sourceReport;
    coverage = {
      unavailable: null,
      checkedAt: rep?.checkedAt ?? null,
      sourceCount: rep?.sourceCount ?? 0,
      truncated: rep?.truncated ?? [],
      primary: rep?.primary ?? null,
      change: sourceChange(rep),
      result: rep ? compareCoverage(rep.officialObjectives, objs.map((o) => o.code)) : null,
      canRefresh: job.sourceUrls.length > 0,
    };
    if (coverage.result?.status === "ok") {
      const domainOfPrefix = new Map(objs.map((o) => [o.code.split(".")[0], o.domainId]));
      for (const m of coverage.result.missing) push({ kind: "missing_objective", severity: "high", objectiveId: null, objectiveCode: m.code, sectionId: null, missing: { code: m.code, title: m.title, domainId: domainOfPrefix.get(m.code.split(".")[0]) ?? doms[0]?.id ?? null }, text: { de: `Offizielles Lernziel ${m.code} „${m.title}“ fehlt im Kurs.`, en: `Official objective ${m.code} “${m.title}” is missing from the course.` } });
    }
  }

  improvements.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || (a.objectiveCode ?? "").localeCompare(b.objectiveCode ?? "", undefined, { numeric: true }));
  return {
    totals: {
      domains: doms.length,
      objectives: objs.length,
      sections: secs.length,
      questions: qs.length,
      simulations: domainRows.reduce((s, d) => s + d.simulations, 0),
      practice: domainRows.reduce((s, d) => s + d.practice, 0),
      openReports: [...lessonReports.values(), ...questionReports.values()].reduce((s, n) => s + n, 0),
    },
    domains: domainRows,
    coverage,
    improvements: improvements.slice(0, 300),
  };
}

export class CoverageRefreshError extends Error {}

/**
 * Quellen des Erzeugungsauftrags neu abrufen und die erkannten offiziellen Lernziele speichern („Quelle prüfen“). Für Kurse,
 * die vor dem Quellenbericht entstanden sind, und wenn sich die Quelle geändert hat.
 */
export async function refreshCoverage(certId: string, fetcher: (urls: string[]) => Promise<FetchedSource[]> = fetchSources, now = new Date()): Promise<SourceChange | null> {
  await editableCourse(certId);
  const job = await latestJob(certId);
  if (!job || job.sourceUrls.length === 0) throw new CoverageRefreshError("Zu diesem Kurs ist keine Quelle hinterlegt.");
  let sources: FetchedSource[];
  try {
    sources = await fetcher(job.sourceUrls);
  } catch (error) {
    if (error instanceof SourceFetchError) throw new CoverageRefreshError(`Quelle nicht abrufbar: ${error.message}`);
    throw error;
  }
  const report = { ...buildSourceReport(sources, now), baseline: baselineFor(job.sourceReport) };
  await getDb().update(courseGenerationJobs).set({ sourceReport: report }).where(eq(courseGenerationJobs.id, job.id));
  // Versionsüberwachung: zuletzt gegen die Quelle geprüft.
  await getDb().update(certifications).set({ lastVerifiedDate: now }).where(eq(certifications.id, certId));
  return sourceChange(report);
}

/** Den aktuellen Stand der Quelle als neuen Vergleichsstand bestätigen (nachdem der Kurs angepasst wurde). */
export async function acceptSourceBaseline(certId: string): Promise<void> {
  await editableCourse(certId);
  const job = await latestJob(certId);
  const rep = job?.sourceReport;
  if (!job || !rep) throw new CoverageRefreshError("Die Quelle wurde noch nicht geprüft.");
  const baseline = { checkedAt: rep.checkedAt, fingerprint: rep.fingerprint ?? null, officialObjectives: rep.officialObjectives, versions: rep.versions ?? [] };
  await getDb().update(courseGenerationJobs).set({ sourceReport: { ...rep, baseline } }).where(eq(courseGenerationJobs.id, job.id));
}
