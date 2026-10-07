"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { COURSE_KIND_LABELS } from "@/lib/course-requests";

type Status = "assigned" | "in_progress" | "completed";
type Role = "company_admin" | "mentor" | "learner";

export type AssignmentRowView = {
  id: string;
  memberName: string | null;
  memberEmail: string;
  learningPath: string;
  learningPathKind: "general" | "internal";
  status: Status;
  assignedAt: string;
  dueAt: string | null;
  completedAt: string | null;
  overdue: boolean;
  practiceConfirmed: number;
  practiceTotal: number;
};
export type MemberOption = { userId: string; name: string | null; email: string; role: Role };
export type PathOption = { id: string; name: string; kind: "general" | "internal" };

const STATUS_LABELS: Record<Status, { de: string; en: string }> = {
  assigned: { de: "Zugewiesen", en: "Assigned" },
  in_progress: { de: "In Arbeit", en: "In progress" },
  completed: { de: "Abgeschlossen", en: "Completed" },
};

function formatDate(iso: string | null, locale: "de" | "en") {
  return iso ? new Date(iso).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB", { timeZone: "UTC" }) : "–";
}

/**
 * Firmenbereich: Lernpfade zuweisen und den Status ansehen. Gezeigt werden nur Status, Zuweisungs-,
 * Frist- und Abschlussdatum - nie Lerndetails (Leitplanke „Arbeitgeber sieht nur Status“).
 */
