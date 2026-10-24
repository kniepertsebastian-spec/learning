"use client";

import { useState } from "react";
import { ConfidenceBar } from "@/components/quiz/ConfidenceBar";
import { FormatAnswerInput, initialDraft, isDraftComplete } from "@/components/quiz/FormatAnswerInput";
import { FormatFeedbackPanel } from "@/components/quiz/FormatFeedbackPanel";
import { QuestionHead } from "@/components/quiz/QuestionHead";
import { RichText } from "@/components/RichText";
import { Button } from "@/components/ui/button";
import type { AnswerPayload, AnswerPrompt, AnswerSolution } from "@/lib/questions/answer-formats";
import { useLocale } from "@/lib/i18n";
import type { AnswerConfidence } from "@/lib/types";

export interface FormatEvaluation {
  correct: boolean;
  partial?: number;
  solution?: AnswerSolution;
  explanation?: string;
}

/**
 * Eine Frage mit einem der neuen Antwortformate (Reihenfolge, Kurzantwort, Zuordnung): eingeben → „Antwort prüfen“ → (Selbsteinschätzung) →
 * Auswertung. Die Auswertung kommt vom Aufrufer (lokal oder vom Server), die Karte kennt weder Lösung noch Bewertung.
 */
export function FormatQuestionCard({
  question,
  explanation,
  prompt,
  evaluate,
  onAnswered,
  askConfidence = false,
  sourceReference,
  questionId,
  onNext,
  nextLabel,
  objectiveLabel,
  difficulty,
  restored,
}: {
  question: string;
  explanation: string;
  prompt: AnswerPrompt;
  evaluate: (answer: AnswerPayload) => FormatEvaluation | Promise<FormatEvaluation>;
  onAnswered: (correct: boolean, answer: AnswerPayload, confidence?: AnswerConfidence, evaluation?: FormatEvaluation) => void;
  askConfidence?: boolean;
  sourceReference?: string | null;
  questionId: string;
  onNext: () => void;
  nextLabel: string;
  objectiveLabel?: string;
  difficulty?: string | null;
  /** Schon beantwortete Aufgabe wieder öffnen (z. B. beim Zurückblättern in der Session): zeigt Antwort und Auswertung statt einer leeren Eingabe. */
  restored?: { answer: AnswerPayload; result: FormatEvaluation; confidence: AnswerConfidence | null };
}) {
  const { locale } = useLocale();
  const de = locale === "de";
  const [draft, setDraft] = useState<AnswerPayload>(() => initialDraft(prompt));
  const [submitted, setSubmitted] = useState<AnswerPayload | null>(restored?.answer ?? null);
  const [confidence, setConfidence] = useState<AnswerConfidence | null>(restored?.confidence ?? null);
  const [result, setResult] = useState<FormatEvaluation | null>(restored?.result ?? null);
  const [busy, setBusy] = useState(false);

  async function finish(answer: AnswerPayload, level: AnswerConfidence | null) {
    setBusy(true);
    try {
      const evaluation = await evaluate(answer);
      setResult(evaluation);
      onAnswered(evaluation.correct, answer, level ?? undefined, evaluation);
    } finally {
      setBusy(false);
    }
  }

  function submit() {
    if (submitted || busy || !isDraftComplete(prompt, draft)) return;
    setSubmitted(draft);
    if (!askConfidence) void finish(draft, null);
  }

  function pickConfidence(level: AnswerConfidence) {
    if (!submitted || confidence !== null) return;
    setConfidence(level);
    void finish(submitted, level);
  }

  const locked = submitted !== null;
  return (
    <div className="flex flex-col gap-4" data-testid="format-question" data-format={prompt.format}>
      <div>
        <QuestionHead objectiveLabel={objectiveLabel} difficulty={difficulty} />
        <div className="mb-5 text-xl leading-[1.4] font-semibold sm:text-2xl" data-testid="question-text">
          <RichText text={question} />
        </div>
        <FormatAnswerInput prompt={prompt} value={locked ? submitted : draft} onChange={setDraft} disabled={locked} locale={locale} />
        {!locked && (
          <div className="mt-4">
            <Button onClick={submit} disabled={!isDraftComplete(prompt, draft)} data-testid="check-answer">{de ? "Antwort prüfen" : "Check answer"}</Button>
          </div>
        )}
      </div>
      {askConfidence && locked && confidence === null && <ConfidenceBar onPick={pickConfidence} />}
      {result && (
        <FormatFeedbackPanel
          correct={result.correct}
          partial={result.partial}
          solution={result.solution}
          explanation={result.explanation ?? explanation}
          confidence={confidence}
          sourceReference={sourceReference}
          questionId={questionId}
          nextLabel={nextLabel}
          onNext={onNext}
          locale={locale}
        />
      )}
      {busy && <p className="text-sm text-subtle" role="status">…</p>}
    </div>
  );
}
