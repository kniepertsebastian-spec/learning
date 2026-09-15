import { and, asc, desc, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  domains,
  lessons,
  objectiveProgress,
  objectives,
  questionOptions,
  questions,
  reviewItems,
  sections,
  sessionRecommendationFeedback,
  studyProfiles,
  studySessionItems,
  studySessions,
  type ReviewOutcome,
  type StudyGoalType,
  type StudySessionItemCategory,
  type StudySessionStatus,
} from "@/lib/server/db/schema";
import type { AnswerConfidence, Localized } from "@/lib/types";
import { getDueReviewCount, getDueReviewItems, recordReviewOutcomes } from "@/lib/server/review/service";
import {
  computeLessonFallbackCount,
  computeSessionComposition,
  computeStreak,
  estimateSessionMinutes,
  estimateTargetQuestionCount,
  reallocateForExamUrgency,
  toDayKey,
  type SessionComposition,
} from "./session-builder";

const DEFAULT_GOAL_TYPE: StudyGoalType = "minutes";
const DEFAULT_GOAL_VALUE = 15;
/** Obergrenze für Kandidaten-Abfragen (schwache Objectives / neuer Stoff) -
 * kein exaktes "Pool-Größe" sondern eine großzügige Näherung: keine einzelne
 * Session-Kategorie kann laut computeSessionComposition() mehr als
 * `targetQuestionCount` Items bekommen, ein realistisches Tagesziel bleibt
 * weit darunter - siehe MAX_SOURCE_TEXT_CHARS in lib/server/ai/service.ts
 * für dasselbe Muster (dokumentierte Kappung statt exakter Zählung). */
const CANDIDATE_POOL_LIMIT = 200;
/** "Prüfungstermin ... in die Priorisierung einbeziehen" (roadmap.md):
 * innerhalb dieses Fensters vor der Prüfung tritt neuer Stoff zugunsten von
 * Wiederholung/Schwachstellen zurück - siehe reallocateForExamUrgency(). */
const EXAM_URGENCY_WINDOW_DAYS = 7;

export class StudySessionNotFoundError extends Error {}
export class StudySessionNotActiveError extends Error {}

export interface StudySessionSummary {
  id: string;
  status: StudySessionStatus;
  goalType: StudyGoalType;
  goalValue: number;
  itemCount: number;
  estimatedMinutes: number;
}

function toSummary(
  session: { id: string; status: StudySessionStatus; goalType: StudyGoalType; goalValue: number },
  itemCount: number,
): StudySessionSummary {
  return {
    id: session.id,
    status: session.status,
    goalType: session.goalType,
    goalValue: session.goalValue,
    itemCount,
    estimatedMinutes: estimateSessionMinutes(itemCount),
  };
}

/**
 * R2.3 (roadmap.md): liefert die aktuell gültige Session für (Nutzer,
 * Zertifizierung) oder baut eine neue - "Session deterministisch speichern,
 * damit ein Reload sie nicht verändert": ein Reload trifft hier immer zuerst
 * auf den bereits persistierten Zweig (unique-Partial-Index
 * `study_sessions_active_per_user_cert` erzwingt höchstens eine aktive
 * Session), nie den Bau-Zweig erneut.
 *
 * "Gültig" heißt: entweder noch aktiv (planned/in_progress, unabhängig vom
 * Datum - eine unterbrochene Session bleibt bestehen, bis sie fertig ist),
 * ODER bereits von HEUTE abgeschlossen/ausgesetzt (sonst würde ein erneuter
 * Dashboard-Aufruf nach "Session abschließen"/"Heute aussetzen" sofort eine
 * neue Session nachbauen und die "Heute schon erledigt"/"Heute pausiert"-
 * Anzeige im Dashboard, R2.4, wäre nie sichtbar). Eine abgeschlossene/
 * ausgesetzte Session von einem FRÜHEREN Tag zählt dagegen nicht mehr -
 * dann wird eine neue für den neuen Tag gebaut.
 */
export async function getOrCreateStudySession(
  userId: string,
  certificationId: string,
  now: Date = new Date(),
): Promise<StudySessionSummary> {
  const existing = await peekActiveOrTodaySession(userId, certificationId, now);
  if (existing) return existing;
  return buildAndPersistSession(userId, certificationId);
}

