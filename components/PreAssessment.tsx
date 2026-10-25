"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { FocusFrame } from "@/components/quiz/FocusFrame";
import type { OptionState } from "@/components/quiz/OptionTile";
import { QuestionBody } from "@/components/quiz/QuestionBody";
import { RichText } from "@/components/RichText";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { SegmentState } from "@/components/ui/progress";
import { useLocale } from "@/lib/i18n";
import { fmt } from "@/lib/quiz/keys";
import type { PreAssessmentResult, PreAssessmentTest } from "@/lib/server/pre-assessment/service";

/**
 * Einstufungstest direkt nach der Kurswahl: 10 Auswahlfragen quer durch alle Kapitel, Rückmeldung erst am Ende. Die Auswertung
 * passiert serverseitig (POST /api/pre-assessment/:certId); das Ergebnis dient der Orientierung und zählt nicht für den Lernstand.
 */
export function PreAssessment({ slug, test }: { slug: string; test: PreAssessmentTest }) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const de = locale === "de";
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<Array<string | null>>(() => test.questions.map(() => null));
  const [result, setResult] = useState<PreAssessmentResult | null>(null);
  const [busy, setBusy] = useState<"submit" | "skip" | null>(null);
  const [error, setError] = useState(false);
  const courseHref = `/cert/${slug}`;
  const current = test.questions[index];
  const options = [...current.options].sort((a, b) => a.orderNum - b.orderNum);
  const answered = picks.filter(Boolean).length;
  const last = index === test.questions.length - 1;

  async function send(body: unknown, kind: "submit" | "skip") {
    setBusy(kind);
    setError(false);
    try {
      const response = await fetch(`/api/pre-assessment/${test.certificationId}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error();
      if (kind === "skip") {
        router.push(courseHref);
        router.refresh();
        return;
      }
      setResult((await response.json()) as PreAssessmentResult);
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  }

  if (result) {
    const sorted = [...result.domains].sort((a, b) => a.correct / a.total - b.correct / b.total);
    const weakest = sorted.filter((d) => d.correct / d.total < 0.5);
    return (
      <FocusFrame
        exitHref={courseHref}
        confirmLeave={false}
        contextLabel={`${de ? "Einstufungstest" : "Entry assessment"} · ${test.courseName}`}
        mode="practice"
        segments={result.questions.map((q): SegmentState => (q.isCorrect ? "correct" : "wrong"))}
        counterText={fmt(t.quiz.correctCount, { a: result.correct, b: result.total })}
      >
        <div className="flex flex-col gap-4" data-testid="pre-assessment-result">
          <Card variant="hero">
            <h1 className="text-xl font-semibold">{fmt(de ? "{a} von {b} richtig" : "{a} of {b} correct", { a: result.correct, b: result.total })}</h1>
            <p className="mt-1 text-sm text-muted">
              {de
                ? "Das ist nur eine Standortbestimmung, sie zählt nicht für deinen Lernstand. Mit den Kapiteln unten kannst du anfangen, wo es am meisten bringt."
                : "This is only a snapshot and does not count towards your progress. Start with the chapters below where it helps most."}
            </p>
          </Card>
          <ul className="flex flex-col gap-2" data-testid="pre-assessment-domains">
            {result.domains.map((d) => (
              <li key={d.domainId} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-sm">
                <span className="min-w-0 truncate">{d.name}</span>
                <span className="shrink-0 tabular-nums text-subtle">{d.correct} / {d.total}</span>
              </li>
            ))}
          </ul>
          {weakest.length > 0 && (
            <p className="text-sm text-muted" data-testid="pre-assessment-weak">
              {de ? "Hier lohnt sich ein gründlicher Blick: " : "Worth a closer look: "}
              {weakest.map((d) => d.name).join(", ")}
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {result.questions.map((q, i) => (
              <li key={q.questionId} className="rounded-lg border border-border bg-surface p-3 text-sm">
                <p className="flex items-center gap-2 font-medium">
                  {q.isCorrect ? <Check className="h-4 w-4 text-mint-text" aria-hidden="true" /> : <X className="h-4 w-4 text-danger-text" aria-hidden="true" />}
                  <span className="sr-only">{q.isCorrect ? (de ? "Richtig" : "Correct") : de ? "Falsch" : "Wrong"}: </span>
                  {test.questions.find((x) => x.questionId === q.questionId)?.question[locale] ?? `#${i + 1}`}
                </p>
                {!q.isCorrect && <div className="mt-2 text-muted"><RichText text={q.explanation[locale]} /></div>}
              </li>
            ))}
          </ul>
          <Button asChild className="w-fit" data-testid="pre-assessment-continue"><Link href={courseHref}>{de ? "Weiter zum Kurs" : "On to the course"}</Link></Button>
        </div>
      </FocusFrame>
    );
  }

  const segments: SegmentState[] = test.questions.map((_, i) => (picks[i] ? "current" : i === index ? "current" : "open"));
  const states: OptionState[] = options.map((o) => (picks[index] === o.id ? "selected" : "neutral"));

  return (
    <FocusFrame
      exitHref={courseHref}
      confirmLeave={answered > 0}
      contextLabel={`${de ? "Einstufungstest" : "Entry assessment"} · ${test.courseName}`}
      mode="practice"
      segments={segments}
      counterText={fmt(t.quiz.questionXofY, { x: index + 1, y: test.questions.length })}
      scoreText={fmt(t.quiz.answeredXofY, { x: answered, y: test.questions.length })}
    >
      {index === 0 && answered === 0 && (
        <p className="mb-4 text-sm text-subtle" data-testid="pre-assessment-intro">
          {fmt(de ? "{n} Fragen quer durch alle Kapitel zeigen dir, wo du stehst. Raten ist erlaubt, das Ergebnis zählt nicht für deinen Lernstand." : "{n} questions across all chapters show where you stand. Guessing is fine, the result does not count towards your progress.", { n: test.questions.length })}
        </p>
      )}
      <QuestionBody
        question={current.question[locale]}
        options={options.map((o) => o.text[locale])}
        states={states}
        onPick={(i) => setPicks((prev) => prev.map((v, k) => (k === index ? options[i].id : v)))}
        objectiveLabel={current.domainName}
      />
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setIndex(Math.max(0, index - 1))} disabled={index === 0}>{t.quiz.previous}</Button>
          <Button variant="ghost" onClick={() => void send({ skip: true }, "skip")} disabled={busy !== null} data-testid="pre-assessment-skip">
            {de ? "Überspringen" : "Skip"}
          </Button>
        </div>
        {last ? (
          <Button
            onClick={() => void send({ answers: test.questions.map((q, i) => ({ questionId: q.questionId, selectedOptionId: picks[i]! })) }, "submit")}
            disabled={busy !== null || answered < test.questions.length}
            iconLeft={busy === "submit" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : undefined}
            data-testid="pre-assessment-submit"
          >
            {de ? "Auswerten" : "Evaluate"}
          </Button>
        ) : (
          <Button onClick={() => setIndex(index + 1)} disabled={!picks[index]} data-testid="pre-assessment-next">{t.quiz.nextShort}</Button>
        )}
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-danger-text">{de ? "Das hat nicht geklappt. Bitte versuche es noch einmal." : "That did not work. Please try again."}</p>}
    </FocusFrame>
  );
}
