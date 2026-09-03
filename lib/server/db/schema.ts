import { sql } from "drizzle-orm";
import {
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
import type { Localized } from "@/lib/types";

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
 * Bewusst getrennt von lib/db.ts (Dexie, weiterhin die einzige Datenquelle des
 * aktuell deployten Frontends) - siehe roadmap2.md Dev-Order Schritt 1/2.
 * Bilinguale Felder ({de,en}) folgen exakt der Localized<T>-Konvention aus
 * lib/types.ts, als jsonb-Spalte (immer als Paar gelesen/geschrieben, nie
 * teilweise - passend zur bisherigen Dexie-Nutzung).
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
