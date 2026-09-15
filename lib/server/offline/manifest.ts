import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  domains,
  lessons,
  objectives,
  questionOptions,
  questions,
  sections,
  studySessionItems,
  studySessions,
} from "@/lib/server/db/schema";
import type { Localized } from "@/lib/types";

export interface OfflineQuestionOption {
  id: string;
  text: Localized<string>;
  orderNum: number;
  isCorrect: boolean;
}

export interface OfflineQuestion {
  id: string;
  question: Localized<string>;
  explanation: Localized<string>;
  sourceReference: string | null;
  options: OfflineQuestionOption[];
}

export interface OfflineSection {
  id: string;
  orderNum: number;
  title: Localized<string>;
  estimatedMinutes: number | null;
  lesson: {
    content: Localized<string>;
    keyTakeaways: Localized<string[]> | null;
    examFocusPoints: Localized<string[]> | null;
  };
}

export interface OfflineObjective {
  id: string;
  code: string;
  title: string;
  questions: OfflineQuestion[];
  sections: OfflineSection[];
}

export interface OfflineDomain {
  id: string;
  name: string;
  orderNum: number;
  weightPercent: number | null;
  objectives: OfflineObjective[];
}

export interface OfflineSessionQuestionItem {
  itemId: string;
  /** Immer "review"/"weak"/"new" - "lesson"-Items sind per Konstruktion
   * immer referenceType "section" (siehe buildAndPersistSession() in
   * session-service.ts) und landen daher nie hier, sondern in lessonItems. */
  category: "review" | "weak" | "new";
  questionId: string;
  question: Localized<string>;
  /** Anders als das Live-Session-Endergebnis (siehe getStudySessionWithContent
   * in lib/server/study/session-service.ts) enthält dies isCorrect - dieselbe
   * bewusste Abweichung wie beim Abschnittsquiz im Offline-Paket: ohne
   * Netzverbindung muss der Score sofort clientseitig berechenbar sein. */
  options: OfflineQuestionOption[];
}

export interface OfflineSessionLessonItem {
  itemId: string;
  sectionId: string;
  title: Localized<string>;
}

export interface OfflineStudySession {
  sessionId: string;
  questionItems: OfflineSessionQuestionItem[];
  lessonItems: OfflineSessionLessonItem[];
}

export interface OfflinePackage {
  certificationId: string;
  certSlug: string;
  certName: string;
  version: string;
  generatedAt: string;
  domains: OfflineDomain[];
  /** R4.3 (roadmap.md): nur gesetzt, wenn zum Download-Zeitpunkt bereits
   * eine AKTIVE (planned/in_progress) Session für heute existiert - wird
   * bewusst nicht neu gebaut (das bräuchte Live-Zugriff auf Fälligkeits-/
   * Schwachstellen-Daten), siehe Kommentar bei getOfflineStudySession(). */
  session: OfflineStudySession | null;
}

/**
 * R4.1 (roadmap.md): "Versioniertes Manifest mit Lessons, Fragen und
 * benötigten Assets erzeugen" - die Version ist bewusst eine einfache
 * Näherung (jüngstes lessons.updatedAt bzw. certifications.updatedAt, je
 * nachdem was später liegt) statt eines exakten Inhalts-Hash: Lektionen
 * sind der mit Abstand am häufigsten geänderte Inhaltstyp, strukturelle
 * Änderungen (Domains/Objectives/neue Fragen) gehen im aktuellen
 * Content-Pipeline-Ablauf praktisch immer mit einer Lesson-Aktualisierung
 * einher.
 */
export async function getOfflinePackageVersion(certificationId: string): Promise<string | null> {
  const db = getDb();
  const [certRow] = await db
    .select({ updatedAt: certifications.updatedAt })
    .from(certifications)
    .where(eq(certifications.id, certificationId))
    .limit(1);
  if (!certRow) return null;

  const [lessonMax] = await db
    .select({ maxUpdatedAt: sql<Date | null>`max(${lessons.updatedAt})` })
    .from(lessons)
    .innerJoin(sections, eq(sections.id, lessons.sectionId))
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(eq(domains.certificationId, certificationId));

  const latest =
    lessonMax?.maxUpdatedAt && lessonMax.maxUpdatedAt > certRow.updatedAt
      ? lessonMax.maxUpdatedAt
      : certRow.updatedAt;
  return latest.toISOString();
}

