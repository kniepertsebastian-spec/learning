"use client";

import { c_practiceTasksPanel } from "@/lib/i18n/components/practiceTasksPanel";
import { fill } from "@/lib/i18n/fill";
import { useConfirm } from "@/components/ui/confirm-dialog";
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
        <span className="text-muted"> · {p.taskTitle} · {p.learningPath}</span>
      </p>
      {p.note && <p className="mt-1 whitespace-pre-wrap text-text-2">„{p.note}“</p>}
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          placeholder={c_practiceTasksPanel(de).noteRequiredForRework}
          aria-label={c_practiceTasksPanel(de).note}
          className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-sm"
        />
        <button type="button" disabled={busy} onClick={() => void decide("confirm")} data-testid="practice-confirm" className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50">
          {c_practiceTasksPanel(de).confirm}
        </button>
        <button type="button" disabled={busy} onClick={() => void decide("rework")} data-testid="practice-rework" className={btn}>
          {c_practiceTasksPanel(de).sendBackForRework}
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-danger-text">{error}</p>}
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
  objectivesByPath,
  sectionsByPath,
  locale,
}: {
  tasks: TaskRowView[];
  pending: PendingRowView[];
  paths: { id: string; name: string }[];
  objectivesByPath: Record<string, Array<{ id: string; code: string; title: string }>>;
  sectionsByPath: Record<string, Array<{ id: string; code: string; title: string }>>;
  locale: "de" | "en";
}) {
  const [confirm, confirmDialog] = useConfirm();
  const router = useRouter();
  const de = locale === "de";
  const [pathId, setPathId] = useState(paths[0]?.id ?? "");
  const [objectiveId, setObjectiveId] = useState("");
  const [unlockSectionId, setUnlockSectionId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const err = await call("/api/company/practice-tasks", "POST", { certificationId: pathId, objectiveId: objectiveId || null, unlockSectionId: unlockSectionId || null, title, description: description || null });
    setBusy(false);
    setError(err);
    if (!err) {
      setTitle("");
      setDescription("");
      router.refresh();
    }
  }
  async function archive(id: string) {
    if (!(await confirm(c_practiceTasksPanel(de).archiveThisTaskItNo))) return;
    setError(await call(`/api/company/practice-tasks/${id}`, "DELETE"));
    router.refresh();
  }

  return (
    <>
    {confirmDialog}
    <section className="rounded-lg border border-border bg-surface p-6" data-testid="practice-tasks">
      <h2 className="text-lg font-medium">{c_practiceTasksPanel(de).practiceTasks}</h2>
      <p className="mt-1 text-sm text-muted">
        {c_practiceTasksPanel(de).practicalTasksForYourLearning}
      </p>

      {paths.length > 0 ? (
        <form onSubmit={create} className="mt-4 flex flex-col gap-2">
          <div className="flex flex-col gap-2 sm:flex-row">
            <select value={pathId} onChange={(e) => { setPathId(e.target.value); setObjectiveId(""); setUnlockSectionId(""); }} aria-label={c_practiceTasksPanel(de).learningPath} data-testid="practice-path" className="rounded-md border border-border bg-background px-3 py-2 text-sm">
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
              placeholder={c_practiceTasksPanel(de).taskEGSetUp}
              aria-label={c_practiceTasksPanel(de).taskTitle}
              data-testid="practice-title"
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm"
            />
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
            rows={2}
            placeholder={c_practiceTasksPanel(de).descriptionOptional}
            aria-label={c_practiceTasksPanel(de).description}
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">
              {c_practiceTasksPanel(de).objectiveOptionalConfirmationAndRework}
            </span>
            <select value={objectiveId} onChange={(e) => setObjectiveId(e.target.value)} aria-label={c_practiceTasksPanel(de).objective} data-testid="practice-objective" className="rounded-md border border-border bg-background px-3 py-2 text-sm">
              <option value="">{c_practiceTasksPanel(de).none}</option>
              {(objectivesByPath[pathId] ?? []).map((o) => (
                <option key={o.id} value={o.id}>{o.code} {o.title}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">
              {c_practiceTasksPanel(de).unlockAfterLessonOptionalThe}
            </span>
            <select value={unlockSectionId} onChange={(e) => setUnlockSectionId(e.target.value)} aria-label={c_practiceTasksPanel(de).unlockAfterLesson} data-testid="practice-unlock" className="rounded-md border border-border bg-background px-3 py-2 text-sm">
              <option value="">{c_practiceTasksPanel(de).visibleRightAway}</option>
              {(sectionsByPath[pathId] ?? []).map((o) => (
                <option key={o.id} value={o.id}>{o.code} {o.title}</option>
              ))}
            </select>
          </label>
          <button type="submit" disabled={busy || !title.trim()} data-testid="practice-create" className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50">
            {c_practiceTasksPanel(de).createTask}
          </button>
        </form>
      ) : (
        <p className="mt-3 text-sm text-muted">{c_practiceTasksPanel(de).thereIsNoLearningPath}</p>
      )}
      {error && <p role="alert" className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-text">{error}</p>}

      {pending.length > 0 && (
        <>
          <h3 className="mt-6 text-base font-medium">{c_practiceTasksPanel(de).waitingForConfirmation}</h3>
          <ul className="mt-2 flex flex-col gap-2" data-testid="practice-pending-list">
            {pending.map((p) => (
              <PendingItem key={p.id} p={p} locale={locale} />
            ))}
          </ul>
        </>
      )}

      {tasks.length > 0 && (
        <>
          <h3 className="mt-6 text-base font-medium">{c_practiceTasksPanel(de).tasks}</h3>
          <ul className="mt-2 flex flex-col gap-2" data-testid="practice-task-list">
            {tasks.map((t) => (
              <li key={t.id} className="rounded-md border border-border bg-background p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    <span className="font-medium">{t.title}</span>
                    <span className="text-muted"> · {t.learningPath}</span>
                  </span>
                  <button type="button" onClick={() => void archive(t.id)} className="text-xs text-subtle hover:text-danger-text">
                    {c_practiceTasksPanel(de).archive}
                  </button>
                </div>
                {t.description && <p className="mt-1 text-muted">{t.description}</p>}
                <p className="mt-1 text-xs text-muted">
                  {fill(c_practiceTasksPanel(de).n0Of1Confirmed2, t.confirmed, t.assignees, t.submitted, t.rework)}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
    </>
  );
}
