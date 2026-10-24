"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import type { AnswerConfidence, Locale } from "@/lib/types";
import { enqueueSyncEvent } from "@/lib/client/sync-queue";
import { ConfidenceBar } from "@/components/quiz/ConfidenceBar";
import { FormatQuestionCard, type FormatEvaluation } from "@/components/quiz/FormatQuestionCard";
import { useThinkFirst } from "@/lib/client/use-think-first";
import { isSelfExplainType } from "@/lib/questions/self-explain";
import { buildPrompt, buildSolution, gradeAnswer, type AnswerData, type AnswerFormat, type AnswerPayload, type AnswerPrompt, type AnswerSolution } from "@/lib/questions/answer-formats";
import { FeedbackPanel } from "@/components/quiz/FeedbackPanel";
import { FocusFrame } from "@/components/quiz/FocusFrame";
import type { OptionState } from "@/components/quiz/OptionTile";
import { QuestionBody } from "@/components/quiz/QuestionBody";
import { QuestionNavigator, type NavState } from "@/components/quiz/QuestionNavigator";
import { ReportProblem } from "@/components/quiz/ReportProblem";
import { MentorAskForm } from "@/components/MentorAskForm";
import { ExitSummary } from "@/components/quiz/ExitSummary";
import { ResultSummary } from "@/components/quiz/ResultSummary";
import { useQuizHotkeys } from "@/components/quiz/useQuizHotkeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { SegmentState } from "@/components/ui/progress";
import { LessonSimulationsProvider } from "@/components/lesson/LessonSimulations";
import { RichText } from "@/components/RichText";
import { useLocale } from "@/lib/i18n";
import { useFeedbackMode } from "@/lib/client/use-feedback-mode";
import { extractSimulationSources } from "@/lib/markdown/simulation";
import { fmt } from "@/lib/quiz/keys";

interface SessionQuestionItem {
  itemId: string;
  category: "review" | "weak" | "new" | "recall" | "understand" | "win" | "prereq";
  /** Nur bei category = recall (online): die Lektion, auf die sich der Rückblick bezieht. */
  recall?: { sectionId: string; lessonTitle: { de: string; en: string } };
  /** Nur bei category = understand (online): das Konzept und die häufige Verwechslung. */
  understand?: { conceptStruggleId: string; conceptName: string; confusion: { optionText: { de: string; en: string }; rationale: { de: string; en: string } | null } | null; help?: { ladder: Array<{ kind: "worked_example" | "gapped_example"; content: { de: string; en: string }; solution: { de: string; en: string } | null }>; extra: { kind: "analogy" | "example"; content: { de: string; en: string } } | null } | null; bridge?: { conceptName: string; sectionId: string; title: { de: string; en: string } } | null };
  questionId: string;
  question: { de: string; en: string };
  /** isCorrect ist nur im Offline-Paket gesetzt (siehe offline-Prop unten) -
   * im Live-Fall bleibt Korrektheit serverseitig geprüft. */
  options: Array<{ id: string; text: { de: string; en: string }; orderNum: number; isCorrect?: boolean; rationale?: { de: string; en: string } | null }>;
  /** Nur im Offline-Paket: Erklärung für das Sofort-Feedback ohne Server. */
  explanation?: { de: string; en: string };
  sourceReference?: string | null;
  /** Neue Antwortformate (Reihenfolge, Kurzantwort, Zuordnung): online kommt die Aufgabe als `prompt` (ohne Lösung), offline die Lösung als `answerData`. */
  format?: AnswerFormat;
  prompt?: AnswerPrompt;
  answerData?: AnswerData | null;
  /** Fragetyp (kognitive Stufe), für die Selbsterklärung bei Szenario-Fragen. */
  type?: string;
}

interface SessionLessonItem {
  itemId: string;
  sectionId: string;
  title: { de: string; en: string };
}

interface StudySessionResult {
  score: number;
  results: Array<{ itemId: string; isCorrect: boolean }>;
}

/** Antwort-Aufdeckung je Frage (Server: /reveal, offline: aus dem Kurspaket berechnet). */
interface QuestionReveal {
  correctOptionId: string;
  explanation: { de: string; en: string };
  rationales: Record<string, { de: string; en: string }>;
  sourceReference: string | null;
  reviewSectionId: string | null;
  platformNote?: { de: string; en: string } | null;
  /** Neue Formate: Lösung und Anteil richtiger Teile. */
  isCorrect?: boolean;
  solution?: AnswerSolution;
  partial?: number;
}

