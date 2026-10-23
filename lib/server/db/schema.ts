import { sql } from "drizzle-orm";
import {
  date,
  type AnyPgColumn,
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { AnswerConfidence, EnergyLevel, Locale, Localized } from "@/lib/types";
import type { CourseOverview } from "@/lib/course-overview";

/** R0.2 (roadmap.md): learner is the default, admin unlocks /admin and every
 * admin API route/server action. */
export type UserRole = "learner" | "admin";
export const AGE_RANGES = ["under_18", "18_24", "25_34", "35_44", "45_54", "55_plus"] as const;
export type AgeRange = (typeof AGE_RANGES)[number];
export const EVALUATION_GROUPS = ["vanilla", "planning", "planning_state"] as const;
export type EvaluationGroup = (typeof EVALUATION_GROUPS)[number];

/** R0.1 (roadmap.md): Fehlerklassen für content_generation_jobs, siehe
 * classifyGenerationError() in lib/server/admin/content-generation.ts. */
export type GenerationErrorClass =
  | "schema"
  | "rate_limit"
  | "quota"
  | "provider_outage"
  | "internal";

/** Phase 1 (docs/ROADMAP-TECHNISCH.md): Rolle eines Nutzers INNERHALB einer
 * Organisation. Bewusst getrennt von UserRole (Plattform-Admin): ein
 * Plattform-Admin hat dadurch keinen Zugriff auf Firmendaten. */
export type CompanyRole = "company_admin" | "mentor" | "learner";

/** Status einer Zuweisung - das Einzige, was der Arbeitgeber über den
 * Lernfortschritt sieht (zusammen mit Datum und Frist). */
export type AssignmentStatus = "assigned" | "in_progress" | "completed";

/** Stand einer Praxisaufgabe bei einer Person: abgegeben, vom Mentor bestätigt oder zur Nacharbeit zurück. Ohne Zeile = offen. */
export type OnboardingStatus = "open" | "discussed" | "reviewed";

export type PracticeSubmissionStatus = "submitted" | "confirmed" | "rework";

/** Phase 3: allgemeiner (von uns erstellter) oder interner (firmeneigener) Lernpfad. */
export type CourseKind = "general" | "internal";
/** Ausrichtung eines Kurses: auf eine Zertifizierung/Prüfung oder individuell (freies Thema, nur Quellen). */
export type CourseType = "certification" | "custom";
/** Menschliche Freigabe eines Lernpfads, bevor er an Kunden gehen darf. */
export type CatalogStatus = "draft" | "in_review" | "approved";
/** Übersetzungslauf eines Kurses in die zweite Sprache (siehe lib/server/course-translation). */
export type CourseTranslationStatus = "none" | "running" | "done" | "failed";
/**
 * Lebenslauf einer Kundenanfrage nach einem allgemeinen Lernpfad: eingegangen -> (wartet | in Erstellung |
 * in externer Prüfung) -> freigegeben oder abgelehnt.
 */
export type CourseRequestStatus =
  | "submitted"
  | "on_hold"
  | "in_creation"
  | "in_review"
  | "released"
  | "rejected"
  /** Die Firma hat die Anfrage selbst zurückgezogen (nur solange sie offen war). */
  | "withdrawn"
  /** Die erteilte Freigabe wurde vom Betreiber wieder entzogen. */
  | "revoked";

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
    /** Wird bei Passwortwechsel erhöht. Das JWT trägt die Version; weicht sie ab (oder
     * existiert der Nutzer nicht mehr), ist die Sitzung ungültig (lib/server/session-validity.ts). */
    sessionVersion: integer("session_version").notNull().default(0),
    /** Zeitpunkt der E-Mail-Bestätigung (lib/server/account/tokens.ts). Null = noch nicht bestätigt.
     * Bestandskonten wurden bei der Einführung als bestätigt markiert. */
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    /** UI U8: Opt-out für E-Mail-Erinnerungen des Prüfungsplaners. */
    examRemindersOptOut: boolean("exam_reminders_opt_out").notNull().default(false),
    /** PSRP-HR (roadmap_psrp_hr.md, Phase 1): optionale Altersspanne, nur für Kaltstart-Parameter des Schedulers. */
    ageRange: text("age_range").$type<AgeRange>(),
    /** IANA-Zeitzone für die lokale Tageszeit (Chronotyp) und Tagesgrenzen der Planung. */
    timezone: text("timezone").notNull().default("Europe/Berlin"),
    /** Phase 5: Evaluationsgruppe; null = noch nicht zugeteilt (wird beim ersten Zugriff stabil zugeteilt). */
    evaluationGroup: text("evaluation_group").$type<EvaluationGroup>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("users_role_check", sql`${table.role} in ('learner', 'admin')`),
    check(
      "users_age_range_check",
      sql`${table.ageRange} is null or ${table.ageRange} in ('under_18', '18_24', '25_34', '35_44', '45_54', '55_plus')`,
    ),
    check(
      "users_evaluation_group_check",
      sql`${table.evaluationGroup} is null or ${table.evaluationGroup} in ('vanilla', 'planning', 'planning_state')`,
    ),
  ],
);

export const EXAM_PROVIDERS = ["pearson_vue", "psi", "linux_foundation", "other"] as const;
export type ExamProvider = (typeof EXAM_PROVIDERS)[number];
export const EXAM_DELIVERY_MODES = ["online", "test_center"] as const;
export type ExamDeliveryMode = (typeof EXAM_DELIVERY_MODES)[number];
export type ExamPlanStatus = "planned" | "passed" | "failed" | "cancelled";

/**
 * Prüfungsplan einer Person (UI U8): gehört der Person; die Firma sieht davon nichts (`share_with_company` ist standardmäßig aus und
 * wird erst mit der Freigabe je Zertifikat in U9 ausgewertet – der Firmenbereich liest diese Tabelle nicht, siehe Architektur-Test).
 */
export const examPlans = pgTable(
  "exam_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    certificationId: uuid("certification_id")
      .notNull()
      .references(() => certifications.id, { onDelete: "cascade" }),
    /** null = noch nicht gebucht */
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    deliveryMode: text("delivery_mode").$type<ExamDeliveryMode>(),
    voucherExpiresAt: timestamp("voucher_expires_at", { withTimezone: true }),
    retakeIncluded: boolean("retake_included").notNull().default(false),
    shareWithCompany: boolean("share_with_company").notNull().default(false),
    weeklyGoalHours: integer("weekly_goal_hours").notNull().default(5),
    status: text("status").$type<ExamPlanStatus>().notNull().default("planned"),
    /** Wann die letzte Erinnerung dieser Art verschickt wurde (verhindert doppelte Mails). */
    remindersSent: jsonb("reminders_sent").$type<Record<string, string>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("exam_plans_user_idx").on(table.userId),
    check("exam_plans_status_check", sql`${table.status} in ('planned', 'passed', 'failed', 'cancelled')`),
  ],
);

/**
 * Zertifikate einer Person (UI U9). Gehören der Person; die Firma sieht ein Zertifikat nur, wenn die Person es einzeln freigibt
 * (`shared_with_company`, Standard aus), und nur die festgeschriebenen Felder `COMPANY_CERTIFICATE_FIELDS` – nie Punkte oder Lernstand.
 */
export const userCertificates = pgTable(
  "user_certificates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    certificationId: uuid("certification_id").references(() => certifications.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    vendor: text("vendor").notNull().default(""),
    earnedAt: timestamp("earned_at", { withTimezone: true }).notNull(),
    /** null = unbegrenzt gültig */
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    evidenceUrl: text("evidence_url"),
    sharedWithCompany: boolean("shared_with_company").notNull().default(false),
    /** Wann die Erinnerungen (90/30 Tage vor Ablauf) verschickt wurden. */
    remindersSent: jsonb("reminders_sent").$type<Record<string, string>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("user_certificates_user_idx").on(table.userId)],
);

/** Prüfungsgutscheine einer Firma (UI U9). Der Code liegt verschlüsselt und wird nur der zugewiesenen Person angezeigt. */
export const examVouchers = pgTable(
  "exam_vouchers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    certificationId: uuid("certification_id")
      .notNull()
      .references(() => certifications.id, { onDelete: "cascade" }),
    assignedUserId: uuid("assigned_user_id").references(() => users.id, { onDelete: "set null" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    note: text("note").notNull().default(""),
    codeEncrypted: text("code_encrypted"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [index("exam_vouchers_org_idx").on(table.organizationId)],
);

/** Feste Farbpalette der Kursgruppen (UI U7); die Farbe färbt Kurzcode-Kacheln in Dashboard und Prüfungsplaner. */
export const COURSE_CATEGORY_COLORS = ["info", "mint", "warning", "danger", "violet"] as const;
export type CourseCategoryColor = (typeof COURSE_CATEGORY_COLORS)[number];

/** Katalog-Kursgruppen (UI U7): genau eine Gruppe je allgemeinem Kurs (n:1), vom Betreiber gepflegt. */
export const courseCategories = pgTable("course_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: jsonb("name").$type<Localized<string>>().notNull(),
  color: text("color").$type<CourseCategoryColor>().notNull().default("info"),
  position: integer("position").notNull().default(0),
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
  /** Phase 3: "general" = allgemeiner Lernpfad (Security, Zertifikate), von uns erstellt und einer Firma erst
   * nach Freigabe zuweisbar; "internal" = firmeneigener Lernpfad, gehört genau einer Organisation. */
  kind: text("kind").$type<CourseKind>().notNull().default("general"),
  /** "certification" = Zertifikatskurs, "custom" = individuelles Training ohne Prüfung (Thema + Quellen). */
  courseType: text("course_type").$type<CourseType>().notNull().default("certification"),
  /** Nur bei kind = "internal": die Organisation, der der Lernpfad gehört. */
  ownerOrganizationId: uuid("owner_organization_id").references(() => organizations.id, { onDelete: "cascade" }),
  /** UI U8 (vom Betreiber gepflegt): Prüfungsanbieter, Formen, Buchungs-/Testcenter-Link, Gültigkeit, Hinweis auf eine Nachfolgeversion. */
  examProvider: text("exam_provider").$type<ExamProvider>(),
  deliveryModes: text("delivery_modes").array().$type<ExamDeliveryMode[]>().notNull().default(sql`'{}'::text[]`),
  bookingUrl: text("booking_url"),
  testCenterUrl: text("test_center_url"),
  validityMonths: integer("validity_months"),
  successorNote: text("successor_note"),
  /** UI U7: Kursgruppe im Katalog; null = „Nicht zugeordnet“. */
  categoryId: uuid("category_id").references(() => courseCategories.id, { onDelete: "set null" }),
  /** Kurzcode für Kacheln, z. B. K8s, SEC+, PCA (höchstens 6 Zeichen). */
  shortCode: text("short_code"),
  /** Menschliche Freigabe vor jeder Weitergabe an Kunden: draft -> in_review -> approved. Bestehende Lernpfade gelten als freigegeben. */
  catalogStatus: text("catalog_status").$type<CatalogStatus>().notNull().default("approved"),
  /**
   * Lernpfade, die ohne Tests auskommen („reine Absolvierung zum Verständnis“, nur interne Lernpfade): ohne
   * Lektionstests gibt es keine Abschnittsquizze, Übungssitzungen und Wiederholungen; ohne Abschlussprüfung keine
   * Prüfung. Bei allgemeinen Lernpfaden und allen älteren immer true.
   */
  includeSectionQuizzes: boolean("include_section_quizzes").notNull().default(true),
  includeFinalExam: boolean("include_final_exam").notNull().default(true),
  /** Wer den Lernpfad fachlich geprüft hat (Name des externen Prüfers, auch ohne Konto) und wann. */
  approvedByName: text("approved_by_name"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  /**
   * Sprache, in der die Inhalte erzeugt wurden (Auftragssprache der Kursgenerierung). Die Generierung schreibt
   * denselben Text in beide Sprachfelder; erst der Übersetzungslauf füllt die zweite Sprache. `null` = älterer Kurs
   * ohne Angabe (gilt als Deutsch).
   */
  contentLocale: text("content_locale").$type<Locale>(),
  translationStatus: text("translation_status").$type<CourseTranslationStatus>().notNull().default("none"),
  /** Fortschritt oder Fehler des letzten Übersetzungslaufs, für die Admin-Übersicht. */
  translationMessage: text("translation_message"),
  /** Fortschritt des laufenden bzw. letzten Laufs: bearbeitete Teile (übersetzt oder fehlgeschlagen) von allen. */
  translationProcessed: integer("translation_processed").notNull().default(0),
  translationTotal: integer("translation_total").notNull().default(0),
  /** Summe der geschätzten KI-Kosten aller Übersetzungsläufe (USD); null = kein Preis hinterlegt. */
  translationCostUsd: numeric("translation_cost_usd", { precision: 10, scale: 4 }),
  /** Summe der geschätzten Kosten aller KI-Vorschläge der Werkstatt (roadmap3.md, Schritt 3), auch verworfener. */
  aiEditCostUsd: numeric("ai_edit_cost_usd", { precision: 10, scale: 4 }),
  translatedAt: timestamp("translated_at", { withTimezone: true }),
  /** Kursbeschreibung vor dem Start (roadmap3.md, Schritt 4); null = noch keine. */
  overview: jsonb("overview").$type<CourseOverview>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("certifications_kind_check", sql`${table.kind} in ('general', 'internal')`),
  check("certifications_catalog_status_check", sql`${table.catalogStatus} in ('draft', 'in_review', 'approved')`),
  check("certifications_content_locale_check", sql`${table.contentLocale} is null or ${table.contentLocale} in ('de', 'en')`),
  check("certifications_translation_status_check", sql`${table.translationStatus} in ('none', 'running', 'done', 'failed')`),
  check(
    "certifications_owner_check",
    sql`(${table.kind} = 'internal' and ${table.ownerOrganizationId} is not null) or (${table.kind} = 'general' and ${table.ownerOrganizationId} is null)`,
  ),
]);

/** Zuordnung Kurs ↔ Kursgruppen (n:m). `certifications.category_id` bleibt die Hauptgruppe (Farbe, Kurzcode) und ist immer auch hier enthalten. */
export const certificationCategories = pgTable(
  "certification_categories",
  {
    certificationId: uuid("certification_id").notNull().references(() => certifications.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => courseCategories.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.certificationId, t.categoryId] })],
);

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
  /**
   * Merkzettel zur Lektion (Markdown, zweisprachig): zum Nachschlagen und Wiederholen, bei Firmen-Lernpfaden auch die
   * firmeneigenen Namen und Abläufe aus den Quellen (z. B. welcher Server wofür). Wird mit dem Kurs erzeugt und mit ihm
   * geprüft; bei älteren Lektionen leer.
   */
  cheatSheet: jsonb("cheat_sheet").$type<Localized<string>>(),
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
  /**
   * Die zweite Sprache ist veraltet: die Kurssprache wurde (per KI in der Werkstatt) geändert, die Übersetzung noch nicht.
   * Lernende sehen bis dahin die alte Übersetzung; der Übersetzungslauf übersetzt die Lektion neu und setzt das Feld zurück.
   */
  translationOutdated: boolean("translation_outdated").notNull().default(false),
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
  /** Wie lessons.translationOutdated: Kurssprache per KI geändert, die zweite Sprache noch nicht neu übersetzt. */
  translationOutdated: boolean("translation_outdated").notNull().default(false),
  /** PSRP-HR Phase 7: Abfragevariante (probe_variant), erscheint nie in Lektionstests, Prüfungen oder Sessions als normale Frage. */
  probeOnly: boolean("probe_only").notNull().default(false),
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
  /** UI U4: warum diese (falsche) Option nicht passt, zweisprachig; null bei älteren Fragen und bei der richtigen Option. */
  rationale: jsonb("rationale").$type<Localized<string>>(),
});

