"use client";

import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { ExamTimer } from "@/components/ExamTimer";
import { FocusFrame } from "@/components/quiz/FocusFrame";
import type { OptionState } from "@/components/quiz/OptionTile";
import { QuestionBody } from "@/components/quiz/QuestionBody";
import { QuestionNavigator, type NavState } from "@/components/quiz/QuestionNavigator";
import { ResultSummary } from "@/components/quiz/ResultSummary";
import { useQuizHotkeys } from "@/components/quiz/useQuizHotkeys";
import { Button } from "@/components/ui/button";
import type { SegmentState } from "@/components/ui/progress";
import { useLocale } from "@/lib/i18n";
import { fmt } from "@/lib/quiz/keys";
import type { Locale } from "@/lib/types";

interface ExamQuestion {
  questionId: string;
  orderNum: number;
  question: { de: string; en: string };
  options: Array<{ id: string; text: { de: string; en: string }; orderNum: number }>;
}

interface DomainScore {
  domainId: string;
  domainName: string;
  score: number;
}

interface WeakObjective {
  objectiveId: string;
  objectiveCode: string;
  objectiveTitle: string;
  examScore: number;
}

interface ExamResult {
  attemptId: string;
  score: number;
  readiness: string;
  readinessLabel: string;
  readinessConfidence: number;
  analysis: {
    domainPerformance: DomainScore[];
    weakObjectives: WeakObjective[];
    recommendations: string[];
  };
}

// Fallback, nur falls für diese Zertifizierung (noch) kein reales Zeitlimit
// aus der offiziellen Quelle bekannt ist (certifications.examDurationMinutes,
// siehe lib/server/exam/blueprint.ts) - vorher war das hier der einzige,
// für jede Zertifizierung gleiche Wert.
const FALLBACK_MINUTES_PER_QUESTION = 90 / 50;

interface ExamSessionProps {
  certSlug: string;
  examId: string;
  questions: ExamQuestion[];
  locale: Locale;
  /** Reales Zeitlimit der offiziellen Prüfung, falls bekannt. */
  durationMinutes: number | null;
  /** Ziel-Fragenanzahl laut Blueprint - kann von questions.length abweichen,
   * wenn der Fragenpool für diese Zertifizierung noch nicht vollständig ist;
   * das Zeitlimit wird dann proportional skaliert statt die volle Zeit für
   * eine kürzere Prüfung zu geben. */
  targetQuestionCount: number | null;
  /** Bestehensgrenze in Prozent, nur wenn die Prüfung in Prozent bewertet wird (sonst keine Markierung im Ring). */
  passingPercent?: number | null;
  /** Kontext für die Fokusleiste, z. B. der Kursname. */
  contextLabel?: string;
}

