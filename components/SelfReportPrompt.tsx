"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { c_selfReportPrompt } from "@/lib/i18n/components/selfReportPrompt";
import { SELF_REPORT_VALUES, type SelfReportKind, type SelfReportRefType } from "@/lib/self-reports";

interface Question {
  kind: SelfReportKind;
  refType: SelfReportRefType | null;
  refId: string | null;
}

/**
 * Eine freiwillige Frage nach einer Lektion (5.1, 5.2) oder auf der Kursseite (5.3, 5.4), Aufgabe 18. Der Server entscheidet, ob und
 * welche Frage jetzt dran ist (`/api/self-reports/next`); ohne Frage zeigt die Komponente nichts. Jede Frage lässt sich überspringen.
 * Eine Antwort wird nie als Pflicht dargestellt und blockiert nichts.
 */
export function SelfReportPrompt({ context, refId, locale }: { context: "lesson" | "course"; refId: string; locale: "de" | "en" }) {
  const t = c_selfReportPrompt(locale);
  const [question, setQuestion] = useState<Question | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "done" | "failed">("idle");

  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/self-reports/next?context=${context}&refId=${refId}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<{ question: Question | null }>) : null))
      .then((data) => {
        if (!cancelled && data?.question) setQuestion(data.question);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [context, refId]);

  if (!question) return null;
  const texts = t.questions[question.kind];

  async function send(value: string | null) {
    if (!question || state === "sending") return;
    setState("sending");
    try {
      const res = await fetch("/api/self-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: question.kind, value, refType: question.refType, refId: question.refId }),
      });
      // 409: inzwischen nicht mehr erlaubt (abgeschaltet, pausiert): still wegnehmen.
      if (res.ok || res.status === 409) {
        setState("done");
        if (value === null || res.status === 409) setQuestion(null);
      } else setState("failed");
    } catch {
      setState("failed");
    }
  }

  if (state === "done") {
    return (
      <p role="status" className="mt-4 text-sm text-subtle" data-testid="self-report-thanks">
        {t.thanks}
      </p>
    );
  }

  return (
    <Card className="mt-4" data-testid="self-report-prompt" data-kind={question.kind}>
      <p className="text-meta text-subtle">{t.intro}</p>
      <h2 className="mt-1 text-base font-semibold" data-testid="self-report-question">{texts.question}</h2>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={texts.question}>
        {SELF_REPORT_VALUES[question.kind].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => void send(value)}
            disabled={state === "sending"}
            data-testid={`self-report-option-${value}`}
            className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm hover:border-accent-border disabled:cursor-not-allowed disabled:opacity-60"
          >
            {(texts.options as Record<string, string>)[value]}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-subtle">
        <span>{t.optional}</span>
        <button type="button" onClick={() => void send(null)} disabled={state === "sending"} className="text-link hover:underline disabled:opacity-60" data-testid="self-report-skip">
          {t.skip}
        </button>
        {state === "failed" && <span role="alert" className="text-danger-text">{t.failed}</span>}
      </div>
    </Card>
  );
}