/**
 * R2 (roadmap.md, neue Fassung): "Zeitbudget als primäre Session-Eingabe" -
 * die Dashboard-Seite braucht die "gültige Session existiert bereits"-Prüfung
 * OHNE den Auto-Bau-Zweig, um stattdessen die 2/5/10/20-Minuten-Auswahl
 * (StartSessionPicker) zu zeigen, wenn noch keine Session für heute existiert.
 * Reine Lesefunktion - siehe getOrCreateStudySession für die "gültig"-Regel.
 */
export async function peekActiveOrTodaySession(
  userId: string,
  certificationId: string,
  now: Date = new Date(),
): Promise<StudySessionSummary | null> {
  const db = getDb();

  const [latest] = await db
    .select()
    .from(studySessions)
    .where(and(eq(studySessions.userId, userId), eq(studySessions.certificationId, certificationId)))
    .orderBy(desc(studySessions.plannedAt))
    .limit(1);

  if (latest) {
    const isActive = latest.status === "planned" || latest.status === "in_progress";
    const isFromToday = toDayKey(latest.plannedAt) === toDayKey(now);
    if (isActive || isFromToday) {
      const itemCount = await countSessionItems(latest.id);
      return toSummary(latest, itemCount);
    }
  }
  return null;
}

/**
 * R2 (roadmap.md, neue Fassung): "Nutzer wählt 2, 5, 10 oder 20 Minuten" -
 * baut eine neue Session explizit mit dem gerade gewählten Zeitbudget statt
 * dem gespeicherten Tagesziel aus study_profiles. Bewusst KEIN Rückschreiben
 * auf study_profiles.dailyGoalValue - eine Wahl "gerade 5 Minuten Zeit" soll
 * nicht leise die langfristige Standardeinstellung überschreiben. Wirft
 * nichts Neues, wenn bereits eine gültige Session existiert (siehe
 * peekActiveOrTodaySession) - der Aufrufer (API-Route) prüft das vorher.
 */
export async function startStudySession(
  userId: string,
  certificationId: string,
  goalValue: number,
  goalType: StudyGoalType = "minutes",
): Promise<StudySessionSummary> {
  return buildAndPersistSession(userId, certificationId, { goalType, goalValue });
}

async function countSessionItems(sessionId: string): Promise<number> {
  const [row] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(studySessionItems)
    .where(eq(studySessionItems.sessionId, sessionId));
  return row?.count ?? 0;
}

export interface StudySessionItemContent {
  itemId: string;
  category: StudySessionItemCategory;
  outcome: ReviewOutcome | null;
  question?: {
    questionId: string;
    question: Localized<string>;
    options: Array<{ id: string; text: Localized<string>; orderNum: number }>;
  };
  lesson?: {
    sectionId: string;
    title: Localized<string>;
  };
}

/**
 * R2.3: vollständiger Inhalt einer Session für die Lernansicht - Fragen mit
 * Optionen (ohne `isCorrect`, dieselbe Regel wie bei ExamSession: Korrektheit
 * wird erst nach der Einreichung server-seitig geprüft) bzw. Lesson-Links
 * für Fallback-Items.
 */
