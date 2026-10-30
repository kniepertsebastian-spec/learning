"use client";

import { c_myPracticeTasks } from "@/lib/i18n/components/myPracticeTasks";
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
      setError(data?.error ?? (c_myPracticeTasks(de).thatDidNotWork));
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
          <span className="text-muted"> · {t.learningPath}</span>
        </span>
        <span className="rounded bg-accent-soft px-2 py-0.5 text-xs font-medium text-link" data-testid="my-practice-status">{LABELS[t.status][locale]}</span>
      </div>
      {t.description && <p className="mt-1 whitespace-pre-wrap text-muted">{t.description}</p>}
      {t.status === "rework" && t.reviewerNote && <p className="mt-2 rounded bg-warning-soft px-2 py-1" data-testid="my-practice-reviewer-note">{t.reviewerNote}</p>}
      {t.status === "confirmed" && t.reviewerNote && <p className="mt-1 text-xs text-subtle">{t.reviewerNote}</p>}
      {canSubmit && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            placeholder={c_myPracticeTasks(de).noteForTheReviewerOptional}
            aria-label={c_myPracticeTasks(de).note}
            className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-sm"
          />
          <button type="button" disabled={busy} onClick={() => void submit()} data-testid="my-practice-submit" className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface disabled:opacity-50">
            {t.status === "submitted" ? (c_myPracticeTasks(de).updateNote) : c_myPracticeTasks(de).doneSendForConfirmation}
          </button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-danger-text">{error}</p>}
      {canAskMentor && t.status !== "confirmed" && <MentorAskForm topic={t.title} certificationId={t.certificationId} locale={locale} />}
    </li>
  );
}

/** Eigene Praxisaufgaben (nur meine Lernpfade, nur mein Stand). */
export function MyPracticeTasks({ tasks, locale, canAskMentor = false }: { tasks: MyTaskRow[]; locale: "de" | "en"; canAskMentor?: boolean }) {
  const de = locale === "de";
  return (
    <section id="practice-tasks" className="scroll-mt-6 rounded-2xl border border-border bg-surface p-5" data-testid="my-practice-tasks">
      <h2 className="font-semibold">{c_myPracticeTasks(de).practiceTasks}</h2>
      <p className="mt-1 text-xs text-subtle">
        {c_myPracticeTasks(de).someoneElseAtYourCompany}
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {tasks.map((t) => (
          <Task key={t.taskId} t={t} locale={locale} canAskMentor={canAskMentor} />
        ))}
      </ul>
    </section>
  );
}
