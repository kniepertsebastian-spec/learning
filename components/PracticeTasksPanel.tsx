"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type TaskRowView = {
  id: string;
  title: string;
  description: string | null;
  learningPath: string;
  assignees: number;
  submitted: number;
  confirmed: number;
  rework: number;
};
export type PendingRowView = {
  id: string;
  taskTitle: string;
  learningPath: string;
  memberName: string | null;
  memberEmail: string;
  note: string | null;
  submittedAt: string;
};

const btn = "rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-background disabled:opacity-50";

async function call(url: string, method: string, body?: unknown): Promise<string | null> {
  const res = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.error ?? `Fehler ${res.status}`;
}

function PendingItem({ p, locale }: { p: PendingRowView; locale: "de" | "en" }) {
  const router = useRouter();
  const de = locale === "de";
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function decide(decision: "confirm" | "rework") {
    setBusy(true);
    const err = await call(`/api/company/practice-tasks/submissions/${p.id}/review`, "POST", { decision, note: note || null });
    setBusy(false);
    setError(err);
    if (!err) router.refresh();
  }

  return (
    <li className="rounded-md border border-border bg-background p-3 text-sm" data-testid="practice-pending">
      <p>
        <span className="font-medium">{p.memberName ?? p.memberEmail}</span>
        <span className="text-foreground/70"> · {p.taskTitle} · {p.learningPath}</span>
      </p>
      {p.note && <p className="mt-1 whitespace-pre-wrap text-foreground/80">„{p.note}“</p>}
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          placeholder={de ? "Hinweis (bei Nacharbeit Pflicht)" : "Note (required for rework)"}
          aria-label={de ? "Hinweis" : "Note"}
          className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-sm"
        />
        <button type="button" disabled={busy} onClick={() => void decide("confirm")} data-testid="practice-confirm" className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-50">
          {de ? "Bestätigen" : "Confirm"}
        </button>
        <button type="button" disabled={busy} onClick={() => void decide("rework")} data-testid="practice-rework" className={btn}>
          {de ? "Zur Nacharbeit zurück" : "Send back for rework"}
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}
    </li>
  );
}

/**
 * Praxisaufgaben (Mentor, Firmen-Admin): Aufgaben zu den Lernpfaden anlegen und Abgaben bestätigen. Bestätigt eine
 * andere Person als die abgebende; die Firma sieht in der Statusliste nur „x von y bestätigt“.
 */
export function PracticeTasksPanel({
  tasks,
  pending,
  paths,
  locale,
}: {
  tasks: TaskRowView[];
  pending: PendingRowView[];
  paths: { id: string; name: string }[];
  locale: "de" | "en";
}) {
  const router = useRouter();
  const de = locale === "de";
  const [pathId, setPathId] = useState(paths[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const err = await call("/api/company/practice-tasks", "POST", { certificationId: pathId, title, description: description || null });
    setBusy(false);
    setError(err);
    if (!err) {
      setTitle("");
      setDescription("");
      router.refresh();
    }
  }
  async function archive(id: string) {
    if (!window.confirm(de ? "Aufgabe archivieren? Sie zählt dann nicht mehr, Abgaben bleiben erhalten." : "Archive this task? It no longer counts, submissions are kept.")) return;
    setError(await call(`/api/company/practice-tasks/${id}`, "DELETE"));
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-6" data-testid="practice-tasks">
      <h2 className="text-lg font-medium">{de ? "Praxisaufgaben" : "Practice tasks"}</h2>
      <p className="mt-1 text-sm text-foreground/70">
        {de
          ? "Praktische Aufgaben zu euren Lernpfaden. Wer den Lernpfad hat, gibt die Aufgabe ab; eine andere Person aus Mentor oder Firmen-Admin bestätigt sie. In der Statusliste steht nur „x von y bestätigt“."
          : "Practical tasks for your learning paths. People assigned the path hand them in; a different mentor or company admin confirms. The status list only shows “x of y confirmed”."}
      </p>

      {paths.length > 0 ? (
        <form onSubmit={create} className="mt-4 flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={pathId} onChange={(e) => setPathId(e.target.value)} aria-label={de ? "Lernpfad" : "Learning path"} data-testid="practice-path" className="rounded-md border border-border bg-background px-3 py-2 text-sm">
              {paths.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              minLength={3}
              maxLength={200}
              placeholder={de ? "Aufgabe, z. B. „Setze einen Testserver auf“" : "Task, e.g. “Set up a test server”"}
              aria-label={de ? "Titel der Aufgabe" : "Task title"}
              data-testid="practice-title"
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={2}
            placeholder={de ? "Beschreibung (optional)" : "Description (optional)"}
            aria-label={de ? "Beschreibung" : "Description"}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <button type="submit" disabled={busy || !title.trim()} data-testid="practice-create" className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-50">
            {de ? "Aufgabe anlegen" : "Create task"}
          </button>
        </form>
      ) : (
        <p className="mt-3 text-sm text-foreground/70">{de ? "Es gibt noch keinen Lernpfad, zu dem sich Aufgaben anlegen lassen." : "There is no learning path yet to add tasks to."}</p>
      )}
      {error && <p role="alert" className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>}

      {pending.length > 0 && (
        <>
          <h3 className="mt-6 text-base font-medium">{de ? "Wartet auf Bestätigung" : "Waiting for confirmation"}</h3>
          <ul className="mt-2 flex flex-col gap-2" data-testid="practice-pending-list">
            {pending.map((p) => (
              <PendingItem key={p.id} p={p} locale={locale} />
            ))}
          </ul>
        </>
      )}

      {tasks.length > 0 && (
        <>
          <h3 className="mt-6 text-base font-medium">{de ? "Aufgaben" : "Tasks"}</h3>
          <ul className="mt-2 flex flex-col gap-2" data-testid="practice-task-list">
            {tasks.map((t) => (
              <li key={t.id} className="rounded-md border border-border bg-background p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{t.title}</span>
                    <span className="text-foreground/70"> · {t.learningPath}</span>
                  </span>
                  <button type="button" onClick={() => void archive(t.id)} className="text-xs text-foreground/60 hover:text-red-500">
                    {de ? "Archivieren" : "Archive"}
                  </button>
                </div>
                {t.description && <p className="mt-1 text-foreground/70">{t.description}</p>}
                <p className="mt-1 text-xs text-foreground/70">
                  {de
                    ? `${t.confirmed} von ${t.assignees} bestätigt · ${t.submitted} wartet · ${t.rework} in Nacharbeit`
                    : `${t.confirmed} of ${t.assignees} confirmed · ${t.submitted} waiting · ${t.rework} in rework`}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
