"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { c_reviewerQuality } from "@/lib/i18n/components/reviewerQuality";
import type { Locale } from "@/lib/types";

export interface SecondReviewCardData {
  id: string;
  courseName: string;
  versionLabel: string;
  humanId: string;
  question: string;
  explanation: string;
  options: Array<{ id: string; text: string; isCorrect: boolean }>;
  solution: string | null;
}

/** Zweitprüfung: je Frage Aufgabe, Lösung und Erklärung, darunter „Stimmt“ oder „Stimmt nicht“ mit Begründung. Erledigte Karten verschwinden. */
export function SecondReviewList({ items, locale }: { items: SecondReviewCardData[]; locale: Locale }) {
  const tx = c_reviewerQuality(locale);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  async function decide(id: string, verdict: "agree" | "disagree") {
    if (busy) return;
    const comment = comments[id]?.trim() ?? "";
    if (verdict === "disagree" && comment.length < 3) {
      setErrors((e) => ({ ...e, [id]: tx.commentRequired }));
      return;
    }
    setBusy(id);
    setErrors((e) => ({ ...e, [id]: "" }));
    const response = await fetch(`/api/reviewer/second-review/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verdict, comment }) }).catch(() => null);
    setBusy(null);
    if (response?.ok) {
      setDone((d) => new Set(d).add(id));
      setMessage(tx.saved);
    } else {
      setErrors((e) => ({ ...e, [id]: response?.status === 400 ? tx.commentRequired : tx.failed }));
    }
  }

  const open = items.filter((i) => !done.has(i.id));
  return (
    <div className="flex flex-col gap-4" data-testid="second-review-list">
      <div aria-live="polite" className="text-sm text-mint-text">{message}</div>
      {open.length === 0 && <p className="text-sm text-subtle" data-testid="second-review-empty">{tx.pageEmpty}</p>}
      {open.map((item) => (
        <Card key={item.id} className="flex flex-col gap-3" data-testid="second-review-card">
          <p className="text-xs text-subtle">{item.courseName} · {item.versionLabel} · {item.humanId}</p>
          <div>
            <p className="text-xs font-semibold tracking-overline text-faint uppercase">{tx.question}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm font-medium">{item.question}</p>
          </div>
          {item.options.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm">
              {item.options.map((o) => (
                <li key={o.id} className={o.isCorrect ? "font-medium text-mint-text" : "text-muted"}>
                  {o.isCorrect ? "✓ " : "– "}
                  {o.text}
                  {o.isCorrect && <span className="sr-only"> ({tx.correct})</span>}
                </li>
              ))}
            </ul>
          )}
          {item.solution && (
            <div>
              <p className="text-xs font-semibold tracking-overline text-faint uppercase">{tx.solution}</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{item.solution}</p>
            </div>
          )}
          <div>
            <p className="text-xs font-semibold tracking-overline text-faint uppercase">{tx.explanation}</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted">{item.explanation}</p>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{tx.commentLabel}</span>
            <textarea
              rows={3}
              maxLength={2000}
              value={comments[item.id] ?? ""}
              onChange={(e) => setComments((c) => ({ ...c, [item.id]: e.target.value }))}
              placeholder={tx.commentPlaceholder}
              className="rounded-md border border-border-strong bg-control p-2 text-sm"
              data-testid="second-review-comment"
            />
          </label>
          {errors[item.id] && <p role="alert" className="text-sm text-danger-text">{errors[item.id]}</p>}
          <div className="flex flex-wrap gap-3">
            <Button type="button" onClick={() => void decide(item.id, "agree")} disabled={busy === item.id} data-testid="second-review-agree">{tx.agree}</Button>
            <Button type="button" variant="secondary" onClick={() => void decide(item.id, "disagree")} disabled={busy === item.id} data-testid="second-review-disagree">{tx.disagree}</Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