/**
 * R4.3: bündelt die heutige Session NUR, wenn sie bereits existiert und
 * noch aktiv ist (planned/in_progress) - eine neue Session zu bauen
 * bräuchte Live-Zugriff auf Fälligkeits-/Schwachstellen-/Review-Daten
 * (siehe buildAndPersistSession() in session-service.ts), was offline nicht
 * möglich ist. Wurde die Session bereits abgeschlossen/ausgesetzt, gibt es
 * nichts mehr offline zu erledigen - dann null.
 */
async function getOfflineStudySession(
  userId: string,
  certificationId: string,
): Promise<OfflineStudySession | null> {
  const db = getDb();
  const [session] = await db
    .select()
    .from(studySessions)
    .where(and(eq(studySessions.userId, userId), eq(studySessions.certificationId, certificationId)))
    .orderBy(desc(studySessions.plannedAt))
    .limit(1);
  if (!session || (session.status !== "planned" && session.status !== "in_progress")) return null;

  const itemRows = await db
    .select()
    .from(studySessionItems)
    .where(eq(studySessionItems.sessionId, session.id))
    .orderBy(asc(studySessionItems.orderNum));

  const questionItemIds = itemRows.filter((i) => i.referenceType === "question").map((i) => i.referenceId);
  const sectionItemIds = itemRows.filter((i) => i.referenceType === "section").map((i) => i.referenceId);

  const [questionRows, optionRows, sectionRows] = await Promise.all([
    questionItemIds.length > 0
      ? db.select().from(questions).where(inArray(questions.id, questionItemIds))
      : Promise.resolve([]),
    questionItemIds.length > 0
      ? db.select().from(questionOptions).where(inArray(questionOptions.questionId, questionItemIds))
      : Promise.resolve([]),
    sectionItemIds.length > 0
      ? db.select().from(sections).where(inArray(sections.id, sectionItemIds))
      : Promise.resolve([]),
  ]);

  const questionById = new Map(questionRows.map((q) => [q.id, q]));
  const optionsByQuestionId = new Map<string, typeof optionRows>();
  for (const option of optionRows) {
    const list = optionsByQuestionId.get(option.questionId) ?? [];
    list.push(option);
    optionsByQuestionId.set(option.questionId, list);
  }
  const sectionById = new Map(sectionRows.map((s) => [s.id, s]));

  const questionItems: OfflineSessionQuestionItem[] = [];
  const lessonItems: OfflineSessionLessonItem[] = [];
  for (const item of itemRows) {
    if (item.referenceType === "question") {
      const q = questionById.get(item.referenceId);
      if (!q) continue;
      const options = (optionsByQuestionId.get(item.referenceId) ?? [])
        .slice()
        .sort((a, b) => a.orderNum - b.orderNum)
        .map((o) => ({ id: o.id, text: o.text, orderNum: o.orderNum, isCorrect: o.isCorrect }));
      questionItems.push({
        itemId: item.id,
        category: item.category as "review" | "weak" | "new",
        questionId: q.id,
        question: q.question,
        options,
      });
    } else {
      const s = sectionById.get(item.referenceId);
      if (!s) continue;
      lessonItems.push({ itemId: item.id, sectionId: s.id, title: s.title });
    }
  }

  return { sessionId: session.id, questionItems, lessonItems };
}

/**
 * R4.1: liefert das vollständige Offline-Paket eines Kurses - nur Domains/
 * Objectives/Sections mit tatsächlich generierter Lesson (dieselbe
 * "isReady"-Regel wie auf der Kursseite, app/cert/[id]/page.tsx), inklusive
 * aller nicht veralteten (stale=false) Fragen je Objective, wie sie auch das
 * Live-Abschnittsquiz anzeigt (siehe SectionPage: Fragen werden pro
 * OBJECTIVE geladen, nicht pro Section - Sections mit gemeinsamem Objective
 * teilen sich denselben Fragenpool, hier daher einmal je Objective
 * transportiert statt pro Section dupliziert).
 */