/**
 * R6 (roadmap.md): "Kosten je veröffentlichter Lesson, Mission und
 * akzeptierter Frage" - ein Snapshot statt einer Historie: das erzeugende
 * Skript (scripts/generate-lessons-and-questions.ts) kennt keine
 * content_generation_jobs-ID (läuft auch völlig eigenständig per CLI, ohne
 * Job-Kontext - siehe runNpmScript() in lib/server/admin/content-generation.ts,
 * das keine Job-ID an den Kindprozess weiterreicht), daher Zuordnung über
 * objectiveId statt jobId. Ein erneuter Lauf überschreibt den Snapshot
 * (ON CONFLICT), passend dazu, dass eine Regenerierung den vorherigen
 * Lernstoff der Section/des Objectives ohnehin ersetzt (siehe R1.5). Die
 * tatsächlichen Kosten EINER einzelnen Lesson/Frage sind nicht separat
 * messbar (ein Aufruf erzeugt mehrere zusammen) - `estimatedCostUsd` bleibt
 * der reale Batch-Betrag, ein Kosten-je-Element-Wert wird erst beim Lesen
 * (geteilt durch acceptedLessonCount+acceptedQuestionCount) abgeleitet,
 * statt eine erfundene Einzelzahl zu speichern.
 */
export const objectiveGenerationCosts = pgTable("objective_generation_costs", {
  objectiveId: uuid("objective_id")
    .primaryKey()
    .references(() => objectives.id, { onDelete: "cascade" }),
  model: text("model"),
  promptTokens: integer("prompt_tokens").notNull().default(0),
  completionTokens: integer("completion_tokens").notNull().default(0),
  totalTokens: integer("total_tokens").notNull().default(0),
  /** NULL solange für das Modell keine Preise konfiguriert sind - siehe
   * gleichlautender Kommentar auf contentGenerationJobs.estimatedCostUsd. */
  estimatedCostUsd: numeric("estimated_cost_usd", { precision: 10, scale: 4 }),
  acceptedLessonCount: integer("accepted_lesson_count").notNull().default(0),
  acceptedQuestionCount: integer("accepted_question_count").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
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
  /** R2 (roadmap.md): "Sicherheit der eigenen Antwort abfragen" - optional,
   * vom Client VOR Aufdeckung der Korrektheit erfasst. Bewusst nicht auf
   * exam_answers übertragen: die Abschlussprüfung soll eine realistische,
   * zeitkritische Simulation bleiben statt einer reflektierenden Übung. */
  confidence: text("confidence").$type<AnswerConfidence>(),
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
 * Fälligkeits-Sicht auf den FSRS-Zustand (siehe lib/server/psrp/service.ts; der alte SM-2-Scheduler ist entfernt),
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
     * aus der FSRS-Fälligkeit abgeleitet). */
    intervalDays: numeric("interval_days", { precision: 6, scale: 2 }).notNull().default("0"),
    /** Anzahl AUFEINANDERFOLGENDER richtiger Antworten - jede falsche Antwort
     * setzt das auf 0 zurück (FSRS-Lapse). */
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
    /** PSRP-HR Phase 3: „leichte Tage“ (ISO-Wochentage 1-7) mit reduziertem Kontingent. */
    lightWeekdays: jsonb("light_weekdays").$type<number[]>().notNull().default([]),
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
    /** R2 (roadmap.md): "optionaler Energiezustand" - vom Nutzer beim
     * Sessionstart freiwillig angegeben (siehe StartSessionPicker), NULL
     * wenn übersprungen. `low` reduziert den Anteil neuen Stoffs zugunsten
     * von Wiederholung, siehe reallocateTowardFamiliarContent() in
     * session-builder.ts. */
    energyLevel: text("energy_level").$type<EnergyLevel>(),
    /** R2 (roadmap.md): "sanfter Comeback-Modus nach Pause" - ob beim Bau
     * dieser Session eine lange Lernpause erkannt und die Zusammensetzung
     * entsprechend sanfter gestaltet wurde (siehe isComebackSession() in
     * session-builder.ts). Als Snapshot gespeichert statt live neu berechnet,
     * aus demselben Grund wie goalType/goalValue oben: die Begründungs-UI
     * muss auch nach dem Bau noch erklären können, WARUM die Session so
     * zusammengesetzt wurde. */
    isComeback: boolean("is_comeback").notNull().default(false),
    /** Frühwarnung (Flag dropout_guard): ob diese Session in der Planungsschicht entlastet wurde (Snapshot wie isComeback). */
    deescalated: boolean("deescalated").notNull().default(false),
    /** Notausstieg „Heute reicht's“ (Flag exit_with_win): Zeitpunkt, an dem die Session vorzeitig beendet wurde (Signal für die Frühwarnung). */
    exitedAt: timestamp("exited_at", { withTimezone: true }),
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
    check(
      "study_sessions_energy_level_check",
      sql`${table.energyLevel} is null or ${table.energyLevel} in ('low', 'medium', 'high')`,
    ),
  ],
);

/** R2.3: die drei Session-Builder-Kategorien plus der Lesson-Fallback ("Bei
 * zu kleinem Fragenpool auf Lesson-Wiederholung ... zurückfallen"). */
