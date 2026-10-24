"use client";

import { useState } from "react";
import { QuizQuestionCard } from "@/components/QuizQuestionCard";
import { FormatQuestionCard } from "@/components/quiz/FormatQuestionCard";
import { buildPrompt, buildSolution, gradeAnswer, type AnswerData, type AnswerFormat, type AnswerPayload } from "@/lib/questions/answer-formats";
import { FocusFrame } from "@/components/quiz/FocusFrame";
import { Button } from "@/components/ui/button";
import { ExitSummary } from "@/components/quiz/ExitSummary";
import { ResultSummary } from "@/components/quiz/ResultSummary";
import { useLocale } from "@/lib/i18n";
import { fmt } from "@/lib/quiz/keys";
import type { SegmentState } from "@/components/ui/progress";
import type { AnswerConfidence, QuizQuestion, Locale } from "@/lib/types";
import { enqueueSyncEvent } from "@/lib/client/sync-queue";

export interface SectionQuizQuestion {
  id: string;
  question: { de: string; en: string };
  explanation: { de: string; en: string };
  options: Array<{
    id: string;
    text: { de: string; en: string };
    orderNum: number;
    isCorrect: boolean;
    /** UI U4: warum diese (falsche) Option nicht passt; fehlt bei älteren Fragen. */
    rationale?: { de: string; en: string } | null;
  }>;
  difficulty?: string | null;
  /** R1.4: knappe Quellenangabe (z. B. "S. 4"), falls die Frage
   * quellengebunden generiert wurde - sonst null. */
  sourceReference: string | null;
  /** Aus einer früheren Lektion eingewoben (Flag `woven_reviews`): sieht aus wie jede Frage, zählt aber nicht fürs Ergebnis dieser Lektion. */
  woven?: boolean;
  /** Fragetyp (kognitive Stufe); bei Szenario-Fragen wird nach einer falschen Antwort die Selbsterklärung angeboten. */
  type?: string | null;
  /** Antwortformat; fehlt oder „choice“ = Auswahlfrage. Bei den anderen Formaten steht die Lösung in `answerData` (Lektionstest wird im Browser ausgewertet). */
  format?: AnswerFormat;
  answerData?: AnswerData | null;
}

interface SectionQuizProps {
  sectionId: string;
  questions: SectionQuizQuestion[];
  certSlug: string;
  locale: Locale;
  /** Kontext für die Fokusleiste, z. B. „Domain 3 · 3.2 Troubleshooting“. */
  contextLabel?: string;
  objectiveLabel?: string;
  /** R4.1/4.2/4.3 (roadmap.md): im Offline-Reader gesetzt - statt des
   * direkten POST an den Server wird das Ergebnis in die lokale Sync-
   * Warteschlange (lib/client/sync-queue.ts) eingereiht und beim nächsten
   * `online`/App-Start/manuellen Sync übertragen. */
  offline?: { userId: string };
  /** Notausstieg „Heute reicht's“ (Flag exit_with_win, nur online). */
  exitEnabled?: boolean;
  /** Sicherheitsangabe ab der 3. Session (und wenn nicht abgeschaltet). */
  askConfidence?: boolean;
}