/** Hat die Frage ein anderes Format als Auswahl, und kennen wir die Aufgabe? Dann liefert das die Aufgabe. */
function formatPromptOf(item: SessionQuestionItem): AnswerPrompt | null {
  if (!item.format || item.format === "choice") return null;
  if (item.prompt) return item.prompt;
  if (item.answerData) return buildPrompt(item.format, item.answerData, item.itemId);
  return null;
}

/** Stellvertreter in `answers`, damit „beantwortet“ für alle Formate gleich gezählt wird; die eigentliche Antwort steht in `payloads`. */
const FORMAT_ANSWER = "__format__";

interface StudySessionProps {
  certSlug: string;
  sessionId: string;
  questionItems: SessionQuestionItem[];
  lessonItems: SessionLessonItem[];
  locale: Locale;
  /** R4.3 (roadmap.md): im Offline-Reader gesetzt - reiht das Ergebnis statt
   * eines Live-POST in die lokale Sync-Warteschlange ein und berechnet den
   * Score direkt clientseitig aus den mitgelieferten isCorrect-Werten. */
  offline?: { userId: string };
  /** Praxisaufgabe nach den Fragen: eine Simulation aus einer Lektion derselben Lernziele (nur online). */
  practice?: { sectionId: string; title: { de: string; en: string }; content: { de: string; en: string }; simIndex: number } | null;
  /** Frühwarnung (Flag dropout_guard): die Session wurde entlastet, mit „Nein danke“ zum normalen Umfang (nur online). */
  deescalated?: boolean;
  /** Notausstieg „Heute reicht's“ (Flag exit_with_win, nur online). */
  exitEnabled?: boolean;
  /** Im Firmenbereich mit zugeordnetem Mentor: „Mentor fragen“ in der Verstehens-Aufgabe (nur online). */
  mentorAsk?: { certificationId: string } | null;
  /** Sicherheitsangabe ab der 3. Session (und wenn nicht abgeschaltet, „Wie ich lerne“); sonst gilt wie bisher das Rating ohne Angabe. */
  askConfidence?: boolean;
}


/**
 * R2.3/R2.4 (roadmap.md): nimmt eine vom Session Builder zusammengestellte
 * Session entgegen (Fragen + optionale Lesson-Fallback-Items) und wertet sie
 * aus - "Nach der Session eine kurze, motivierende Zusammenfassung zeigen"
 * (R2.4).
 */