/** `recall`: Rückblick auf eine kürzlich gelernte Lektion am Session-Anfang (roadmap_didaktik Phase 8). */
/** `understand`: Verstehens-Aufgabe (neue Variante) für ein Konzept im Verstehens-Modus (roadmap_didaktik Phase 9). */
export type StudySessionItemCategory = "review" | "weak" | "new" | "lesson" | "recall" | "understand" | "win";

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
  /** R2 (roadmap.md): "Sicherheit der eigenen Antwort abfragen" - wie bei
   * quizAnswers.confidence, nur für "question"-Items relevant. */
  confidence: text("confidence").$type<AnswerConfidence>(),
  /** Variantenrotation: gezeigte Variante (questions.id) statt des Originals in `referenceId`; null = Original. Bewertet und verbucht wird weiter am Original. */
  variantQuestionId: uuid("variant_question_id").references(() => questions.id, { onDelete: "set null" }),
  /** Rückblick (category = recall): zu welchem Rückblick die Frage gehört. */
  recallCheckId: uuid("recall_check_id").references((): AnyPgColumn => recallChecks.id, { onDelete: "set null" }),
  /** Verstehens-Aufgabe (category = understand): zu welchem Konzept im Verstehens-Modus sie gehört. */
  conceptStruggleId: uuid("concept_struggle_id").references((): AnyPgColumn => conceptStruggles.id, { onDelete: "set null" }),
  /** Gewählte Antwortoption der gezeigten Frage (Grundlage für „wiederholt dieselbe falsche Option“). */
  selectedOptionId: uuid("selected_option_id").references((): AnyPgColumn => questionOptions.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ConceptStruggleStatus = "detected" | "in_progress" | "resolved" | "declined";

/** Ein Signal, das auf Nicht-Verstehen hindeutet (roadmap_didaktik Phase 9.1). */
export type StruggleSignalKind = "sure_wrong" | "repeated_wrong_option" | "distinct_variant_failures" | "stalled_item" | "simulation_help";
export interface StruggleSignal {
  kind: StruggleSignalKind;
  at: string;
  /** Bei repeated_wrong_option: Frage und immer wieder gewählte falsche Option (für „Häufige Verwechslung“). */
  questionId?: string;
  optionId?: string;
}

/**
 * Verstehens-Modus je Nutzer und Konzept (roadmap_didaktik Phase 9): getrennt von den Rohdaten (review_log, Session-Items).
 * `detected` = Muster erkannt, Angebot offen; `in_progress` = Verstehens-Aufgabe läuft (nach einer falsch beantworteten);
 * `resolved` = neue Variante richtig beantwortet, danach normale Wiederholung; `declined` = Person hat abgelehnt.
 * Solange `detected` oder `in_progress`, kommen die Items des Konzepts nicht als normale Wiederholung (nur Planungsschicht).
 */
export const conceptStruggles = pgTable(
  "concept_struggle",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conceptId: uuid("concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    status: text("status").$type<ConceptStruggleStatus>().notNull().default("detected"),
    signals: jsonb("signals").$type<StruggleSignal[]>().notNull().default(sql`'[]'::jsonb`),
    detectedAt: timestamp("detected_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("concept_struggle_user_concept_unique").on(table.userId, table.conceptId),
    index("concept_struggle_user_status_idx").on(table.userId, table.status),
    check("concept_struggle_status_check", sql`${table.status} in ('detected', 'in_progress', 'resolved', 'declined')`),
  ],
);

export type EngagementStatus = "normal" | "deescalated";
export type EngagementSignalKind = "short_sessions" | "high_error_rate" | "slow_answers" | "checkin_skipped" | "exit_with_win";
export interface EngagementSignal {
  kind: EngagementSignalKind;
  at: string;
}

/**
 * Frühwarnung für stille Abbrüche (roadmap_motivation Phase 2): ein Zustand je Nutzer, getrennt von den Rohdaten.
 * `deescalated` wirkt ausschließlich in der Planungsschicht (kleineres Tageslimit, keine neuen Karten); FSRS-Zustand und
 * Ratings bleiben unverändert. Nie im Firmenbereich sichtbar. `declinedUntil`: „Nein danke, normal weiter“ löst bis dahin nicht erneut aus.
 */
export const engagementStates = pgTable(
  "engagement_state",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").$type<EngagementStatus>().notNull().default("normal"),
    signals: jsonb("signals").$type<EngagementSignal[]>().notNull().default(sql`'[]'::jsonb`),
    since: timestamp("since", { withTimezone: true }),
    until: timestamp("until", { withTimezone: true }),
    sessionsLeft: integer("sessions_left").notNull().default(0),
    declinedUntil: timestamp("declined_until", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("engagement_state_status_check", sql`${table.status} in ('normal', 'deescalated')`)],
);

export type RecallCheckStatus = "offered" | "answered" | "skipped";

/**
 * Rückblick „Was weißt du noch?“ (roadmap_didaktik Phase 8): ein Rückblick je Session und Lektion mit den Messwerten, die das
 * Gedächtnismodell für den ersten Abstand nach dem Lernen braucht - Abstand in Stunden sowie Tagesform (Φ) und Tageszeit
 * beim Lernen der Lektion und beim Rückblick. Ein übersprungener Rückblick wird ebenfalls festgehalten (Abbruchquote).
 */
export const recallChecks = pgTable(
  "recall_checks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => studySessions.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    status: text("status").$type<RecallCheckStatus>().notNull().default("offered"),
    questionCount: integer("question_count").notNull(),
    correctCount: integer("correct_count"),
    lessonCompletedAt: timestamp("lesson_completed_at", { withTimezone: true }).notNull(),
    hoursSinceLesson: numeric("hours_since_lesson", { precision: 8, scale: 2, mode: "number" }).notNull(),
    /** Φ der letzten Session höchstens 24 h vor dem Abschluss der Lektion; null, wenn es keine gab. */
    phiAtLearning: numeric("phi_at_learning", { precision: 5, scale: 4, mode: "number" }),
    hourAtLearning: integer("hour_at_learning").notNull(),
    phiAtRecall: numeric("phi_at_recall", { precision: 5, scale: 4, mode: "number" }).notNull(),
    hourAtRecall: integer("hour_at_recall").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("recall_checks_session_section_unique").on(table.sessionId, table.sectionId),
    index("recall_checks_user_section_idx").on(table.userId, table.sectionId),
    check("recall_checks_status_check", sql`${table.status} in ('offered', 'answered', 'skipped')`),
    check("recall_checks_hours_check", sql`${table.hourAtLearning} between 0 and 23 and ${table.hourAtRecall} between 0 and 23`),
  ],
);

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
    /** R6 (roadmap.md): "Modell, Tokenverbrauch und geschätzte Kosten pro
     * Job" - läuft über den kompletten Job (curriculum + lessons Skript,
     * beide als Kindprozess, siehe runNpmScript() in content-generation.ts)
     * hoch, nicht erst am Ende: bei einem Absturz mitten im Job bleibt der
     * bis dahin tatsächlich verbrauchte Verbrauch erhalten (jede
     * `USAGE`-Zeile aus lib/ai/generate.ts aktualisiert die Zeile sofort).
     * Curriculum- und Lessons-Phase nutzen unterschiedliche Claude-Modelle
     * (siehe lib/claude.ts) - `model` listet alle in diesem Job tatsächlich
     * verwendeten Modelle kommagetrennt, siehe trackUsageLine() in
     * content-generation.ts. */
    model: text("model"),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    /** NULL solange keine Preise konfiguriert sind (siehe
     * ANTHROPIC_CURRICULUM_PRICE_PER_MILLION_*_TOKENS_USD /
     * ANTHROPIC_LESSONS_PRICE_PER_MILLION_*_TOKENS_USD) - eine geschätzte
     * Zahl, die nicht mit der tatsächlichen Rechnung des Anbieters
     * verwechselt werden darf, ist schlechter als gar keine. */
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 10, scale: 4 }),
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
    /** "pdf" (Datei-Upload) oder "url" (serverseitig abgerufen, siehe
     * registerCertificationSourceFromUrl() in lib/server/admin/sources.ts,
     * SSRF-abgesichert über lib/server/network/ssrf-guard.ts). Beide Typen
     * landen in derselben Storage-/Extraktions-Pipeline. */
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
/** `simulation_result`: offline gelöste Simulation (roadmap3.md, Schritt 5). */
export type SyncEventType = "section_quiz" | "study_session" | "simulation_result";
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

/** R0 (roadmap.md, neue Fassung): "Änderungen an Inhalten und Rollen
 * auditierbar machen" + "kostenpflichtige Aktionen ... protokollieren".
 * Bewusst eine einzelne generische Tabelle statt einer je Aktionstyp - die
 * Menge unterschiedlicher auditierter Aktionen ist klein und wächst
 * langsam, ein append-only Log mit freiem `metadata`-Feld genügt dafür,
 * siehe lib/server/audit/service.ts. */
export type AuditActorType = "user" | "cli" | "system";

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Null bei actorType "cli"/"system" (z. B. scripts/set-user-role.ts,
     * das mit einer direkten DB-Verbindung läuft, nicht als eingeloggter
     * Nutzer). */
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    actorType: text("actor_type").$type<AuditActorType>().notNull().default("user"),
    /** Stabiler, punktgetrennter Aktionsname, z. B. "role.changed",
     * "certification.created", "content_generation.started",
     * "blueprint_extraction.started", "source.approved". */
    action: text("action").notNull(),
    targetType: text("target_type"),
    /** Kein FK - das Ziel kann in jeder Tabelle liegen (gleiches Muster wie
     * studySessionItems.referenceId), Integrität bleibt App-seitig. */
    targetId: uuid("target_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_events_created_at_idx").on(table.createdAt),
    index("audit_events_actor_user_id_idx").on(table.actorUserId),
  ],
);

/** R2 (roadmap.md, neue Fassung): "Nutzerfeedback auf Empfehlungen erfassen"
 * - einfaches Daumen-hoch/-runter je Session, direkt an der Empfehlung
 * (siehe getSessionCategoryBreakdown()/TodayDashboard). Höchstens ein
 * Feedback-Eintrag pro Session (Unique-Constraint), ein zweiter Klick
 * überschreibt den ersten statt einen weiteren Eintrag anzulegen (Upsert in
 * lib/server/study/session-service.ts). */
export const sessionRecommendationFeedback = pgTable(
  "session_recommendation_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => studySessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    helpful: boolean("helpful").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("session_recommendation_feedback_session_unique").on(table.sessionId),
  ],
);

/** R6 (roadmap.md): "Inhalte als falsch, unklar oder veraltet melden" +
 * "Review-Queue". `targetId` verweist je nach `targetType` auf `questions.id`
 * oder `lessons.id` - bewusst OHNE DB-seitige FK (dasselbe Muster wie
 * studySessionItems.referenceId/auditEvents.targetId: eine Spalte kann nicht
 * auf zwei Tabellen verweisen, Integrität bleibt App-seitig in
 * lib/server/content-reports/service.ts). Anders als
 * sessionRecommendationFeedback bewusst OHNE Unique-Constraint - mehrere
 * Meldungen zur selben Frage sind ein zusätzliches Signal (mehr Lerner sehen
 * dasselbe Problem), keine Korrektur eines einzelnen Werts. */
export type ContentReportTargetType = "question" | "lesson";
/** `variant_outlier`: automatisch erzeugt, wenn eine Variante auffällig andere Erfolgsquote hat als die übrigen (kein Nutzer meldet). */
export type ContentReportReason = "incorrect" | "unclear" | "outdated" | "variant_outlier";
export type ContentReportStatus = "open" | "resolved" | "dismissed";

export const contentReports = pgTable(
  "content_reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reporterUserId: uuid("reporter_user_id").references(() => users.id, { onDelete: "set null" }),
    targetType: text("target_type").$type<ContentReportTargetType>().notNull(),
    targetId: uuid("target_id").notNull(),
    reason: text("reason").$type<ContentReportReason>().notNull(),
    status: text("status").$type<ContentReportStatus>().notNull().default("open"),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => users.id, { onDelete: "set null" }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("content_reports_target_idx").on(table.targetType, table.targetId),
    index("content_reports_status_idx").on(table.status),
    check("content_reports_target_type_check", sql`${table.targetType} in ('question', 'lesson')`),
    check("content_reports_reason_check", sql`${table.reason} in ('incorrect', 'unclear', 'outdated', 'variant_outlier')`),
    check("content_reports_status_check", sql`${table.status} in ('open', 'resolved', 'dismissed')`),
  ],
);

/**
 * course_generation.md Phase 2: Statuswerte aus Abschnitt 6, unverändert
 * übernommen - der Job-Orchestrator (lib/server/course-generation/*) hält
 * jeden Übergang idempotent (siehe dortige Kommentare), diese Liste ist nur
 * die Menge gültiger Werte.
 */
export type SourceReport = {
  checkedAt: string;
  officialObjectives: Array<{ code: string; title: string }>;
  /** Quellen, die für die KI gekürzt wurden: Anfang statt ganzer Text, Lernziele aus dem Rest fehlen dann womöglich. */
  truncated: Array<{ title: string; url: string }>;
  sourceCount: number;
  /** Als Prüfungsleitfaden erkannte Quelle (wird nicht auf 60.000 Zeichen gekürzt); fehlt bei älteren Berichten. */
  primary?: { title: string; url: string } | null;
  /** Fingerabdruck des Quelltexts (Leitfaden, sonst alle Quellen) und darin genannte Prüfungsversionen („SY0-701“, „Version 7.0“). */
  fingerprint?: string;
  versions?: string[];
  /**
   * Stand bei der Kurserstellung (bzw. zuletzt als aktuell bestätigt): „Quelle prüfen“ vergleicht damit und erkennt so
   * eine neue Prüfungsversion oder geänderte Lernziele.
   */
  baseline?: { checkedAt: string; fingerprint: string | null; officialObjectives: Array<{ code: string; title: string }>; versions: string[] } | null;
};

export type CourseGenerationJobStatus =
  | "queued"
  | "preflight"
  | "preflight_failed"
  | "blueprint_requested"
  | "blueprint_generating"
  | "blueprint_validating"
  | "cost_estimating"
  | "blueprint_ready"
  | "canary_generating"
  | "canary_validating"
  | "canary_failed"
  | "content_generating"
  | "batch_generating"
  | "validating"
  | "repairing"
  | "circuit_breaker_open"
  /** Nicht im ursprünglichen course_generation.md-Statuskatalog (Abschnitt 6) -
   * ergänzt, da der Katalog keinen Zustand für "vollständig generiert und
   * validiert, aber autoPublish=false" vorsieht. Terminal wie "published":
   * der Job selbst ist fertig, der Import wartet auf eine manuelle
   * Admin-Bestätigung (siehe retry-Endpunkt in Phase 3). */
  | "package_ready"
  | "importing"
  | "published"
  | "waiting_for_quota"
  | "paused_budget"
  | "cost_limit_reached"
  | "failed"
  | "cancelled";

export const COURSE_GENERATION_JOB_STATUSES: CourseGenerationJobStatus[] = [
  "queued",
  "preflight",
  "preflight_failed",
  "blueprint_requested",
  "blueprint_generating",
  "blueprint_validating",
  "cost_estimating",
  "blueprint_ready",
  "canary_generating",
  "canary_validating",
  "canary_failed",
  "content_generating",
  "batch_generating",
  "validating",
  "repairing",
  "circuit_breaker_open",
  "package_ready",
  "importing",
  "published",
  "waiting_for_quota",
  "paused_budget",
  "cost_limit_reached",
  "failed",
  "cancelled",
];

/** Terminal = der Job nimmt keine weiteren Übergänge mehr vor (siehe
 * isTerminalCourseGenerationStatus() in lib/server/course-generation/job-service.ts). */