export function ExamSession({
  certSlug,
  examId,
  questions,
  locale,
  durationMinutes,
  targetQuestionCount,
  passingPercent = null,
  contextLabel,
}: ExamSessionProps) {
  const { t } = useLocale();
  const [secondsLeft, setSecondsLeft] = useState(() => {
    if (durationMinutes) {
      const ratio = targetQuestionCount ? questions.length / targetQuestionCount : 1;
      return Math.round(durationMinutes * 60 * ratio);
    }
    return Math.round(questions.length * FALLBACK_MINUTES_PER_QUESTION * 60);
  });
  // R3 (roadmap.md): "Dauer" für die "Meine Prüfungen"-Übersicht - gemessen
  // von Sessionstart bis Einreichen, nicht aus secondsLeft rückgerechnet
  // (das würde bei einem Auto-Submit durch Zeitablauf ungenau, da
  // secondsLeft dann exakt 0 ist statt der tatsächlich verstrichenen Zeit).
  const [startedAt] = useState(() => Date.now());
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Array<string | null>>(() => questions.map(() => null));
  const [flagged, setFlagged] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ExamResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (submitting || result) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        answers: questions.map((q, i) => ({
          questionId: q.questionId,
          selectedOptionId: answers[i] ?? "",
        })),
        durationSeconds: Math.round((Date.now() - startedAt) / 1000),
      };
      const response = await fetch(`/api/exams/${certSlug}/${examId}/attempt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || "Failed to submit exam");
        setSubmitting(false);
        return;
      }
      setResult(data);
    } catch {
      setError(locale === "de" ? "Fehler beim Einreichen der Prüfung." : "Failed to submit exam.");
    } finally {
      setSubmitting(false);
    }
  }

  function toggleFlag(index: number) {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  const exitHref = `/cert/${certSlug}`;
  const question = questions[currentIndex];
  const sortedOptions = [...question.options].sort((a, b) => a.orderNum - b.orderNum);
  const isLast = currentIndex + 1 >= questions.length;
  const answeredCount = answers.filter(Boolean).length;

  function pickOption(index: number) {
    const option = sortedOptions[index];
    if (!option) return;
    setAnswers((prev) => {
      const next = [...prev];
      next[currentIndex] = option.id;
      return next;
    });
  }

  useQuizHotkeys(
    sortedOptions.length,
    (action) => {
      if (action.type === "pick") pickOption(action.index);
      else if (action.type === "flag") toggleFlag(currentIndex);
      else if (action.type === "enter" && !isLast) setCurrentIndex((i) => i + 1);
    },
    !result,
  );

  if (result) {
    const weak = result.analysis.weakObjectives;
    return (
      <FocusFrame
        exitHref={exitHref}
        confirmLeave={false}
        contextLabel={contextLabel}
        mode="exam"
        segments={questions.map((): SegmentState => "current")}
        counterText={fmt(t.quiz.answeredXofY, { x: answeredCount, y: questions.length })}
      >
        <ResultSummary
          score={result.score}
          passPercent={passingPercent}
          headline={result.readinessLabel}
          subline={`${t.quiz.confidenceLabel}: ${Math.round(result.readinessConfidence * 100)} %`}
          domains={result.analysis.domainPerformance.map((d) => ({ id: d.domainId, name: d.domainName, score: d.score }))}
          weakAreas={weak.map((w) => `${w.objectiveCode} ${w.objectiveTitle} (${w.examScore} %)`)}
          recommendations={result.analysis.recommendations}
          actions={[
            { href: `/cert/${certSlug}/history/${result.attemptId}`, label: t.quiz.reviewWrong, primary: true },
            ...(weak[0] ? [{ href: `/cert/${certSlug}/remediation/${weak[0].objectiveId}`, label: t.quiz.practiceTargeted }] : []),
            { href: exitHref, label: t.quiz.backToCourse },
          ]}
        />
      </FocusFrame>
    );
  }

  // Prüfungsmodus: Zustände nur „gewählt“ – nie richtig/falsch (der Client kennt die Lösung nicht einmal).
  const states: OptionState[] = sortedOptions.map((o) => (answers[currentIndex] === o.id ? "selected" : "neutral"));
  const segments: SegmentState[] = questions.map((_, i) => (answers[i] ? "current" : "open"));
  const navStates: NavState[] = questions.map((_, i) => (answers[i] ? "answered" : "open"));

  return (
    <FocusFrame
      exitHref={exitHref}
      confirmLeave={answeredCount > 0}
      contextLabel={contextLabel}
      mode="exam"
      segments={segments}
      counterText={fmt(t.quiz.questionXofY, { x: currentIndex + 1, y: questions.length })}
      scoreText={fmt(t.quiz.answeredXofY, { x: answeredCount, y: questions.length })}
      right={<ExamTimer secondsLeft={secondsLeft} onTick={setSecondsLeft} onExpire={handleSubmit} />}
      navigator={<QuestionNavigator mode="exam" states={navStates} currentIndex={currentIndex} flagged={flagged} onJump={setCurrentIndex} />}
    >
      <QuestionBody
        question={question.question[locale]}
        options={sortedOptions.map((o) => o.text[locale])}
        states={states}
        onPick={pickOption}
        flagged={flagged.has(currentIndex)}
        onToggleFlag={() => toggleFlag(currentIndex)}
      />

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))} disabled={currentIndex === 0}>
          {t.quiz.previous}
        </Button>
        {isLast ? (
          <Button onClick={handleSubmit} disabled={submitting} iconLeft={submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : undefined} data-testid="submit-exam">
            {t.quiz.submitExam}
          </Button>
        ) : (
          <Button onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))} iconRight={<ArrowRight className="h-4 w-4" aria-hidden="true" />}>
            {t.quiz.nextShort}
          </Button>
        )}
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-danger-text">{error}</p>}
    </FocusFrame>
  );
}
