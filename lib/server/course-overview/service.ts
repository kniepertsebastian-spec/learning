import { and, asc, eq, inArray, like, sql } from "drizzle-orm";
import type { GoogleGenAI } from "@google/genai";
import { generateStructured } from "@/lib/ai/generate";
import { CURRICULUM_MODEL, TRANSLATION_MODEL, thinkingLevelFor } from "@/lib/gemini";
import {
  courseOverviewSchema,
  overviewDraftOf,
  overviewDraftSchema,
  overviewFromDraft,
  overviewIsUntranslated,
  withOverviewLocale,
  type CourseOverview,
  type OverviewDraft,
} from "@/lib/course-overview";
import { clientFor } from "@/lib/server/course-translation/service";
import { translationDirection } from "@/lib/server/course-translation/translate";
import { getDb } from "@/lib/server/db/client";
import { certifications, domains, lessons, objectives, questions, sections } from "@/lib/server/db/schema";
import type { Locale } from "@/lib/types";
import { overviewSystemPrompt, overviewTranslationSystemPrompt, overviewUserPrompt, type OverviewFacts } from "./prompt";
import { withAiCost } from "@/lib/server/admin/ai-ledger";

/** Umfang des Kurses, live gezählt (nicht in der Beschreibung gespeichert, damit er nie veraltet). */
export type CourseScope = { lessons: number; simulations: number; questions: number; minutes: number | null };