export function SectionQuiz({ sectionId, questions, certSlug, locale, contextLabel, objectiveLabel, offline, exitEnabled, askConfidence = true }: SectionQuizProps) {
  const { t } = useLocale();
  const [quizIndex, setQuizIndex] = useState(0);
  const [results, setResults] = useState<boolean[]>([]);
  const [hasAnsweredCurrent, setHasAnsweredCurrent] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);
  const [pendingAnswer, setPendingAnswer] = useState<{
    questionId: string;
    selectedOptionId: string;
    answer?: AnswerPayload;
    confidence?: AnswerConfidence;
    woven?: boolean;
    thinkFirst?: boolean;
    /** Zeitpunkt der Antwort (ISO); für die zeitgenaue Verbuchung offline aufgezeichneter Ergebnisse. */
    answeredAt?: string;
  } | null>(null);
  const [answers, setAnswers] = useState<
    Array<{ questionId: string; selectedOptionId: string; answer?: AnswerPayload; confidence?: AnswerConfidence; woven?: boolean; thinkFirst?: boolean; answeredAt?: string }>
  >([]);

  function mapQuestion(q: SectionQuizQuestion): QuizQuestion {
    const sorted = [...q.options].sort((a, b) => a.orderNum - b.orderNum);
    const hasRationales = sorted.some((o) => !o.isCorrect && o.rationale);
    return {
      id: q.id,
      question: q.question,
      explanation: q.explanation,
      options: {
        de: sorted.map((o) => o.text.de),
        en: sorted.map((o) => o.text.en),
      },
      correctIndex: sorted.findIndex((o) => o.isCorrect),
      optionRationales: hasRationales
        ? { de: sorted.map((o) => o.rationale?.de ?? null), en: sorted.map((o) => o.rationale?.en ?? null) }
        : null,
    };
  }

  function handleAnswered(isCorrect: boolean, selectedIndex: number, confidence?: AnswerConfidence, thinkFirst?: boolean) {
    setResults((r) => [...r, isCorrect]);
    setHasAnsweredCurrent(true);
    const q = questions[quizIndex];
    const sorted = [...q.options].sort((a, b) => a.orderNum - b.orderNum);
    setPendingAnswer({
      questionId: q.id,
      selectedOptionId: sorted[selectedIndex]?.id ?? "",
      confidence,
      woven: q.woven || undefined,
      thinkFirst,
      answeredAt: new Date().toISOString(),
    });
  }

  function handleFormatAnswered(correct: boolean, answer: AnswerPayload, confidence?: AnswerConfidence) {
    setResults((r) => [...r, correct]);
    setHasAnsweredCurrent(true);
    const q = questions[quizIndex];
    setPendingAnswer({ questionId: q.id, selectedOptionId: "", answer, confidence, woven: q.woven || undefined, answeredAt: new Date().toISOString() });
  }

  function handleNext() {
    if (!hasAnsweredCurrent) return;
    const nextAnswers = pendingAnswer ? [...answers, pendingAnswer] : answers;

    if (quizIndex + 1 >= questions.length) {
      setQuizFinished(true);
      if (offline) {
        enqueueSyncEvent(
          offline.userId,
          "section_quiz",
          { sectionId, answers: nextAnswers },
          locale === "de" ? "Abschnittsquiz" : "Section quiz",
        ).catch(() => {});
      } else {
        fetch(`/api/sections/${sectionId}/attempt`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers: nextAnswers }),
        }).catch(() => {});
      }
    } else {
      setAnswers(nextAnswers);
      setQuizIndex((i) => i + 1);
      setHasAnsweredCurrent(false);
      setPendingAnswer(null);
    }
  }

  const [exitState, setExitState] = useState<{ winSession: boolean } | null>(null);
  const [exiting, setExiting] = useState(false);
  const [exitError, setExitError] = useState(false);
  async function exitToday() {
    if (exiting) return;
    setExiting(true);
    setExitError(false);
    try {
      // Bisher beantwortet (inklusive der aktuellen, falls schon beantwortet); die offene Frage bekommt kein Rating.
      const sent = pendingAnswer ? [...answers, pendingAnswer] : answers;
      const response = await fetch(`/api/sections/${sectionId}/exit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: sent, openQuestionId: hasAnsweredCurrent ? undefined : questions[quizIndex]?.id }),
      });
      if (!response.ok) throw new Error("exit failed");
      const data = (await response.json()) as { winSession?: boolean };
      setExitState({ winSession: Boolean(data.winSession) });
    } catch {
      setExitError(true);
    } finally {
      setExiting(false);
    }
  }

  if (questions.length === 0) return null;
  if (exitState) return <ExitSummary certSlug={certSlug} winSession={exitState.winSession} contextLabel={contextLabel ?? t.quiz.sectionQuiz} />;

  // Eingewebte Fragen erscheinen im Ablauf, zählen aber nicht für Ergebnis und Wertung dieser Lektion.
  const countedResults = results.filter((_, i) => !questions[i]?.woven);
  const regularTotal = questions.filter((q) => !q.woven).length;
  const correctCount = countedResults.filter(Boolean).length;
  const wrongCount = countedResults.length - correctCount;

  if (quizFinished) {
    const score = Math.round((correctCount / Math.max(1, regularTotal)) * 100);
    return (
      <FocusFrame
        exitHref={`/cert/${certSlug}`}
        confirmLeave={false}
        contextLabel={contextLabel ?? t.quiz.sectionQuiz}
        mode="practice"
        segments={results.map((r): SegmentState => (r ? "correct" : "wrong"))}
        counterText={fmt(t.quiz.correctCount, { a: correctCount, b: regularTotal })}
      >
        <ResultSummary
          score={score}
          headline={fmt(t.quiz.correctCount, { a: correctCount, b: regularTotal })}
          offlineNote={Boolean(offline)}
          actions={[{ href: `/cert/${certSlug}`, label: t.quiz.backToCourse, primary: true }]}
        />
      </FocusFrame>
    );
  }

  const current = questions[quizIndex];
  const segments: SegmentState[] = questions.map((_, i) => (i < results.length ? (results[i] ? "correct" : "wrong") : i === quizIndex ? "current" : "open"));

  return (
    <FocusFrame
      exitHref={`/cert/${certSlug}`}
      confirmLeave={results.length > 0}
      contextLabel={contextLabel ?? t.quiz.sectionQuiz}
      mode="practice"
      segments={segments}
      counterText={fmt(t.quiz.questionXofY, { x: quizIndex + 1, y: questions.length })}
      scoreText={fmt(t.quiz.correctWrong, { a: correctCount, b: wrongCount })}
    >
      {current.format && current.format !== "choice" && current.answerData ? (
        <FormatQuestionCard
          key={current.id}
          questionId={current.id}
          question={current.question[locale]}
          explanation={current.explanation[locale]}
          prompt={buildPrompt(current.format, current.answerData, current.id)}
          evaluate={(answer) => {
            const grade = gradeAnswer(current.format as Exclude<AnswerFormat, "choice">, current.answerData!, answer);
            return { correct: grade.correct, partial: grade.partial, solution: buildSolution(current.format as Exclude<AnswerFormat, "choice">, current.answerData!) };
          }}
          onAnswered={handleFormatAnswered}
          askConfidence={askConfidence}
          sourceReference={current.sourceReference}
          onNext={handleNext}
          nextLabel={quizIndex + 1 >= questions.length ? t.quiz.finish : t.quiz.next}
          objectiveLabel={objectiveLabel}
          difficulty={current.difficulty}
          questionType={current.type}
        />
      ) : (
      <QuizQuestionCard
        key={current.id}
        question={mapQuestion(current)}
        onAnswered={handleAnswered}
        sourceReference={current.sourceReference}
        askConfidence={askConfidence}
        onNext={handleNext}
        nextLabel={quizIndex + 1 >= questions.length ? t.quiz.finish : t.quiz.next}
        objectiveLabel={objectiveLabel}
        difficulty={current.difficulty}
        questionType={current.type}
      />
      )}
      {exitEnabled && !offline && (
        <div className="mt-4">
          <Button variant="ghost" size="sm" onClick={() => void exitToday()} disabled={exiting} data-testid="exit-today">{t.quiz.exitToday}</Button>
          {exitError && <p role="alert" className="mt-2 text-sm text-danger-text">{t.quiz.exitError}</p>}
        </div>
      )}
    </FocusFrame>
  );
}
