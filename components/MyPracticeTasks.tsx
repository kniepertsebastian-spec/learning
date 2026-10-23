"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MentorAskForm } from "@/components/MentorAskForm";

export type MyTaskRow = {
  taskId: string;
  title: string;
  description: string | null;
  learningPath: string;
  certificationId?: string;
  status: "open" | "submitted" | "confirmed" | "rework";
  note: string | null;
  reviewerNote: string | null;
};

const LABELS = {
  open: { de: "Offen", en: "Open" },
  submitted: { de: "Wartet auf Bestätigung", en: "Waiting for confirmation" },
  confirmed: { de: "Bestätigt", en: "Confirmed" },
  rework: { de: "Bitte nacharbeiten", en: "Please rework" },
} as const;

function Task({ t, locale, canAskMentor }: { t: MyTaskRow; locale: "de" | "en"; canAskMentor: boolean }) {
  const router = useRouter();
  const de = locale === "de";
  const [note, setNote] = useState(t.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const canSubmit = t.status === "open" || t.status === "rework" || t.status === "submitted";

  async function submit() {
    setBusy(true);
    const res = await fetch(`/api/company/practice-tasks/${t.taskId}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: note || null }) });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? (de ? "Das hat nicht geklappt." : "That did not work."));
      return;
    }
    setError(null);
    router.refresh();
  }

  return (
    <li className="rounded-md border border-border bg-background p-3 text-sm" data-testid="my-practice-task">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span className="font-medium">{t.title}</span>
          <span className="text-foreground/70"> · {t.learningPath}</span>
        </span>
        <span className="rounded bg-accent/10 px-2 py-0.5 text-xs font-medium text-link" data-testid="my-practice-status">{LABELS[t.status][locale]}</span>
      </div>
      {t.description && <p className="mt-1 whitespace-pre-wrap text-foreground/70">{t.description}</p>}
      {t.status === "rework" && t.reviewerNote && <p className="mt-2 rounded bg-amber-500/10 px-2 py-1" data-testid="my-practice-reviewer-note">{t.reviewerNote}</p>}
      {t.status === "confirmed" && t.reviewerNote && <p className="mt-1 text-xs text-foreground/70">{t.reviewerNote}</p>}
      {canSubmit && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            placeholder={de ? "Notiz für die Bestätigung (optional)" : "Note for the reviewer (optional)"}
            aria-label={de ? "Notiz" : "Note"}
            className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-sm"
          />
          <button type="button" disabled={busy} onClick={() => void submit()} data-testid="my-practice-submit" className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface disabled:opacity-50">
            {t.status === "submitted" ? (de ? "Notiz aktualisieren" : "Update note") : de ? "Erledigt – zur Bestätigung" : "Done – send for confirmation"}
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}
      {canAskMentor && t.status !== "confirmed" && <MentorAskForm topic={t.title} certificationId={t.certificationId} locale={locale} />}
    </li>
  );
}

/** Eigene Praxisaufgaben (nur meine Lernpfade, nur mein Stand). */
export function MyPracticeTasks({ tasks, locale, canAskMentor = false }: { tasks: MyTaskRow[]; locale: "de" | "en"; canAskMentor?: boolean }) {
  const de = locale === "de";
  return (
    <section className="mb-6 rounded-xl border border-border bg-surface p-5" data-testid="my-practice-tasks">
      <h2 className="font-semibold">{de ? "Praxisaufgaben" : "Practice tasks"}</h2>
      <p className="mt-1 text-xs text-foreground/70">
        {de
          ? "Eine andere Person aus deiner Firma bestätigt die Aufgabe. Deine Firma sieht nur, wie viele bestätigt sind, nicht deine Notizen."
          : "Someone else at your company confirms the task. Your company only sees how many are confirmed, not your notes."}
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {tasks.map((t) => (
          <Task key={t.taskId} t={t} locale={locale} canAskMentor={canAskMentor} />
        ))}
      </ul>
    </section>
  );
}