export async function getCourseScope(certificationId: string): Promise<CourseScope> {
  const db = getDb();
  const sectionRows = await db
    .select({ id: sections.id, minutes: sections.estimatedMinutes })
    .from(sections)
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .innerJoin(lessons, eq(lessons.sectionId, sections.id))
    .where(eq(domains.certificationId, certificationId));
  const sectionIds = sectionRows.map((s) => s.id);
  const [{ simulations }] = sectionIds.length
    ? await db
        .select({ simulations: sql<number>`count(*)::int` })
        .from(lessons)
        .where(and(inArray(lessons.sectionId, sectionIds), sql`${lessons.content}::text like '%simulation%'`))
    : [{ simulations: 0 }];
  const [{ count: questionCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(questions)
    .innerJoin(objectives, eq(objectives.id, questions.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(and(eq(domains.certificationId, certificationId), eq(questions.stale, false), eq(questions.probeOnly, false)));
  const known = sectionRows.filter((s) => s.minutes != null);
  return {
    lessons: sectionRows.length,
    simulations,
    questions: questionCount,
    minutes: known.length ? known.reduce((sum, s) => sum + (s.minutes ?? 0), 0) : null,
  };
}

export async function getCourseOverview(certificationId: string): Promise<CourseOverview | null> {
  const [row] = await getDb().select({ overview: certifications.overview }).from(certifications).where(eq(certifications.id, certificationId)).limit(1);
  const parsed = courseOverviewSchema.safeParse(row?.overview);
  return parsed.success ? parsed.data : null;
}

export async function saveCourseOverview(certificationId: string, overview: CourseOverview): Promise<CourseOverview> {
  const valid = courseOverviewSchema.parse(overview);
  await getDb().update(certifications).set({ overview: valid, updatedAt: new Date() }).where(eq(certifications.id, certificationId));
  return valid;
}

async function loadFacts(certificationId: string): Promise<{ facts: OverviewFacts; locale: Locale; cert: { kind: string; ownerOrganizationId: string | null } }> {
  const db = getDb();
  const [cert] = await db.select().from(certifications).where(eq(certifications.id, certificationId)).limit(1);
  if (!cert) throw new Error(`Kurs ${certificationId} nicht gefunden.`);
  const locale: Locale = cert.contentLocale === "en" ? "en" : "de";
  const domainRows = await db.select().from(domains).where(eq(domains.certificationId, certificationId)).orderBy(asc(domains.orderNum));
  const objectiveRows = domainRows.length
    ? await db.select().from(objectives).where(inArray(objectives.domainId, domainRows.map((d) => d.id))).orderBy(asc(objectives.code))
    : [];
  return {
    locale,
    cert,
    facts: {
      name: cert.name,
      provider: cert.provider,
      examName: cert.examName,
      examVersion: cert.examVersion,
      hasExam: cert.includeFinalExam && cert.courseType === "certification",
      examQuestionCount: cert.examQuestionCount,
      examDurationMinutes: cert.examDurationMinutes,
      domains: domainRows.map((d) => ({
        name: d.name,
        weightPercent: d.weightPercent == null ? null : Number(d.weightPercent),
        objectives: objectiveRows.filter((o) => o.domainId === d.id).map((o) => o.title),
      })),
    },
  };
}

/**
 * Schreibt mit der KI einen Entwurf der Kursbeschreibung aus Themenbereichen und Lernzielen. Speichert nichts: die
 * Werkstatt zeigt den Entwurf, erst „Speichern“ übernimmt ihn. Beide Sprachfelder tragen zunächst den Text der
 * Kurssprache (wie bei den Lektionen), die zweite Sprache füllt der Übersetzungslauf.
 */
export async function generateOverviewDraft(certificationId: string, deps: { generate?: (system: string, user: string, locale: Locale) => Promise<OverviewDraft> } = {}): Promise<CourseOverview> {
  const { facts, locale, cert } = await loadFacts(certificationId);
  if (facts.domains.length === 0) throw new Error("Der Kurs hat noch keine Themenbereiche.");
  const system = overviewSystemPrompt(locale);
  const user = overviewUserPrompt(facts);
  const draft = deps.generate
    ? await deps.generate(system, user, locale)
    : await withAiCost({ source: "overview", certificationId }, async () => generateStructured(system, user, overviewDraftSchema, CURRICULUM_MODEL, undefined, await clientFor(cert)));
  return overviewFromDraft(overviewDraftSchema.parse(draft));
}

/** Erzeugt und speichert die Beschreibung, wenn der Kurs noch keine hat (Backfill, nach der Kursgenerierung). */
export async function ensureCourseOverview(certificationId: string): Promise<"created" | "exists"> {
  if (await getCourseOverview(certificationId)) return "exists";
  const overview = await generateOverviewDraft(certificationId);
  await saveCourseOverview(certificationId, overview);
  return "created";
}

export type OverviewTranslator = (draft: OverviewDraft, source: Locale, target: Locale) => Promise<OverviewDraft>;

function createOverviewTranslator(client?: GoogleGenAI): OverviewTranslator {
  return (draft, source, target) => generateStructured(overviewTranslationSystemPrompt(source, target), JSON.stringify(draft), overviewDraftSchema, TRANSLATION_MODEL, undefined, client, { thinkingLevel: thinkingLevelFor("translation") });
}

/**
 * Übersetzt die Beschreibung in die zweite Sprache, solange beide Sprachfelder gleich sind. Fehler gehen an den
 * Aufrufer (der Übersetzungslauf des Kurses meldet sie, die Beschreibung bleibt einsprachig).
 */
export async function translateCourseOverview(certificationId: string, translator?: OverviewTranslator): Promise<"translated" | "skipped"> {
  const overview = await getCourseOverview(certificationId);
  if (!overview || !overviewIsUntranslated(overview)) return "skipped";
  const { locale, cert } = await loadFacts(certificationId);
  const { source, target } = translationDirection(locale);
  const translate = translator ?? createOverviewTranslator(await clientFor(cert));
  const translated = overviewDraftSchema.parse(await withAiCost({ source: "overview", certificationId }, () => translate(overviewDraftOf(overview, source), source, target)));
  if (translated.essentialWhen.length !== overview.essentialWhen.length) throw new Error("Übersetzung der Kursbeschreibung unvollständig.");
  // Nur die Zielsprache wird gesetzt; wurde die Beschreibung inzwischen bearbeitet, gewinnt deren Stand.
  const current = (await getCourseOverview(certificationId)) ?? overview;
  await saveCourseOverview(certificationId, withOverviewLocale(current, target, translated));
  return "translated";
}

/** Kurse ohne Beschreibung (für das Backfill-Skript). */
export async function listCoursesWithoutOverview(slug?: string): Promise<Array<{ id: string; slug: string }>> {
  const rows = await getDb()
    .select({ id: certifications.id, slug: certifications.slug, overview: certifications.overview })
    .from(certifications)
    .where(slug ? eq(certifications.slug, slug) : like(certifications.slug, "%"));
  return rows.filter((r) => !r.overview).map(({ id, slug: s }) => ({ id, slug: s }));
}