export function AssignmentsPanel({
  rows,
  members,
  paths,
  locale,
}: {
  rows: AssignmentRowView[];
  members: MemberOption[];
  paths: PathOption[];
  locale: "de" | "en";
}) {
  const router = useRouter();
  const de = locale === "de";
  const [selected, setSelected] = useState<string[]>([]);
  const [pathId, setPathId] = useState(paths[0]?.id ?? "");
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setNotice(null);
    const res = await fetch("/api/company/assignments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userIds: selected, certificationId: pathId, dueAt: due || null }),
    });
    const body = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError(body?.error ?? (de ? "Zuweisung fehlgeschlagen." : "Could not assign."));
      return;
    }
    const n = body.assigned.length as number;
    const skipped = body.alreadyAssigned.length as number;
    setNotice(
      de
        ? `${n} zugewiesen${skipped ? `, ${skipped} hatten den Lernpfad schon` : ""}.`
        : `${n} assigned${skipped ? `, ${skipped} already had this path` : ""}.`,
    );
    setSelected([]);
    router.refresh();
  }

  async function changeDue(id: string, value: string) {
    setError(null);
    const res = await fetch(`/api/company/assignments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dueAt: value || null }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? (de ? "Frist konnte nicht geändert werden." : "Could not change the due date."));
      return;
    }
    router.refresh();
  }

  async function remove(id: string) {
    setError(null);
    const res = await fetch(`/api/company/assignments/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(de ? "Entfernen fehlgeschlagen." : "Could not remove.");
      return;
    }
    router.refresh();
  }

  function toggle(userId: string) {
    setSelected((s) => (s.includes(userId) ? s.filter((x) => x !== userId) : [...s, userId]));
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-6" data-testid="assignments-panel">
      <h2 className="text-lg font-medium">{de ? "Lernpfade zuweisen" : "Assign learning paths"}</h2>
      <p className="mt-1 text-sm text-foreground/70">
        {de
          ? "Du siehst hier nur Status, Zuweisungs-, Frist- und Abschlussdatum. Lernergebnisse und Antworten bleiben bei den Lernenden."
          : "You only see status, assignment, due and completion dates. Results and answers stay with the learners."}
      </p>

      {paths.length === 0 ? (
        <p className="mt-3 text-sm text-foreground/70" data-testid="no-paths">
          {de ? "Es gibt noch keine Lernpfade." : "There are no learning paths yet."}
        </p>
      ) : (
        <form onSubmit={assign} className="mt-4 flex flex-col gap-3">
          <fieldset className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-border bg-background p-3">
            <legend className="px-1 text-xs text-foreground/70">{de ? "Personen" : "People"}</legend>
            {members.map((m) => (
              <label key={m.userId} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selected.includes(m.userId)} onChange={() => toggle(m.userId)} />
                <span>{m.name ? `${m.name} (${m.email})` : m.email}</span>
              </label>
            ))}
          </fieldset>
          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              value={pathId}
              onChange={(e) => setPathId(e.target.value)}
              aria-label={de ? "Lernpfad" : "Learning path"}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            >
              {paths.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({COURSE_KIND_LABELS[p.kind][locale]})
                </option>
              ))}
            </select>
            <input
              type="date"
              value={due}
              onChange={(e) => setDue(e.target.value)}
              aria-label={de ? "Frist (optional)" : "Due date (optional)"}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={pending || selected.length === 0 || !pathId}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {de ? "Zuweisen" : "Assign"}
            </button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-3 text-sm" data-testid="assign-notice">
          {notice}
        </p>
      )}

      <h3 className="mt-6 text-base font-medium">{de ? "Status" : "Status"}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-foreground/70" data-testid="company-status-empty">
          {de ? "Noch keine Lernpfade zugewiesen." : "No learning paths assigned yet."}
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-sm" data-testid="status-table">
            <thead className="text-xs text-foreground/70">
              <tr>
                <th className="py-2 pr-4 font-medium">{de ? "Person" : "Person"}</th>
                <th className="py-2 pr-4 font-medium">{de ? "Lernpfad" : "Learning path"}</th>
                <th className="py-2 pr-4 font-medium">{de ? "Status" : "Status"}</th>
                <th className="py-2 pr-4 font-medium">{de ? "Zugewiesen" : "Assigned"}</th>
                <th className="py-2 pr-4 font-medium">{de ? "Frist" : "Due"}</th>
                <th className="py-2 pr-4 font-medium">{de ? "Abgeschlossen" : "Completed"}</th>
                <th className="py-2 pr-4 font-medium">{de ? "Praxis" : "Practice"}</th>
                <th className="py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border" data-testid="status-row">
                  <td className="py-2 pr-4">{r.memberName ? `${r.memberName} (${r.memberEmail})` : r.memberEmail}</td>
                  <td className="py-2 pr-4">
                    {r.learningPath}
                    <span className="ml-2 rounded bg-foreground/10 px-1.5 py-0.5 text-xs">{COURSE_KIND_LABELS[r.learningPathKind][locale]}</span>
                  </td>
                  <td className="py-2 pr-4" data-testid="row-status">
                    {STATUS_LABELS[r.status][locale]}
                    {r.overdue && <span className="ml-2 rounded bg-red-500/10 px-1.5 py-0.5 text-xs text-red-500">{de ? "überfällig" : "overdue"}</span>}
                  </td>
                  <td className="py-2 pr-4">{formatDate(r.assignedAt, locale)}</td>
                  <td className="py-2 pr-4">
                    {r.status === "completed" ? (
                      formatDate(r.dueAt, locale)
                    ) : (
                      <input
                        type="date"
                        defaultValue={r.dueAt ? r.dueAt.slice(0, 10) : ""}
                        onBlur={(e) => {
                          if (e.target.value !== (r.dueAt ? r.dueAt.slice(0, 10) : "")) void changeDue(r.id, e.target.value);
                        }}
                        aria-label={de ? "Frist ändern" : "Change due date"}
                        className="rounded-md border border-border bg-background px-2 py-1 text-xs"
                      />
                    )}
                  </td>
                  <td className="py-2 pr-4">{formatDate(r.completedAt, locale)}</td>
                  <td className="py-2 pr-4" data-testid="row-practice">
                    {r.practiceTotal > 0 ? (de ? `${r.practiceConfirmed} von ${r.practiceTotal} bestätigt` : `${r.practiceConfirmed} of ${r.practiceTotal} confirmed`) : "–"}
                  </td>
                  <td className="py-2 text-right">
                    {r.status !== "completed" && (
                      <button
                        type="button"
                        onClick={() => void remove(r.id)}
                        className="text-xs text-red-500 hover:underline"
                        aria-label={de ? "Zuweisung entfernen" : "Remove assignment"}
                      >
                        {de ? "Entfernen" : "Remove"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