export function StudySession({
  certSlug,
  sessionId,
  questionItems,
  lessonItems,
  locale,
  offline,
  practice,
  deescalated,
  exitEnabled,
  mentorAsk,
  askConfidence = true,
}: StudySessionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Array<string | null>>(() => questionItems.map(() => null));
  // Zeitpunkt der Antwort je Frage; offline gespeichert, damit die Verbuchung später den richtigen Zeitpunkt kennt.
  const answeredAtRef = useRef<Record<number, string>>({});
  const [payloads, setPayloads] = useState<Array<AnswerPayload | null>>(() => questionItems.map(() => null));
  const [formatResults, setFormatResults] = useState<Array<FormatEvaluation | null>>(() => questionItems.map(() => null));
  const [confidences, setConfidences] = useState<Array<AnswerConfidence | null>>(() =>
    questionItems.map(() => null),
  );
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<StudySessionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Sofort-Feedback: Antwort sperren, Sicherheit vor dem Aufdecken abfragen, dann aufdecken.
  const [feedbackMode, setFeedbackMode] = useFeedbackMode();
  // „Antwort zuerst überlegen“: gilt ab Beginn der Session; je Frage merken wir, ob die Optionen schon gezeigt wurden.
  const [thinkFirstOn] = useThinkFirst();
  const [thinkFirst] = useState(thinkFirstOn);
  const [optionsShown, setOptionsShown] = useState<boolean[]>(() => questionItems.map(() => false));
  const instant = feedbackMode === "instant";
  const [reveals, setReveals] = useState<Array<QuestionReveal | "failed" | "loading" | null>>(() =>
    questionItems.map(() => null),
  );
  const { t } = useLocale();

  async function revealAnswer(index: number, selectedOptionId: string) {
    const item = questionItems[index];
    const setReveal = (value: QuestionReveal | "failed" | "loading") =>
      setReveals((prev) => {
        const next = [...prev];
        next[index] = value;
        return next;
      });
    setReveal("loading");

    if (offline) {
      const correct = item.options.find((o) => o.isCorrect);
      if (!item.explanation || !correct) return setReveal("failed");
      const rationales: QuestionReveal["rationales"] = {};
      for (const option of item.options) {
        if (!option.isCorrect && option.rationale) rationales[option.id] = option.rationale;
      }
      return setReveal({
        correctOptionId: correct.id,
        explanation: item.explanation,
        rationales,
        sourceReference: item.sourceReference ?? null,
        reviewSectionId: null,
      });
    }

    try {
      const response = await fetch(`/api/study-sessions/${sessionId}/reveal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.itemId, selectedOptionId }),
      });
      if (!response.ok) return setReveal("failed");
      setReveal((await response.json()) as QuestionReveal);
    } catch {
      setReveal("failed");
    }
  }

  /** Auswertung einer Frage mit neuem Format: offline lokal aus dem Paket, online über den Server (der die Lösung erst jetzt herausgibt). */
  async function evaluateFormat(item: SessionQuestionItem, answer: AnswerPayload): Promise<FormatEvaluation> {
    const format = item.format as Exclude<AnswerFormat, "choice">;
    if (offline) {
      if (!item.answerData) return { correct: false };
      const grade = gradeAnswer(format, item.answerData, answer);
      return { correct: grade.correct, partial: grade.partial, solution: buildSolution(format, item.answerData), explanation: item.explanation?.[locale] };
    }
    const response = await fetch(`/api/study-sessions/${sessionId}/reveal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.itemId, answer }),
    });
    if (!response.ok) throw new Error("reveal failed");
    const data = (await response.json()) as QuestionReveal;
    return { correct: Boolean(data.isCorrect), partial: data.partial, solution: data.solution, explanation: data.explanation[locale] };
  }

  function handleFormatAnswered(index: number, answer: AnswerPayload, confidence?: AnswerConfidence, evaluation?: FormatEvaluation) {
    if (evaluation) {
      setFormatResults((prev) => {
        const next = [...prev];
        next[index] = evaluation;
        return next;
      });
    }
    answeredAtRef.current[index] = new Date().toISOString();
    setAnswers((prev) => {
      const next = [...prev];
      next[index] = FORMAT_ANSWER;
      return next;
    });
    setPayloads((prev) => {
      const next = [...prev];
      next[index] = answer;
      return next;
    });
    if (confidence) {
      setConfidences((prev) => {
        const next = [...prev];
        next[index] = confidence;
        return next;
      });
    }
  }

  function chooseConfidence(index: number, level: AnswerConfidence | null) {
    if (reveals[index] !== null) return;
    if (level) {
      setConfidences((prev) => {
        const next = [...prev];
        next[index] = level;
        return next;
      });
    }
    void revealAnswer(index, answers[index] ?? "");
  }

  const [skippingRecall, setSkippingRecall] = useState(false);
  async function skipRecall() {
    setSkippingRecall(true);
    try {
      await fetch(`/api/study-sessions/${sessionId}/recall-skip`, { method: "POST" });
    } finally {
      // Die Session wird neu geladen: ohne Rückblick-Fragen (und mit allen Zuständen zurückgesetzt).
      window.location.reload();
    }
  }

  const [decliningUnderstand, setDecliningUnderstand] = useState(false);
  // „Vormachen, dann selbst machen“: Stufe der Leiter in der Verstehens-Aufgabe (gelöstes Beispiel, Beispiel mit Lücken, danach die eigene Aufgabe)
  const [ladderStep, setLadderStep] = useState(0);
  const [solutionShown, setSolutionShown] = useState(false);
  async function declineUnderstand() {
    setDecliningUnderstand(true);
    try {
      await fetch(`/api/study-sessions/${sessionId}/understand-decline`, { method: "POST" });
    } finally {
      window.location.reload();
    }
  }

  const [decliningEase, setDecliningEase] = useState(false);
  async function declineEase() {
    setDecliningEase(true);
    try {
      await fetch(`/api/study-sessions/${sessionId}/deescalate-decline`, { method: "POST" });
    } finally {
      window.location.reload();
    }
  }

  const [exitState, setExitState] = useState<{ winSession: boolean } | null>(null);
  const [exiting, setExiting] = useState(false);
  async function exitToday() {
    if (exiting || result || exitState) return;
    setExiting(true);
    setError(null);
    try {
      const response = await fetch(`/api/study-sessions/${sessionId}/exit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Nur beantwortete Aufgaben: die übrigen bekommen kein Rating und bleiben fällig.
        body: JSON.stringify({
          openItemId: item.itemId,
          answers: questionItems.flatMap((q, i) => (answers[i] ? [{ itemId: q.itemId, selectedOptionId: payloads[i] ? "" : answers[i], answer: payloads[i] ?? undefined, confidence: confidences[i] ?? undefined, thinkFirst: thinkFirst && !payloads[i] ? true : undefined }] : [])),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || (locale === "de" ? "Das hat nicht geklappt." : "That did not work."));
      } else {
        setExitState({ winSession: Boolean(data.winSession) });
      }
    } catch {
      setError(locale === "de" ? "Das hat nicht geklappt." : "That did not work.");
    } finally {
      setExiting(false);
    }
  }

  async function handleSubmit() {
    if (submitting || result) return;
    setSubmitting(true);
    setError(null);
    const payload = {
      answers: questionItems.map((item, i) => ({
        itemId: item.itemId,
        selectedOptionId: payloads[i] ? "" : (answers[i] ?? ""),
        answer: payloads[i] ?? undefined,
        confidence: confidences[i] ?? undefined,
        thinkFirst: thinkFirst && !payloads[i] ? true : undefined,
      })),
    };

    if (offline) {
      const results = questionItems.map((item, i) => ({
        itemId: item.itemId,
        isCorrect: item.format && item.format !== "choice" ? Boolean(item.answerData && payloads[i] && gradeAnswer(item.format, item.answerData, payloads[i]).correct) : item.options.some((o) => o.id === answers[i] && o.isCorrect),
      }));
      const score =
        results.length > 0
          ? Math.round((results.filter((r) => r.isCorrect).length / results.length) * 100)
          : 0;
      await enqueueSyncEvent(
        offline.userId,
        "study_session",
        { sessionId, answers: payload.answers.map((a, i) => ({ ...a, answeredAt: answeredAtRef.current[i] })) },
        locale === "de" ? "Tages-Session" : "Today's session",
      ).catch(() => {});
      setResult({ score, results });
      setSubmitting(false);
      return;
    }

    try {
      const response = await fetch(`/api/study-sessions/${sessionId}/attempt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || (locale === "de" ? "Einreichen fehlgeschlagen." : "Failed to submit."));
        setSubmitting(false);
        return;
      }
      setResult(data);
    } catch {
      setError(locale === "de" ? "Einreichen fehlgeschlagen." : "Failed to submit.");
    } finally {
      setSubmitting(false);
    }
  }

  const exitHref = `/cert/${certSlug}`;
  const pickOption = (index: number) => {
    const item = questionItems[currentIndex];
    if (!item) return;
    const sorted = [...item.options].sort((a, b) => a.orderNum - b.orderNum);
    const option = sorted[index];
    if (!option || formatPromptOf(item) || (thinkFirst && !optionsShown[currentIndex])) return;
    if (instant && answers[currentIndex]) return; // Antwort ist nach dem Wählen gesperrt
    answeredAtRef.current[currentIndex] = new Date().toISOString();
    setAnswers((prev) => {
      const next = [...prev];
      next[currentIndex] = option.id;
      return next;
    });
    // Ohne Sicherheitsangabe wird gleich aufgedeckt.
    if (instant && !askConfidence && reveals[currentIndex] === null) void revealAnswer(currentIndex, option.id);
  };
  const isLast = currentIndex + 1 >= questionItems.length;
  const currentReveal = reveals[currentIndex] ?? null;
  const currentFormat = questionItems[currentIndex] ? formatPromptOf(questionItems[currentIndex]) : null;
  const canAdvance = currentFormat ? Boolean(payloads[currentIndex]) : currentReveal !== null && currentReveal !== "loading";
  useQuizHotkeys(
    4,
    (action) => {
      if (action.type === "pick") pickOption(action.index);
      else if (action.type === "enter" && answers[currentIndex] && !isLast && (!instant || canAdvance || currentFormat)) setCurrentIndex((i) => i + 1);
    },
    questionItems.length > 0 && !result,
  );

  if (questionItems.length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-1 flex-col py-8">
        <h1 className="mb-4 text-xl font-semibold">{t.quiz.lessonsRecommended}</h1>
        {lessonItems.length > 0 ? (
          <LessonList certSlug={certSlug} lessonItems={lessonItems} locale={locale} />
        ) : (
          <p className="text-sm text-subtle">{t.quiz.nothingToday}</p>
        )}
        <Link href={exitHref} className="mt-6 text-sm text-link hover:underline">
          {t.quiz.backToCourse}
        </Link>
      </div>
    );
  }

  if (exitState) return <ExitSummary certSlug={certSlug} winSession={exitState.winSession} contextLabel={t.quiz.session} />;

  if (result) {
    const correctCount = result.results.filter((r) => r.isCorrect).length;
    // Rückblick: freundlich zusammengefasst ("2 von 3 sitzen schon"), mit Link zur Lektion bei Fehlern.
    const recallItems = questionItems.filter((q) => q.category === "recall" && q.recall);
    const recallCorrect = recallItems.filter((q) => result.results.find((r) => r.itemId === q.itemId)?.isCorrect).length;
    const understandItem = questionItems.find((q) => q.category === "understand" && q.understand);
    const understandCorrect = understandItem ? result.results.find((r) => r.itemId === understandItem.itemId)?.isCorrect === true : false;
    const recallSummary = recallItems.length > 0 ? { sectionId: recallItems[0].recall!.sectionId, lessonTitle: recallItems[0].recall!.lessonTitle, total: recallItems.length, correct: recallCorrect } : null;
    return (
      <FocusFrame
        exitHref={exitHref}
        confirmLeave={false}
        contextLabel={t.quiz.session}
        mode="practice"
        segments={result.results.map((r): SegmentState => (r.isCorrect ? "correct" : "wrong"))}
        counterText={fmt(t.quiz.correctCount, { a: correctCount, b: result.results.length })}
      >
        <ResultSummary
          score={result.score}
          headline={fmt(t.quiz.correctCount, { a: correctCount, b: result.results.length })}
          offlineNote={Boolean(offline)}
          actions={[{ href: exitHref, label: t.quiz.backToCourse, primary: true }]}
        >
          {questionItems.some((q) => q.category === "prereq") && (
            <p className="text-left text-sm" role="status" data-testid="prereq-result">{t.quiz.prereqResult}</p>
          )}
          {questionItems.every((q) => q.category === "win") && (
            <p className="text-left text-sm" role="status" data-testid="win-result">{fmt(t.quiz.winResult, { a: correctCount, b: result.results.length })}</p>
          )}
          {understandItem?.understand && (
            <p className="text-left text-sm" role="status" data-testid="understand-result">
              {fmt(understandCorrect ? t.quiz.understandResultOk : t.quiz.understandResultAgain, { concept: understandItem.understand.conceptName })}
            </p>
          )}
          {recallSummary && (
            <p className="text-left text-sm" role="status" data-testid="recall-result">
              {recallSummary.correct > 0
                ? fmt(t.quiz.recallResult, { lesson: recallSummary.lessonTitle[locale], a: recallSummary.correct, b: recallSummary.total })
                : fmt(t.quiz.recallResultNone, { lesson: recallSummary.lessonTitle[locale] })}
              {recallSummary.correct < recallSummary.total && !offline && (
                <>{" "}<Link href={`/cert/${certSlug}/section/${recallSummary.sectionId}`} className="text-link hover:underline">{t.quiz.recallReread}</Link></>
              )}
            </p>
          )}
          {practice && !offline && <PracticeTask certSlug={certSlug} practice={practice} locale={locale} />}
          {lessonItems.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold">{t.quiz.lessonsRecommended}</h2>
              <LessonList certSlug={certSlug} lessonItems={lessonItems} locale={locale} />
            </div>
          )}
        </ResultSummary>
      </FocusFrame>
    );
  }

  const item = questionItems[currentIndex];
  const formatPrompt = formatPromptOf(item);
  const sortedOptions = [...item.options].sort((a, b) => a.orderNum - b.orderNum);
  const ladder = item.category === "understand" ? (item.understand?.help?.ladder ?? []) : [];
  const laddering = ladder.length > ladderStep;
  const reveal = typeof currentReveal === "object" && currentReveal !== null ? currentReveal : null;
  const states: OptionState[] = sortedOptions.map((o) => {
    if (instant && reveal) {
      if (o.id === reveal.correctOptionId) return "correct";
      if (o.id === answers[currentIndex]) return "wrong";
      return "dimmed";
    }
    return answers[currentIndex] === o.id ? "selected" : "neutral";
  });
  const segments: SegmentState[] = questionItems.map((_, i) => (answers[i] ? "current" : "open"));
  const navStates: NavState[] = questionItems.map((_, i) => (answers[i] ? "answered" : "open"));
  const answeredCount = answers.filter(Boolean).length;

  return (
    <FocusFrame
      exitHref={exitHref}
      confirmLeave={answeredCount > 0}
      contextLabel={t.quiz.session}
      mode="practice"
      segments={segments}
      counterText={fmt(t.quiz.questionXofY, { x: currentIndex + 1, y: questionItems.length })}
      scoreText={fmt(t.quiz.answeredXofY, { x: answeredCount, y: questionItems.length })}
      navigator={<QuestionNavigator mode="exam" hideNote states={navStates} currentIndex={currentIndex} flagged={new Set()} onJump={setCurrentIndex} />}
    >
      {deescalated && !offline && (
        <Card variant="inset" className="mb-4" data-testid="ease-intro">
          <p className="text-sm font-semibold">{t.quiz.easeTitle}</p>
          <p className="mt-1 text-xs text-subtle">{t.quiz.easeHint}</p>
          {answers.every((a) => a === null) && (
            <Button className="mt-3" variant="ghost" size="sm" onClick={() => void declineEase()} disabled={decliningEase} data-testid="ease-decline">{t.quiz.easeDecline}</Button>
          )}
        </Card>
      )}
      {item.category === "recall" && item.recall && (currentIndex === 0 || questionItems[currentIndex - 1].category !== "recall") && (
        <Card variant="inset" className="mb-4" data-testid="recall-intro">
          <p className="text-sm font-semibold">{fmt(t.quiz.recallTitle, { lesson: item.recall.lessonTitle[locale] })}</p>
          <p className="mt-1 text-xs text-subtle">{t.quiz.recallHint}</p>
          {!offline && answers.every((a) => a === null) && (
            <Button className="mt-3" variant="ghost" size="sm" onClick={() => void skipRecall()} disabled={skippingRecall} data-testid="recall-skip">{t.quiz.recallSkip}</Button>
          )}
        </Card>
      )}
      {item.category === "prereq" && item.understand && (currentIndex === 0 || questionItems[currentIndex - 1].category !== "prereq") && (
        <Card variant="inset" className="mb-4" data-testid="prereq-intro">
          <p className="text-sm font-semibold">{fmt(t.quiz.prereqTitle, { concept: item.understand.conceptName })}</p>
          <p className="mt-1 text-xs text-subtle">{t.quiz.prereqHint}</p>
          {!offline && answers.every((a) => a === null) && (
            <Button className="mt-3" variant="ghost" size="sm" onClick={() => void declineUnderstand()} disabled={decliningUnderstand} data-testid="prereq-decline">{t.quiz.understandDecline}</Button>
          )}
        </Card>
      )}
      {item.category === "understand" && item.understand && (
        <Card variant="inset" className="mb-4" data-testid="understand-intro">
          <p className="text-sm font-semibold">{fmt(t.quiz.understandTitle, { concept: item.understand.conceptName })}</p>
          <p className="mt-1 text-xs text-subtle">{t.quiz.understandHint}</p>
          {item.understand.confusion && (
            <p className="mt-2 text-xs" data-testid="understand-confusion">
              {fmt(t.quiz.understandConfusion, { option: item.understand.confusion.optionText[locale] })}
              {item.understand.confusion.rationale ? ` ${item.understand.confusion.rationale[locale]}` : ""}
            </p>
          )}
          {item.understand.bridge && !offline && (
            <p className="mt-3 text-sm" data-testid="understand-bridge">
              {fmt(t.quiz.bridgeHint, { concept: item.understand.bridge.conceptName })}{" "}
              <Link href={`/cert/${certSlug}/section/${item.understand.bridge.sectionId}`} className="text-link hover:underline">{fmt(t.quiz.bridgeRead, { lesson: item.understand.bridge.title[locale] })}</Link>
            </p>
          )}
          {laddering && ladder[ladderStep] && (
            <div className="mt-3 rounded-md border border-border bg-background p-3 text-sm" data-testid="understand-ladder" data-step={ladderStep}>
              <p className="mb-1 text-xs font-semibold">
                {fmt(t.quiz.ladderStep, { n: ladderStep + 1, m: ladder.length + 1 })} · {ladder[ladderStep].kind === "worked_example" ? t.quiz.explainWorked : t.quiz.explainGapped}
              </p>
              <RichText text={ladder[ladderStep].content[locale]} />
              {ladder[ladderStep].kind === "gapped_example" && ladder[ladderStep].solution && (
                <div className="mt-2">
                  {solutionShown ? (
                    <div className="rounded-md bg-surface p-2" data-testid="ladder-solution">
                      <p className="mb-1 text-xs font-semibold">{t.quiz.ladderSolution}</p>
                      <RichText text={ladder[ladderStep].solution![locale]} />
                    </div>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => setSolutionShown(true)} data-testid="ladder-show-solution">{t.quiz.ladderShowSolution}</Button>
                  )}
                </div>
              )}
              <Button className="mt-3" size="sm" onClick={() => { setLadderStep((n) => n + 1); setSolutionShown(false); }} data-testid="ladder-next">
                {ladderStep + 1 >= ladder.length ? t.quiz.ladderToTask : t.quiz.ladderNext}
              </Button>
            </div>
          )}
          {!laddering && item.understand.help?.extra && (
            <div className="mt-3 rounded-md border border-border bg-background p-3 text-sm" data-testid="understand-explanation">
              <p className="mb-1 text-xs font-semibold">{item.understand.help.extra.kind === "analogy" ? t.quiz.explainAnalogy : t.quiz.explainExample}</p>
              <RichText text={item.understand.help.extra.content[locale]} />
            </div>
          )}
          {mentorAsk && !offline && <MentorAskForm topic={item.understand.conceptName} certificationId={mentorAsk.certificationId} locale={locale} />}
          {!offline && answers.every((a) => a === null) && (
            <Button className="mt-3" variant="ghost" size="sm" onClick={() => void declineUnderstand()} disabled={decliningUnderstand} data-testid="understand-decline">{t.quiz.understandDecline}</Button>
          )}
        </Card>
      )}
      {!laddering && (
      <>
      <div className="mb-3">
        <Badge tone={item.category === "weak" ? "warning" : item.category === "review" || item.category === "recall" || item.category === "understand" || item.category === "win" || item.category === "prereq" ? "info" : "accent"}>
          {item.category === "review" ? t.quiz.categoryReview : item.category === "weak" ? t.quiz.categoryWeak : item.category === "recall" ? t.quiz.categoryRecall : item.category === "understand" ? t.quiz.categoryUnderstand : item.category === "win" ? t.quiz.categoryWin : item.category === "prereq" ? t.quiz.categoryPrereq : t.quiz.categoryNew}
        </Badge>
      </div>
      {formatPrompt ? (
        <FormatQuestionCard
          key={item.itemId}
          questionId={item.questionId}
          question={item.question[locale]}
          explanation={item.explanation?.[locale] ?? ""}
          prompt={formatPrompt}
          evaluate={(answer) => evaluateFormat(item, answer)}
          questionType={item.type}
          onAnswered={(_correct, answer, confidence, evaluation) => handleFormatAnswered(currentIndex, answer, confidence, evaluation)}
          askConfidence={askConfidence}
          sourceReference={item.sourceReference}
          onNext={isLast ? () => void handleSubmit() : () => setCurrentIndex((i) => i + 1)}
          nextLabel={isLast ? t.quiz.finish : t.quiz.nextShort}
          restored={payloads[currentIndex] && formatResults[currentIndex] ? { answer: payloads[currentIndex]!, result: formatResults[currentIndex]!, confidence: confidences[currentIndex] } : undefined}
        />
      ) : (
      <>
      <QuestionBody
        question={item.question[locale]}
        options={sortedOptions.map((o) => o.text[locale])}
        states={states}
        onPick={pickOption}
        locked={instant && Boolean(answers[currentIndex])}
        optionsHidden={thinkFirst && !optionsShown[currentIndex] && !answers[currentIndex]}
        onShowOptions={() => setOptionsShown((prev) => prev.map((v, k) => (k === currentIndex ? true : v)))}
      />

      {askConfidence && answers[currentIndex] && instant && currentReveal === null && (
        <div className="mt-4">
          <ConfidenceBar onPick={(level) => chooseConfidence(currentIndex, level)} onSkip={() => chooseConfidence(currentIndex, null)} />
          <p className="mt-2 text-xs text-subtle" data-testid="confidence-why">{t.quiz.confidenceWhy}</p>
        </div>
      )}
      {askConfidence && answers[currentIndex] && !instant && (
        <div className="mt-4">
          <ConfidenceBar onPick={(level) => setConfidences((prev) => { const next = [...prev]; next[currentIndex] = level; return next; })} />
          {confidences[currentIndex] && <p className="mt-2 text-xs text-subtle">{t.quiz[confidences[currentIndex] as AnswerConfidence]}</p>}
        </div>
      )}
      {instant && currentReveal === "loading" && (
        <p className="mt-4 flex items-center gap-2 text-sm text-subtle" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          {t.quiz.checkingAnswer}
        </p>
      )}
      {instant && reveal && (
        <div className="mt-4">
          <FeedbackPanel
            correct={answers[currentIndex] === reveal.correctOptionId}
            correctIndex={sortedOptions.findIndex((o) => o.id === reveal.correctOptionId)}
            explanation={reveal.explanation[locale]}
            rationales={sortedOptions.map((o) => reveal.rationales[o.id]?.[locale] ?? null)}
            options={sortedOptions.map((o) => o.text[locale])}
            selectedIndex={sortedOptions.findIndex((o) => o.id === answers[currentIndex])}
            confidence={confidences[currentIndex]}
            sourceReference={reveal.sourceReference}
            questionId={item.questionId}
            note={reveal.platformNote?.[locale] ?? null}
            rereadHref={reveal.reviewSectionId ? `/cert/${certSlug}/section/${reveal.reviewSectionId}` : null}
            nextLabel={isLast ? t.quiz.finish : t.quiz.nextShort}
            onNext={isLast ? () => void handleSubmit() : () => setCurrentIndex((i) => i + 1)}
            nextDisabled={submitting}
            selfExplain={isSelfExplainType(item.type)}
          />
        </div>
      )}

      {!(instant && reveal) && (
        <div className="mt-4">
          <ReportProblem questionId={item.questionId} />
        </div>
      )}
      </>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))} disabled={currentIndex === 0}>
          {t.quiz.previous}
        </Button>
        {instant && reveal ? (
          <span />
        ) : isLast ? (
          <Button onClick={() => void handleSubmit()} disabled={submitting || ((instant || Boolean(formatPrompt)) && !canAdvance)} iconLeft={submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : undefined} data-testid="submit-session">
            {t.quiz.finish}
          </Button>
        ) : (
          <Button onClick={() => setCurrentIndex((i) => Math.min(questionItems.length - 1, i + 1))} disabled={(instant || Boolean(formatPrompt)) && !canAdvance} iconRight={<ArrowRight className="h-4 w-4" aria-hidden="true" />}>
            {t.quiz.nextShort}
          </Button>
        )}
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-danger-text">{error}</p>}

      {exitEnabled && !offline && item.category !== "win" && (
        <div className="mt-4">
          <Button variant="ghost" size="sm" onClick={() => void exitToday()} disabled={exiting || submitting} data-testid="exit-today">{t.quiz.exitToday}</Button>
        </div>
      )}

      <label className="mt-6 flex items-start gap-2 text-xs text-subtle" title={t.quiz.feedbackAtEndHint}>
        <input
          type="checkbox"
          className="mt-0.5"
          checked={!instant}
          onChange={(e) => setFeedbackMode(e.target.checked ? "end" : "instant")}
          data-testid="feedback-at-end"
        />
        <span>
          {t.quiz.feedbackAtEnd}
          <span className="block text-faint">{t.quiz.feedbackAtEndHint}</span>
        </span>
      </label>
      </>
      )}
    </FocusFrame>
  );
}