export async function getStudySessionWithContent(
  sessionId: string,
  userId: string,
): Promise<{ session: StudySessionSummary; items: StudySessionItemContent[] }> {
  const db = getDb();
  const [session] = await db
    .select()
    .from(studySessions)
    .where(and(eq(studySessions.id, sessionId), eq(studySessions.userId, userId)))
    .limit(1);
  if (!session) throw new StudySessionNotFoundError(`Session ${sessionId} nicht gefunden.`);

  const itemRows = await db
    .select()
    .from(studySessionItems)
    .where(eq(studySessionItems.sessionId, sessionId))
    .orderBy(asc(studySessionItems.orderNum));

  const questionItemIds = itemRows
    .filter((i) => i.referenceType === "question")
    .map((i) => i.referenceId);
  const sectionItemIds = itemRows
    .filter((i) => i.referenceType === "section")
    .map((i) => i.referenceId);

  const [questionRows, optionRows, sectionRows] = await Promise.all([
    questionItemIds.length > 0
      ? db.select().from(questions).where(inArray(questions.id, questionItemIds))
      : Promise.resolve([]),
    questionItemIds.length > 0
      ? db
          .select({
            id: questionOptions.id,
            questionId: questionOptions.questionId,
            text: questionOptions.text,
            orderNum: questionOptions.orderNum,
          })
          .from(questionOptions)
          .where(inArray(questionOptions.questionId, questionItemIds))
      : Promise.resolve([]),
    sectionItemIds.length > 0
      ? db.select().from(sections).where(inArray(sections.id, sectionItemIds))
      : Promise.resolve([]),
  ]);

  const questionById = new Map(questionRows.map((q) => [q.id, q]));
  const optionsByQuestion = new Map<string, typeof optionRows>();
  for (const option of optionRows) {
    const list = optionsByQuestion.get(option.questionId) ?? [];
    list.push(option);
    optionsByQuestion.set(option.questionId, list);
  }
  const sectionById = new Map(sectionRows.map((s) => [s.id, s]));

  const items: StudySessionItemContent[] = [];
  for (const item of itemRows) {
    if (item.referenceType === "question") {
      const q = questionById.get(item.referenceId);
      if (!q) continue; // Referenz verwaist (Frage seither gelöscht) - überspringen statt zu crashen.
      const options = (optionsByQuestion.get(item.referenceId) ?? [])
        .slice()
        .sort((a, b) => a.orderNum - b.orderNum);
      items.push({
        itemId: item.id,
        category: item.category,
        outcome: item.outcome,
        question: { questionId: q.id, question: q.question, options },
      });
    } else {
      const s = sectionById.get(item.referenceId);
      if (!s) continue;
      items.push({
        itemId: item.id,
        category: item.category,
        outcome: item.outcome,
        lesson: { sectionId: s.id, title: s.title },
      });
    }
  }

  return { session: toSummary(session, items.length), items };
}

async function buildAndPersistSession(
  userId: string,
  certificationId: string,
  goalOverride?: { goalType: StudyGoalType; goalValue: number },
): Promise<StudySessionSummary> {
  const db = getDb();

  const [profile] = await db
    .select({
      dailyGoalType: studyProfiles.dailyGoalType,
      dailyGoalValue: studyProfiles.dailyGoalValue,
      examDate: studyProfiles.examDate,
    })
    .from(studyProfiles)
    .where(and(eq(studyProfiles.userId, userId), eq(studyProfiles.certificationId, certificationId)))
    .limit(1);

  const goalType = goalOverride?.goalType ?? profile?.dailyGoalType ?? DEFAULT_GOAL_TYPE;
  const goalValue = goalOverride?.goalValue ?? profile?.dailyGoalValue ?? DEFAULT_GOAL_VALUE;
  const targetQuestionCount = estimateTargetQuestionCount(goalType, goalValue);

  const [dueCount, dueItems] = await Promise.all([
    getDueReviewCount(userId, certificationId),
    getDueReviewItems(userId, certificationId, { limit: targetQuestionCount }),
  ]);
  const dueQuestionIds = dueItems.map((item) => item.questionId);

  const weakCandidates = await selectWeakObjectiveQuestions(
    userId,
    certificationId,
    dueQuestionIds,
    CANDIDATE_POOL_LIMIT,
  );
  const weakQuestionIds = weakCandidates.map((c) => c.questionId);

  const newCandidates = await selectNewQuestions(
    userId,
    certificationId,
    [...dueQuestionIds, ...weakQuestionIds],
    CANDIDATE_POOL_LIMIT,
  );

  let composition: SessionComposition = computeSessionComposition(
    targetQuestionCount,
    dueCount,
    weakCandidates.length,
    newCandidates.length,
  );

  const examIsImminent =
    profile?.examDate != null &&
    profile.examDate.getTime() - Date.now() <= EXAM_URGENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (examIsImminent) {
    // Reallokation ist bewusst an die tatsächlich ABRUFBAREN Pools gebunden
    // (dueItems.length/weakCandidates.length, nicht der ungedeckelte
    // dueCount), damit sie nie mehr Fragen verspricht, als gleich auch
    // tatsächlich befüllt werden.
    composition = reallocateForExamUrgency(composition, dueItems.length, weakCandidates.length);
  }

  const items: Array<{
    category: StudySessionItemCategory;
    referenceType: "question" | "section";
    referenceId: string;
  }> = [
    ...dueItems.slice(0, composition.review).map((item) => ({
      category: "review" as const,
      referenceType: "question" as const,
      referenceId: item.questionId,
    })),
    ...weakCandidates.slice(0, composition.weak).map((c) => ({
      category: "weak" as const,
      referenceType: "question" as const,
      referenceId: c.questionId,
    })),
    ...newCandidates.slice(0, composition.new).map((c) => ({
      category: "new" as const,
      referenceType: "question" as const,
      referenceId: c.questionId,
    })),
  ];

  // "Bei zu kleinem Fragenpool auf Lesson-Wiederholung ... zurückfallen":
  // nur wenn die drei Fragen-Kategorien zusammen das Tagesziel verfehlen.
  const fallbackCount = computeLessonFallbackCount(targetQuestionCount, composition);
  if (fallbackCount > 0) {
    const fallbackSections = await selectFallbackLessonSections(certificationId, fallbackCount);
    items.push(
      ...fallbackSections.map((s) => ({
        category: "lesson" as const,
        referenceType: "section" as const,
        referenceId: s.sectionId,
      })),
    );
  }

  const [session] = await db
    .insert(studySessions)
    .values({ userId, certificationId, status: "planned", goalType, goalValue })
    .returning();

  if (items.length > 0) {
    await db.insert(studySessionItems).values(
      items.map((item, index) => ({
        sessionId: session.id,
        orderNum: index + 1,
        category: item.category,
        referenceType: item.referenceType,
        referenceId: item.referenceId,
      })),
    );
  }

  return toSummary(session, items.length);
}

