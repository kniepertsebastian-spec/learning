import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { Locale, Localized } from "@/lib/types";

/** R0.2 (roadmap.md): learner is the default, admin unlocks /admin and every
 * admin API route/server action. */
export type UserRole = "learner" | "admin";

/** R0.1 (roadmap.md): Fehlerklassen für content_generation_jobs, siehe
 * classifyGenerationError() in lib/server/admin/content-generation.ts. */
export type GenerationErrorClass =
  | "schema"
  | "rate_limit"
  | "quota"
  | "provider_outage"
  | "internal";

/** R1.1 (roadmap.md): "url" ist Teil des künftigen Datenmodells, wird aber
 * erstmal nicht angeboten - siehe Kommentar auf certificationSources.sourceType. */
export type CertificationSourceType = "pdf" | "url";

/** R1.1 (roadmap.md): Lebenszyklus einer certification_sources-Zeile. `parsed`
 * wird von R1.1 gesetzt (Textextraktion fertig); `reviewed`/`approved`/
 * `superseded` gehören zum Review-Workflow aus R1.3. */
export type CertificationSourceStatus =
  | "uploaded"
  | "parsed"
  | "reviewed"
  | "approved"
  | "superseded"
  | "failed";

/**
 * v2-Backend-Schema nach roadmap2.md Phase 2/3 (Certification -> Domain ->
 * Objective -> Section -> Lesson/Quiz -> Attempt -> Objective Progress).
 * Einzige Datenquelle des Frontends (das frühere parallele Dexie/IndexedDB-
 * System wurde entfernt - siehe roadmap.md, Konsolidierung vor R4).
 * Bilinguale Felder ({de,en}) folgen exakt der Localized<T>-Konvention aus
 * lib/types.ts, als jsonb-Spalte (immer als Paar gelesen/geschrieben).
 */

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    name: text("name"),
    role: text("role").$type<UserRole>().notNull().default("learner"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("users_role_check", sql`${table.role} in ('learner', 'admin')`)],
);