export const TERMINAL_COURSE_GENERATION_JOB_STATUSES: CourseGenerationJobStatus[] = [
  "preflight_failed",
  "canary_failed",
  // Vom Fehlerschutz gestoppt: der Lauf steht still (erneutes Starten möglich), er blockiert keinen Titel und keinen Platz.
  "circuit_breaker_open",
  "package_ready",
  "published",
  "cost_limit_reached",
  "failed",
  "cancelled",
];

export type CourseGenerationObjectiveStatus =
  | "pending"
  | "generating"
  | "validating"
  | "repairing"
  | "valid"
  | "failed";

/**
 * course_generation.md Abschnitt 6: "CourseGenerationJob" - ein Auftrag für
 * einen komplett neuen Kurs aus Quellen (siehe course_generation.md Abschnitt
 * 0: koexistiert bewusst mit `content_generation_jobs`, das den anderen
 * Anwendungsfall "fehlende Inhalte zu einem bestehenden Kurs ergänzen"
 * bedient). `blueprintJson`/`packageJson` halten `CourseBlueprintV1` bzw. den
 * bislang zusammengebauten Teil von `CoursePackageV1` (lose typisiert wie bei
 * `blueprintDrafts.content` - konkrete Typisierung an den Lese-/
 * Schreibstellen in lib/server/course-generation/). */
export const courseGenerationJobs = pgTable(
  "course_generation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /**
     * Gesetzt = interner Lernpfad einer Firma (Quelle ist ein Firmendokument, Ergebnis gehört der Firma). Solche
     * Aufträge sieht der Betreiber nie: alle Admin-Abfragen filtern auf organization_id is null.
     */
    organizationId: uuid("organization_id").references(() => organizations.id, { onDelete: "cascade" }),
    /** Quelle eines internen Lernpfads. SET NULL: das Dokument darf gelöscht werden, der erzeugte Lernpfad bleibt. */
    documentId: uuid("document_id").references(() => companyDocuments.id, { onDelete: "set null" }),
    /** Nur interne Lernpfade: mit Lektionstests und/oder Abschlussprüfung erstellen (sonst keine Fragen, günstiger). */
    includeSectionQuizzes: boolean("include_section_quizzes").notNull().default(true),
    includeFinalExam: boolean("include_final_exam").notNull().default(true),
    /** UI U7: Kursgruppe und Kurzcode, die der Kurs nach dem Import bekommt (nur allgemeine Kurse). */
    categoryId: uuid("category_id").references(() => courseCategories.id, { onDelete: "set null" }),
    shortCode: text("short_code"),
    /** Zertifikatskurs oder individuelles Training (kein Anbieter, keine Prüfung). */
    courseType: text("course_type").$type<CourseType>().notNull().default("certification"),
    courseTitle: text("course_title").notNull(),
    courseDescription: text("course_description").notNull(),
    language: text("language").notNull(),
    provider: text("provider").notNull(),
    certificationVersion: text("certification_version"),
    sourceUrls: jsonb("source_urls").$type<string[]>().notNull().default([]),
    autoPublish: boolean("auto_publish").notNull().default(false),
    initialCostLimitUsd: numeric("initial_cost_limit_usd", { precision: 10, scale: 2 }).notNull(),
    absoluteCostLimitUsd: numeric("absolute_cost_limit_usd", { precision: 10, scale: 2 }).notNull(),
    status: text("status").$type<CourseGenerationJobStatus>().notNull().default("queued"),
    phase: text("phase").notNull().default("queued"),
    message: text("message"),
    blueprintProvider: text("blueprint_provider").notNull(),
    /** Abschnitt 6: "routineSessionUrl" - erst befüllt, sobald ein
     * BlueprintProvider tatsächlich eine Claude-Code-Cloud-Routine auslöst
     * (siehe providers.ts::routineBlueprintProvider) - bleibt NULL beim
     * aktuell aktiven anthropic-sonnet-Provider. */
    routineSessionUrl: text("routine_session_url"),
    blueprintJson: jsonb("blueprint_json").$type<Record<string, unknown>>(),
    packageJson: jsonb("package_json").$type<Record<string, unknown>>(),
    /** Was die Quellen hergeben (roadmap3.md, Schritt 2): erkannte offizielle Lernziel-Nummern, gekürzte Quellen, Zeitpunkt. */
    sourceReport: jsonb("source_report").$type<SourceReport>(),
    /**
     * Aufgeteilter sehr großer Kurs (mehr als COURSE_GEN_HARD_MAX_OBJECTIVES Lernziele): Teil `splitPart` von `splitParts`;
     * die Teile 2 ff. verweisen auf den ersten Auftrag und laufen nach ihm nacheinander, mit fertigem Teil-Blueprint.
     */
    splitOfJobId: uuid("split_of_job_id"),
    splitPart: integer("split_part"),
    splitParts: integer("split_parts"),
    estimatedCostUsd: numeric("estimated_cost_usd", { precision: 10, scale: 4 }),
    actualCostUsd: numeric("actual_cost_usd", { precision: 10, scale: 4 }).notNull().default("0"),
    resultCertificationId: uuid("result_certification_id").references(() => certifications.id, {
      onDelete: "set null",
    }),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("course_generation_jobs_status_idx").on(table.status),
    index("course_generation_jobs_org_idx").on(table.organizationId),
    check(
      "course_generation_jobs_status_check",
      sql`${table.status} in ('queued', 'preflight', 'preflight_failed', 'blueprint_requested', 'blueprint_generating', 'blueprint_validating', 'cost_estimating', 'blueprint_ready', 'canary_generating', 'canary_validating', 'canary_failed', 'content_generating', 'batch_generating', 'validating', 'repairing', 'circuit_breaker_open', 'package_ready', 'importing', 'published', 'waiting_for_quota', 'paused_budget', 'cost_limit_reached', 'failed', 'cancelled')`,
    ),
  ],
);

/**
 * course_generation.md Abschnitt 6: "CourseGenerationObjective" - Fortschritt,
 * Kosten und Inhalt EINES Objectives innerhalb eines Jobs. `domainId`/
 * `objectiveId` sind die blueprint-internen String-IDs (siehe
 * courseBlueprintObjectiveSchema in lib/server/course-generation/schemas.ts),
 * NICHT DB-UUIDs - die entstehen erst beim finalen Import
 * (importCoursePackage()). Ein Unique-Constraint auf (jobId, objectiveId)
 * verhindert, dass ein erneut angestoßener Worker-Lauf dasselbe Objective
 * doppelt anlegt (Abschnitt 8: "Datenbank-Lock oder Lease verhindert, dass
 * mehrere Worker dasselbe Lernziel gleichzeitig bearbeiten"). */
export const courseGenerationObjectives = pgTable(
  "course_generation_objectives",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => courseGenerationJobs.id, { onDelete: "cascade" }),
    domainId: text("domain_id").notNull(),
    objectiveId: text("objective_id").notNull(),
    code: text("code").notNull(),
    isCanary: boolean("is_canary").notNull().default(false),
    status: text("status").$type<CourseGenerationObjectiveStatus>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    provider: text("provider"),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 4 }),
    contentJson: jsonb("content_json").$type<Record<string, unknown>>(),
    validationErrorsJson: jsonb("validation_errors_json").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("course_generation_objectives_job_objective_unique").on(table.jobId, table.objectiveId),
    index("course_generation_objectives_job_idx").on(table.jobId),
    check(
      "course_generation_objectives_status_check",
      sql`${table.status} in ('pending', 'generating', 'validating', 'repairing', 'valid', 'failed')`,
    ),
  ],
);

/**
 * Phase 1: Organisation (Mandant). Alle Firmendaten hängen über
 * organization_id an genau einer Organisation; Abfragen im Firmenbereich
 * übernehmen die Organisation immer aus der Mitgliedschaft des angemeldeten
 * Nutzers (lib/server/company/guard.ts), nie aus Request-Parametern.
 */
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Mitgliedschaft eines Nutzers in einer Organisation. Ein Nutzer gehört zu
 * GENAU EINER Organisation (Unique-Index auf user_id) - Entscheidung für den
 * Pilot; mehrere Organisationen pro Nutzer ließen sich später durch Entfernen
 * dieses Index zulassen, der zusammengesetzte Unique-Index
 * (user_id, organization_id) bleibt als Ziel des Fremdschlüssels in
 * company_assignments bestehen.
 */
export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").$type<CompanyRole>().notNull(),
    /** Abteilung innerhalb der Firma (frei wählbar, optional). Fällt die Abteilung weg, bleibt die Person ohne. */
    departmentId: uuid("department_id").references((): AnyPgColumn => departments.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "organization_memberships_role_check",
      sql`${table.role} in ('company_admin', 'mentor', 'learner')`,
    ),
    uniqueIndex("organization_memberships_user_unique").on(table.userId),
    unique("organization_memberships_user_org_unique").on(table.userId, table.organizationId),
    index("organization_memberships_org_idx").on(table.organizationId),
  ],
);

/**
 * Zuweisung eines Lernpfads (derzeit eine Zertifizierung) an ein Mitglied.
 * NUR Status, Zuweisungs-, Fälligkeits- und Abschlussdatum - bewusst keine
 * Lerndetails (Quiz-Antworten, Mastery, Remediation usw.); die liegen in den
 * privaten Tabellen und dürfen vom Firmenbereich nie gelesen werden (siehe
 * lib/server/company/*, abgesichert durch einen Architektur-Test).
 * Der zusammengesetzte Fremdschlüssel stellt auf Datenbankebene sicher, dass
 * userId wirklich Mitglied von organizationId ist.
 */
/** Kursgruppen einer Firma (UI U6): eigene Zusammenstellungen aus freigegebenen Katalogkursen, internen Lernpfaden und Pflichtschulungen. */
export const companyCourseGroups = pgTable(
  "company_course_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: jsonb("name").$type<Localized<string>>().notNull(),
    color: text("color").$type<CourseCategoryColor>().notNull().default("info"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [index("company_course_groups_org_idx").on(table.organizationId)],
);

export const companyCourseGroupItems = pgTable(
  "company_course_group_items",
  {
    groupId: uuid("group_id")
      .notNull()
      .references(() => companyCourseGroups.id, { onDelete: "cascade" }),
    certificationId: uuid("certification_id")
      .notNull()
      .references(() => certifications.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.groupId, table.certificationId] })],
);

export const companyAssignments = pgTable(
  "company_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    certificationId: uuid("certification_id")
      .notNull()
      .references(() => certifications.id, { onDelete: "cascade" }),
    status: text("status").$type<AssignmentStatus>().notNull().default("assigned"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    assignedByUserId: uuid("assigned_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /**
     * Runde der Zuweisung (1 = erste). Bei Pflicht mit Wiederholung beginnt nach Ablauf der Zeit eine neue Runde: Status
     * zurück auf „zugewiesen“, neue Frist; als abgeschlossen zählt dann nur, was nach `roundStartedAt` nachgewiesen wurde.
     */
    round: integer("round").notNull().default(1),
    roundStartedAt: timestamp("round_started_at", { withTimezone: true }).notNull().defaultNow(),
    /** Abschluss der vorherigen Runde (bleibt als Nachweis stehen, wenn eine neue Runde beginnt). */
    lastCompletedAt: timestamp("last_completed_at", { withTimezone: true }),
    /** Gesetzt, wenn die Zuweisung aus einer Pflichtregel stammt (Pflichtschulung). */
    mandatoryRuleId: uuid("mandatory_rule_id").references((): AnyPgColumn => mandatoryRules.id, { onDelete: "set null" }),
    /** UI U6: gesetzt, wenn die Zuweisung über eine Kursgruppe entstand (nur Herkunft; spätere Änderungen an der Gruppe ändern sie nicht). */
    groupId: uuid("group_id").references((): AnyPgColumn => companyCourseGroups.id, { onDelete: "set null" }),
  },
  (table) => [
    check(
      "company_assignments_status_check",
      sql`${table.status} in ('assigned', 'in_progress', 'completed')`,
    ),
    foreignKey({
      columns: [table.userId, table.organizationId],
      foreignColumns: [organizationMemberships.userId, organizationMemberships.organizationId],
      name: "company_assignments_member_fk",
    }).onDelete("cascade"),
    unique("company_assignments_member_path_unique").on(
      table.organizationId,
      table.userId,
      table.certificationId,
    ),
    index("company_assignments_org_idx").on(table.organizationId),
  ],
);

/**
 * Phase 2: Einladung in eine Organisation per Link mit Token. Gespeichert wird
 * NUR der SHA-256-Hash des Tokens: ein Datenbank-Leak liefert keine nutzbaren
 * Einladungslinks. Einmalig verwendbar (accepted_at), widerrufbar (revoked_at)
 * und befristet (expires_at). Die Einladung ist an eine E-Mail-Adresse
 * gebunden; angenommen werden kann sie nur von einem Konto mit genau dieser
 * Adresse. Pro Organisation und E-Mail gibt es höchstens eine offene
 * Einladung (Partial-Unique-Index).
 */
export const companyInvitations = pgTable(
  "company_invitations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Normalisiert (lib/server/email.ts). */
    email: text("email").notNull(),
    role: text("role").$type<CompanyRole>().notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "company_invitations_role_check",
      sql`${table.role} in ('company_admin', 'mentor', 'learner')`,
    ),
    uniqueIndex("company_invitations_pending_unique")
      .on(table.organizationId, table.email)
      .where(sql`${table.acceptedAt} is null and ${table.revokedAt} is null`),
    index("company_invitations_org_idx").on(table.organizationId),
    index("company_invitations_email_idx").on(table.email),
  ],
);