async function selectWeakObjectiveQuestions(
  userId: string,
  certificationId: string,
  excludeQuestionIds: string[],
  limit: number,
): Promise<Array<{ questionId: string; objectiveId: string }>> {
  const db = getDb();
  const rows = await db
    .select({ questionId: questions.id, objectiveId: questions.objectiveId })
    .from(objectiveProgress)
    .innerJoin(objectives, eq(objectives.id, objectiveProgress.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .innerJoin(questions, eq(questions.objectiveId, objectives.id))
    .where(
      and(
        eq(objectiveProgress.userId, userId),
        eq(objectiveProgress.status, "NEEDS_REMEDIATION"),
        eq(domains.certificationId, certificationId),
        eq(questions.stale, false),
        excludeQuestionIds.length > 0 ? notInArray(questions.id, excludeQuestionIds) : undefined,
      ),
    )
    .orderBy(asc(objectiveProgress.masteryScore))
    .limit(limit);
  return rows;
}

async function selectNewQuestions(
  userId: string,
  certificationId: string,
  excludeQuestionIds: string[],
  limit: number,
): Promise<Array<{ questionId: string; objectiveId: string }>> {
  const db = getDb();
  const rows = await db
    .select({ questionId: questions.id, objectiveId: questions.objectiveId })
    .from(questions)
    .innerJoin(objectives, eq(objectives.id, questions.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .leftJoin(
      reviewItems,
      and(eq(reviewItems.questionId, questions.id), eq(reviewItems.userId, userId)),
    )
    .where(
      and(
        eq(domains.certificationId, certificationId),
        eq(questions.stale, false),
        isNull(reviewItems.id),
        excludeQuestionIds.length > 0 ? notInArray(questions.id, excludeQuestionIds) : undefined,
      ),
    )
    .orderBy(sql`${domains.weightPercent} desc nulls last`)
    .limit(limit);
  return rows;
}

async function selectFallbackLessonSections(
  certificationId: string,
  limit: number,
): Promise<Array<{ sectionId: string }>> {
  const db = getDb();
  const rows = await db
    .select({ sectionId: sections.id })
    .from(sections)
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .innerJoin(lessons, eq(lessons.sectionId, sections.id))
    .where(eq(domains.certificationId, certificationId))
    .orderBy(asc(sections.orderNum))
    .limit(limit);
  return rows;
}

export interface StudySessionAnswerInput {
  itemId: string;
  selectedOptionId: string;
  /** R2 (roadmap.md): "Sicherheit der eigenen Antwort abfragen" - optional. */
  confidence?: AnswerConfidence;
}

export interface StudySessionAttemptResult {
  score: number;
  results: Array<{ itemId: string; questionId: string; isCorrect: boolean; correctOptionId: string }>;
}

/**
 * R2.3/R2.4: wertet eine eingereichte Session aus, aktualisiert den
 * Review-Zustand jeder beantworteten Frage (recordReviewOutcomes(), R2.2)
 * und markiert die Session als abgeschlossen - Grundlage für "Nach der
 * Session eine kurze, motivierende Zusammenfassung zeigen" (R2.4) und die
 * Lernserie (computeStreak() liest completedAt).
 */
export async function completeStudySession(
  sessionId: string,
  userId: string,
  answers: StudySessionAnswerInput[],
): Promise<StudySessionAttemptResult> {
  const db = getDb();
  const [session] = await db
    .select()
    .from(studySessions)
    .where(and(eq(studySessions.id, sessionId), eq(studySessions.userId, userId)))
    .limit(1);
  if (!session) throw new StudySessionNotFoundError(`Session ${sessionId} nicht gefunden.`);
  if (session.status !== "planned" && session.status !== "in_progress") {
    throw new StudySessionNotActiveError("Diese Session ist bereits abgeschlossen oder ausgesetzt.");
  }

  const items = await db
    .select()
    .from(studySessionItems)
    .where(
      and(
        eq(studySessionItems.sessionId, sessionId),
        eq(studySessionItems.referenceType, "question"),
      ),
    );
  const itemById = new Map(items.map((item) => [item.id, item]));
  const questionIds = items.map((item) => item.referenceId);

  const optionRows =
    questionIds.length > 0
      ? await db.select().from(questionOptions).where(inArray(questionOptions.questionId, questionIds))
      : [];

  const results: StudySessionAttemptResult["results"] = [];
  let correctCount = 0;
  for (const answer of answers) {
    const item = itemById.get(answer.itemId);
    if (!item) continue;
    const correctOption = optionRows.find((o) => o.questionId === item.referenceId && o.isCorrect);
    const isCorrect = !!correctOption && correctOption.id === answer.selectedOptionId;
    if (isCorrect) correctCount++;
    results.push({
      itemId: item.id,
      questionId: item.referenceId,
      isCorrect,
      correctOptionId: correctOption?.id ?? "",
    });
  }

  if (results.length > 0) {
    const confidenceByItemId = new Map(answers.map((a) => [a.itemId, a.confidence]));
    await Promise.all(
      results.map((r) =>
        db
          .update(studySessionItems)
          .set({
            outcome: r.isCorrect ? "correct" : "incorrect",
            confidence: confidenceByItemId.get(r.itemId) ?? null,
          })
          .where(eq(studySessionItems.id, r.itemId)),
      ),
    );
    await recordReviewOutcomes(
      userId,
      results.map((r) => ({ questionId: r.questionId, isCorrect: r.isCorrect })),
    );
  }

  await db
    .update(studySessions)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(eq(studySessions.id, sessionId));

  const score = results.length > 0 ? Math.round((correctCount / results.length) * 100) : 0;
  return { score, results };
}

/** R2.4: "Heute aussetzen" - beendet die Session ohne sie als erledigt zu
 * zählen (zählt entsprechend NICHT in die Lernserie, siehe computeStreak()). */
export async function skipStudySession(sessionId: string, userId: string): Promise<void> {
  const db = getDb();
  const result = await db
    .update(studySessions)
    .set({ status: "skipped", updatedAt: new Date() })
    .where(
      and(
        eq(studySessions.id, sessionId),
        eq(studySessions.userId, userId),
        inArray(studySessions.status, ["planned", "in_progress"]),
      ),
    )
    .returning({ id: studySessions.id });
  if (result.length === 0) {
    throw new StudySessionNotFoundError(`Aktive Session ${sessionId} nicht gefunden.`);
  }
}

/** R2.4: "Lernserie" - aufeinanderfolgende Tage mit mindestens einer
 * abgeschlossenen Session für diese Zertifizierung. */
export async function getStudyStreak(
  userId: string,
  certificationId: string,
  now: Date = new Date(),
): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ completedAt: studySessions.completedAt })
    .from(studySessions)
    .where(
      and(
        eq(studySessions.userId, userId),
        eq(studySessions.certificationId, certificationId),
        eq(studySessions.status, "completed"),
      ),
    );
  const dates = rows.map((r) => r.completedAt).filter((d): d is Date => d !== null);
  return computeStreak(dates, now);
}

export interface WeakObjectiveSummary {
  objectiveId: string;
  objectiveTitle: string;
  domainName: string;
  masteryScore: number;
}

/** R2.4: "Drei wichtigste schwache Objectives erklären" - die niedrigste
 * Mastery zuerst, direkt aus der bereits gepflegten objective_progress
 * (siehe ObjectiveProgressService), keine erneute Neuberechnung nötig. */
export async function getTopWeakObjectives(
  userId: string,
  certificationId: string,
  limit = 3,
): Promise<WeakObjectiveSummary[]> {
  const db = getDb();
  const rows = await db
    .select({
      objectiveId: objectives.id,
      objectiveTitle: objectives.title,
      domainName: domains.name,
      masteryScore: objectiveProgress.masteryScore,
    })
    .from(objectiveProgress)
    .innerJoin(objectives, eq(objectives.id, objectiveProgress.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(
      and(
        eq(objectiveProgress.userId, userId),
        eq(domains.certificationId, certificationId),
        eq(objectiveProgress.status, "NEEDS_REMEDIATION"),
      ),
    )
    .orderBy(asc(objectiveProgress.masteryScore))
    .limit(limit);
  return rows.map((r) => ({ ...r, masteryScore: Number(r.masteryScore) }));
}

/** R2 (roadmap.md, neue Fassung): "Empfehlungen mit Gründen anzeigen" -
 * zählt die bereits gebauten study_session_items je Kategorie, damit das
 * Dashboard daraus einen erklärenden Satz bauen kann ("3 Wiederholungen,
 * 1 schwacher Bereich, 1 neue Frage"), ohne die Session-Zusammenstellung
 * (computeSessionComposition) an dieser Stelle zu wiederholen. */
export async function getSessionCategoryBreakdown(
  sessionId: string,
): Promise<Record<StudySessionItemCategory, number>> {
  const rows = await getDb()
    .select({ category: studySessionItems.category, count: sql<number>`count(*)::int` })
    .from(studySessionItems)
    .where(eq(studySessionItems.sessionId, sessionId))
    .groupBy(studySessionItems.category);

  const breakdown: Record<StudySessionItemCategory, number> = { review: 0, weak: 0, new: 0, lesson: 0 };
  for (const row of rows) breakdown[row.category] = row.count;
  return breakdown;
}

/** R2 (roadmap.md, neue Fassung): "Nutzerfeedback auf Empfehlungen erfassen"
 * - Upsert, da höchstens ein Feedback pro Session sinnvoll ist (Unique-
 * Constraint auf session_id): ein erneuter Klick ändert die bestehende
 * Bewertung statt eine zweite Zeile anzulegen. */
export async function setSessionRecommendationFeedback(
  sessionId: string,
  userId: string,
  helpful: boolean,
): Promise<void> {
  const db = getDb();
  const [session] = await db
    .select({ id: studySessions.id })
    .from(studySessions)
    .where(and(eq(studySessions.id, sessionId), eq(studySessions.userId, userId)))
    .limit(1);
  if (!session) throw new StudySessionNotFoundError(`Session ${sessionId} nicht gefunden.`);

  await db
    .insert(sessionRecommendationFeedback)
    .values({ sessionId, userId, helpful })
    .onConflictDoUpdate({
      target: sessionRecommendationFeedback.sessionId,
      set: { helpful },
    });
}

export async function getSessionRecommendationFeedback(sessionId: string): Promise<boolean | null> {
  const [row] = await getDb()
    .select({ helpful: sessionRecommendationFeedback.helpful })
    .from(sessionRecommendationFeedback)
    .where(eq(sessionRecommendationFeedback.sessionId, sessionId))
    .limit(1);
  return row?.helpful ?? null;
}
