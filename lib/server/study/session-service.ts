import { and, asc, desc, eq, gte, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  domains,
  lessons,
  objectiveProgress,
  objectives,
  questionOptions,
  conceptStruggles,
  concepts,
  questions,
  recallChecks,
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
import type { AnswerConfidence, EnergyLevel, Localized } from "@/lib/types";
import { isFeatureEnabled } from "@/lib/server/feature-flags";
import { loadBridges, planPrereqCheck, recordPrereqResults } from "@/lib/server/prerequisites/service";
import { platformStatText } from "@/lib/feedback/platform-stat";
import { firstTryStats } from "@/lib/server/stats/first-try";
import { recordObjectiveSnapshot } from "@/lib/server/progress/snapshots";
import { approvedHelpForQuestion, type UnderstandHelp } from "@/lib/server/explanations/service";
import { createWinSession, planWinItems, recordExit } from "@/lib/server/exit/service";
import { afterDeescalatedSession, declineDeescalation, orderEasiestFirst, refreshEngagement } from "@/lib/server/engagement/service";
import { DEFAULT_ENGAGEMENT_CONFIG } from "@/lib/server/engagement/rules";
import { createRecallCheck, planRecallCheck, recordRecallResults } from "@/lib/server/recall/service";
import { detectStruggles, loadConfusion, pausedItemIds, planUnderstandTask, recordUnderstandResults } from "@/lib/server/understanding/service";
import { chooseSessionVariants } from "@/lib/server/variants/rotation";
import { flagOutlierVariants } from "@/lib/server/variants/outliers";
import { buildAnswerReveal, type AnswerReveal } from "./answer-reveal";
import {
  buildDailyQueue,
  persistSessionPlan,
  planSession,
  type CheckinInput,
} from "@/lib/server/psrp/planning-service";
import { applyReviewedPracticeTasks } from "@/lib/server/psrp/practice-reviews";
import { usesPlanning } from "@/lib/server/psrp/evaluation";
import { DEFAULT_PSRP_CONFIG } from "@/lib/server/psrp/config";
import { moreStudyExtra } from "@/lib/server/psrp/planner";
import { interleaveProbes, selectProbes } from "@/lib/server/psrp/probes";
import { getDueReviewCount, getDueReviewItems, recordReviewOutcomes } from "@/lib/server/review/service";
import {
  computeLessonFallbackCount,
  computeSessionComposition,
  computeStreak,
  estimateSessionMinutes,
  estimateTargetQuestionCount,
  isComebackSession,
  reallocateTowardFamiliarContent,
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
 * Wiederholung/Schwachstellen zurück - siehe reallocateTowardFamiliarContent(). */
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
  isComeback: boolean;
  /** Frühwarnung (Flag dropout_guard): diese Session wurde entlastet. */
  deescalated: boolean;
}

function toSummary(
  session: {
    id: string;
    status: StudySessionStatus;
    goalType: StudyGoalType;
    goalValue: number;
    isComeback: boolean;
    deescalated: boolean;
  },
  itemCount: number,
): StudySessionSummary {
  return {
    id: session.id,
    status: session.status,
    goalType: session.goalType,
    goalValue: session.goalValue,
    itemCount,
    estimatedMinutes: estimateSessionMinutes(itemCount),
    isComeback: session.isComeback,
    deescalated: session.deescalated,
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
  energyLevel?: EnergyLevel,
  checkin?: CheckinInput,
  /** Aufgabenart nach Energie (Flag energy_modes): nur Wiederholungen, kein neuer Stoff und keine Schwächen-Fragen. */
  reviewsOnly?: boolean,
): Promise<StudySessionSummary> {
  return buildAndPersistSession(userId, certificationId, { goalType, goalValue, energyLevel, checkin, reviewsOnly });
}

/**
 * „Mehr lernen“ (PSRP-HR Phase 3): nach einer abgeschlossenen Session eine weitere bauen, deren Limit um einen Anteil
 * höher liegt. Nur wenn der Nutzer das Tageslimit überschreiben darf (Konfiguration) und die letzte Session von heute
 * abgeschlossen ist. Gibt null zurück, wenn das nicht zutrifft.
 */
export async function startMoreStudySession(
  userId: string,
  certificationId: string,
  now: Date = new Date(),
): Promise<StudySessionSummary | null> {
  if (!DEFAULT_PSRP_CONFIG.planning.allowLimitOverride) return null;
  const latest = await peekActiveOrTodaySession(userId, certificationId, now);
  if (!latest || latest.status !== "completed") return null;
  return buildAndPersistSession(userId, certificationId, {
    goalType: latest.goalType,
    goalValue: latest.goalValue,
    moreStudy: true,
  });
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
  /** Nur bei category = understand: das Konzept im Verstehens-Modus und die erkannte Verwechslung (falls vorhanden). */
  understand?: {
    conceptStruggleId: string;
    conceptName: string;
    confusion: { optionText: Localized<string>; rationale: Localized<string> | null } | null;
    /** Freigegebene Hilfen zum Lernziel (nie live erzeugt): Leiter „Vormachen, dann selbst machen“ und eine zusätzliche Sicht, falls vorhanden. */
    help: UnderstandHelp | null;
    /** Schwache Voraussetzung aus dem Grundlagen-Check: zuerst diese Lektion lesen, dann zurück zum Konzept. */
    bridge: { conceptName: string; sectionId: string; title: Localized<string> } | null;
  };
  /** Nur bei category = recall: die Lektion, auf die sich der Rückblick bezieht. */
  recall?: {
    recallCheckId: string;
    sectionId: string;
    lessonTitle: Localized<string>;
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

  // Gezeigt wird die gewählte Variante, sonst das Original.
  const questionItemIds = itemRows
    .filter((i) => i.referenceType === "question")
    .map((i) => i.variantQuestionId ?? i.referenceId);
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

  const recallIds = [...new Set(itemRows.map((i) => i.recallCheckId).filter((id): id is string => id !== null))];
  const recallRows =
    recallIds.length > 0
      ? await db
          .select({ id: recallChecks.id, sectionId: recallChecks.sectionId, title: sections.title })
          .from(recallChecks)
          .innerJoin(sections, eq(sections.id, recallChecks.sectionId))
          .where(inArray(recallChecks.id, recallIds))
      : [];
  const recallById = new Map(recallRows.map((r) => [r.id, r]));
  const struggleIds = [...new Set(itemRows.map((i) => i.conceptStruggleId).filter((id): id is string => id !== null))];
  const struggleRows =
    struggleIds.length > 0
      ? await db
          .select({ id: conceptStruggles.id, name: concepts.name, signals: conceptStruggles.signals, status: conceptStruggles.status })
          .from(conceptStruggles)
          .innerJoin(concepts, eq(concepts.id, conceptStruggles.conceptId))
          .where(inArray(conceptStruggles.id, struggleIds))
      : [];
  const explanationByStruggle = new Map<string, UnderstandHelp | null>();
  for (const item of itemRows) {
    if (item.conceptStruggleId && !explanationByStruggle.has(item.conceptStruggleId)) {
      const status = struggleRows.find((r) => r.id === item.conceptStruggleId)?.status ?? "detected";
      explanationByStruggle.set(item.conceptStruggleId, await approvedHelpForQuestion(item.variantQuestionId ?? item.referenceId, status).catch(() => null));
    }
  }
  const bridgeByStruggle = await loadBridges(struggleRows.map((r) => r.id));
  const struggleById = new Map(await Promise.all(struggleRows.map(async (r) => [r.id, { name: r.name, confusion: await loadConfusion(r.signals), help: explanationByStruggle.get(r.id) ?? null, bridge: bridgeByStruggle.get(r.id) ?? null }] as const)));

  const items: StudySessionItemContent[] = [];
  for (const item of itemRows) {
    if (item.referenceType === "question") {
      const shownId = item.variantQuestionId ?? item.referenceId;
      const q = questionById.get(shownId);
      if (!q) continue; // Referenz verwaist (Frage seither gelöscht) - überspringen statt zu crashen.
      const options = (optionsByQuestion.get(shownId) ?? [])
        .slice()
        .sort((a, b) => a.orderNum - b.orderNum);
      items.push({
        itemId: item.id,
        category: item.category,
        outcome: item.outcome,
        question: { questionId: q.id, question: q.question, options },
        ...(item.conceptStruggleId && struggleById.has(item.conceptStruggleId)
          ? { understand: { conceptStruggleId: item.conceptStruggleId, conceptName: struggleById.get(item.conceptStruggleId)!.name, confusion: struggleById.get(item.conceptStruggleId)!.confusion, help: struggleById.get(item.conceptStruggleId)!.help, bridge: struggleById.get(item.conceptStruggleId)!.bridge } }
          : {}),
        ...(item.recallCheckId && recallById.has(item.recallCheckId)
          ? { recall: { recallCheckId: item.recallCheckId, sectionId: recallById.get(item.recallCheckId)!.sectionId, lessonTitle: recallById.get(item.recallCheckId)!.title } }
          : {}),
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
  goalOverride?: { goalType: StudyGoalType; goalValue: number; energyLevel?: EnergyLevel; checkin?: CheckinInput; moreStudy?: boolean; reviewsOnly?: boolean },
): Promise<StudySessionSummary> {
  const db = getDb();
  const now = new Date();

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
  // PSRP-HR: Check-in (1-5) hat Vorrang vor der groben Energie-Auswahl; beide landen in energyLevel.
  const checkinEnergy = goalOverride?.checkin?.energyLevel;
  const energyLevel: EnergyLevel | null =
    checkinEnergy !== undefined ? (checkinEnergy <= 2 ? "low" : checkinEnergy >= 4 ? "high" : "medium") : (goalOverride?.energyLevel ?? null);

  // Entscheidungen zu Praxisaufgaben fließen als implizite Reviews ein (best effort, blockiert nie den Sessionstart).
  await applyReviewedPracticeTasks(userId, now).catch((error) => console.error("Praxisaufgaben-Reviews fehlgeschlagen:", error));

  // PSRP-HR Planungsschicht (Gruppe vanilla: wie bisher, nur FSRS-Fälligkeit).
  const plan = await planSession({
    userId,
    certificationId,
    now,
    timeBudgetMin: goalType === "minutes" ? goalValue : Math.max(1, Math.round(estimateSessionMinutes(goalValue))),
    checkin: goalOverride?.checkin,
  });
  const planned = usesPlanning(plan.group);
  let targetQuestionCount =
    planned && goalType === "minutes" ? plan.dailyLimit : estimateTargetQuestionCount(goalType, goalValue);
  if (goalOverride?.moreStudy) {
    // „Mehr lernen“: das Tageslimit wird um einen konfigurierbaren Anteil erhöht (Phase 3).
    const extra = moreStudyExtra(targetQuestionCount);
    targetQuestionCount += extra;
  }
  // Frühwarnung (Flag dropout_guard): bei erkanntem Muster entlasten - nur Planung, FSRS bleibt unverändert.
  const deescalated = isFeatureEnabled("dropout_guard", userId)
    ? (await refreshEngagement(userId, now).catch((error) => (console.error("Frühwarnung fehlgeschlagen:", error), { deescalated: false }))).deescalated
    : false;
  if (deescalated) targetQuestionCount = Math.max(1, Math.ceil(targetQuestionCount * DEFAULT_ENGAGEMENT_CONFIG.limitFactor));
  // Gespeichertes Tageslimit = tatsächliche Zielgröße der Session (auch ohne Planungsschicht).
  plan.dailyLimit = targetQuestionCount;

  // "Sanfter Comeback-Modus nach Pause": updatedAt statt completedAt, damit
  // sowohl eine abgeschlossene als auch eine "heute ausgesetzte" Session als
  // letzte Aktivität zählt (skipStudySession setzt nur updatedAt).
  const [lastActivity] = await db
    .select({ updatedAt: studySessions.updatedAt })
    .from(studySessions)
    .where(
      and(
        eq(studySessions.userId, userId),
        eq(studySessions.certificationId, certificationId),
        inArray(studySessions.status, ["completed", "skipped"]),
      ),
    )
    .orderBy(desc(studySessions.updatedAt))
    .limit(1);
  const isComeback = isComebackSession(lastActivity?.updatedAt ?? null);

  let dueCount: number;
  let dueItems: Array<{ questionId: string }>;
  let newCardsPaused = false;
  if (planned) {
    const queue = await buildDailyQueue({ userId, certificationId, now, limit: targetQuestionCount, phi: plan.phi });
    dueCount = queue.totalDue;
    dueItems = queue.queue.map((c) => ({ questionId: c.itemId }));
    newCardsPaused = queue.newCardsPaused;
  } else {
    [dueCount, dueItems] = await Promise.all([
      getDueReviewCount(userId, certificationId),
      getDueReviewItems(userId, certificationId, { limit: targetQuestionCount }),
    ]);
  }
  const understandingOn = isFeatureEnabled("understanding_mode", userId);
  // Verstehens-Modus: Items von Konzepten, die nicht verstanden sind, kommen nicht als normale Wiederholung (nur die Planung ändert sich).
  const paused = understandingOn ? await pausedItemIds(userId, certificationId).catch(() => new Set<string>()) : new Set<string>();
  if (paused.size > 0) {
    const kept = dueItems.filter((item) => !paused.has(item.questionId));
    dueCount = Math.max(0, dueCount - (dueItems.length - kept.length));
    dueItems = kept;
  }
  if (deescalated) dueItems = await orderEasiestFirst(userId, dueItems, now);
  const dueQuestionIds = dueItems.map((item) => item.questionId);

  const weakCandidates = (await selectWeakObjectiveQuestions(
    userId,
    certificationId,
    dueQuestionIds,
    CANDIDATE_POOL_LIMIT,
  )).filter((c) => !paused.has(c.questionId));
  const weakQuestionIds = weakCandidates.map((c) => c.questionId);

  // Rückstau-Abbau: solange mehr fällig ist als das Tageslimit, pausieren neue Karten.
  const newCandidates = newCardsPaused || deescalated
    ? []
    : await selectNewQuestions(userId, certificationId, [...dueQuestionIds, ...weakQuestionIds], CANDIDATE_POOL_LIMIT);

  let composition: SessionComposition = computeSessionComposition(
    targetQuestionCount,
    dueCount,
    weakCandidates.length,
    newCandidates.length,
  );

  const examIsImminent =
    profile?.examDate != null &&
    profile.examDate.getTime() - Date.now() <= EXAM_URGENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (examIsImminent || energyLevel === "low" || isComeback) {
    // Reallokation ist bewusst an die tatsächlich ABRUFBAREN Pools gebunden
    // (dueItems.length/weakCandidates.length, nicht der ungedeckelte
    // dueCount), damit sie nie mehr Fragen verspricht, als gleich auch
    // tatsächlich befüllt werden. Drei unabhängige Auslöser (Prüfung steht
    // an, wenig Energie, Comeback nach Pause) teilen sich denselben Hebel -
    // siehe reallocateTowardFamiliarContent().
    composition = reallocateTowardFamiliarContent(composition, dueItems.length, weakCandidates.length);
  }

  // „Nur Wiederholungen“ (Flag energy_modes): nur wenn überhaupt etwas fällig ist, sonst gilt die normale Zusammenstellung.
  if (goalOverride?.reviewsOnly && isFeatureEnabled("energy_modes", userId) && dueItems.length > 0) {
    composition = { ...composition, review: Math.min(targetQuestionCount, dueItems.length), weak: 0, new: 0 };
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

  // PSRP-HR Phase 7: höchstens 10 % versteckte Abfragen, nie direkt hintereinander, gleiche Darstellung wie normale Fragen.
  const probes = await selectProbes(userId, certificationId, items.length, now);
  if (probes.length > 0) {
    const withProbes = interleaveProbes(
      items,
      probes.map((p) => ({ category: "review" as const, referenceType: "question" as const, referenceId: p.questionId })),
    );
    items.splice(0, items.length, ...withProbes);
  }

  // "Bei zu kleinem Fragenpool auf Lesson-Wiederholung ... zurückfallen":
  // nur wenn die drei Fragen-Kategorien zusammen das Tagesziel verfehlen.
  const fallbackCount = goalOverride?.reviewsOnly && composition.new === 0 && composition.weak === 0 && dueItems.length > 0 ? 0 : computeLessonFallbackCount(targetQuestionCount, composition);
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
    .values({ userId, certificationId, status: "planned", goalType, goalValue, energyLevel, isComeback, deescalated })
    .returning();
  await persistSessionPlan(session.id, userId, plan, now);

  // Rückblick „Was weißt du noch?“ am Session-Anfang (Flag recall_check): unabhängig von der Tagesform, höchstens drei Varianten-Fragen,
  // Teil des Zeitbudgets - die übrigen Fragen werden um dieselbe Zahl gekürzt.
  let recallItems: Array<{ referenceId: string; variantQuestionId: string; recallCheckId: string }> = [];
  if (isFeatureEnabled("recall_check", userId)) {
    const recall = await planRecallCheck(userId, certificationId, now, new Set()).catch((error) => {
      console.error("Rückblick konnte nicht geplant werden:", error);
      return null;
    });
    if (recall) {
      const recallCheckId = await createRecallCheck({ userId, sessionId: session.id, plan: recall, phiAtRecall: plan.phi, now });
      recallItems = recall.picks.map((pick) => ({ referenceId: pick.itemId, variantQuestionId: pick.variantQuestionId, recallCheckId }));
      // Ein Item, das schon regulär dran wäre, wird stattdessen im Rückblick abgefragt (ein Review je Item und Session).
      const inRecall = new Set(recallItems.map((r) => r.referenceId));
      let toTrim = recallItems.length;
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i].referenceType === "question" && inRecall.has(items[i].referenceId)) {
          items.splice(i, 1);
          toTrim--;
        }
      }
      // Den Rest kürzen: von hinten, nur Fragen, und nur so weit, dass noch etwas Reguläres bleibt (Rückblick zählt zum Zeitbudget).
      for (let i = items.length - 1; i >= 0 && toTrim > 0 && items.filter((x) => x.referenceType === "question").length > 1; i--) {
        if (items[i].referenceType === "question") {
          items.splice(i, 1);
          toTrim--;
        }
      }
    }
  }

  // Verstehens-Modus nach dem Rückblick: zuerst (einmal je Konzept) der Grundlagen-Check zu den freigegebenen Voraussetzungen,
  // sonst eine Verstehens-Aufgabe (neue Variante) für das am längsten offene Konzept.
  let understandItems: Array<{ referenceId: string; variantQuestionId: string | null; conceptStruggleId: string; category: "understand" | "prereq" }> = [];
  if (understandingOn) {
    const prereq = await planPrereqCheck(userId, certificationId, now).catch((error) => {
      console.error("Grundlagen-Check konnte nicht geplant werden:", error);
      return null;
    });
    const task = prereq
      ? null
      : await planUnderstandTask(userId, certificationId).catch((error) => {
          console.error("Verstehens-Aufgabe konnte nicht geplant werden:", error);
          return null;
        });
    const planned: typeof understandItems = prereq
      ? prereq.items.filter((i) => !recallItems.some((r) => r.referenceId === i.itemId)).map((i) => ({ referenceId: i.itemId, variantQuestionId: null, conceptStruggleId: prereq.struggleId, category: "prereq" as const }))
      : task && !recallItems.some((r) => r.referenceId === task.itemId)
        ? [{ referenceId: task.itemId, variantQuestionId: task.variantQuestionId, conceptStruggleId: task.struggleId, category: "understand" as const }]
        : [];
    if (planned.length > 0) {
      understandItems = planned;
      // Diese Items kommen nicht zusätzlich regulär dran; sonst reguläre Fragen weniger (zählt zum Zeitbudget).
      let toTrim = planned.length;
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i].referenceType === "question" && planned.some((p) => p.referenceId === items[i].referenceId)) {
          items.splice(i, 1);
          toTrim--;
        }
      }
      for (let i = items.length - 1; i >= 0 && toTrim > 0 && items.filter((x) => x.referenceType === "question").length > 1; i--) {
        if (items[i].referenceType === "question") {
          items.splice(i, 1);
          toTrim--;
        }
      }
    }
  }

  if (understandItems.length > 0) {
    await db.insert(studySessionItems).values(
      understandItems.map((item, index) => ({
        sessionId: session.id,
        orderNum: recallItems.length + index + 1,
        category: item.category,
        referenceType: "question" as const,
        referenceId: item.referenceId,
        variantQuestionId: item.variantQuestionId,
        conceptStruggleId: item.conceptStruggleId,
      })),
    );
  }

  if (recallItems.length > 0) {
    await db.insert(studySessionItems).values(
      recallItems.map((item, index) => ({
        sessionId: session.id,
        orderNum: index + 1,
        category: "recall" as const,
        referenceType: "question" as const,
        referenceId: item.referenceId,
        variantQuestionId: item.variantQuestionId,
        recallCheckId: item.recallCheckId,
      })),
    );
  }

  if (items.length > 0) {
    // Variantenrotation: für Wiederholungen eine andere Variante des Items zeigen; neue Fragen starten immer mit dem Original.
    const variantByItem = await chooseSessionVariants(
      userId,
      items.filter((item) => item.referenceType === "question").map((item) => ({ itemId: item.referenceId, isNew: item.category === "new" })),
      now,
    ).catch(() => new Map<string, string>());
    await db.insert(studySessionItems).values(
      items.map((item, index) => ({
        sessionId: session.id,
        orderNum: recallItems.length + understandItems.length + index + 1,
        category: item.category,
        referenceType: item.referenceType,
        referenceId: item.referenceId,
        variantQuestionId: item.referenceType === "question" ? (variantByItem.get(item.referenceId) ?? null) : null,
      })),
    );
  }

  return toSummary(session, recallItems.length + understandItems.length + items.length);
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
        eq(questions.probeOnly, false),
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
        eq(questions.probeOnly, false),
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
  // Richtig ist die Option der GEZEIGTEN Frage (Variante oder Original); verbucht wird am Original.
  const shownQuestionId = (item: (typeof items)[number]) => item.variantQuestionId ?? item.referenceId;
  const questionIds = items.map(shownQuestionId);

  const optionRows =
    questionIds.length > 0
      ? await db.select().from(questionOptions).where(inArray(questionOptions.questionId, questionIds))
      : [];

  const results: StudySessionAttemptResult["results"] = [];
  const variantByItemId = new Map(items.filter((i) => i.variantQuestionId).map((i) => [i.id, i.variantQuestionId as string]));
  const recallByItemId = new Map(items.filter((i) => i.recallCheckId).map((i) => [i.id, i.recallCheckId as string]));
  // Verstehens-Aufgaben (Konzept im Verstehens-Modus) erzeugen kein FSRS-Review: der Zustand bleibt unverändert bis zur Lösung.
  const understandByItemId = new Map(items.filter((i) => i.conceptStruggleId).map((i) => [i.id, i.conceptStruggleId as string]));
  let correctCount = 0;
  for (const answer of answers) {
    const item = itemById.get(answer.itemId);
    if (!item) continue;
    const correctOption = optionRows.find((o) => o.questionId === shownQuestionId(item) && o.isCorrect);
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
    const selectedByItemId = new Map(answers.map((a) => [a.itemId, a.selectedOptionId]));
    await Promise.all(
      results.map((r) =>
        db
          .update(studySessionItems)
          .set({
            outcome: r.isCorrect ? "correct" : "incorrect",
            confidence: confidenceByItemId.get(r.itemId) ?? null,
            selectedOptionId: selectedByItemId.get(r.itemId) || null,
          })
          .where(eq(studySessionItems.id, r.itemId)),
      ),
    );
    await recordReviewOutcomes(
      userId,
      results.filter((r) => !understandByItemId.has(r.itemId)).map((r) => ({
        questionId: r.questionId,
        isCorrect: r.isCorrect,
        confidence: confidenceByItemId.get(r.itemId) ?? null,
        variantQuestionId: variantByItemId.get(r.itemId) ?? null,
        reviewType: recallByItemId.has(r.itemId) ? ("recall_check" as const) : undefined,
      })),
      { sessionId },
    );
    await recordUnderstandResults(results.flatMap((r) => (itemById.get(r.itemId)?.category === "understand" && understandByItemId.has(r.itemId) ? [{ struggleId: understandByItemId.get(r.itemId)!, isCorrect: r.isCorrect }] : [])));
    // Grundlagen-Check: je Konzept im Verstehens-Modus auswerten (schwache Voraussetzung → Brückenlektion), kein FSRS-Review
    const prereqResults = new Map<string, Array<{ questionId: string; isCorrect: boolean }>>();
    for (const r of results) {
      if (itemById.get(r.itemId)?.category === "prereq" && understandByItemId.has(r.itemId)) {
        const struggleId = understandByItemId.get(r.itemId)!;
        prereqResults.set(struggleId, [...(prereqResults.get(struggleId) ?? []), { questionId: r.questionId, isCorrect: r.isCorrect }]);
      }
    }
    for (const [struggleId, list] of prereqResults) await recordPrereqResults(struggleId, list).catch((error) => console.error("Grundlagen-Check (Auswertung) fehlgeschlagen:", error));
    await recordRecallResults(results.flatMap((r) => (recallByItemId.has(r.itemId) ? [{ recallCheckId: recallByItemId.get(r.itemId)!, isCorrect: r.isCorrect }] : [])));
    // Auffällige Varianten in die Prüfliste legen (best effort, blockiert die Auswertung nie).
    await flagOutlierVariants(results.map((r) => r.questionId)).catch((error) => console.error("Varianten-Prüfung fehlgeschlagen:", error));
  }

  await db
    .update(studySessions)
    .set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
    .where(eq(studySessions.id, sessionId));

  // Verstehens-Modus (Flag understanding_mode): Muster erkennen, best effort, blockiert die Auswertung nie.
  if (results.length > 0 && isFeatureEnabled("understanding_mode", userId)) {
    await detectStruggles(userId, results.filter((r) => !understandByItemId.has(r.itemId)).map((r) => r.questionId)).catch((error) => console.error("Verstehens-Erkennung fehlgeschlagen:", error));
  }

  await recordObjectiveSnapshot(userId, session.certificationId).catch((error) => console.error("Fortschritts-Stand fehlgeschlagen:", error));

  if (session.deescalated) await afterDeescalatedSession(userId).catch((error) => console.error("Frühwarnung (Abschluss) fehlgeschlagen:", error));

  const score = results.length > 0 ? Math.round((correctCount / results.length) * 100) : 0;
  return { score, results };
}

export interface StudySessionRevealResult extends AnswerReveal {
  /** Lektion zum Nachlesen (erste Section des Lernziels der Frage), falls vorhanden. */
  reviewSectionId: string | null;
  /** Echte Plattformstatistik („x von 10 lösen das nicht gleich“) nur bei nicht gelöster Frage und ausreichender Datenbasis, sonst null. */
  platformNote: Localized<string> | null;
}

/**
 * Sofort-Feedback (roadmap_didaktik Phase 2): Korrektheit, Erklärung und Begründungen für
 * EINE Frage einer eigenen, noch aktiven Session. Schreibt nichts - die Wertung entsteht
 * weiterhin erst in completeStudySession().
 */
export async function revealStudySessionAnswer(
  sessionId: string,
  userId: string,
  itemId: string,
  selectedOptionId: string,
): Promise<StudySessionRevealResult> {
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

  const [item] = await db
    .select()
    .from(studySessionItems)
    .where(
      and(
        eq(studySessionItems.id, itemId),
        eq(studySessionItems.sessionId, sessionId),
        eq(studySessionItems.referenceType, "question"),
      ),
    )
    .limit(1);
  if (!item) throw new StudySessionNotFoundError(`Item ${itemId} nicht gefunden.`);

  const shownId = item.variantQuestionId ?? item.referenceId;
  const [[question], optionRows] = await Promise.all([
    db.select().from(questions).where(eq(questions.id, shownId)).limit(1),
    db.select().from(questionOptions).where(eq(questionOptions.questionId, shownId)),
  ]);
  if (!question) throw new StudySessionNotFoundError(`Frage ${shownId} nicht gefunden.`);

  const [section] = await db
    .select({ id: sections.id })
    .from(sections)
    .innerJoin(lessons, eq(lessons.sectionId, sections.id))
    .where(eq(sections.objectiveId, question.objectiveId))
    .orderBy(asc(sections.orderNum))
    .limit(1);

  const reveal = buildAnswerReveal(question, optionRows, selectedOptionId);
  const stats = reveal.isCorrect ? null : await firstTryStats(item.referenceId).catch(() => null);
  const de = platformStatText(stats, "de");
  const en = platformStatText(stats, "en");
  return {
    ...reveal,
    reviewSectionId: section?.id ?? null,
    platformNote: de && en ? { de, en } : null,
  };
}

/** R2.4: "Heute aussetzen" - beendet die Session ohne sie als erledigt zu
 * zählen (zählt entsprechend NICHT in die Lernserie, siehe computeStreak()). */
export interface StudySessionExitResult extends StudySessionAttemptResult {
  /** Es wurde eine Mini-Session mit Erfolgsaufgaben angelegt. */
  winSession: boolean;
}

/**
 * Notausstieg „Heute reicht's“ (Flag exit_with_win): beendet die Session mit den bisher gegebenen Antworten. Unbeantwortete Aufgaben
 * bekommen kein Rating und bleiben fällig. Danach höchstens drei Erfolgsaufgaben (sehr wahrscheinlich gekonnt, ohnehin bald fällig)
 * als kurze Folge-Session. Der Notausstieg zählt als Signal für die Frühwarnung.
 */
export async function exitStudySession(sessionId: string, userId: string, answers: StudySessionAnswerInput[], openItemId?: string | null): Promise<StudySessionExitResult> {
  const db = getDb();
  const [session] = await db.select().from(studySessions).where(and(eq(studySessions.id, sessionId), eq(studySessions.userId, userId))).limit(1);
  if (!session) throw new StudySessionNotFoundError(`Session ${sessionId} nicht gefunden.`);
  const answered = answers.filter((a) => a.selectedOptionId);
  const items = await db.select({ id: studySessionItems.id, referenceId: studySessionItems.referenceId }).from(studySessionItems).where(eq(studySessionItems.sessionId, sessionId));
  const result = await completeStudySession(sessionId, userId, answered);
  await db.update(studySessions).set({ exitedAt: new Date() }).where(eq(studySessions.id, sessionId));
  const open = openItemId ? items.find((i) => i.id === openItemId && !answered.some((a) => a.itemId === i.id)) : undefined;
  await recordExit({ userId, source: "session", sessionId, questionId: open?.referenceId ?? null });
  const winIds = await planWinItems(userId, session.certificationId, items.map((i) => i.referenceId)).catch(() => [] as string[]);
  return { ...result, winSession: (await createWinSession(userId, session.certificationId, winIds, session.energyLevel)) !== null };
}

/**
 * „Nein danke, normal weiter“ bei einer entlasteten Session: Entlastung beenden (mit Wartezeit gegen sofortiges Neuauslösen) und die
 * noch unbeantwortete Session mit demselben Ziel normal neu bauen. Gibt die neue Session zurück, sonst null.
 */
export async function declineDeescalatedSession(sessionId: string, userId: string): Promise<StudySessionSummary | null> {
  const db = getDb();
  const [session] = await db.select().from(studySessions).where(and(eq(studySessions.id, sessionId), eq(studySessions.userId, userId))).limit(1);
  if (!session || !session.deescalated || (session.status !== "planned" && session.status !== "in_progress")) return null;
  const [answered] = await db
    .select({ id: studySessionItems.id })
    .from(studySessionItems)
    .where(and(eq(studySessionItems.sessionId, sessionId), sql`${studySessionItems.outcome} is not null`))
    .limit(1);
  if (answered) return null;
  await declineDeescalation(userId);
  await db.delete(studySessions).where(eq(studySessions.id, sessionId));
  return buildAndPersistSession(userId, session.certificationId, { goalType: session.goalType, goalValue: session.goalValue, energyLevel: session.energyLevel ?? undefined });
}

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

/** Lernserie über alle Zertifizierungen (Kopfzeile der App-Shell): Tage mit mindestens einer abgeschlossenen Session. */
export async function getUserStudyStreak(userId: string, now: Date = new Date()): Promise<number> {
  const since = new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000);
  const rows = await getDb()
    .select({ completedAt: studySessions.completedAt })
    .from(studySessions)
    .where(and(eq(studySessions.userId, userId), eq(studySessions.status, "completed"), gte(studySessions.completedAt, since)));
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

  const breakdown: Record<StudySessionItemCategory, number> = { review: 0, weak: 0, new: 0, lesson: 0, recall: 0, understand: 0, win: 0, prereq: 0 };
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