/** Binärdaten in Postgres (bytea). Der Treiber liefert und erwartet Buffer. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/**
 * Phase 3: Firmendokument (Metadaten). Gehört genau einer Organisation und wird nie ohne Mandantenfilter
 * gelesen (lib/server/company/documents.ts). Hochgeladen werden nur Dateien, die den Secret-Scanner
 * bestanden haben (lib/server/documents/secret-scanner.ts). Die Datei selbst liegt getrennt in
 * company_document_files, damit Listen nie die Dateiinhalte laden. Dedup nur INNERHALB einer
 * Organisation (Unique auf Prüfsumme), nie organisationsübergreifend. Der Uploader-Verweis geht beim
 * Löschen des Kontos auf NULL, das Dokument gehört der Firma.
 */
export const companyDocuments = pgTable(
  "company_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    /** SHA-256 des Dateiinhalts (Hex). */
    checksum: text("checksum").notNull(),
    /** Seiten bei PDFs, 1 bei Textdateien. */
    pageCount: integer("page_count").notNull(),
    /** Option „von KI-Verarbeitung ausschließen“: wird gespeichert, wirkt mit dem KI-Schritt. */
    excludeFromAi: boolean("exclude_from_ai").notNull().default(false),
    /**
     * Fehlalarme des Secret-Scanners, die ein Firmen-Admin bestätigt hat: [{ kind, pageNumber, line }], nie der
     * Wert. Der KI-Schritt muss genau diese Zeilen vor der Verarbeitung schwärzen. null = nichts unterdrückt.
     */
    scannerSuppressed: jsonb("scanner_suppressed").$type<{ kind: string; pageNumber: number; line: number }[]>(),
    scannerSuppressedByUserId: uuid("scanner_suppressed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    scannerSuppressedAt: timestamp("scanner_suppressed_at", { withTimezone: true }),
    /**
     * Nur für einen Kursauftrag hochgeladen (Drag and drop im Formular „Neuer interner Kurs“): erscheint nicht unter
     * „Dokumente“, wird nach dem Auftrag gelöscht (siehe cleanupJobDocuments). Gleiche Dateien dürfen mehrfach
     * vorkommen, die Eindeutigkeit je Firma gilt nur für gespeicherte Dokumente.
     */
    temporary: boolean("temporary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("company_documents_org_checksum_unique").on(table.organizationId, table.checksum).where(sql`${table.temporary} = false`),
    index("company_documents_org_idx").on(table.organizationId),
  ],
);

/** Welche Dokumente zu einem Kursauftrag gehören (ein Kurs kann aus vielen Dateien entstehen). Fällt mit Auftrag oder Dokument weg. */
export const courseGenerationJobDocuments = pgTable(
  "course_generation_job_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => courseGenerationJobs.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => companyDocuments.id, { onDelete: "cascade" }),
    orderNum: integer("order_num").notNull(),
  },
  (table) => [unique("course_generation_job_documents_unique").on(table.jobId, table.documentId)],
);

/** Dateiinhalt eines Firmendokuments (wird mit dem Dokument gelöscht und über pg_dump mitgesichert). */
export const companyDocumentFiles = pgTable("company_document_files", {
  documentId: uuid("document_id")
    .primaryKey()
    .references(() => companyDocuments.id, { onDelete: "cascade" }),
  data: bytea("data").notNull(),
});

/**
 * Screenshot zu einem Firmendokument (PNG, JPEG, WebP). Bilder lassen sich nicht auf Zugangsdaten scannen; deshalb
 * bestätigt die hochladende Person beim Upload, dass nichts Vertrauliches zu sehen ist (attested_*). Für die
 * Kurserstellung wird das Bild von der KI in Text beschrieben, und dieser Text läuft durch den Secret-Scanner.
 * Gehört der Firma und fällt mit dem Dokument weg.
 */
export const companyDocumentImages = pgTable(
  "company_document_images",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => companyDocuments.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    data: bytea("data").notNull(),
    attestedByUserId: uuid("attested_by_user_id").references(() => users.id, { onDelete: "set null" }),
    attestedAt: timestamp("attested_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("company_document_images_doc_idx").on(table.documentId)],
);

/**
 * Anfrage einer Firma nach einem allgemeinen Lernpfad. Entweder wird ein vorhandener Lernpfad gewählt
 * (certification_id) oder frei beschrieben (wish_title/-description). Wir (Betreiber) geben frei oder erstellen
 * den Lernpfad, lassen ihn extern prüfen und geben dann frei; bis dahin steht die Anfrage mit aktuellem Status
 * und Hinweis (status_note) da. Jede Statusänderung steht zusätzlich in course_request_events.
 */
export const courseRequests = pgTable(
  "course_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id, { onDelete: "set null" }),
    certificationId: uuid("certification_id").references(() => certifications.id, { onDelete: "set null" }),
    wishTitle: text("wish_title"),
    wishDescription: text("wish_description"),
    status: text("status").$type<CourseRequestStatus>().notNull().default("submitted"),
    /** Aktueller Hinweis an die Firma (z. B. „wird erstellt, voraussichtlich KW 44“). */
    statusNote: text("status_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "course_requests_status_check",
      sql`${table.status} in ('submitted', 'on_hold', 'in_creation', 'in_review', 'released', 'rejected', 'withdrawn', 'revoked')`,
    ),
    check("course_requests_target_check", sql`${table.certificationId} is not null or ${table.wishTitle} is not null`),
    index("course_requests_org_idx").on(table.organizationId),
    index("course_requests_status_idx").on(table.status),
  ],
);

/** Verlauf einer Anfrage: jede Statusänderung mit Hinweis, Zeitpunkt und Bearbeiter (der Firma sichtbar). */
export const courseRequestEvents = pgTable(
  "course_request_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id")
      .notNull()
      .references(() => courseRequests.id, { onDelete: "cascade" }),
    status: text("status").$type<CourseRequestStatus>().notNull(),
    note: text("note"),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("course_request_events_request_idx").on(table.requestId)],
);

/**
 * Freigabe eines allgemeinen Lernpfads für eine Firma. Erst mit diesem Eintrag darf die Firma den Lernpfad
 * zuweisen. Eigene (interne) Lernpfade einer Firma brauchen keine Freigabe.
 */
export const companyCourseEntitlements = pgTable(
  "company_course_entitlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    certificationId: uuid("certification_id")
      .notNull()
      .references(() => certifications.id, { onDelete: "cascade" }),
    releasedAt: timestamp("released_at", { withTimezone: true }).notNull().defaultNow(),
    releasedByUserId: uuid("released_by_user_id").references(() => users.id, { onDelete: "set null" }),
    requestId: uuid("request_id").references(() => courseRequests.id, { onDelete: "set null" }),
  },
  (table) => [
    unique("company_course_entitlements_org_cert_unique").on(table.organizationId, table.certificationId),
    index("company_course_entitlements_org_idx").on(table.organizationId),
  ],
);

export type AiAccessMode = "platform" | "byok";

/**
 * KI-Zugang einer Firma für ihre internen Lernpfade: "platform" = über unseren Zugang, "byok" = mit dem
 * eigenen Schlüssel der Firma („bring your own key“). Der Schlüssel liegt nur verschlüsselt hier
 * (lib/server/crypto/secret-box.ts) und wird nie an den Browser zurückgegeben, nur die letzten 4 Zeichen.
 * Ohne Eintrag (mode null) ist kein KI-Zugang eingerichtet.
 */
export const organizationAiSettings = pgTable("organization_ai_settings", {
  organizationId: uuid("organization_id")
    .primaryKey()
    .references(() => organizations.id, { onDelete: "cascade" }),
  mode: text("mode").$type<AiAccessMode>(),
  provider: text("provider").notNull().default("gemini"),
  keyEncrypted: text("key_encrypted"),
  keyLast4: text("key_last4"),
  keyUpdatedAt: timestamp("key_updated_at", { withTimezone: true }),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id, { onDelete: "set null" }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  check("organization_ai_settings_mode_check", sql`${table.mode} is null or ${table.mode} in ('platform', 'byok')`),
  check("organization_ai_settings_key_check", sql`(${table.keyEncrypted} is null) = (${table.keyLast4} is null)`),
]);

export type AccountTokenPurpose = "verify_email" | "reset_password";

/**
 * Einmal-Tokens für E-Mail-Bestätigung und Passwort-Reset. Gespeichert wird NUR der SHA-256-Hash
 * (wie bei Einladungen): ein Datenbank-Leak liefert keine nutzbaren Links. Befristet, einmalig
 * verwendbar, werden mit dem Konto gelöscht.
 */
export const accountTokens = pgTable(
  "account_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").$type<AccountTokenPurpose>().notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("account_tokens_purpose_check", sql`${table.purpose} in ('verify_email', 'reset_password')`),
    index("account_tokens_user_purpose_idx").on(table.userId, table.purpose),
  ],
);

/**
 * Offene Anfrage „Ich gehöre zu diesem Unternehmen“: ein Konto nennt Firmenname und Firmen-E-Mail,
 * an die Adresse geht ein Bestätigungslink. Erst beim Einlösen entsteht die Organisation (mit dem
 * Konto als Firmen-Admin). Wie bei account_tokens wird nur der SHA-256-Hash des Tokens gespeichert;
 * Anfragen sind befristet, einmalig und verschwinden mit dem Konto.
 */
export const companyClaims = pgTable(
  "company_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyName: text("company_name").notNull(),
    companyEmail: text("company_email").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("company_claims_user_idx").on(table.userId)],
);

/**
 * Praxisaufgabe einer Firma zu einem ihrer Lernpfade (z. B. „Setze einen Testserver auf“). Alle, denen der
 * Lernpfad zugewiesen ist, sehen sie; Mentor oder Firmen-Admin bestätigen die Erledigung. Archivierte Aufgaben
 * zählen nicht mehr, bleiben aber samt Abgaben erhalten (Nachweise gehören der Person).
 */
