import { sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { DEFAULT_PASS_PERCENT } from "@/lib/server/stats/completions";

/**
 * Aufgabe 05b (Folge zu 05a): bestandene Prüfungsversuche aus der Zeit vor der serverseitigen Prüfung nachrechnen. Liest nur,
 * ändert nichts. Der Bericht enthält nur Anzahlen und Zeiträume, keine Personen.
 *
 * Nachgerechnet wird wie heute in submitExamAttempt(): richtige Antworten auf Fragen DIESER Prüfung (jede Frage einmal) geteilt
 * durch alle Prüfungsfragen. Ein Versuch ist verdächtig, wenn er als bestanden gilt, aber so nachgerechnet unter der
 * Bestehensgrenze liegt. Versuche ganz ohne gespeicherte Antworten (vor R3) lassen sich nicht nachrechnen und werden getrennt
 * gezählt.
 */

export interface AttemptAuditRow {
  attemptId: string;
  userId: string;
  certificationId: string;
  completedAt: Date | null;
  /** Fragen der Prüfung. */
  total: number;
  /** Gespeicherte Antworten (auch fremde und doppelte). */
  answers: number;
  /** Verschiedene Fragen dieser Prüfung unter den Antworten. */
  validDistinct: number;
  /** Davon richtig beantwortet. */
  correctValid: number;
  /** Bestehensgrenze in Prozent (wie passMarkPercent()). */
  mark: number;
  /** Eine Bescheinigung (user_certificates) zum Kurs liegt vor. */
  hasCertificate: boolean;
  /** Ein Kurs-Skill (source = course) zum Kurs liegt vor. */
  hasCourseSkill: boolean;
}

export type AttemptClass = "ok" | "suspicious" | "unverifiable";

export function classifyAttempt(row: Pick<AttemptAuditRow, "total" | "answers" | "correctValid" | "mark">): AttemptClass {
  if (row.answers === 0) return "unverifiable";
  const score = row.total > 0 ? Math.round((row.correctValid / row.total) * 100) : 0;
  return row.total > 0 && score >= row.mark ? "ok" : "suspicious";
}

export interface Range {
  count: number;
  from: string | null;
  to: string | null;
}

export interface AttemptAuditReport {
  /** Als bestanden geltende Versuche insgesamt. */
  passedAttempts: number;
  /** Davon mit weniger verschiedenen gültigen Antworten als Prüfungsfragen (Kriterium der Roadmap). */
  incomplete: Range;
  /** Davon nachgerechnet unter der Bestehensgrenze. */
  suspicious: Range;
  /** Ohne gespeicherte Antworten, nicht nachrechenbar. */
  unverifiable: Range;
  /** Verdächtige Versuche, die das erste Bestehen der Person im Kurs waren: sie haben sehr wahrscheinlich eine Zeile in der
   * anonymen Abschlussstatistik (course_completion_events, final_exam_passed) erzeugt. */
  completionEvents: Range;
  /** Kurs-Skills (source = course), deren Kurs die Person nur mit verdächtigen Versuchen bestanden hat und für den keine
   * Bescheinigung vorliegt. */
  courseSkills: number;
  /** Personen mit mindestens einem verdächtigen Versuch (nur Anzahl). */
  people: number;
}

const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

function range(rows: AttemptAuditRow[]): Range {
  const dates = rows.map((r) => r.completedAt).filter((d): d is Date => d !== null).sort((a, b) => a.getTime() - b.getTime());
  return { count: rows.length, from: day(dates[0] ?? null), to: day(dates[dates.length - 1] ?? null) };
}

/** Wertet die geladenen Zeilen aus (ohne DB, testbar). */
export function summarizeAttemptAudit(rows: AttemptAuditRow[]): AttemptAuditReport {
  const classOf = new Map(rows.map((r) => [r.attemptId, classifyAttempt(r)]));
  const suspicious = rows.filter((r) => classOf.get(r.attemptId) === "suspicious");

  // Erstes Bestehen je Person und Kurs (frühestes Datum, bei Gleichstand stabil nach ID).
  const byPersonCourse = new Map<string, AttemptAuditRow[]>();
  for (const r of rows) {
    const key = `${r.userId}:${r.certificationId}`;
    byPersonCourse.set(key, [...(byPersonCourse.get(key) ?? []), r]);
  }
  const firstPass = new Set<string>();
  let courseSkills = 0;
  for (const list of byPersonCourse.values()) {
    const sorted = [...list].sort((a, b) => (a.completedAt?.getTime() ?? 0) - (b.completedAt?.getTime() ?? 0) || a.attemptId.localeCompare(b.attemptId));
    firstPass.add(sorted[0].attemptId);
    const onlySuspicious = list.every((r) => classOf.get(r.attemptId) === "suspicious");
    if (onlySuspicious && list[0].hasCourseSkill && !list[0].hasCertificate) courseSkills++;
  }

  return {
    passedAttempts: rows.length,
    incomplete: range(rows.filter((r) => r.answers > 0 && r.validDistinct < r.total)),
    suspicious: range(suspicious),
    unverifiable: range(rows.filter((r) => classOf.get(r.attemptId) === "unverifiable")),
    completionEvents: range(suspicious.filter((r) => firstPass.has(r.attemptId))),
    courseSkills,
    people: new Set(suspicious.map((r) => r.userId)).size,
  };
}

/** Lädt alle als bestanden geltenden Versuche (wie recordFinalExamPass(): `passed` gesetzt oder ältere ohne `passed` über der Grenze). */
export async function loadAttemptAuditRows(): Promise<AttemptAuditRow[]> {
  const result = await getDb().execute(sql`
    with attempts as (
      select a.id, a.user_id, a.completed_at, a.exam_id, e.certification_id,
        case when c.passing_score > 0 and c.passing_score <= 100 then c.passing_score else ${DEFAULT_PASS_PERCENT} end as mark,
        a.passed, a.score
      from exam_attempts a
      join exams e on e.id = a.exam_id
      join certifications c on c.id = e.certification_id
    )
    select
      p.id as attempt_id,
      p.user_id,
      p.certification_id,
      p.completed_at,
      p.mark::float8 as mark,
      (select count(distinct q.question_id) from exam_questions q where q.exam_id = p.exam_id)::int as total,
      (select count(*) from exam_answers x where x.exam_attempt_id = p.id)::int as answers,
      (select count(distinct x.question_id) from exam_answers x join exam_questions q on q.exam_id = p.exam_id and q.question_id = x.question_id where x.exam_attempt_id = p.id)::int as valid_distinct,
      (select count(distinct x.question_id) from exam_answers x join exam_questions q on q.exam_id = p.exam_id and q.question_id = x.question_id where x.exam_attempt_id = p.id and x.is_correct)::int as correct_valid,
      exists (select 1 from user_certificates u where u.user_id = p.user_id and u.certification_id = p.certification_id) as has_certificate,
      exists (select 1 from user_skills s where s.user_id = p.user_id and s.source = 'course' and s.source_certification_id = p.certification_id) as has_course_skill
    from attempts p
    where p.passed = true or (p.passed is null and p.score is not null and p.score >= p.mark)
  `);
  return (result as unknown as Array<Record<string, unknown>>).map((r) => ({
    attemptId: String(r.attempt_id),
    userId: String(r.user_id),
    certificationId: String(r.certification_id),
    completedAt: r.completed_at ? new Date(r.completed_at as string) : null,
    total: Number(r.total),
    answers: Number(r.answers),
    validDistinct: Number(r.valid_distinct),
    correctValid: Number(r.correct_valid),
    mark: Number(r.mark),
    hasCertificate: r.has_certificate === true,
    hasCourseSkill: r.has_course_skill === true,
  }));
}

export async function auditExamAttempts(): Promise<AttemptAuditReport> {
  return summarizeAttemptAudit(await loadAttemptAuditRows());
}