export async function getOfflinePackage(
  certificationId: string,
  userId: string,
): Promise<OfflinePackage | null> {
  const db = getDb();

  const [certRow] = await db
    .select()
    .from(certifications)
    .where(eq(certifications.id, certificationId))
    .limit(1);
  if (!certRow) return null;

  const domainRows = await db
    .select()
    .from(domains)
    .where(eq(domains.certificationId, certificationId))
    .orderBy(asc(domains.orderNum));
  const domainIds = domainRows.map((d) => d.id);

  const objectiveRows =
    domainIds.length > 0
      ? await db.select().from(objectives).where(inArray(objectives.domainId, domainIds))
      : [];
  const objectiveIds = objectiveRows.map((o) => o.id);

  const sectionRows =
    objectiveIds.length > 0
      ? await db
          .select()
          .from(sections)
          .where(inArray(sections.objectiveId, objectiveIds))
          .orderBy(asc(sections.orderNum))
      : [];
  const sectionIds = sectionRows.map((s) => s.id);

  const [lessonRows, questionRows] = await Promise.all([
    sectionIds.length > 0
      ? db.select().from(lessons).where(inArray(lessons.sectionId, sectionIds))
      : Promise.resolve([]),
    objectiveIds.length > 0
      ? db
          .select()
          .from(questions)
          .where(inArray(questions.objectiveId, objectiveIds))
      : Promise.resolve([]),
  ]);
  const nonStaleQuestionRows = questionRows.filter((q) => !q.stale);
  const questionIds = nonStaleQuestionRows.map((q) => q.id);

  const optionRows =
    questionIds.length > 0
      ? await db
          .select()
          .from(questionOptions)
          .where(inArray(questionOptions.questionId, questionIds))
          .orderBy(asc(questionOptions.orderNum))
      : [];

  const lessonBySectionId = new Map(lessonRows.map((l) => [l.sectionId, l]));
  const optionsByQuestionId = new Map<string, typeof optionRows>();
  for (const option of optionRows) {
    const list = optionsByQuestionId.get(option.questionId) ?? [];
    list.push(option);
    optionsByQuestionId.set(option.questionId, list);
  }
  const questionsByObjectiveId = new Map<string, OfflineQuestion[]>();
  for (const q of nonStaleQuestionRows) {
    const list = questionsByObjectiveId.get(q.objectiveId) ?? [];
    list.push({
      id: q.id,
      question: q.question,
      explanation: q.explanation,
      sourceReference: q.sourceReference,
      options: (optionsByQuestionId.get(q.id) ?? []).map((o) => ({
        id: o.id,
        text: o.text,
        orderNum: o.orderNum,
        isCorrect: o.isCorrect,
      })),
    });
    questionsByObjectiveId.set(q.objectiveId, list);
  }
  const readySectionsByObjectiveId = new Map<string, OfflineSection[]>();
  for (const s of sectionRows) {
    const lesson = lessonBySectionId.get(s.id);
    if (!lesson) continue; // "Inhalt fehlt" - noch nicht generierte Section, nicht offline verfügbar.
    const list = readySectionsByObjectiveId.get(s.objectiveId) ?? [];
    list.push({
      id: s.id,
      orderNum: s.orderNum,
      title: s.title,
      estimatedMinutes: s.estimatedMinutes,
      lesson: {
        content: lesson.content,
        keyTakeaways: lesson.keyTakeaways ?? null,
        examFocusPoints: lesson.examFocusPoints ?? null,
      },
    });
    readySectionsByObjectiveId.set(s.objectiveId, list);
  }

  const domainList: OfflineDomain[] = [];
  for (const domain of domainRows) {
    const domainObjectives = objectiveRows.filter((o) => o.domainId === domain.id);
    const objectiveList: OfflineObjective[] = [];
    for (const objective of domainObjectives) {
      const readySections = readySectionsByObjectiveId.get(objective.id) ?? [];
      if (readySections.length === 0) continue;
      objectiveList.push({
        id: objective.id,
        code: objective.code,
        title: objective.title,
        questions: questionsByObjectiveId.get(objective.id) ?? [],
        sections: readySections,
      });
    }
    if (objectiveList.length === 0) continue;
    domainList.push({
      id: domain.id,
      name: domain.name,
      orderNum: domain.orderNum,
      weightPercent: domain.weightPercent !== null ? Number(domain.weightPercent) : null,
      objectives: objectiveList,
    });
  }

  const [version, session] = await Promise.all([
    getOfflinePackageVersion(certificationId).then((v) => v ?? new Date(0).toISOString()),
    getOfflineStudySession(userId, certificationId),
  ]);

  return {
    certificationId: certRow.id,
    certSlug: certRow.slug,
    certName: certRow.name,
    version,
    generatedAt: new Date().toISOString(),
    domains: domainList,
    session,
  };
}
