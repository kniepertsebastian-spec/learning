"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { ExamTimer } from "@/components/ExamTimer";
import { ExamNavigator } from "@/components/ExamNavigator";
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
  objectiveCode: string;
  objectiveTitle: string;
  examScore: number;
}

interface ExamResult {
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

const MINUTES_PER_QUESTION = 90 / 50; // matches the real Security+ ratio (90 min / 50 questions)

interface ExamSessionProps {
  certSlug: string;
  examId: string;
  questions: ExamQuestion[];
  locale: Locale;
}

export function ExamSession({ certSlug, examId, questions, locale }: ExamSessionProps) {
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.round(questions.length * MINUTES_PER_QUESTION * 60),
  );
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

  if (result) {
    return (
      <div className="mx-auto flex max-w-2xl flex-1 flex-col py-8">
        <div className="mb-6 rounded-lg border border-border bg-surface p-6 text-center">
          <p className="mb-1 text-4xl font-bold">{result.score}%</p>
          <p className="mb-1 text-lg font-medium">{result.readinessLabel}</p>
          <p className="text-xs text-foreground/50">
            {locale === "de" ? "Konfidenz" : "Confidence"}: {Math.round(result.readinessConfidence * 100)}%
          </p>
        </div>

        {result.analysis.domainPerformance.length > 0 && (
          <div className="mb-6 rounded-lg border border-border bg-surface p-4">
            <h3 className="mb-3 font-medium">{locale === "de" ? "Nach Domain" : "By domain"}</h3>
            <div className="flex flex-col gap-2">
              {result.analysis.domainPerformance.map((d) => (
                <div key={d.domainId} className="flex items-center justify-between text-sm">
                  <span>{d.domainName}</span>
                  <span className="font-medium">{d.score}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {result.analysis.weakObjectives.length > 0 && (
          <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
            <h3 className="mb-3 font-medium text-yellow-800">
              {locale === "de" ? "Schwache Bereiche" : "Weak areas"}
            </h3>
            <ul className="space-y-1 text-sm text-yellow-700">
              {result.analysis.weakObjectives.map((w) => (
                <li key={w.objectiveCode}>
                  <span className="font-mono text-xs">{w.objectiveCode}</span> {w.objectiveTitle} (
                  {w.examScore}%)
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.analysis.recommendations.length > 0 && (
          <div className="mb-6 rounded-lg border border-border bg-surface p-4">
            <h3 className="mb-2 font-medium">{locale === "de" ? "Empfehlungen" : "Recommendations"}</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/70">
              {result.analysis.recommendations.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        <Link
          href={`/cert/${certSlug}`}
          className="mx-auto rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          {locale === "de" ? "Zurück zur Zertifizierung" : "Back to certification"}
        </Link>
      </div>
    );
  }

  const question = questions[currentIndex];
  const answerIndices = answers.map((a, i) =>
    a === null ? null : questions[i].options.findIndex((o) => o.id === a),
  );

  return (
    <div className="grid flex-1 grid-cols-1 gap-6 py-6 lg:grid-cols-[1fr_280px]">
      <div>
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm text-foreground/60">
            {locale === "de" ? "Frage" : "Question"} {currentIndex + 1} / {questions.length}
          </p>
          <ExamTimer
            secondsLeft={secondsLeft}
            onTick={setSecondsLeft}
            onExpire={handleSubmit}
          />
        </div>

        <div className="rounded-lg border border-border bg-surface p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <p className="font-medium">{question.question[locale]}</p>
            <button
              type="button"
              onClick={() => toggleFlag(currentIndex)}
              className={`shrink-0 text-xs ${flagged.has(currentIndex) ? "text-amber-500" : "text-foreground/40"}`}
            >
              {locale === "de" ? "Markieren" : "Flag"}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {[...question.options]
              .sort((a, b) => a.orderNum - b.orderNum)
              .map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() =>
                    setAnswers((prev) => {
                      const next = [...prev];
                      next[currentIndex] = option.id;
                      return next;
                    })
                  }
                  className={`rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${
                    answers[currentIndex] === option.id
                      ? "border-accent bg-accent/10"
                      : "border-border hover:bg-background"
                  }`}
                >
                  {option.text[locale]}
                </button>
              ))}
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            disabled={currentIndex === 0}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
          >
            {locale === "de" ? "Zurück" : "Previous"}
          </button>

          {currentIndex + 1 >= questions.length ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {locale === "de" ? "Prüfung einreichen" : "Submit exam"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              {locale === "de" ? "Weiter" : "Next"}
            </button>
          )}
        </div>

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>

      <ExamNavigator
        total={questions.length}
        currentIndex={currentIndex}
        answers={answerIndices}
        flagged={flagged}
        onJump={setCurrentIndex}
      />
    </div>
  );
}
