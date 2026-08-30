import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { Localized } from "@/lib/types";

/**
 * v2-Backend-Schema nach roadmap2.md Phase 2/3 (Certification -> Domain ->
 * Objective -> Section -> Lesson/Quiz -> Attempt -> Objective Progress).
 * Bewusst getrennt von lib/db.ts (Dexie, weiterhin die einzige Datenquelle des
 * aktuell deployten Frontends) - siehe roadmap2.md Dev-Order Schritt 1/2.
 * Bilinguale Felder ({de,en}) folgen exakt der Localized<T>-Konvention aus
 * lib/types.ts, als jsonb-Spalte (immer als Paar gelesen/geschrieben, nie
 * teilweise - passend zur bisherigen Dexie-Nutzung).
 */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const certifications = pgTable("certifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  examName: text("exam_name").notNull(),
  examVersion: text("exam_version").notNull(),
  lastVerifiedDate: timestamp("last_verified_date", { withTimezone: true }),
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
  sourceReference: text("source_reference"),
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