function LessonList({
  certSlug,
  lessonItems,
  locale,
}: {
  certSlug: string;
  lessonItems: SessionLessonItem[];
  locale: Locale;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {lessonItems.map((lesson) => (
        <li key={lesson.itemId}>
          <Link
            href={`/cert/${certSlug}/section/${lesson.sectionId}`}
            className="block rounded-md border border-border px-3 py-2 text-sm hover:border-accent hover:bg-background"
          >
            {lesson.title[locale]}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Praxisaufgabe am Ende der Sitzung: die Simulation zum Selbstlösen, mit „Zum Text“ auf die Lektion und gespeichertem
 * Ergebnis wie in der Lektion (mühsam gelöst → Wiederholungsfragen vorgezogen).
 */
function PracticeTask({ certSlug, practice, locale }: { certSlug: string; practice: NonNullable<StudySessionProps["practice"]>; locale: Locale }) {
  const text = practice.content[locale];
  const source = extractSimulationSources(text)[practice.simIndex];
  if (!source) return null;
  return (
    <section className="text-left" data-testid="session-practice">
      <h2 className="mb-1 text-sm font-semibold">{locale === "de" ? "Praxisaufgabe" : "Hands-on task"}</h2>
      <p className="mb-3 text-xs text-subtle">
        {locale === "de" ? "Aus der Lektion " : "From the lesson "}
        <Link href={`/cert/${certSlug}/section/${practice.sectionId}`} className="text-link hover:underline">{practice.title[locale]}</Link>
        {locale === "de" ? ": wende das Gelernte selbst an." : ": apply what you've learned."}
      </p>
      <LessonSimulationsProvider text={text} sectionId={practice.sectionId} persist initialProgress={[]}>
        <RichText text={"````simulation\n" + source + "\n````"} />
      </LessonSimulationsProvider>
    </section>
  );
}
