"use client";

import { useConfirm } from "@/components/ui/confirm-dialog";
import { useState } from "react";
import { useRouter } from "next/navigation";

export type ModuleRowView = {
  id: string;
  certificationId: string;
  learningPath: string;
  title: string;
  body: string;
  validUntil: string;
  state: "valid" | "expiring" | "expired";
  responsibleUserId: string | null;
  responsibleName: string | null;
  responsibleEmail: string | null;
};
type PersonOption = { userId: string; name: string | null; email: string };

const btn = "rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-background disabled:opacity-50";
const field = "rounded-md border border-border bg-background px-3 py-2 text-sm";

async function call(url: string, method: string, body?: unknown): Promise<string | null> {
  const res = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.error ?? `Fehler ${res.status}`;
}

const label = (p: PersonOption) => (p.name ? `${p.name} (${p.email})` : p.email);
const fmt = (iso: string, de: boolean) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(de ? "de-DE" : "en-GB", { timeZone: "UTC" });
const plusDays = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function ModuleForm({
  initial,
  paths,
  people,
  de,
  onDone,
  submitLabel,
  pathLocked,
}: {
  initial?: ModuleRowView;
  paths: { id: string; name: string }[];
  people: PersonOption[];
  de: boolean;
  onDone: () => void;
  submitLabel: string;
  pathLocked?: boolean;
}) {
  const router = useRouter();
  const [pathId, setPathId] = useState(initial?.certificationId ?? paths[0]?.id ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [validUntil, setValidUntil] = useState(initial?.validUntil ?? plusDays(180));
  const [responsible, setResponsible] = useState(initial?.responsibleUserId ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const err = initial
      ? await call(`/api/company/modules/${initial.id}`, "PATCH", { title, body, validUntil, ...(responsible ? { responsibleUserId: responsible } : {}) })
      : await call("/api/company/modules", "POST", { certificationId: pathId, title, body, validUntil, responsibleUserId: responsible || null });
    setBusy(false);
    setError(err);
    if (!err) {
      if (!initial) {
        setTitle("");
        setBody("");
      }
      onDone();
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-2" data-testid="module-form">
      <div className="flex flex-col gap-2 sm:flex-row">
        {!pathLocked && (
          <select value={pathId} onChange={(e) => setPathId(e.target.value)} aria-label={de ? "Lernpfad" : "Learning path"} data-testid="module-path" className={field}>
            {paths.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
        <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={200} placeholder={de ? "Titel, z. B. „Unser Ticket-Prozess“" : "Title, e.g. “Our ticket process”"} aria-label={de ? "Titel" : "Title"} data-testid="module-title" className={`${field} flex-1`} />
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} required maxLength={20000} rows={6} placeholder={de ? "Inhalt (Markdown möglich: Überschriften, Listen, Links)" : "Content (Markdown: headings, lists, links)"} aria-label={de ? "Inhalt" : "Content"} data-testid="module-body" className={field} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="flex items-center gap-2 text-sm">
          {de ? "Gültig bis" : "Valid until"}
          <input type="date" value={validUntil} min={plusDays(0)} onChange={(e) => setValidUntil(e.target.value)} required data-testid="module-valid-until" className={field} />
        </label>
        <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
          {de ? "Verantwortlich" : "Responsible"}
          <select value={responsible} onChange={(e) => setResponsible(e.target.value)} data-testid="module-responsible" className={`${field} min-w-0 flex-1`}>
            <option value="">{initial ? (de ? "unverändert" : "unchanged") : de ? "ich" : "me"}</option>
            {people.map((p) => (
              <option key={p.userId} value={p.userId}>{label(p)}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy || !title.trim() || !body.trim()} data-testid="module-submit" className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-50">
          {submitLabel}
        </button>
        {error && <p role="alert" data-testid="module-error" className="text-sm text-red-500">{error}</p>}
      </div>
    </form>
  );
}

function ModuleItem({ m, paths, people, currentUserId, de }: { m: ModuleRowView; paths: { id: string; name: string }[]; people: PersonOption[]; currentUserId: string; de: boolean }) {
  const [confirm, confirmDialog] = useConfirm();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [until, setUntil] = useState(plusDays(365));
  const [error, setError] = useState<string | null>(null);
  const mine = m.responsibleUserId === currentUserId;
  const badge =
    m.state === "expired"
      ? { text: de ? "Abgelaufen" : "Expired", cls: "bg-red-500/10 text-red-500" }
      : m.state === "expiring"
        ? { text: de ? "Läuft bald ab" : "Expiring soon", cls: "bg-amber-500/10 text-amber-600" }
        : { text: de ? "Gültig" : "Valid", cls: "bg-green-500/10 text-green-600" };

  async function extend() {
    setError(await call(`/api/company/modules/${m.id}`, "PATCH", { validUntil: until }));
    router.refresh();
  }
  async function archive() {
    if (!(await confirm(de ? "Modul archivieren? Es verschwindet für alle." : "Archive this module? It disappears for everyone."))) return;
    setError(await call(`/api/company/modules/${m.id}`, "DELETE"));
    router.refresh();
  }

  return (
    <>
    {confirmDialog}
    <li className="rounded-md border border-border bg-background p-3 text-sm" data-testid="module-item" data-state={m.state}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span className="font-medium">{m.title}</span>
          <span className="text-muted"> · {m.learningPath}</span>
        </span>
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${badge.cls}`} data-testid="module-state">{badge.text}</span>
      </div>
      <p className="mt-1 text-xs text-muted">
        {de ? "Gültig bis" : "Valid until"} {fmt(m.validUntil, de)} ·{" "}
        {m.responsibleUserId ? (
          <span data-testid="module-owner">{de ? "Verantwortlich" : "Responsible"}: {m.responsibleName ?? m.responsibleEmail}{mine ? (de ? " (du)" : " (you)") : ""}</span>
        ) : (
          <span className="text-red-500" data-testid="module-owner">{de ? "ohne Verantwortlichen" : "no one responsible"}</span>
        )}
      </p>
      {editing ? (
        <ModuleForm initial={m} paths={paths} people={people} de={de} pathLocked submitLabel={de ? "Speichern" : "Save"} onDone={() => setEditing(false)} />
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input type="date" value={until} min={plusDays(0)} onChange={(e) => setUntil(e.target.value)} aria-label={de ? "Neues Ablaufdatum" : "New expiry date"} data-testid="module-extend-date" className="rounded-md border border-border bg-surface px-2 py-1 text-xs" />
          <button type="button" onClick={() => void extend()} data-testid="module-extend" className={btn}>{de ? "Verlängern" : "Extend"}</button>
          <button type="button" onClick={() => setEditing(true)} className={btn}>{de ? "Bearbeiten" : "Edit"}</button>
          <button type="button" onClick={() => void archive()} className="text-xs text-subtle hover:text-red-500">{de ? "Archivieren" : "Archive"}</button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}
    </li>
    </>
  );
}

/**
 * Firmenmodule (Mentor, Firmen-Admin): Unterlagen zu Lernpfaden der Firma mit verantwortlicher Person und „gültig
 * bis“. Abgelaufene Module sind für Lernende verborgen, bis die verantwortliche Person verlängert.
 */
export function CompanyModulesPanel({
  modules,
  paths,
  people,
  currentUserId,
  locale,
}: {
  modules: ModuleRowView[];
  paths: { id: string; name: string }[];
  people: PersonOption[];
  currentUserId: string;
  locale: "de" | "en";
}) {
  const de = locale === "de";
  const expired = modules.filter((m) => m.state === "expired").length;
  const expiring = modules.filter((m) => m.state === "expiring").length;
  const orphaned = modules.filter((m) => !m.responsibleUserId).length;
  const myDue = modules.filter((m) => m.responsibleUserId === currentUserId && m.state !== "valid").length;

  return (
    <section className="rounded-lg border border-border bg-surface p-6" data-testid="company-modules-panel">
      <h2 className="text-lg font-medium">{de ? "Firmenmodule" : "Company modules"}</h2>
      <p className="mt-1 text-sm text-muted">
        {de
          ? "Eigene Unterlagen zu euren Lernpfaden (z. B. „Unser Ticket-Prozess“). Wer den Lernpfad hat, liest sie dort. Jedes Modul hat eine verantwortliche Person und ein „Gültig bis“; danach sehen Lernende den Inhalt nicht mehr, bis verlängert wird."
          : "Your own material for your learning paths. People with the path read it there. Each module has a responsible person and a “valid until” date; afterwards learners no longer see the content until it is extended."}
      </p>

      {(expired > 0 || expiring > 0 || orphaned > 0) && (
        <p className="mt-3 rounded-md bg-amber-500/10 px-3 py-2 text-sm" role="status" data-testid="module-warning">
          {[
            expired > 0 && (de ? `${expired} abgelaufen` : `${expired} expired`),
            expiring > 0 && (de ? `${expiring} laufen bald ab` : `${expiring} expiring soon`),
            orphaned > 0 && (de ? `${orphaned} ohne Verantwortlichen` : `${orphaned} without an owner`),
            myDue > 0 && (de ? `davon ${myDue} bei dir` : `${myDue} of them yours`),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      {paths.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-link">{de ? "Modul anlegen" : "Create module"}</summary>
          <ModuleForm paths={paths} people={people} de={de} submitLabel={de ? "Modul anlegen" : "Create module"} onDone={() => undefined} />
        </details>
      ) : (
        <p className="mt-3 text-sm text-muted">{de ? "Es gibt noch keinen Lernpfad, zu dem sich Module anlegen lassen." : "There is no learning path yet to add modules to."}</p>
      )}

      {modules.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2" data-testid="module-list">
          {modules.map((m) => (
            <ModuleItem key={m.id} m={m} paths={paths} people={people} currentUserId={currentUserId} de={de} />
          ))}
        </ul>
      )}
    </section>
  );
}
