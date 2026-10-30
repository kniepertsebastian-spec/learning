"use client";

import { useState } from "react";
import { Check, Flag, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n";
import type { FeedbackCategory } from "@/lib/server/db/schema";

const CATEGORIES: Array<{ value: FeedbackCategory; de: string; en: string }> = [
  { value: "bug", de: "Technischer Fehler", en: "Bug" },
  { value: "typo", de: "Tippfehler", en: "Typo" },
  { value: "content", de: "Inhaltlich unstimmig", en: "Content issue" },
  { value: "other", de: "Sonstiges", en: "Other" },
];

/**
 * Dezenter „Problem melden / Feedback“-Knopf (roadmap_bugs_features 4.4) für Kursübersicht und Lektion. Die Meldung trägt Kurs, Kapitel und
 * Lektion mit, damit niemand nachfragen muss, wo das Problem war. Ein Fehler beim Senden wird gezeigt, unterbricht aber nie das Lernen.
 */
export function FeedbackButton({ certificationId, domainId = null, sectionId = null, className }: { certificationId: string; domainId?: string | null; sectionId?: string | null; className?: string }) {
  const { locale } = useLocale();
  const de = locale === "de";
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>("content");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    setState("sending");
    setError(null);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ certificationId, domainId, sectionId, category, message }),
      });
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? `Status ${response.status}`);
      setState("sent");
      setMessage("");
    } catch (err) {
      setError(err instanceof Error ? err.message : de ? "Das hat nicht geklappt." : "That did not work.");
      setState("error");
    }
  }

  if (state === "sent") {
    return (
      <p className={`flex items-center gap-1.5 text-xs text-mint-text ${className ?? ""}`} role="status" data-testid="feedback-sent">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        {de ? "Danke für deine Meldung! Wir schauen sie uns an." : "Thanks for your report! We will look into it."}
      </p>
    );
  }
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`flex min-h-8 items-center gap-1.5 rounded-md px-1 text-xs text-subtle hover:text-foreground ${className ?? ""}`} data-testid="feedback-open">
        <Flag className="h-3.5 w-3.5" aria-hidden="true" />
        {de ? "Problem melden / Feedback" : "Report a problem / feedback"}
      </button>
    );
  }
  return (
    <form onSubmit={send} className={`flex max-w-xl flex-col gap-3 rounded-xl border border-border bg-surface p-4 text-sm ${className ?? ""}`} data-testid="feedback-form">
      <p className="font-medium">{de ? "Was ist dir aufgefallen?" : "What did you notice?"}</p>
      <fieldset className="flex flex-wrap gap-2" aria-label={de ? "Art des Problems" : "Kind of problem"}>
        {CATEGORIES.map((c) => (
          <label key={c.value} className={`cursor-pointer rounded-md border px-2.5 py-1 text-xs ${category === c.value ? "border-accent bg-accent-soft text-link" : "border-border-strong"}`}>
            <input type="radio" name="feedback-category" value={c.value} checked={category === c.value} onChange={() => setCategory(c.value)} className="sr-only" data-testid={`feedback-category-${c.value}`} />
            {de ? c.de : c.en}
          </label>
        ))}
      </fieldset>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        required
        minLength={5}
        maxLength={2000}
        rows={4}
        placeholder={de ? "Beschreibe kurz, was nicht stimmt oder wo es hakt." : "Briefly describe what is wrong or where it gets stuck."}
        aria-label={de ? "Beschreibung" : "Description"}
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        data-testid="feedback-message"
      />
      <p className="text-xs text-subtle">{de ? "Kurs, Kapitel und Lektion werden automatisch mitgeschickt." : "Course, chapter and lesson are sent along automatically."}</p>
      {error && <p role="alert" className="text-xs text-danger-text">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={state === "sending" || message.trim().length < 5} iconLeft={state === "sending" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : undefined} data-testid="feedback-send">
          {de ? "Senden" : "Send"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>{de ? "Abbrechen" : "Cancel"}</Button>
      </div>
    </form>
  );
}
