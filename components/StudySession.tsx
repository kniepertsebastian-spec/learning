"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import type { AnswerConfidence, Locale } from "@/lib/types";
import { enqueueSyncEvent } from "@/lib/client/sync-queue";
import { ConfidenceBar } from "@/components/quiz/ConfidenceBar";
import { FeedbackPanel } from "@/components/quiz/FeedbackPanel";
import { FocusFrame } from "@/components/quiz/FocusFrame";
import type { OptionState } from "@/components/quiz/OptionTile";
import { QuestionBody } from "@/components/quiz/QuestionBody";
import { QuestionNavigator, type NavState } from "@/components/quiz/QuestionNavigator";
import { ReportProblem } from "@/components/quiz/ReportProblem";
import { ResultSummary } from "@/components/quiz/ResultSummary";
import { useQuizHotkeys } from "@/components/quiz/useQuizHotkeys";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { SegmentState } from "@/components/ui/progress";
import { LessonSimulationsProvider } from "@/components/lesson/LessonSimulations";
import { RichText } from "@/components/RichText";
import { useLocale } from "@/lib/i18n";
import { useFeedbackMode } from "@/lib/client/use-feedback-mode";
import type { OfflineQuestion } from "@/lib/server/offline/manifest";
import { extractSimulationSources } from "@/lib/markdown/simulation";
import { fmt } from "@/lib/quiz/keys";

interface SessionQuestionItem {
  itemId: string;
  category: "review" | "weak" | "new";
  questionId: string;
  question: { de: string; en: string };
  /** isCorrect ist nur im Offline-Paket gesetzt (siehe offline-Prop unten) -
   * im Live-Fall bleibt Korrektheit serverseitig geprüft. */
  options: Array<{ id: string; text: { de: string; en: string }; orderNum: number; isCorrect?: boolean }>;
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
}

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
  /** Offline: Fragen des Kurspakets (Erklärung, Begründungen) für das Sofort-Feedback, nach Frage-ID. */
  offlineQuestions?: Record<string, OfflineQuestion>;
  /** Praxisaufgabe nach den Fragen: eine Simulation aus einer Lektion derselben Lernziele (nur online). */
  practice?: { sectionId: string; title: { de: string; en: string }; content: { de: string; en: string }; simIndex: number } | null;
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
  offlineQuestions,
  practice,
}: StudySessionProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Array<string | null>>(() => questionItems.map(() => null));
  const [confidences, setConfidences] = useState<Array<AnswerConfidence | null>>(() =>
    questionItems.map(() => null),
  );
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<StudySessionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Sofort-Feedback: Antwort sperren, Sicherheit vor dem Aufdecken abfragen, dann aufdecken.
  const [feedbackMode, setFeedbackMode] = useFeedbackMode();
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
      const q = offlineQuestions?.[item.questionId];
      const correct = item.options.find((o) => o.isCorrect);
      if (!q || !correct) return setReveal("failed");
      const rationales: QuestionReveal["rationales"] = {};
      for (const option of q.options) {
        if (!option.isCorrect && option.rationale) rationales[option.id] = option.rationale;
      }
      return setReveal({
        correctOptionId: correct.id,
        explanation: q.explanation,
        rationales,
        sourceReference: q.sourceReference,
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

  async function handleSubmit() {
    if (submitting || result) return;
    setSubmitting(true);
    setError(null);
    const payload = {
      answers: questionItems.map((item, i) => ({
        itemId: item.itemId,
        selectedOptionId: answers[i] ?? "",
        confidence: confidences[i] ?? undefined,
      })),
    };

    if (offline) {
      const results = questionItems.map((item, i) => ({
        itemId: item.itemId,
        isCorrect: item.options.some((o) => o.id === answers[i] && o.isCorrect),
      }));
      const score =
        results.length > 0
          ? Math.round((results.filter((r) => r.isCorrect).length / results.length) * 100)
          : 0;
      await enqueueSyncEvent(
        offline.userId,
        "study_session",
        { sessionId, answers: payload.answers },
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
    if (!option) return;
    if (instant && answers[currentIndex]) return; // Antwort ist nach dem Wählen gesperrt
    setAnswers((prev) => {
      const next = [...prev];
      next[currentIndex] = option.id;
      return next;
    });
  };
  const isLast = currentIndex + 1 >= questionItems.length;
  const currentReveal = reveals[currentIndex] ?? null;
  const canAdvance = currentReveal !== null && currentReveal !== "loading";
  useQuizHotkeys(
    4,
    (action) => {
      if (action.type === "pick") pickOption(action.index);
      else if (action.type === "enter" && answers[currentIndex] && !isLast && (!instant || canAdvance)) setCurrentIndex((i) => i + 1);
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

  if (result) {
    const correctCount = result.results.filter((r) => r.isCorrect).length;
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
  const sortedOptions = [...item.options].sort((a, b) => a.orderNum - b.orderNum);
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
      <div className="mb-3">
        <Badge tone={item.category === "weak" ? "warning" : item.category === "review" ? "info" : "accent"}>
          {item.category === "review" ? t.quiz.categoryReview : item.category === "weak" ? t.quiz.categoryWeak : t.quiz.categoryNew}
        </Badge>
      </div>
      <QuestionBody
        question={item.question[locale]}
        options={sortedOptions.map((o) => o.text[locale])}
        states={states}
        onPick={pickOption}
        locked={instant && Boolean(answers[currentIndex])}
      />

      {answers[currentIndex] && instant && currentReveal === null && (
        <div className="mt-4">
          <ConfidenceBar onPick={(level) => chooseConfidence(currentIndex, level)} onSkip={() => chooseConfidence(currentIndex, null)} />
        </div>
      )}
      {answers[currentIndex] && !instant && (
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
            rereadHref={reveal.reviewSectionId ? `/cert/${certSlug}/section/${reveal.reviewSectionId}` : null}
            nextLabel={isLast ? t.quiz.finish : t.quiz.nextShort}
            onNext={isLast ? () => void handleSubmit() : () => setCurrentIndex((i) => i + 1)}
            nextDisabled={submitting}
          />
        </div>
      )}

      {!(instant && reveal) && (
        <div className="mt-4">
          <ReportProblem questionId={item.questionId} />
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))} disabled={currentIndex === 0}>
          {t.quiz.previous}
        </Button>
        {instant && reveal ? (
          <span />
        ) : isLast ? (
          <Button onClick={() => void handleSubmit()} disabled={submitting || (instant && !canAdvance)} iconLeft={submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : undefined} data-testid="submit-session">
            {t.quiz.finish}
          </Button>
        ) : (
          <Button onClick={() => setCurrentIndex((i) => Math.min(questionItems.length - 1, i + 1))} disabled={instant && !canAdvance} iconRight={<ArrowRight className="h-4 w-4" aria-hidden="true" />}>
            {t.quiz.nextShort}
          </Button>
        )}
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-danger-text">{error}</p>}

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