export const certifications = pgTable("certifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  examName: text("exam_name").notNull(),
  examVersion: text("exam_version").notNull(),
  lastVerifiedDate: timestamp("last_verified_date", { withTimezone: true }),
  /** Prüfungsrealismus-Ergänzung zu R1.2: reales Prüfungsformat, aus der
   * offiziellen Quelle extrahiert (blueprintExtractionSchema) statt wie
   * bisher global hartkodiert (siehe lib/server/exam/blueprint.ts vor dieser
   * Änderung: `totalQuestions = 90` für jede Zertifizierung). Bleibt null,
   * bis eine Quelle freigegeben wurde, die diese Werte enthielt - der
   * Exam-Generator fällt dann weiterhin auf den bisherigen Default zurück. */
  examQuestionCount: integer("exam_question_count"),
  examDurationMinutes: integer("exam_duration_minutes"),
  /** Offizielle Bestehensgrenze auf der jeweiligen Anbieter-Skala (siehe
   * scoreScale), z. B. 750 auf einer 100-900-Skala - rein informativ für die
   * Lernenden-Ansicht, fließt NICHT in die "Readiness"-Berechnung ein (siehe
   * lib/server/exam/scoring.ts: Readiness bleibt bewusst ein prozentualer
   * Lernindikator, keine Simulation der offiziellen Skala). */
  passingScore: numeric("passing_score", { precision: 6, scale: 2 }),
  /** Menschenlesbare Skalenbeschreibung, z. B. "100-900" oder "0-100%". */
  scoreScale: text("score_scale"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const domains = pgTable("domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  certificationId: uuid("certification_id")
    .notNull()
    .references(() => certifications.id, { onDelete: "cascade" }),
  orderNum: integer("order_num").notNull(),
  name: text("name").notNull(),
  weightPercent: numeric("weight_percent", { precision: 5, scale: 2 }),
});

export const objectives = pgTable("objectives", {
  id: uuid("id").primaryKey().defaultRandom(),
  domainId: uuid("domain_id")
    .notNull()
    .references(() => domains.id, { onDelete: "cascade" }),
  /** Offizieller Objective-Code, z. B. "1.2". */
  code: text("code").notNull(),
  title: text("title").notNull(),
  description: text("description"),
});

export const topics = pgTable("topics", {
  id: uuid("id").primaryKey().defaultRandom(),
  objectiveId: uuid("objective_id")
    .notNull()
    .references(() => objectives.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
});

export const sections = pgTable("sections", {
  id: uuid("id").primaryKey().defaultRandom(),
  objectiveId: uuid("objective_id")
    .notNull()
    .references(() => objectives.id, { onDelete: "cascade" }),
  orderNum: integer("order_num").notNull(),
  title: jsonb("title").$type<Localized<string>>().notNull(),
  estimatedMinutes: integer("estimated_minutes"),
  difficulty: text("difficulty"),
});

/** R1.4 (roadmap.md): Herkunft/Prüfstatus einer Lesson.
 * "unreviewed" = wie bisher frei generiert (kein Quellenbezug) - Default, damit
 *   bestehende Zeilen nach der Migration unverändert gelten.
 * "grounded" = quellengebunden generiert, alle Aussagen zitiert.
 * "needs_review" = quellengebunden generiert, aber mindestens eine Aussage
 *   konnte nicht eindeutig belegt werden ("als Review-Fall markieren").
 * "stale" = R1.5: die Quelle, aus der diese Lesson stammt, wurde durch eine
 *   neue Version ersetzt, die dieses Objective inhaltlich verändert hat. */
export type LessonReviewStatus = "unreviewed" | "grounded" | "needs_review" | "stale";

export const lessons = pgTable("lessons", {
  id: uuid("id").primaryKey().defaultRandom(),
  sectionId: uuid("section_id")
    .notNull()
    .unique()
    .references(() => sections.id, { onDelete: "cascade" }),
  content: jsonb("content").$type<Localized<string>>().notNull(),
  keyTakeaways: jsonb("key_takeaways").$type<Localized<string[]>>(),
  examFocusPoints: jsonb("exam_focus_points").$type<Localized<string[]>>(),
  version: integer("version").notNull().default(1),
  promptVersion: text("prompt_version"),
  modelVersion: text("model_version"),
  /** R1.4: welche freigegebene Quelle (falls überhaupt eine) für diese Lesson
   * herangezogen wurde - "Blueprint-Version" ist hier schlicht die jeweilige
   * certification_sources-Zeile, da jede freigegebene Quelle eine Version
   * des Blueprints darstellt (siehe R1.5: supersedesSourceId verkettet sie). */
  sourceVersionId: uuid("source_version_id").references(() => certificationSources.id, {
    onDelete: "set null",
  }),
  reviewStatus: text("review_status").$type<LessonReviewStatus>().notNull().default("unreviewed"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const questions = pgTable("questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Menschenlesbare, stabile ID, z. B. "SEC-1.2-Q000183". */
  humanId: text("human_id").notNull().unique(),
  objectiveId: uuid("objective_id")
    .notNull()
    .references(() => objectives.id, { onDelete: "cascade" }),
  topicId: uuid("topic_id").references(() => topics.id, { onDelete: "set null" }),
  difficulty: text("difficulty").notNull(),
  type: text("type").notNull(),
  question: jsonb("question").$type<Localized<string>>().notNull(),
  explanation: jsonb("explanation").$type<Localized<string>>().notNull(),
  /** Menschenlesbarer Locator-Text (z. B. "S. 4"), unabhängig von sourceChunkId
   * unten gepflegt - bleibt auch dann lesbar, falls der Chunk später gelöscht
   * würde (onDelete: set null). */
  sourceReference: text("source_reference"),
  /** R1.4 (roadmap.md): "questions.sourceReference zu einer echten Relation
   * weiterentwickeln" - der eigentliche Beleg, zusätzlich zum Text oben. */
  sourceChunkId: uuid("source_chunk_id").references(() => sourceChunks.id, {
    onDelete: "set null",
  }),
  /** R1.5: true, wenn die Quelle, aus der diese Frage stammt, durch eine neue
   * Version ersetzt wurde, die dieses Objective inhaltlich verändert hat. */
  stale: boolean("stale").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const questionOptions = pgTable("question_options", {
  id: uuid("id").primaryKey().defaultRandom(),
  questionId: uuid("question_id")
    .notNull()
    .references(() => questions.id, { onDelete: "cascade" }),
  orderNum: integer("order_num").notNull(),
  text: jsonb("text").$type<Localized<string>>().notNull(),
  isCorrect: boolean("is_correct").notNull().default(false),
});

export const quizzes = pgTable("quizzes", {
  id: uuid("id").primaryKey().defaultRandom(),
  sectionId: uuid("section_id")
    .notNull()
    .references(() => sections.id, { onDelete: "cascade" }),
  certificationId: uuid("certification_id")
    .notNull()
    .references(() => certifications.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const quizAttempts = pgTable("quiz_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  quizId: uuid("quiz_id")
    .notNull()
    .references(() => quizzes.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  score: numeric("score", { precision: 5, scale: 2 }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const quizAnswers = pgTable("quiz_answers", {
  id: uuid("id").primaryKey().defaultRandom(),
  quizAttemptId: uuid("quiz_attempt_id")
    .notNull()
    .references(() => quizAttempts.id, { onDelete: "cascade" }),
  questionId: uuid("question_id")
    .notNull()
    .references(() => questions.id, { onDelete: "cascade" }),
  selectedOptionId: uuid("selected_option_id").references(() => questionOptions.id, {
    onDelete: "set null",
  }),
  isCorrect: boolean("is_correct").notNull(),
});

export const objectiveProgress = pgTable(
  "objective_progress",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    masteryScore: numeric("mastery_score", { precision: 5, scale: 2 }).notNull().default("0"),
    /** z. B. "NEEDS_REMEDIATION" | "OK" | "STRONG". */
    status: text("status").notNull().default("NEEDS_REMEDIATION"),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
  },
  (table) => [unique().on(table.userId, table.objectiveId)],
);

export const remediationSessions = pgTable("remediation_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  objectiveId: uuid("objective_id")
    .notNull()
    .references(() => objectives.id, { onDelete: "cascade" }),
  quizAttemptId: uuid("quiz_attempt_id").references(() => quizAttempts.id, {
    onDelete: "set null",
  }),
  /**
   * Generated lesson + practice questions, persisted so repeated requests for
   * the same session reuse this instead of calling the (billed) AI service
   * again - see RemediationService.getOrCreateRemediationSession.
   */
  content: jsonb("content").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  improved: boolean("improved"),
});

/** R2.2 (roadmap.md): "letzter Ausgang" einer Wiederholung. */
export type ReviewOutcome = "correct" | "incorrect";

/**
 * R2.2 (roadmap.md): Spaced-Repetition-Zustand pro (Nutzer, Frage) - ein
 * vereinfachter SM-2/Leitner-Hybrid (siehe lib/server/review/scheduler.ts),
 * bewusst NICHT pro Objective, weil "Fragenrotation sicherstellen" (roadmap.md)
 * eine pro-Frage-Fälligkeit braucht: sonst würde ein Objective mit vielen
 * Fragen nach der ersten richtigen Antwort komplett als "erledigt" gelten,
 * statt die einzelnen Fragen tatsächlich zu rotieren. `questionId` verweist
 * auf eine echte questions-Zeile - Remediation-Fragen sind absichtlich
 * ausgeschlossen (die werden pro Session ad-hoc generiert, nicht in
 * `questions` persistiert, siehe RemediationService).
 */
export const reviewItems = pgTable(
  "review_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull().defaultNow(),
    /** Aktuelles Wiederholungsintervall in Tagen (kann gebrochen sein, z. B.
     * durch die Schwierigkeits-Gewichtung in computeNextReview()). */
    intervalDays: numeric("interval_days", { precision: 6, scale: 2 }).notNull().default("0"),
    /** Anzahl AUFEINANDERFOLGENDER richtiger Antworten - jede falsche Antwort
     * setzt das auf 0 zurück (siehe computeNextReview()). */
    repetitions: integer("repetitions").notNull().default(0),
    /** SM-2-artiger Ease-Faktor, steuert wie stark das Intervall bei
     * richtigen Antworten wächst - sinkt bei falschen, steigt bei richtigen,
     * innerhalb [1.3, 2.8] geklemmt. */
    easeFactor: numeric("ease_factor", { precision: 4, scale: 2 }).notNull().default("2.5"),
    lastOutcome: text("last_outcome").$type<ReviewOutcome>(),
    lastAnsweredAt: timestamp("last_answered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("review_items_user_question_unique").on(table.userId, table.questionId),
    check(
      "review_items_last_outcome_check",
      sql`${table.lastOutcome} is null or ${table.lastOutcome} in ('correct', 'incorrect')`,
    ),
  ],
);

/** R2.1 (roadmap.md): "Tägliches Zeit- oder Fragenziel festlegen" - genau
 * eines von beiden gilt, je nachdem, was `dailyGoalType` sagt. */
export type StudyGoalType = "minutes" | "questions";

/**
 * R2.1: Lernprofil je (Nutzer, Zertifizierung) - Grundlage für den Session
 * Builder (R2.3) und das "Heute lernen"-Dashboard (R2.4). Eine separate
 * Tabelle statt Felder auf `users`, weil das Profil PRO KURS gilt (Prüfungs-
 * termin und Tagesziel unterscheiden sich je Zertifizierung). "Ziel jederzeit
 * änderbar machen, ohne bisherigen Fortschritt zu verlieren" ist dadurch
 * erfüllt, dass diese Tabelle reine Zieleinstellungen hält und nie etwas in
 * objective_progress/review_items/quiz_attempts anfasst - ein Update hier
 * kann also strukturell keinen Fortschritt löschen.
 */
export const studyProfiles = pgTable(
  "study_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    certificationId: uuid("certification_id")
      .notNull()
      .references(() => certifications.id, { onDelete: "cascade" }),
    /** "Prüfungstermin optional speichern" - bewusst nullable. */
    examDate: timestamp("exam_date", { withTimezone: true }),
    dailyGoalType: text("daily_goal_type").$type<StudyGoalType>().notNull().default("minutes"),
    dailyGoalValue: integer("daily_goal_value").notNull().default(15),
    /** ISO-Wochentage (1 = Montag ... 7 = Sonntag), an denen gelernt werden
     * soll - "Aktive Lerntage ... speichern". */
    activeDays: jsonb("active_days").$type<number[]>().notNull().default([1, 2, 3, 4, 5, 6, 7]),
    /** "bevorzugte Sprache speichern" - unabhängig vom UI-Sprachcookie
     * (lib/server/locale.ts): eine bewusste Lernziel-Angabe je Kurs, z. B. um
     * Inhalte auf Englisch zu üben, obwohl die Oberfläche auf Deutsch steht.
     * `null` = keine Präferenz (UI-Sprache gilt weiter). */
    preferredLocale: text("preferred_locale").$type<Locale>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("study_profiles_user_certification_unique").on(table.userId, table.certificationId),
    check(
      "study_profiles_daily_goal_type_check",
      sql`${table.dailyGoalType} in ('minutes', 'questions')`,
    ),
    check("study_profiles_daily_goal_value_check", sql`${table.dailyGoalValue} > 0`),
    check(
      "study_profiles_preferred_locale_check",
      sql`${table.preferredLocale} is null or ${table.preferredLocale} in ('de', 'en')`,
    ),
  ],
);

/** R2.3 (roadmap.md): Lebenszyklus einer Lernsession. */
export type StudySessionStatus = "planned" | "in_progress" | "completed" | "skipped" | "abandoned";

/**
 * R2.3: eine vom Session Builder zusammengestellte, tageweise Lerneinheit
 * aus fälligen Wiederholungen, schwachen Bereichen und neuem Stoff (siehe
 * lib/server/study/session-builder.ts). `goalType`/`goalValue` sind ein
 * Schnappschuss des zum Erstellungszeitpunkt gültigen study_profiles-Ziels -
 * bewusst nicht live aus study_profiles gelesen, damit eine spätere
 * Zieländerung eine bereits gebaute Session nicht rückwirkend verändert
 * ("Session deterministisch speichern, damit ein Reload sie nicht
 * verändert"). Höchstens eine aktive (planned/in_progress) Session pro
 * (Nutzer, Zertifizierung) - derselbe Unique-Partial-Index-Ansatz wie bei
 * content_generation_jobs (R0.3): ein Reload liest dieselbe Zeile erneut,
 * statt eine neue Session zu erzeugen.
 */
export const studySessions = pgTable(
  "study_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    certificationId: uuid("certification_id")
      .notNull()
      .references(() => certifications.id, { onDelete: "cascade" }),
    status: text("status").$type<StudySessionStatus>().notNull().default("planned"),
    goalType: text("goal_type").$type<StudyGoalType>().notNull(),
    goalValue: integer("goal_value").notNull(),
    plannedAt: timestamp("planned_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("study_sessions_active_per_user_cert")
      .on(table.userId, table.certificationId)
      .where(sql`${table.status} in ('planned', 'in_progress')`),
    check(
      "study_sessions_status_check",
      sql`${table.status} in ('planned', 'in_progress', 'completed', 'skipped', 'abandoned')`,
    ),
    check("study_sessions_goal_type_check", sql`${table.goalType} in ('minutes', 'questions')`),
  ],
);

/** R2.3: die drei Session-Builder-Kategorien plus der Lesson-Fallback ("Bei
 * zu kleinem Fragenpool auf Lesson-Wiederholung ... zurückfallen"). */
export type StudySessionItemCategory = "review" | "weak" | "new" | "lesson";

/**
 * R2.3: eine einzelne Position innerhalb einer study_sessions-Zeile.
 * `referenceId` verweist je nach `referenceType` auf `questions.id` oder
 * `sections.id` - bewusst OHNE DB-seitige FK (eine Spalte kann nicht auf
 * zwei verschiedene Tabellen verweisen), Integrität wird ausschließlich in
 * lib/server/study/session-service.ts sichergestellt, das diese Zeilen
 * schreibt. `outcome` bleibt für Lesson-Items immer null (die werden
 * gelesen, nicht beantwortet).
 */
export const studySessionItems = pgTable("study_session_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => studySessions.id, { onDelete: "cascade" }),
  orderNum: integer("order_num").notNull(),
  category: text("category").$type<StudySessionItemCategory>().notNull(),
  referenceType: text("reference_type").$type<"question" | "section">().notNull(),
  referenceId: uuid("reference_id").notNull(),
  outcome: text("outcome").$type<ReviewOutcome>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const contentGenerationJobs = pgTable(
  "content_generation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    certificationId: uuid("certification_id")
      .notNull()
      .references(() => certifications.id, { onDelete: "cascade" }),
    /** R0.3 (roadmap.md): welcher Admin den (kostenpflichtigen) Job gestartet hat. */
    startedByUserId: uuid("started_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("queued"),
    phase: text("phase").notNull().default("queued"),
    progress: integer("progress").notNull().default(0),
    message: text("message"),
    error: text("error"),
    /** R0.1 (roadmap.md): grobe Fehlerklasse für die Admin-UI, siehe
     * classifyGenerationError() in content-generation.ts. */
    errorClass: text("error_class").$type<GenerationErrorClass>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    // R0.3: DB-seitig höchstens ein aktiver Job pro Zertifizierung erzwingen,
    // statt sich nur auf die (race-anfällige) Anwendungsprüfung zu verlassen -
    // zwei fast gleichzeitige Startanfragen können so nur einen Job erzeugen.
    uniqueIndex("content_generation_jobs_active_per_cert")
      .on(table.certificationId)
      .where(sql`${table.status} in ('queued', 'running')`),
    check(
      "content_generation_jobs_error_class_check",
      sql`${table.errorClass} is null or ${table.errorClass} in ('schema', 'rate_limit', 'quota', 'provider_outage', 'internal')`,
    ),
  ],
);

export const exams = pgTable("exams", {
  id: uuid("id").primaryKey().defaultRandom(),
  certificationId: uuid("certification_id")
    .notNull()
    .references(() => certifications.id, { onDelete: "cascade" }),
  /** Domänen-Verteilung etc., siehe roadmap2.md Phase 12. */
  blueprint: jsonb("blueprint").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const examQuestions = pgTable("exam_questions", {
  id: uuid("id").primaryKey().defaultRandom(),
  examId: uuid("exam_id")
    .notNull()
    .references(() => exams.id, { onDelete: "cascade" }),
  questionId: uuid("question_id")
    .notNull()
    .references(() => questions.id, { onDelete: "cascade" }),
  orderNum: integer("order_num").notNull(),
});

export const examAttempts = pgTable("exam_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  examId: uuid("exam_id")
    .notNull()
    .references(() => exams.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  score: numeric("score", { precision: 5, scale: 2 }),
  passed: boolean("passed"),
  /** "Practice readiness" - bewusst nicht als Bestehens-Garantie formuliert, siehe roadmap2.md Phase 13. */
  readiness: text("readiness"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  durationSeconds: integer("duration_seconds"),
});

/**
 * R3 (roadmap.md): persistiert die einzelnen Antworten eines Exam-Versuchs -
 * bis hierher (anders als bei quiz_answers) nirgends gespeichert, nur
 * transient beim Einreichen berechnet und an den Client zurückgegeben. Ohne
 * das lässt sich eine "Detailseite pro Versuch mit Domain- und
 * Objective-Auswertung" für einen VERGANGENEN Versuch nicht mehr rekonstru-
 * ieren, sobald die Antwort einmal abgeschickt wurde. Bewusst analog zu
 * quiz_answers (gleiche Spalten/Constraints), damit beide Auswertungspfade
 * (lib/server/exam/scoring.ts) dieselbe Form konsumieren können.
 */
export const examAnswers = pgTable("exam_answers", {
  id: uuid("id").primaryKey().defaultRandom(),
  examAttemptId: uuid("exam_attempt_id")
    .notNull()
    .references(() => examAttempts.id, { onDelete: "cascade" }),
  questionId: uuid("question_id")
    .notNull()
    .references(() => questions.id, { onDelete: "cascade" }),
  selectedOptionId: uuid("selected_option_id").references(() => questionOptions.id, {
    onDelete: "set null",
  }),
  isCorrect: boolean("is_correct").notNull(),
});

/**
 * R1.1 (roadmap.md): offizielle Prüfungsunterlagen als Quelle der Wahrheit
 * (Leitplanke). Volles Datenmodell laut roadmap.md R1-Abschnitt in einer
 * Tabelle, auch wenn R1.1 nur Upload+Extraktion (status uploaded -> parsed/
 * failed) bedient - approvedBy/approvedAt/versionLabel bleiben bis zum
 * Review-Workflow aus R1.3 ungenutzt (null), statt dafür eine zweite
 * Migration zu brauchen.
 */
export const certificationSources = pgTable(
  "certification_sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    certificationId: uuid("certification_id")
      .notNull()
      .references(() => certifications.id, { onDelete: "cascade" }),
    /** Nur "pdf" wird aktuell angenommen (siehe R1.1-Entscheidung: URL-Import
     * folgt erst, sobald geklärt ist, von welchen Anbietern automatisiert
     * abgerufen werden darf). */
    sourceType: text("source_type").$type<CertificationSourceType>().notNull(),
    title: text("title").notNull(),
    provider: text("provider").notNull(),
    sourceUrl: text("source_url"),
    /** Pfad/Key im lokalen Storage (lib/server/storage/local-disk.ts), nicht
     * direkt eine Dateisystem-Absolute - siehe dort. */
    storageKey: text("storage_key").notNull(),
    mimeType: text("mime_type").notNull(),
    fileSizeBytes: integer("file_size_bytes").notNull(),
    /** SHA-256 der Originaldatei, zur Duplikaterkennung je Zertifizierung. */
    checksum: text("checksum").notNull(),
    /** Offizielles Veröffentlichungsdatum der Unterlage (admin-seitig erfasst). */
    publishedAt: timestamp("published_at", { withTimezone: true }),
    /** Wann diese Quelle hochgeladen/abgerufen wurde. */
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").$type<CertificationSourceStatus>().notNull().default("uploaded"),
    /** Fehlertext, falls status = "failed" (z. B. Extraktion fehlgeschlagen). */
    parseError: text("parse_error"),
    versionLabel: text("version_label"),
    /** R1.5: admin-gesetzt beim Upload, wenn diese Quelle eine neue Ausgabe
     * einer bereits freigegebenen Quelle ist - approveBlueprintDraft() nutzt
     * das für den Diff und um betroffene Lessons/Questions als stale zu
     * markieren, und setzt die referenzierte alte Quelle auf "superseded". */
    supersedesSourceId: uuid("supersedes_source_id").references(
      (): AnyPgColumn => certificationSources.id,
      { onDelete: "set null" },
    ),
    approvedBy: uuid("approved_by").references(() => users.id, { onDelete: "set null" }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("certification_sources_cert_checksum_unique").on(
      table.certificationId,
      table.checksum,
    ),
    check(
      "certification_sources_source_type_check",
      sql`${table.sourceType} in ('pdf', 'url')`,
    ),
    check(
      "certification_sources_status_check",
      sql`${table.status} in ('uploaded', 'parsed', 'reviewed', 'approved', 'superseded', 'failed')`,
    ),
  ],
);

/**
 * R1.1: seitenweise extrahierter Text einer Quelle, mit Seitenbezug - Basis
 * für objective_source_refs (R1.2) und die knappe/vollständige
 * Quellenangabe in Lern-/Adminansicht (R1.4).
 */
export const sourceChunks = pgTable(
  "source_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => certificationSources.id, { onDelete: "cascade" }),
    pageNumber: integer("page_number").notNull(),
    /** Grober Abschnittspfad (z. B. Kapitelüberschrift), erst mit einer
     * strukturierten Extraktion (R1.2) sinnvoll befüllbar - bis dahin null. */
    sectionPath: text("section_path"),
    content: text("content").notNull(),
    /** SHA-256 von `content`, um identische Chunks nach erneuter Extraktion
     * zu erkennen statt sie zu duplizieren. */
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("source_chunks_source_page_unique").on(table.sourceId, table.pageNumber),
  ],
);

/**
 * R1.2 (roadmap.md): KI-Extraktionsvorschlag für eine Quelle - ein Draft pro
 * Quelle (erneute Extraktion überschreibt den bisherigen Draft statt einen
 * neuen anzulegen, siehe generateBlueprintDraft-Aufrufstelle). `content` hält
 * die volle Struktur (Zertifizierungsmetadaten, Domains, Objectives je mit
 * Locator+Confidence, siehe blueprintExtractionSchema) als jsonb, analog zum
 * bereits etablierten Muster bei remediation_sessions.content - relationale
 * Tabellen (objective_source_refs etc.) sind erst sinnvoll, sobald ein Draft
 * in R1.3 tatsächlich freigegeben und in die echten domains/objectives-
 * Tabellen übernommen wird.
 */
export const blueprintDrafts = pgTable("blueprint_drafts", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: uuid("source_id")
    .notNull()
    .unique()
    .references(() => certificationSources.id, { onDelete: "cascade" }),
  certificationId: uuid("certification_id")
    .notNull()
    .references(() => certifications.id, { onDelete: "cascade" }),
  /** Struktur siehe blueprintExtractionSchema (lib/server/ai/schemas.ts) -
   * bewusst nur locker typisiert statt mit dem Zod-Typ, damit db/schema.ts
   * nicht von lib/server/ai/ importieren muss; an den Lese-/Schreibstellen
   * in lib/server/admin/blueprint.ts wird konkret typisiert. */
  content: jsonb("content").$type<Record<string, unknown>>().notNull(),
  /** Aus Zertifizierungsname + Exam-Code vorgeschlagen (suggestSlug()),
   * bewusst editierbar - siehe R1.2-Arbeitspaket. */
  suggestedSlug: text("suggested_slug").notNull(),
  /** R1.3: blockierende Validierungsfehler aus validateBlueprintDraft() (z. B.
   * doppelte Objective-Codes innerhalb einer Domain) - verhindert die Freigabe
   * (approveBlueprintDraft), anders als warnings unten. */
  validationErrors: jsonb("validation_errors").$type<string[]>().notNull().default([]),
  /** Nicht-blockierende Hinweise aus validateBlueprintDraft() (Gewichtssumme,
   * Lücken, niedrige Confidence, ...) - bei jeder (Neu-)Generierung oder
   * Inhalts-Korrektur neu berechnet statt separat gepflegt. */
  warnings: jsonb("warnings").$type<string[]>().notNull().default([]),
  /** true, falls der Quelltext für den KI-Aufruf gekürzt werden musste (siehe
   * buildSourceText) - macht sichtbar, dass nicht das ganze Dokument einbezogen wurde. */
  truncatedSource: boolean("truncated_source").notNull().default(false),
  /** R1.2-Nachtrag: "Niedrige Extraktionssicherheit ... manuelle Bestätigung
   * verlangen" - Positions-Keys ("<domainIndex>:<objectiveIndex>") der
   * Objectives, die ein Admin trotz confidence < 0.5 explizit bestätigt hat
   * (siehe BlueprintReview). validateBlueprintDraft() blockiert die Freigabe,
   * solange ein niedrig-konfidentes Objective hier fehlt. Wird bei jeder
   * Neu-Extraktion zurückgesetzt (neuer Inhalt = neue Prüfung nötig). */
  confirmedLowConfidenceObjectives: jsonb("confirmed_low_confidence_objectives")
    .$type<string[]>()
    .notNull()
    .default([]),
  modelVersion: text("model_version"),
  promptVersion: text("prompt_version"),
  generatedByUserId: uuid("generated_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  editedByUserId: uuid("edited_by_user_id").references(() => users.id, { onDelete: "set null" }),
  editedAt: timestamp("edited_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * R1.4 (roadmap.md): reale Relation zwischen einem freigegebenen Objective
 * und den Quellenseiten, die es belegen - wird beim Freigeben
 * (approveBlueprintDraft -> applyBlueprintDraft) aus dem Locator-Text des
 * Drafts abgeleitet (siehe lib/server/admin/blueprint-approval.ts,
 * parseLocatorPageNumbers). Grundlage für "Quellenabdeckung validieren"
 * (jedes Objective braucht mindestens eine Referenz) und für die
 * quellengebundene Generierung.
 */
export const objectiveSourceRefs = pgTable(
  "objective_source_refs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    objectiveId: uuid("objective_id")
      .notNull()
      .references(() => objectives.id, { onDelete: "cascade" }),
    sourceChunkId: uuid("source_chunk_id")
      .notNull()
      .references(() => sourceChunks.id, { onDelete: "cascade" }),
    /** Menschenlesbar aus dem Blueprint-Draft übernommen, z. B. "S. 4-5". */
    locator: text("locator").notNull(),
    /** Aus dem Blueprint-Draft übernommene Extraktionssicherheit (0-1). */
    confidence: numeric("confidence", { precision: 3, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("objective_source_refs_objective_chunk_unique").on(
      table.objectiveId,
      table.sourceChunkId,
    ),
  ],
);

/** R4.3 (roadmap.md): serverseitige Idempotenz-Wache für die Offline-Sync-
 * Queue. Jede Zeile entspricht genau einem clientseitig erzeugten Ereignis
 * (SectionQuiz-Abschluss oder Session-Abschluss, offline aufgezeichnet) -
 * der Unique-Index auf (userId, clientEventId) sorgt dafür, dass ein Retry
 * desselben Ereignisses (z. B. nach einem Netzwerkfehler mitten im vorigen
 * Sync-Versuch) es niemals ein zweites Mal anwendet: der Sync-Endpunkt
 * versucht zuerst, die Zeile einzufügen, wendet die eigentliche Logik
 * (Quiz-/Session-Auswertung) nur bei Erfolg an und gibt bei einem Konflikt
 * einfach das zuvor gespeicherte Ergebnis zurück. */
export type SyncEventType = "section_quiz" | "study_session";
export type SyncEventStatus = "applied" | "conflict" | "error";

export const syncEvents = pgTable(
  "sync_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Clientseitig per crypto.randomUUID() erzeugt (lib/client/sync-queue.ts). */
    clientEventId: text("client_event_id").notNull(),
    type: text("type").$type<SyncEventType>().notNull(),
    status: text("status").$type<SyncEventStatus>().notNull(),
    /** Zeitpunkt, zu dem das Ereignis OFFLINE aufgezeichnet wurde (vom
     * Client mitgeliefert) - Grundlage für die Konfliktauflösung "nach
     * Ereigniszeit und Serverstatus". */
    clientCreatedAt: timestamp("client_created_at", { withTimezone: true }).notNull(),
    /** Kompaktes, für die Client-UI verwertbares Ergebnis (z. B. Score),
     * damit ein Retry dasselbe Ergebnis erneut liefern kann, ohne die
     * zugrundeliegenden Tabellen erneut zu lesen. */
    resultSummary: jsonb("result_summary"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("sync_events_user_client_event_unique").on(table.userId, table.clientEventId),
  ],
);
