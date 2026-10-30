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
  repeatEveryMonths: number | null;
  applyOnChange: boolean;
  allowPlacementSkip: boolean;
  departments: string[];
  /** Katalogkurs, der noch freigeschaltet werden muss. */
  pendingRelease: boolean;
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
  catalog = [],
  departments,
  canEdit,
  locale,
}: {
  rules: MandatoryRuleRow[];
  paths: { id: string; name: string }[];
  /** Kurse aus unserem Katalog, die noch nicht freigeschaltet sind. */
  catalog?: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  canEdit: boolean;
  locale: "de" | "en";
}) {
  const de = locale === "de";
  const router = useRouter();
  const roleLabels = de ? ROLE_DE : ROLE_EN;
  const free = paths.filter((p) => !rules.some((r) => r.learningPath === p.name));
  const freeCatalog = catalog.filter((p) => !rules.some((r) => r.learningPath === p.name) && !paths.some((x) => x.id === p.id));
  const [pathId, setPathId] = useState("");
  const [roles, setRoles] = useState<string[]>(["learner"]);
  const [dueInDays, setDueInDays] = useState(30);
  const [reminder, setReminder] = useState(7);
  const [escalate, setEscalate] = useState(3);
  const [depIds, setDepIds] = useState<string[]>([]);
  const [repeat, setRepeat] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [applyOnChange, setApplyOnChange] = useState(true);
  const [allowPlacementSkip, setAllowPlacementSkip] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    const { error: err, data } = await call("/api/company/mandatory", "POST", { certificationId: pathId, roles, dueInDays, reminderDaysBefore: reminder, escalateAfterDays: escalate, departmentIds: depIds, repeatEveryMonths: repeat, confirmRepeatReset: repeat !== null && confirmReset, applyOnChange, allowPlacementSkip });
    setBusy(false);
    setError(err);
    if (!err) {
      const waiting = catalog.some((c) => c.id === pathId);
      setNotice(
        waiting
          ? de ? "Pflicht angelegt. Der Kurs ist noch nicht für euch freigeschaltet; wir haben die Freischaltung angefragt. Sobald wir ihn freigeben, wird er automatisch zugewiesen." : "Rule created. The course is not yet released for you; we requested it. It will be assigned automatically once we release it."
          : de ? `Pflicht angelegt, ${data?.assigned ?? 0} Person(en) zugewiesen.` : `Rule created, ${data?.assigned ?? 0} people assigned.`,
      );
      setPathId("");
      setRepeat(null);
      setConfirmReset(false);
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
      <p className="mt-1 text-sm text-muted">
        {de
          ? "Ein Lernpfad wird für Rollen (und auf Wunsch Abteilungen) verpflichtend: vorhandene Mitglieder bekommen ihn sofort, neue beim Beitritt, jeweils mit Frist. Vor der Frist gibt es eine Erinnerung, danach eine Meldung an die Person und später eine Sammelmail an Mentoren und Firmen-Admins (nur mit eingerichtetem Mailversand)."
          : "A learning path becomes mandatory for roles: existing members get it immediately, new members when they join, each with a deadline. A reminder goes out before the deadline, a notice to the person after it and later a digest to mentors and admins (only with mail set up)."}
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {rules.map((r) => (
          <li key={r.id} className="rounded-md border border-border p-3 text-sm" data-testid="mandatory-rule">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium break-words">{r.learningPath}</p>
                {r.pendingRelease && (
                  <p className="mt-0.5 inline-block rounded bg-amber-500/15 px-2 py-0.5 text-xs" data-testid="mandatory-pending">
                    {de ? "Wartet auf Freischaltung durch uns – wird danach automatisch zugewiesen" : "Waiting for our release – assigned automatically afterwards"}
                  </p>
                )}
                <p className="text-muted">
                  {r.roles.map((x) => roleLabels[x]).join(", ")} · {r.departments.length > 0 ? r.departments.join(", ") : de ? "alle Abteilungen" : "all departments"} · {de ? `Frist ${r.dueInDays} Tage` : `${r.dueInDays} days`} ·{" "}
                  {r.reminderDaysBefore > 0 ? (de ? `Erinnerung ${r.reminderDaysBefore} Tage vorher` : `reminder ${r.reminderDaysBefore} days before`) : de ? "keine Erinnerung" : "no reminder"} ·{" "}
                  {de ? `Eskalation nach ${r.escalateAfterDays} Tagen` : `escalation after ${r.escalateAfterDays} days`}
                </p>
                {r.allowPlacementSkip && (
                  <p className="text-muted" data-testid="mandatory-skip-allowed">{de ? "Überspringen per Einstiegstest erlaubt" : "Skipping via placement test allowed"}</p>
                )}
                {(r.repeatEveryMonths !== null || !r.applyOnChange) && (
                  <p className="text-muted" data-testid="mandatory-extras">
                    {r.repeatEveryMonths !== null && (de ? `Wiederholung ${r.repeatEveryMonths} Monate nach dem Abschluss (Status wird dann zurückgesetzt)` : `Repeats ${r.repeatEveryMonths} months after completion (status is reset)`)}
                    {r.repeatEveryMonths !== null && !r.applyOnChange ? " · " : ""}
                    {!r.applyOnChange && (de ? "nicht bei Rollen-/Abteilungswechsel" : "not on role/department change")}
                  </p>
                )}
                <p className="mt-1">
                  {r.completed}/{r.assigned} {de ? "bestanden" : "passed"}
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
        {rules.length === 0 && <li className="text-sm text-muted">{de ? "Noch keine Pflichtschulung." : "No mandatory training yet."}</li>}
      </ul>

      {canEdit && (
        <form onSubmit={(e) => void create(e)} className="mt-5 flex flex-col gap-3 border-t border-border pt-4">
          <h3 className="font-medium">{de ? "Neue Pflicht" : "New rule"}</h3>
          <select className={`${field} min-w-0`} value={pathId} onChange={(e) => setPathId(e.target.value)} required aria-label={de ? "Lernpfad" : "Learning path"}>
            <option value="">{de ? "Lernpfad wählen …" : "Choose learning path …"}</option>
            <optgroup label={de ? "Eure Kurse und freigeschaltete Kurse" : "Your courses and released courses"}>
              {free.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
            {freeCatalog.length > 0 && (
              <optgroup label={de ? "Aus unserem Katalog (noch nicht freigeschaltet)" : "From our catalog (not yet released)"}>
                {freeCatalog.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {catalog.some((c) => c.id === pathId) && (
            <p className="text-xs text-muted" data-testid="mandatory-catalog-hint">
              {de
                ? "Dieser Kurs ist noch nicht für euch freigeschaltet. Wir fragen ihn damit bei uns an; die Pflicht wirkt, sobald wir ihn freigeben."
                : "This course is not yet released for you. This requests it from us; the rule takes effect once we release it."}
            </p>
          )}
          <fieldset className="flex flex-wrap gap-4 text-sm">
            <legend className="mb-1">{de ? "Gilt für" : "Applies to"}</legend>
            {(["learner", "mentor", "company_admin"] as const).map((role) => (
              <label key={role} className="flex items-center gap-2">
                <input type="checkbox" checked={roles.includes(role)} onChange={(e) => setRoles((s) => (e.target.checked ? [...s, role] : s.filter((x) => x !== role)))} />
                {roleLabels[role]}
              </label>
            ))}
          </fieldset>
          {departments.length > 0 && (
            <fieldset className="flex flex-wrap gap-4 text-sm">
              <legend className="mb-1">{de ? "Abteilungen (keine Auswahl = alle)" : "Departments (none selected = all)"}</legend>
              {departments.map((d) => (
                <label key={d.id} className="flex items-center gap-2">
                  <input type="checkbox" checked={depIds.includes(d.id)} onChange={(e) => setDepIds((x) => (e.target.checked ? [...x, d.id] : x.filter((y) => y !== d.id)))} />
                  {d.name}
                </label>
              ))}
            </fieldset>
          )}
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
          <label className="flex flex-col gap-1 text-sm sm:max-w-xs">
            {de ? "Wiederholung" : "Repetition"}
            <select
              className={field}
              value={repeat === null ? "" : String(repeat)}
              onChange={(e) => {
                setRepeat(e.target.value === "" ? null : Number(e.target.value));
                setConfirmReset(false);
              }}
              aria-label={de ? "Wiederholung" : "Repetition"}
            >
              <option value="">{de ? "einmalig, keine Wiederholung" : "once, no repetition"}</option>
              {[6, 12, 24, 36].map((m) => (
                <option key={m} value={m}>
                  {de ? `alle ${m} Monate (nach dem Abschluss)` : `every ${m} months (after completion)`}
                </option>
              ))}
            </select>
          </label>
          {repeat !== null && (
            <div role="note" className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm" data-testid="repeat-warning">
              <p className="font-medium">{de ? "Achtung: Der Status wird zurückgesetzt" : "Warning: the status will be reset"}</p>
              <p className="mt-1">
                {de
                  ? `${repeat} Monate nach dem Abschluss beginnt für jede Person eine neue Runde: Der Status springt von „abgeschlossen“ zurück auf „zugewiesen“, es gibt eine neue Frist und neue Erinnerungen. Als abgeschlossen zählt dann nur, was in der neuen Runde erneut nachgewiesen wird (Lektionen erneut durcharbeiten bzw. Lernziele erneut üben). Der letzte Abschluss bleibt vermerkt. In der Statusübersicht wirkt die Person bis dahin wieder als „offen“, auch wenn sie den Lernpfad früher bestanden hat.`
                  : `${repeat} months after completion a new round starts for each person: the status goes from “completed” back to “assigned”, with a new deadline and reminders. Only what is shown again in the new round counts as completed. The last completion is kept on record. Until then the status overview shows the person as open again.`}
              </p>
              <label className="mt-2 flex items-start gap-2">
                <input type="checkbox" checked={confirmReset} onChange={(e) => setConfirmReset(e.target.checked)} className="mt-0.5" />
                <span>{de ? "Ich habe das gelesen und will die Wiederholung mit Statusrücksetzung." : "I have read this and want the repetition with status reset."}</span>
              </label>
            </div>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={applyOnChange} onChange={(e) => setApplyOnChange(e.target.checked)} className="mt-0.5" />
            <span>
              {de
                ? "Auch zuweisen, wenn jemand Rolle oder Abteilung wechselt und dadurch unter diese Regel fällt (sonst nur beim Anlegen der Regel und beim Beitritt)."
                : "Also assign when someone changes role or department and falls under this rule (otherwise only when the rule is created and on joining)."}
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={allowPlacementSkip} onChange={(e) => setAllowPlacementSkip(e.target.checked)} className="mt-0.5" data-testid="allow-placement-skip" />
            <span>
              {de
                ? "Kapitel per Einstiegstest überspringen erlauben. Übersprungene Lektionen zählen nicht als abgeschlossen; Sie sehen weiter nur den Status (abgeschlossen ja/nein)."
                : "Allow skipping chapters via a placement test. Skipped lessons do not count as completed; you still only see the status (completed yes/no)."}
            </span>
          </label>
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
            <button type="submit" className={btn} disabled={busy || !pathId || roles.length === 0 || (repeat !== null && !confirmReset)}>
              {de ? "Pflicht anlegen" : "Create rule"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
