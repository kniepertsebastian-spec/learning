"use client";

import { useState } from "react";
import { RichText } from "@/components/RichText";
import { Button } from "@/components/ui/button";
import { getSelfExplanation, MAX_LENGTH, saveSelfExplanation } from "@/lib/client/self-explanations";
import type { Locale } from "@/lib/types";

/**
 * Selbsterklärung (roadmap_didaktik 3.3): freiwillig, nicht bewertet, ohne Einfluss auf das Rating. Nach dem Absenden steht die eigene
 * Erklärung neben der Musterantwort zum Vergleich. Der Text bleibt nur auf diesem Gerät.
 */
export function SelfExplanation({ storageKey, prompt, modelAnswer, locale }: { storageKey: string; prompt: string; modelAnswer: string; locale: Locale }) {
  const de = locale === "de";
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);

  if (!open) {
    return (
      <div className="mt-3">
        <Button variant="ghost" size="sm" onClick={() => { setText(getSelfExplanation(storageKey)?.text ?? ""); setOpen(true); }} data-testid="self-explain-open">
          {de ? "In einem Satz erklären (freiwillig)" : "Explain in one sentence (optional)"}
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-surface p-3 text-sm" data-testid="self-explain">
      {submitted === null ? (
        <>
          <label htmlFor={`self-explain-${storageKey}`} className="block font-medium">{prompt}</label>
          <p className="mb-2 text-xs text-subtle">{de ? "Wird nicht bewertet und bleibt nur auf diesem Gerät." : "Not graded and stays on this device only."}</p>
          <textarea id={`self-explain-${storageKey}`} value={text} maxLength={MAX_LENGTH} rows={2} onChange={(e) => setText(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-base" data-testid="self-explain-input" />
          <div className="mt-2 flex gap-2">
            <Button size="sm" disabled={!text.trim()} onClick={() => { saveSelfExplanation(storageKey, text); setSubmitted(text.trim()); }} data-testid="self-explain-compare">
              {de ? "Mit Musterantwort vergleichen" : "Compare with model answer"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>{de ? "Überspringen" : "Skip"}</Button>
          </div>
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2" data-testid="self-explain-result">
          <div>
            <p className="mb-1 text-xs font-semibold">{de ? "Deine Erklärung" : "Your explanation"}</p>
            <p className="whitespace-pre-wrap" data-testid="self-explain-own">{submitted}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-semibold">{de ? "Musterantwort zum Vergleich" : "Model answer for comparison"}</p>
            <div data-testid="self-explain-model"><RichText text={modelAnswer} /></div>
          </div>
        </div>
      )}
    </div>
  );
}
