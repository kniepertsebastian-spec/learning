"use client";

import { c_mentorRequestsPanel } from "@/lib/i18n/components/mentorRequestsPanel";
import { useState } from "react";
import { useRouter } from "next/navigation";

export type MentorRequestRow = { id: string; learner: string; topic: string; message: string; learningPath: string | null; createdAt: string };
export type MentorStatsView = { requests: number; answered: number; medianHoursToAnswer: number | null } | null;

const btn = "rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-background disabled:opacity-50";

function Request({ r, locale }: { r: MentorRequestRow; locale: "de" | "en" }) {
  const router = useRouter();
  const de = locale === "de";
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function answer() {
    setBusy(true);
    const res = await fetch(`/api/company/mentor-requests/${r.id}/answer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: note || null }) });
    setBusy(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? (c_mentorRequestsPanel(de).thatDidNotWork));
      return;
    }
    router.refresh();
  }

  return (
    <li className="rounded-md border border-border bg-background p-3 text-sm" data-testid="mentor-request">
      <p className="font-medium">
        {r.learner} · {r.topic}
        {r.learningPath && <span className="text-muted"> · {r.learningPath}</span>}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-text-2">{r.message}</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          placeholder={c_mentorRequestsPanel(de).shortReplyOptional}
          aria-label={c_mentorRequestsPanel(de).reply}
          className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-sm"
        />
        <button type="button" className={btn} disabled={busy} onClick={() => void answer()} data-testid="mentor-request-answer">
          {c_mentorRequestsPanel(de).markAnswered}
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-danger-text">{error}</p>}
    </li>
  );
}

/** Offene „Mentor fragen“-Anfragen (nur was die Person selbst geschrieben hat) und, für den Firmen-Admin, anonyme Kennzahlen ab Mindestgröße. */
export function MentorRequestsPanel({ requests, stats, locale }: { requests: MentorRequestRow[]; stats: MentorStatsView; locale: "de" | "en" }) {
  const de = locale === "de";
  if (requests.length === 0 && !stats) return null;
  return (
    <section className="rounded-2xl border border-border bg-surface p-5" data-testid="mentor-requests-panel">
      <h3 className="mb-3 font-medium">{c_mentorRequestsPanel(de).helpRequests}</h3>
      {requests.length === 0 ? (
        <p className="text-sm text-subtle">{c_mentorRequestsPanel(de).noOpenRequests}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {requests.map((r) => (
            <Request key={r.id} r={r} locale={locale} />
          ))}
        </ul>
      )}
      {stats && (
        <p className="mt-3 text-xs text-muted" data-testid="mentor-stats">
          {de
            ? `Insgesamt ${stats.requests} Anfragen, ${stats.answered} beantwortet${stats.medianHoursToAnswer !== null ? `, typische Antwortzeit ${stats.medianHoursToAnswer} Stunden` : ""}.`
            : `${stats.requests} requests in total, ${stats.answered} answered${stats.medianHoursToAnswer !== null ? `, typical response time ${stats.medianHoursToAnswer} hours` : ""}.`}
        </p>
      )}
    </section>
  );
}
