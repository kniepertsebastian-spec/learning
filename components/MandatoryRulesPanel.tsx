"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type MandatoryRuleRow = {
  id: string;
  learningPath: string;
  roles: ("company_admin" | "mentor" | "learner")[];
  dueInDays: number;
  reminderDaysBefore: number;
  escalateAfterDays: number;
  assigned: number;
  completed: number;
  overdue: number;
};

const btn = "rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-background disabled:opacity-50";
const field = "rounded-md border border-border bg-background px-3 py-2 text-sm";
const ROLE_DE = { company_admin: "Firmen-Admins", mentor: "Mentoren", learner: "Lernende" } as const;
const ROLE_EN = { company_admin: "Company admins", mentor: "Mentors", learner: "Learners" } as const;

async function call(url: string, method: string, body?: unknown): Promise<{ error: string | null; data: Record<string, unknown> | null }> {
  const res = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  return res.ok ? { error: null, data } : { error: data?.error ?? `Fehler ${res.status}`, data: null };
}

/**
 * Pflichtschulungen: Ein Lernpfad wird für Rollen verpflichtend (mit Frist in Tagen). Beim Anlegen bekommen alle
 * vorhandenen Mitglieder dieser Rollen den Lernpfad, neue Mitglieder beim Beitritt. Erinnerung und Eskalation
 * laufen täglich per Mail. Nur der Firmen-Admin legt an und löscht; der Mentor sieht den Stand.
 */
export function MandatoryRulesPanel({
  rules,
  paths,
  canEdit,
  locale,
}: {
  rules: MandatoryRuleRow[];
  paths: { id: string; name: string }[];
  canEdit: boolean;
  locale: "de" | "en";
}) {
  const de = locale === "de";
  const router = useRouter();
  const roleLabels = de ? ROLE_DE : ROLE_EN;
  const free = paths.filter((p) => !rules.some((r) => r.learningPath === p.name));
  const [pathId, setPathId] = useState("");
  const [roles, setRoles] = useState<string[]>(["learner"]);
  const [dueInDays, setDueInDays] = useState(30);
  const [reminder, setReminder] = useState(7);
  const [escalate, setEscalate] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    const { error: err, data } = await call("/api/company/mandatory", "POST", { certificationId: pathId, roles, dueInDays, reminderDaysBefore: reminder, escalateAfterDays: escalate });
    setBusy(false);
    setError(err);
    if (!err) {
      setNotice(de ? `Pflicht angelegt, ${data?.assigned ?? 0} Person(en) zugewiesen.` : `Rule created, ${data?.assigned ?? 0} people assigned.`);
      setPathId("");
      router.refresh();
    }
  }
  async function remove(id: string) {
    setBusy(true);
    const { error: err } = await call(`/api/company/mandatory/${id}`, "DELETE");
    setBusy(false);
    setError(err);
    if (!err) router.refresh();
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-6" data-testid="mandatory-panel">
      <h2 className="text-lg font-medium">{de ? "Pflichtschulungen" : "Mandatory training"}</h2>
      <p className="mt-1 text-sm text-foreground/70">
        {de
          ? "Ein Lernpfad wird für Rollen verpflichtend: vorhandene Mitglieder bekommen ihn sofort, neue beim Beitritt, jeweils mit Frist. Vor der Frist gibt es eine Erinnerung, danach eine Meldung an die Person und später eine Sammelmail an Mentoren und Firmen-Admins (nur mit eingerichtetem Mailversand)."
          : "A learning path becomes mandatory for roles: existing members get it immediately, new members when they join, each with a deadline. A reminder goes out before the deadline, a notice to the person after it and later a digest to mentors and admins (only with mail set up)."}
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {rules.map((r) => (
          <li key={r.id} className="rounded-md border border-border p-3 text-sm" data-testid="mandatory-rule">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium break-words">{r.learningPath}</p>
                <p className="text-foreground/70">
                  {r.roles.map((x) => roleLabels[x]).join(", ")} · {de ? `Frist ${r.dueInDays} Tage` : `${r.dueInDays} days`} ·{" "}
                  {r.reminderDaysBefore > 0 ? (de ? `Erinnerung ${r.reminderDaysBefore} Tage vorher` : `reminder ${r.reminderDaysBefore} days before`) : de ? "keine Erinnerung" : "no reminder"} ·{" "}
                  {de ? `Eskalation nach ${r.escalateAfterDays} Tagen` : `escalation after ${r.escalateAfterDays} days`}
                </p>
                <p className="mt-1">
                  {r.completed}/{r.assigned} {de ? "abgeschlossen" : "completed"}
                  {r.overdue > 0 && <span className="ml-2 text-red-600">{r.overdue} {de ? "überfällig" : "overdue"}</span>}
                </p>
              </div>
              {canEdit && (
                <button type="button" className={btn} disabled={busy} onClick={() => void remove(r.id)}>
                  {de ? "Regel löschen" : "Delete rule"}
                </button>
              )}
            </div>
          </li>
        ))}
        {rules.length === 0 && <li className="text-sm text-foreground/70">{de ? "Noch keine Pflichtschulung." : "No mandatory training yet."}</li>}
      </ul>

      {canEdit && (
        <form onSubmit={(e) => void create(e)} className="mt-5 flex flex-col gap-3 border-t border-border pt-4">
          <h3 className="font-medium">{de ? "Neue Pflicht" : "New rule"}</h3>
          <select className={`${field} min-w-0`} value={pathId} onChange={(e) => setPathId(e.target.value)} required aria-label={de ? "Lernpfad" : "Learning path"}>
            <option value="">{de ? "Lernpfad wählen …" : "Choose learning path …"}</option>
            {free.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <fieldset className="flex flex-wrap gap-4 text-sm">
            <legend className="mb-1">{de ? "Gilt für" : "Applies to"}</legend>
            {(["learner", "mentor", "company_admin"] as const).map((role) => (
              <label key={role} className="flex items-center gap-2">
                <input type="checkbox" checked={roles.includes(role)} onChange={(e) => setRoles((s) => (e.target.checked ? [...s, role] : s.filter((x) => x !== role)))} />
                {roleLabels[role]}
              </label>
            ))}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              { label: de ? "Frist (Tage)" : "Deadline (days)", value: dueInDays, set: setDueInDays, min: 1, max: 365 },
              { label: de ? "Erinnerung (Tage vorher, 0 = aus)" : "Reminder (days before, 0 = off)", value: reminder, set: setReminder, min: 0, max: 60 },
              { label: de ? "Eskalation (Tage nach Frist)" : "Escalate (days after deadline)", value: escalate, set: setEscalate, min: 1, max: 60 },
            ].map((f) => (
              <label key={f.label} className="flex flex-col gap-1 text-sm">
                {f.label}
                <input type="number" className={field} value={f.value} min={f.min} max={f.max} onChange={(e) => f.set(Number(e.target.value))} required />
              </label>
            ))}
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm" data-testid="mandatory-notice">
              {notice}
            </p>
          )}
          <div>
            <button type="submit" className={btn} disabled={busy || !pathId || roles.length === 0}>
              {de ? "Pflicht anlegen" : "Create rule"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