export const practiceTasks = pgTable(
  "practice_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    certificationId: uuid("certification_id")
      .notNull()
      .references(() => certifications.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description"),
    /** Optional: Lernziel, dessen Wiederholungsfragen die Aufgabe prüft (PSRP-HR Phase 6, implizite Reviews). */
    objectiveId: uuid("objective_id").references(() => objectives.id, { onDelete: "set null" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [index("practice_tasks_org_cert_idx").on(table.organizationId, table.certificationId)],
);

/**
 * Abgabe einer Person zu einer Praxisaufgabe: eigene Notiz (freiwillig), Bestätigung oder Nacharbeit durch eine
 * ANDERE Person der Firma (Mentor/Firmen-Admin, nie die eigene Abgabe). Bestätigt ist endgültig. Der zusammengesetzte
 * Fremdschlüssel stellt sicher, dass die Person Mitglied der Firma ist; sie fällt mit der Mitgliedschaft weg.
 */
export const practiceTaskSubmissions = pgTable(
  "practice_task_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => practiceTasks.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").notNull(),
    userId: uuid("user_id").notNull(),
    status: text("status").$type<PracticeSubmissionStatus>().notNull().default("submitted"),
    learnerNote: text("learner_note"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedByUserId: uuid("reviewed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewerNote: text("reviewer_note"),
    /** Wann die Entscheidung in die persönliche Wiederholungsplanung der abgebenden Person eingeflossen ist (Lernseite). */
    learnedAt: timestamp("learned_at", { withTimezone: true }),
  },
  (table) => [
    check("practice_task_submissions_status_check", sql`${table.status} in ('submitted', 'confirmed', 'rework')`),
    foreignKey({
      columns: [table.userId, table.organizationId],
      foreignColumns: [organizationMemberships.userId, organizationMemberships.organizationId],
      name: "practice_task_submissions_member_fk",
    }).onDelete("cascade"),
    unique("practice_task_submissions_task_user_unique").on(table.taskId, table.userId),
    index("practice_task_submissions_org_status_idx").on(table.organizationId, table.status),
  ],
);

/**
 * Firmenmodul: eine kurze Unterlage der Firma (Text, z. B. „Unser Ticket-Prozess“) zu einem ihrer Lernpfade, mit einer
 * verantwortlichen Person (Mentor oder Firmen-Admin) und „gültig bis“. Wer den Lernpfad zugewiesen hat, sieht sie auf
 * der Lernpfad-Seite; nach Ablauf bleibt der Inhalt für Lernende verborgen, bis die verantwortliche Person verlängert.
 * Gehört der Firma: der Betreiber liest sie nie. Fällt die verantwortliche Person weg, bleibt das Modul ohne
 * Verantwortlichen bestehen (SET NULL) und fällt in der Verwaltung auf.
 */
export const companyModules = pgTable(
  "company_modules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    certificationId: uuid("certification_id")
      .notNull()
      .references(() => certifications.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    /** Markdown (ohne rohes HTML dargestellt). */
    body: text("body").notNull(),
    responsibleUserId: uuid("responsible_user_id").references(() => users.id, { onDelete: "set null" }),
    /** Letzter Tag der Gültigkeit (einschließlich), als Datum ohne Zeitzone. */
    validUntil: date("valid_until").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [index("company_modules_org_cert_idx").on(table.organizationId, table.certificationId)],
);

/**
 * Eine Lektion als „durchgearbeitet“ markiert. Gilt für Lernpfade ohne Lektionstests: dort ist der Abschluss die
 * Absolvierung aller Lektionen (bei Lernpfaden mit Tests zählt weiter das Beherrschen jedes Lernziels). Gehört der
 * Person und fällt mit dem Konto weg.
 */
/**
 * Fortschritt der Simulationen in Lektionen (roadmap3.md, Schritt 5): je Person, Lektion und Simulation (Nummer in der
 * Lektion) einmal; `bestHelps` = wenigste Hilfen (Tipp, Lösung, Fehlversuche) bei einer gelösten Runde.
 */
export const simulationResults = pgTable(
  "simulation_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    simIndex: integer("sim_index").notNull(),
    solves: integer("solves").notNull().default(1),
    bestHelps: integer("best_helps").notNull(),
    lastHelps: integer("last_helps").notNull(),
    firstSolvedAt: timestamp("first_solved_at", { withTimezone: true }).notNull().defaultNow(),
    lastSolvedAt: timestamp("last_solved_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("simulation_results_user_section_sim_unique").on(table.userId, table.sectionId, table.simIndex)],
);

export const lessonCompletions = pgTable(
  "lesson_completions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("lesson_completions_user_section_unique").on(table.userId, table.sectionId)],
);

/**
 * Per Einstiegstest übersprungene Lektionen (roadmap_didaktik Phase 4.2). Bewusst getrennt von `lesson_completions`:
 * „übersprungen“ ist nicht „abgeschlossen“ und zählt weder für Firmenstatus noch Abschlussstatistik.
 */
export const lessonSkips = pgTable(
  "lesson_skips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sectionId: uuid("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    source: text("source").notNull().default("placement"),
    skippedAt: timestamp("skipped_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("lesson_skips_user_section_unique").on(table.userId, table.sectionId)],
);

/**
 * Onboarding-Plan einer Firma (z. B. „Operations Infrastruktur“): welche Lernpfade absolviert werden, wer als Mentor
 * begleitet. Gehört der Firma. Fällt der Mentor weg, bleibt der Plan ohne Mentor bestehen (SET NULL).
 */
export const onboardingPlans = pgTable(
  "onboarding_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    mentorUserId: uuid("mentor_user_id").references(() => users.id, { onDelete: "set null" }),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [index("onboarding_plans_org_idx").on(table.organizationId)],
);

/** Benötigte Lernpfade eines Onboarding-Plans (in dieser Reihenfolge). */
export const onboardingPlanCourses = pgTable(
  "onboarding_plan_courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => onboardingPlans.id, { onDelete: "cascade" }),
    certificationId: uuid("certification_id")
      .notNull()
      .references(() => certifications.id, { onDelete: "cascade" }),
    orderNum: integer("order_num").notNull(),
  },
  (table) => [unique("onboarding_plan_courses_unique").on(table.planId, table.certificationId)],
);

/**
 * Das Onboarding einer Person nach einem Plan. Stand: offen, besprochen (Mentor hat mit der Person gesprochen) oder
 * geprüft (Mentor hat abgenommen; erst wenn alle Lernpfade des Plans abgeschlossen sind; endgültig). Der
 * zusammengesetzte Fremdschlüssel stellt sicher, dass die Person Mitglied der Firma ist.
 */
export const onboardings = pgTable(
  "onboardings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => onboardingPlans.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id").notNull(),
    userId: uuid("user_id").notNull(),
    status: text("status").$type<OnboardingStatus>().notNull().default("open"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    discussedAt: timestamp("discussed_at", { withTimezone: true }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    statusByUserId: uuid("status_by_user_id").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => [
    check("onboardings_status_check", sql`${table.status} in ('open', 'discussed', 'reviewed')`),
    foreignKey({
      columns: [table.userId, table.organizationId],
      foreignColumns: [organizationMemberships.userId, organizationMemberships.organizationId],
      name: "onboardings_member_fk",
    }).onDelete("cascade"),
    unique("onboardings_plan_user_unique").on(table.planId, table.userId),
    index("onboardings_org_idx").on(table.organizationId),
  ],
);

/**
 * Pflichtregel einer Firma: ein Lernpfad ist für bestimmte Rollen verpflichtend, mit Frist (Tage ab Zuweisung).
 * Wirkt beim Anlegen auf die vorhandenen Mitglieder dieser Rollen und danach auf neue Mitglieder (Einladung
 * angenommen). Erinnerung vor der Frist und Eskalation nach Ablauf sind je Regel einstellbar. Gehört der Firma;
 * wird die Regel gelöscht, bleiben die Zuweisungen bestehen (mandatory_rule_id wird leer).
 */
export const mandatoryRules = pgTable(
  "mandatory_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    certificationId: uuid("certification_id")
      .notNull()
      .references(() => certifications.id, { onDelete: "cascade" }),
    roles: text("roles").array().$type<CompanyRole[]>().notNull(),
    dueInDays: integer("due_in_days").notNull(),
    /** Tage vor der Frist, an denen erinnert wird (0 = keine Erinnerung). */
    reminderDaysBefore: integer("reminder_days_before").notNull().default(7),
    /** Tage nach Fristablauf, ab denen Mentor und Firmen-Admin informiert werden. */
    escalateAfterDays: integer("escalate_after_days").notNull().default(3),
    /** Wiederholung: so viele Monate nach dem Abschluss beginnt eine neue Runde (leer = einmalig). */
    repeatEveryMonths: integer("repeat_every_months"),
    /** Gilt die Regel auch, wenn jemand die Rolle oder Abteilung wechselt (Entscheidung der Firma je Regel)? */
    applyOnChange: boolean("apply_on_change").notNull().default(true),
    /** true = alle Abteilungen (auch Personen ohne); false = nur die in mandatory_rule_departments. */
    allDepartments: boolean("all_departments").notNull().default(true),
    /** true = der Kurs ist ein Kurs aus unserem Katalog, der für die Firma noch nicht freigeschaltet ist; die Regel wirkt erst nach der Freischaltung. */
    pendingRelease: boolean("pending_release").notNull().default(false),
    /** Dürfen Lernende Kapitel dieses Pflichtkurses per Einstiegstest überspringen (roadmap_didaktik Phase 4.2)? Standard nein. */
    allowPlacementSkip: boolean("allow_placement_skip").notNull().default(false),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("mandatory_rules_repeat_check", sql`${table.repeatEveryMonths} is null or ${table.repeatEveryMonths} between 1 and 60`),
    unique("mandatory_rules_org_cert_unique").on(table.organizationId, table.certificationId),
    check("mandatory_rules_roles_check", sql`cardinality(${table.roles}) > 0 and ${table.roles} <@ array['company_admin', 'mentor', 'learner']::text[]`),
    check("mandatory_rules_due_check", sql`${table.dueInDays} between 1 and 365`),
    check("mandatory_rules_reminder_check", sql`${table.reminderDaysBefore} between 0 and 60`),
    check("mandatory_rules_escalate_check", sql`${table.escalateAfterDays} between 1 and 60`),
  ],
);

/**
 * Welche Erinnerung zu einer Zuweisung schon verschickt wurde (Erinnerung vor der Frist, „überfällig“ an die Person,
 * Eskalation an Mentor und Firmen-Admin). Je Zuweisung und Art höchstens einmal; so ist der tägliche Lauf wiederholbar.
 * Enthält nie Inhalte, nur Art und Zeitpunkt.
 */
export const assignmentNotices = pgTable(
  "assignment_notices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    assignmentId: uuid("assignment_id")
      .notNull()
      .references(() => companyAssignments.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"reminder" | "overdue" | "escalation">().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("assignment_notices_assignment_kind_unique").on(table.assignmentId, table.kind),
    check("assignment_notices_kind_check", sql`${table.kind} in ('reminder', 'overdue', 'escalation')`),
  ],
);

/** Abteilung einer Firma (z. B. „Operations“). Gehört der Firma; Mitglieder ordnet der Firmen-Admin zu. */
export const departments = pgTable(
  "departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique("departments_org_name_unique").on(table.organizationId, table.name)],
);

/** Auf welche Abteilungen eine Pflichtregel eingeschränkt ist (nur wirksam, wenn all_departments = false). */
export const mandatoryRuleDepartments = pgTable(
  "mandatory_rule_departments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => mandatoryRules.id, { onDelete: "cascade" }),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
  },
  (table) => [unique("mandatory_rule_departments_unique").on(table.ruleId, table.departmentId)],
);

/**
 * Nachträgliches Erzeugen von Merkzetteln für Lektionen, die noch keinen haben (ältere Kurse). Je Lauf ein Eintrag mit
 * Fortschritt, damit die Firma ihn sieht; höchstens ein laufender Lauf je Lernpfad. Enthält nur Zahlen und Meldungen,
 * nie Inhalte. Gehört der Firma.
 */
export const cheatSheetRuns = pgTable(
  "cheat_sheet_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    certificationId: uuid("certification_id")
      .notNull()
      .references(() => certifications.id, { onDelete: "cascade" }),
    startedByUserId: uuid("started_by_user_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status").$type<"running" | "done" | "failed">().notNull().default("running"),
    total: integer("total").notNull(),
    created: integer("created").notNull().default(0),
    /** Verworfen, weil der Scanner etwas gefunden hat. */
    skipped: integer("skipped").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    message: text("message"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    check("cheat_sheet_runs_status_check", sql`${table.status} in ('running', 'done', 'failed')`),
    index("cheat_sheet_runs_cert_idx").on(table.certificationId, table.startedAt),
    // Höchstens ein laufender Lauf je Lernpfad, auch bei gleichzeitigen Starts.
    uniqueIndex("cheat_sheet_runs_one_running").on(table.certificationId).where(sql`${table.status} = 'running'`),
  ],
);

/**
 * Anmeldung über das Firmenkonto (OIDC) je Firma. Das Client-Geheimnis liegt verschlüsselt (secret-box). Rollen werden bei
 * jeder Anmeldung aus den Gruppen des IdP bestimmt (`roleMappings`: Rolle → Gruppennamen, eine Rolle gilt, wenn irgendeine
 * ihrer Gruppen in den Ansprüchen steht; höchste Rolle gewinnt; ohne Treffer „Lernende“).
 */
export const organizationSso = pgTable(
  "organization_sso",
  {
    organizationId: uuid("organization_id")
      .primaryKey()
      .references(() => organizations.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(false),
    /** Adresse des IdP (Aussteller), z. B. https://login.microsoftonline.com/<tenant>/v2.0 */
    issuer: text("issuer").notNull(),
    clientId: text("client_id").notNull(),
    clientSecretEncrypted: text("client_secret_encrypted").notNull(),
    /** Name des Anspruchs mit den Gruppen (Entra/Okta/Keycloak: meist „groups“). */
    groupsClaim: text("groups_claim").notNull().default("groups"),
    roleMappings: jsonb("role_mappings").$type<Record<CompanyRole, string[]>>().notNull(),
    /** Passwort-Anmeldung für Mitglieder dieser Firma sperren (Firmen-Admins behalten sie als Notzugang). */
    enforceSso: boolean("enforce_sso").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

/**
 * E-Mail-Domains einer Firma. Erst nach Bestätigung (DNS-TXT-Eintrag) gilt eine Domain für SSO; eine bestätigte Domain gehört
 * genau einer Firma (Schutz vor Konto-Übernahme durch eine Firma, die eine fremde Domain eintippt).
 */
export const organizationDomains = pgTable(
  "organization_domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    verificationToken: text("verification_token").notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("organization_domains_org_domain_unique").on(table.organizationId, table.domain),
    uniqueIndex("organization_domains_verified_unique").on(table.domain).where(sql`${table.verifiedAt} is not null`),
  ],
);

/** Verknüpfung eines Kontos mit der Identität im IdP der Firma (Aussteller + Kennung „sub“). */
export const userIdentities = pgTable(
  "user_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (table) => [unique("user_identities_issuer_subject_unique").on(table.issuer, table.subject), index("user_identities_user_idx").on(table.userId)],
);

/** Einmaliges, kurzlebiges Ticket: die SSO-Rückkehr beweist die Anmeldung, das Ticket macht daraus die Auth.js-Sitzung. */
export const ssoLoginTickets = pgTable("sso_login_tickets", {
  tokenHash: text("token_hash").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Kurs-Werkstatt (roadmap3.md, Schritt 1): gemerkter Stand eines ganzen Kurses („vor KI-Überarbeitung Oktober“). Die
 * Inhalte selbst stehen als content_revisions mit dieser checkpointId; Wiederherstellen setzt jede Lektion und Frage
 * darauf zurück, die es noch gibt.
 */
export const courseCheckpoints = pgTable(
  "course_checkpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    certificationId: uuid("certification_id")
      .notNull()
      .references(() => certifications.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("course_checkpoints_cert_idx").on(table.certificationId, table.createdAt)],
);

export type ContentRevisionTarget = "section" | "question";
/** Wodurch der Stand abgelöst wurde: manuelle Bearbeitung, KI, Backfill-Skript, Übersetzung, Wiederherstellung; „checkpoint“ = Teil eines gemerkten Kursstands. */
export type ContentRevisionOrigin = "manual" | "ai" | "backfill" | "translation" | "restore" | "checkpoint";

/**
 * Versionsgeschichte der Kursinhalte: jede Zeile ist der vollständige Stand einer Lektion (Section-Titel + Lektion) oder
 * einer Frage (mit Optionen) VOR einer Änderung. Zurücksetzen schreibt diesen Stand zurück und legt vorher den
 * aktuellen als neue Revision ab, nichts geht verloren. `targetId` ohne FK wie bei content_reports: eine Spalte für
 * zwei Tabellen; die Zeilen verschwinden mit dem Kurs.
 */
export const contentRevisions = pgTable(
  "content_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    certificationId: uuid("certification_id")
      .notNull()
      .references(() => certifications.id, { onDelete: "cascade" }),
    targetType: text("target_type").$type<ContentRevisionTarget>().notNull(),
    targetId: uuid("target_id").notNull(),
    data: jsonb("data").notNull(),
    origin: text("origin").$type<ContentRevisionOrigin>().notNull(),
    note: text("note"),
    checkpointId: uuid("checkpoint_id").references(() => courseCheckpoints.id, { onDelete: "cascade" }),
    authorUserId: uuid("author_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("content_revisions_target_idx").on(table.targetType, table.targetId, table.createdAt),
    index("content_revisions_checkpoint_idx").on(table.checkpointId),
    check("content_revisions_target_type_check", sql`${table.targetType} in ('section', 'question')`),
    check("content_revisions_origin_check", sql`${table.origin} in ('manual', 'ai', 'backfill', 'translation', 'restore', 'checkpoint')`),
  ],
);

/**
 * Aktive Lernzeit einer Person je Kurs und Tag (Sekunden). Gemessen im Browser nur, solange der Tab sichtbar ist und die
 * Person in den letzten zwei Minuten etwas getan hat (lib/client/learning-time.ts). Persönliche Lerndaten: im Export,
 * fällt mit dem Konto weg. Grundlage für die aktive Lernzeit in der anonymen Abschluss-Statistik.
 */
export const learningTime = pgTable(
  "learning_time",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    certificationId: uuid("certification_id")
      .notNull()
      .references(() => certifications.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    seconds: integer("seconds").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.certificationId, table.day] }), check("learning_time_seconds_check", sql`${table.seconds} between 0 and 86400`)],
);

export type CourseCompletionKind = "final_exam_passed" | "certified";

/**
 * Anonyme Abschluss-Statistik (roadmap3.md): eine Zeile je erstem Bestehen der Abschlussprüfung bzw. erstem
 * ausgestellten Zertifikat einer Person in einem Kurs. BEWUSST ohne Bezug zur Person: keine user_id, kein genauer
 * Zeitpunkt (nur der Tag), keine Punkte. Bleibt erhalten, wenn das Konto gelöscht wird; wird der Kurs gelöscht, bleibt
 * die Zeile mit dem Kursnamen stehen (für Auswertungen über die Zeit).
 * - calendarDays: vom ersten Lernen im Kurs bis zum Abschluss, angefangene Tage (gleicher Tag = 1)
 * - activeMinutes: gemessene aktive Lernzeit; null, wenn die Messung nicht den ganzen Zeitraum abdeckt (Lernen vor
 *   Einführung der Messung)
 */
export const courseCompletionEvents = pgTable(
  "course_completion_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    certificationId: uuid("certification_id").references(() => certifications.id, { onDelete: "set null" }),
    courseName: text("course_name").notNull(),
    kind: text("kind").$type<CourseCompletionKind>().notNull(),
    completedOn: date("completed_on", { mode: "string" }).notNull(),
    calendarDays: integer("calendar_days").notNull(),
    activeMinutes: integer("active_minutes"),
    /** Nachträglich aus vorhandenen Prüfungsversuchen erzeugt (npm run stats:backfill-completions). */
    backfilled: boolean("backfilled").notNull().default(false),
  },
  (table) => [
    index("course_completion_events_cert_idx").on(table.certificationId, table.completedOn),
    index("course_completion_events_day_idx").on(table.completedOn),
    check("course_completion_events_kind_check", sql`${table.kind} in ('final_exam_passed', 'certified')`),
  ],
);

export const GERMAN_STATES = ["BW", "BY", "BE", "BB", "HB", "HH", "HE", "MV", "NI", "NW", "RP", "SL", "SN", "ST", "SH", "TH"] as const;
export type GermanState = (typeof GERMAN_STATES)[number];

/**
 * Berufliches Profil (roadmap3.md, Schritt 8): aktuelle Stelle, Bundesland, Schwerpunkte. Freiwillig, gehört der Person
 * (im Export, fällt mit dem Konto weg), für Firmen nicht sichtbar. Grundlage für die Karrierepfade (Schritt 9).
 */
export const userProfiles = pgTable(
  "user_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    jobTitle: text("job_title"),
    jobDescription: text("job_description"),
    focusAreas: text("focus_areas"),
    state: text("state").$type<GermanState>(),
    /** Skills aus bestandenen Abschlussprüfungen und Zertifikaten automatisch ergänzen (Einstellung, Standard aus). */
    autoSkills: boolean("auto_skills").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check("user_profiles_state_check", sql`${table.state} is null or ${table.state} in ('BW','BY','BE','BB','HB','HH','HE','MV','NI','NW','RP','SL','SN','ST','SH','TH')`)],
);

export type SkillKind = "skill" | "tool";
export type SkillLevel = "basic" | "confident" | "expert";
/** Tools: wie aktuell das Wissen ist. */
export type SkillRecency = "current" | "recent" | "older";
export type SkillSource = "manual" | "course" | "certificate";

/** Skills und Tools einer Person, mit Stufe und Herkunft (selbst eingetragen, aus Kurs, aus Zertifikat). */
export const userSkills = pgTable(
  "user_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<SkillKind>().notNull(),
    name: text("name").notNull(),
    level: text("level").$type<SkillLevel>().notNull(),
    recency: text("recency").$type<SkillRecency>(),
    source: text("source").$type<SkillSource>().notNull().default("manual"),
    sourceCertificationId: uuid("source_certification_id").references(() => certifications.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("user_skills_user_kind_name_unique").on(table.userId, table.kind, sql`lower(${table.name})`),
    check("user_skills_kind_check", sql`${table.kind} in ('skill', 'tool')`),
    check("user_skills_level_check", sql`${table.level} in ('basic', 'confident', 'expert')`),
    check("user_skills_recency_check", sql`${table.recency} is null or ${table.recency} in ('current', 'recent', 'older')`),
    check("user_skills_source_check", sql`${table.source} in ('manual', 'course', 'certificate')`),
  ],
);

/**
 * Importierte Gehaltsstatistik (roadmap3.md, Schritt 9): eine hochgeladene Tabelle der Entgeltstatistik der Bundesagentur
 * für Arbeit. Angezeigt wird immer der neueste Datensatz, mit Quelle und Stichtag; ältere bleiben zum Vergleich stehen.
 */
export const salaryDatasets = pgTable("salary_datasets", {
  id: uuid("id").primaryKey().defaultRandom(),
  source: text("source").notNull(),
  /** Stichtag der Statistik (bei der BA der 31.12. eines Jahres). */
  referenceDate: date("reference_date", { mode: "string" }).notNull(),
  fileName: text("file_name"),
  rowCount: integer("row_count").notNull().default(0),
  importedByUserId: uuid("imported_by_user_id").references(() => users.id, { onDelete: "set null" }),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Region der Gehaltsstatistik: Deutschland, Ost/West oder ein Bundesland (GERMAN_STATES). */
export type SalaryRegion = "DE" | "OST" | "WEST" | GermanState;

/**
 * Bruttomonatsentgelt (Euro, Vollzeit) je Beruf (KldB 2010, 3–5 Stellen), Anforderungsniveau (1 Helfer … 4 Experte,
 * null = alle) und Region: Median und, wenn die Tabelle sie enthält, unteres und oberes Quartil.
 */
export const salaryStats = pgTable(
  "salary_stats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    datasetId: uuid("dataset_id")
      .notNull()
      .references(() => salaryDatasets.id, { onDelete: "cascade" }),
    kldb: text("kldb").notNull(),
    occupationName: text("occupation_name"),
    level: integer("level"),
    region: text("region").$type<SalaryRegion>().notNull(),
    median: integer("median").notNull(),
    q25: integer("q25"),
    q75: integer("q75"),
  },
  (table) => [
    index("salary_stats_lookup_idx").on(table.datasetId, table.kldb, table.region),
    check("salary_stats_kldb_check", sql`${table.kldb} ~ '^[0-9]{3,5}$'`),
    check("salary_stats_level_check", sql`${table.level} is null or ${table.level} between 1 and 4`),
  ],
);

/**
 * Zuletzt berechnete Karrierepfade einer Person (KI). `inputHash` fasst Profil, Skills, Abschlüsse und Katalog zusammen:
 * weicht er ab, bietet die Seite „Pfade aktualisieren“ an. Persönliche Daten: im Export, fällt mit dem Konto weg.
 */
export const careerSuggestions = pgTable("career_suggestions", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  inputHash: text("input_hash").notNull(),
  paths: jsonb("paths").notNull(),
  model: text("model"),
  generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
  /** Berechnungen heute (Kostenbremse), zurückgesetzt an einem neuen Tag. */
  runsToday: integer("runs_today").notNull().default(1),
  runsDay: date("runs_day", { mode: "string" }).notNull().default(sql`(now() at time zone 'utc')::date`),
});

// ---------------------------------------------------------------------------
// PSRP-HR (roadmap_psrp_hr.md): FSRS-Gedächtnismodell, Review-Log, Human State
// Engine und Kalibrierung. „Item“ der Roadmap = Frage (`questions`), „Kurs“ =
// Zertifizierung (`certifications`), `course_enrollment` = `study_profiles`
// (dort liegen Prüfungsdatum und leichte Tage bereits je Nutzer und Kurs).
// ---------------------------------------------------------------------------

export type ReviewLogType = "card" | "interleaved" | "probe" | "recall_check";

/** FSRS-Zustand je (Nutzer, Frage). Abgeleitet aus dem Review-Log, wird mit jedem Review fortgeschrieben. */
export const itemStates = pgTable(
  "item_state",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    stability: numeric("stability", { precision: 10, scale: 4, mode: "number" }).notNull(),
    difficulty: numeric("difficulty", { precision: 8, scale: 4, mode: "number" }).notNull(),
    reps: integer("reps").notNull().default(0),
    lapses: integer("lapses").notNull().default(0),
    /** ts-fsrs State (0 New, 1 Learning, 2 Review, 3 Relearning). */
    fsrsState: integer("fsrs_state").notNull().default(2),
    lastReview: timestamp("last_review", { withTimezone: true }),
    due: timestamp("due", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("item_state_user_item_unique").on(table.userId, table.itemId),
    index("item_state_user_due_idx").on(table.userId, table.due),
  ],
);

/**
 * Append-only Log jedes Reviews (Architektur-Regel 3). Ein Trigger (Migration 0067) verbietet
 * UPDATE und DELETE; gelöscht wird nur beim Löschen des gesamten Nutzers (CASCADE).
 */
export const reviewLog = pgTable(
  "review_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    sessionId: uuid("session_id").notNull(),
    timestampUtc: timestamp("timestamp_utc", { withTimezone: true }).notNull().defaultNow(),
    /** Lokale Stunde (0-23) und ISO-Wochentag (1-7) in der Zeitzone des Nutzers. */
    localHour: integer("local_hour").notNull(),
    weekday: integer("weekday").notNull(),
    /** Rohes Rating 1-4 (1 Again, 2 Hard, 3 Good, 4 Easy); geht unverändert an FSRS. */
    rawRating: integer("raw_rating").notNull(),
    responseTimeMs: integer("response_time_ms"),
    reviewType: text("review_type").$type<ReviewLogType>().notNull().default("card"),
    probeVariantId: uuid("probe_variant_id"),
    /** Variantenrotation: gezeigte Variante (questions.id), wenn nicht das Original selbst; `item_id` bleibt das Original. Ohne FK, da review_log unveränderlich ist. */
    variantQuestionId: uuid("variant_question_id"),
    /** Abrufwahrscheinlichkeit laut FSRS unmittelbar vor diesem Review (null bei erstem Review). */
    predictedR: numeric("predicted_r", { precision: 6, scale: 5, mode: "number" }),
  },
  (table) => [
    index("review_log_user_time_idx").on(table.userId, table.timestampUtc),
    index("review_log_item_idx").on(table.itemId),
    check("review_log_raw_rating_check", sql`${table.rawRating} between 1 and 4`),
    check("review_log_type_check", sql`${table.reviewType} in ('card', 'interleaved', 'probe', 'recall_check')`),
    check("review_log_hour_check", sql`${table.localHour} between 0 and 23`),
    check("review_log_weekday_check", sql`${table.weekday} between 1 and 7`),
  ],
);

export const concepts = pgTable(
  "concept",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => certifications.id, { onDelete: "cascade" }),
    topicArea: text("topic_area").notNull(),
    name: text("name").notNull(),
  },
  (table) => [unique("concept_course_name_unique").on(table.courseId, table.name)],
);

