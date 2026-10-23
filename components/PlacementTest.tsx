"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Loader2, X } from "lucide-react";
import { ConfidenceBar } from "@/components/quiz/ConfidenceBar";
import { FocusFrame } from "@/components/quiz/FocusFrame";
import type { OptionState } from "@/components/quiz/OptionTile";
import { QuestionBody } from "@/components/quiz/QuestionBody";
import { RichText } from "@/components/RichText";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { SegmentState } from "@/components/ui/progress";
import { useLocale } from "@/lib/i18n";
import { fmt } from "@/lib/quiz/keys";
import type { PlacementResult, PlacementTest as PlacementTestData } from "@/lib/server/placement/service";
import type { AnswerConfidence } from "@/lib/types";

/**
 * Einstiegstest je Kapitel (roadmap_didaktik Phase 4.2): eine Frage je Lernziel mit Sicherheitsangabe, Rückmeldung erst am
 * Ende. Die Auswertung und das Überspringen passieren serverseitig (POST /api/placement/:domainId).
 */
export function PlacementTest({ slug, test }: { slug: string; test: PlacementTestData }) {
  const { locale, t } = useLocale();
  const p = t.placement;
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<Array<{ optionId: string; confidence: AnswerConfidence } | null>>(() => test.questions.map(() => null));
  const [pendingOption, setPendingOption] = useState<string | null>(null);
  const [result, setResult] = useState<PlacementResult | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);
  const exitHref = `/cert/${slug}`;
  const current = test.questions[index];
  const options = [...current.options].sort((a, b) => a.orderNum - b.orderNum);
  const answeredCount = picks.filter(Boolean).length;
  const allAnswered = answeredCount === test.questions.length;

  function setConfidence(confidence: AnswerConfidence) {
    if (!pendingOption) return;
    setPicks((prev) => prev.map((v, i) => (i === index ? { optionId: pendingOption, confidence } : v)));
    setPendingOption(null);
    if (index + 1 < test.questions.length) setIndex(index + 1);
  }

  async function submit() {
    setSending(true);
    setError(false);
    try {
      const response = await fetch(`/api/placement/${test.domainId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: test.questions.map((q, i) => ({ questionId: q.questionId, selectedOptionId: picks[i]!.optionId, confidence: picks[i]!.confidence })) }),
      });
      if (!response.ok) throw new Error();
      setResult((await response.json()) as PlacementResult);
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  }

  if (result) {
    const needsMoreSure = result.passed === false && result.correct / result.total >= 0.9;
    return (
      <FocusFrame
        exitHref={exitHref}
        confirmLeave={false}
        contextLabel={`${p.title} · ${test.domainName}`}
        mode="practice"
        segments={result.questions.map((q): SegmentState => (q.isCorrect ? "correct" : "wrong"))}
        counterText={fmt(p.score, { a: result.correct, b: result.total, c: result.sure })}
      >
        <div className="flex flex-col gap-4" data-testid="placement-result" data-passed={result.passed}>
          <Card variant="hero">
            <h1 className="text-xl font-semibold">{result.passed ? p.pass : p.fail}</h1>
            <p className="mt-1 text-sm text-muted">{fmt(p.score, { a: result.correct, b: result.total, c: result.sure })}</p>
            {result.passed && result.skipApplied && <p className="mt-2 text-sm">{p.passSkipped}</p>}
            {result.passed && !result.skipAllowed && <p className="mt-2 text-sm text-warning-text">{p.passBlocked}</p>}
            {needsMoreSure && <p className="mt-2 text-sm">{p.failSure}</p>}
          </Card>

          {result.open.length > 0 && (!result.passed || !result.skipApplied) && (
            <ul className="flex flex-col gap-2" data-testid="placement-open">
              {result.open.map((o) => (
                <li key={o.objectiveId} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-sm">
                  <span><span className="mr-2 font-mono text-xs text-subtle">{o.objectiveCode}</span>{o.objectiveTitle}</span>
                  {o.firstSectionId && <Button asChild size="sm" variant="secondary"><Link href={`/cert/${slug}/section/${o.firstSectionId}`}>{p.startWith}</Link></Button>}
                </li>
              ))}
            </ul>
          )}

          <ul className="flex flex-col gap-2">
            {result.questions.map((q, i) => (
              <li key={q.questionId} className="rounded-lg border border-border bg-surface p-3 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  {q.isCorrect ? <Check className="h-4 w-4 text-mint-text" aria-hidden="true" /> : <X className="h-4 w-4 text-danger-text" aria-hidden="true" />}
                  <span className="sr-only">{q.isCorrect ? p.correct : p.wrong}: </span>
                  {q.objectiveCode} · {test.questions[i].question[locale]}
                </p>
                {!q.isCorrect && <div className="mt-2 text-muted"><RichText text={q.explanation[locale]} /></div>}
              </li>
            ))}
          </ul>
          <Button asChild variant="secondary" className="w-fit"><Link href={exitHref}>{p.backToCourse}</Link></Button>
        </div>
      </FocusFrame>
    );
  }

  const segments: SegmentState[] = test.questions.map((_, i) => (picks[i] ? "current" : i === index ? "current" : "open"));
  const states: OptionState[] = options.map((o) => (pendingOption === o.id || (!pendingOption && picks[index]?.optionId === o.id) ? "selected" : "neutral"));

  return (
    <FocusFrame
      exitHref={exitHref}
      confirmLeave={answeredCount > 0}
      contextLabel={`${p.title} · ${test.domainName}`}
      mode="practice"
      segments={segments}
      counterText={fmt(t.quiz.questionXofY, { x: index + 1, y: test.questions.length })}
      scoreText={fmt(t.quiz.answeredXofY, { x: answeredCount, y: test.questions.length })}
    >
      {index === 0 && answeredCount === 0 && <p className="mb-4 text-sm text-subtle">{fmt(p.intro, { n: test.questions.length })}</p>}
      <QuestionBody
        question={current.question[locale]}
        options={options.map((o) => o.text[locale])}
        states={states}
        onPick={(i) => setPendingOption(options[i].id)}
        objectiveLabel={`${current.objectiveCode} ${current.objectiveTitle}`}
      />
      {pendingOption && <div className="mt-4"><ConfidenceBar onPick={setConfidence} /></div>}
      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="secondary" onClick={() => { setIndex(Math.max(0, index - 1)); setPendingOption(null); }} disabled={index === 0}>{t.quiz.previous}</Button>
        {allAnswered && (
          <Button onClick={() => void submit()} disabled={sending} iconLeft={sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : undefined} data-testid="placement-submit">
            {sending ? p.sending : p.submit}
          </Button>
        )}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-danger-text">{p.error}</p>}
    </FocusFrame>
  );
}