export const itemConcepts = pgTable(
  "item_concept",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    conceptId: uuid("concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.itemId, table.conceptId] })],
);

export type ProbeFormat = "embedded_step" | "distractor" | "error_spotting" | "transfer";

export const probeVariants = pgTable(
  "probe_variant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conceptId: uuid("concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    /** Frage, die als Abfrage gestellt wird (dieselbe UI wie normale Aufgaben). */
    questionId: uuid("question_id").references(() => questions.id, { onDelete: "cascade" }),
    /** Original-Item, dessen Wissen die Variante prüft; Reviews der Abfrage werden diesem Item zugeschrieben. */
    sourceItemId: uuid("source_item_id").references(() => questions.id, { onDelete: "cascade" }),
    format: text("format").$type<ProbeFormat>().notNull(),
    content: jsonb("content").$type<Localized<string>>().notNull(),
    isBottleneck: boolean("is_bottleneck").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("probe_variant_concept_idx").on(table.conceptId),
    check(
      "probe_variant_format_check",
      sql`${table.format} in ('embedded_step', 'distractor', 'error_spotting', 'transfer')`,
    ),
  ],
);

export type ItemVariantSource = "original" | "probe" | "generated";

/**
 * Varianten eines Wiederholungs-Items (roadmap_didaktik Phase 1): `itemId` ist das Original (FSRS-Item, `item_state`/`review_log`),
 * `questionId` die Frage, die gezeigt wird. Das Original steht selbst als Variante mit `source = original` darin; ein Trigger
 * (Migration 0072) legt sie für jede neue Frage an. Der Zustand bleibt am Original, die Variante wird nur mitgeloggt.
 */
export const itemVariants = pgTable(
  "item_variant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    questionId: uuid("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    source: text("source").$type<ItemVariantSource>().notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("item_variant_item_question_unique").on(table.itemId, table.questionId),
    index("item_variant_question_idx").on(table.questionId),
    check("item_variant_source_check", sql`${table.source} in ('original', 'probe', 'generated')`),
  ],
);

/** Check-in je Lernsession (Phase 4); Rohdaten, getrennt von abgeleiteten Werten. */
export const sessionCheckins = pgTable(
  "session_checkin",
  {
    sessionId: uuid("session_id")
      .primaryKey()
      .references(() => studySessions.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    energyLevel: integer("energy_level").notNull(),
    timeBudgetMin: integer("time_budget_min").notNull(),
    hadWorkday: boolean("had_workday").notNull(),
    /** true, wenn der Check-in übersprungen und aus letzten/neutralen Werten ergänzt wurde. */
    imputed: boolean("imputed").notNull().default(false),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("session_checkin_user_idx").on(table.userId, table.timestamp),
    check("session_checkin_energy_check", sql`${table.energyLevel} between 1 and 5`),
    check("session_checkin_budget_check", sql`${table.timeBudgetMin} > 0`),
  ],
);

/** Abgeleitete Werte je Session (Phase 3/4), getrennt von den Rohdaten. */
export const sessionDerived = pgTable("session_derived", {
  sessionId: uuid("session_id")
    .primaryKey()
    .references(() => studySessions.id, { onDelete: "cascade" }),
  phi: numeric("phi", { precision: 5, scale: 4, mode: "number" }).notNull(),
  rTarget: numeric("r_target", { precision: 5, scale: 4, mode: "number" }).notNull(),
  dailyLimit: integer("daily_limit").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Phase 4: Flag für monotone Check-ins (identische Werte über viele Sessions). */
export const userCheckinFlags = pgTable("user_checkin_flags", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  monotone: boolean("monotone").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Phase 2: persönliche FSRS-Parameter nach dem Fit (Optimizer-Job). */
export const userFsrsParams = pgTable("user_fsrs_params", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  weights: jsonb("weights").$type<number[]>().notNull(),
  reviewCount: integer("review_count").notNull(),
  fittedAt: timestamp("fitted_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Phase 7.3: Kalibrierung (Selbsteinschätzung) je Nutzer und Themengebiet. */
export const userCalibration = pgTable(
  "user_calibration",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    topicArea: text("topic_area").notNull(),
    bias: numeric("bias", { precision: 6, scale: 5, mode: "number" }).notNull(),
    ciLow: numeric("ci_low", { precision: 6, scale: 5, mode: "number" }).notNull(),
    ciHigh: numeric("ci_high", { precision: 6, scale: 5, mode: "number" }).notNull(),
    nProbes: integer("n_probes").notNull(),
    /** Brier-Score über alle gewerteten Abfragen des Themengebiets. */
    brier: numeric("brier", { precision: 6, scale: 5, mode: "number" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.topicArea] })],
);

/** Phase 7.3: je gewertete Abfrage die Messwerte, aus denen der Kalibrierungswert entsteht. */
export const probeResults = pgTable(
  "probe_result",
  {
    reviewLogId: uuid("review_log_id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conceptId: uuid("concept_id")
      .notNull()
      .references(() => concepts.id, { onDelete: "cascade" }),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => probeVariants.id, { onDelete: "cascade" }),
    topicArea: text("topic_area").notNull(),
    predictedR: numeric("predicted_r", { precision: 6, scale: 5, mode: "number" }).notNull(),
    selfRating: integer("self_rating"),
    populationRate: numeric("population_rate", { precision: 6, scale: 5, mode: "number" }),
    success: boolean("success").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("probe_result_user_topic_idx").on(table.userId, table.topicArea)],
);

/**
 * PSRP-HR Phase 6: Aufgaben (z. B. Simulationen), die Wiederholungs-Items referenzieren. Wird die Aufgabe
 * gelöst, entsteht für jedes Item ein impliziter Review (review_type = interleaved).
 * `taskRef` ist bei Simulationen "<sectionId>:<simIndex>".
 */
export const taskItems = pgTable(
  "task_item",
  {
    taskType: text("task_type").$type<"simulation" | "practice">().notNull(),
    taskRef: text("task_ref").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.taskType, table.taskRef, table.itemId] }),
    check("task_item_type_check", sql`${table.taskType} in ('simulation', 'practice')`),
  ],
);

export type AiBatchKind = "quality" | "simulations" | "concepts";
export type AiBatchStatus = "running" | "done" | "failed" | "cancelled";

/**
 * Sammelläufe der KI-Nachbesserung (nur allgemeine Kurse, nur Admins): „Qualitätsbericht komplett abarbeiten“, „Simulationen
 * ergänzen“ und „Konzepte und Abfragen ergänzen“, für einen Kurs oder für alle. Läuft im Hintergrund des Servers; der Stand
 * steht hier, damit die Oberfläche Fortschritt zeigen und ein Neustart des Servers erkannt werden kann.
 */
export const aiBatchRuns = pgTable(
  "ai_batch_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").$type<AiBatchKind>().notNull(),
    /** null = alle allgemeinen Kurse. */
    certificationId: uuid("certification_id").references(() => certifications.id, { onDelete: "cascade" }),
    startedByUserId: uuid("started_by_user_id").references(() => users.id, { onDelete: "set null" }),
    status: text("status").$type<AiBatchStatus>().notNull().default("running"),
    /** Auswahl bei „quality“ (welche Arten von Verbesserungen), sonst leer. */
    params: jsonb("params").$type<Record<string, unknown>>().notNull().default({}),
    total: integer("total").notNull().default(0),
    /** Bearbeitete Einträge (Lektionen, Verbesserungen oder Lernziele). */
    processed: integer("processed").notNull().default(0),
    applied: integer("applied").notNull().default(0),
    /** Nicht passend (z. B. Thema eignet sich nicht für eine Simulation) oder schon vorhanden. */
    skipped: integer("skipped").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 10, scale: 4 }),
    message: text("message"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    /** Lebenszeichen; ein „laufender“ Lauf ohne Lebenszeichen gilt als abgebrochen (Neustart). */
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    check("ai_batch_runs_kind_check", sql`${table.kind} in ('quality', 'simulations', 'concepts')`),
    check("ai_batch_runs_status_check", sql`${table.status} in ('running', 'done', 'failed', 'cancelled')`),
    index("ai_batch_runs_kind_idx").on(table.kind, table.startedAt),
    // Höchstens ein laufender Lauf je Art und Kurs, und einer je Art für „alle Kurse“.
    uniqueIndex("ai_batch_runs_one_running_cert").on(table.kind, table.certificationId).where(sql`${table.status} = 'running' and ${table.certificationId} is not null`),
    uniqueIndex("ai_batch_runs_one_running_all").on(table.kind).where(sql`${table.status} = 'running' and ${table.certificationId} is null`),
  ],
);
