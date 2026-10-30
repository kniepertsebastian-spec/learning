"use client";

import { c_mandatoryRulesPanel } from "@/lib/i18n/components/mandatoryRulesPanel";
import { fill } from "@/lib/i18n/fill";
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
          ? c_mandatoryRulesPanel(de).ruleCreatedTheCourseIs
          : fill(c_mandatoryRulesPanel(de).ruleCreated0PeopleAssigned, data?.assigned ?? 0),
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
      <h2 className="text-lg font-medium">{c_mandatoryRulesPanel(de).mandatoryTraining}</h2>
      <p className="mt-1 text-sm text-muted">
        {c_mandatoryRulesPanel(de).aLearningPathBecomesMandatory}
      </p>

      <ul className="mt-4 flex flex-col gap-2">
        {rules.map((r) => (
          <li key={r.id} className="rounded-md border border-border p-3 text-sm" data-testid="mandatory-rule">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium break-words">{r.learningPath}</p>
                {r.pendingRelease && (
                  <p className="mt-0.5 inline-block rounded bg-warning-soft px-2 py-0.5 text-xs" data-testid="mandatory-pending">
                    {c_mandatoryRulesPanel(de).waitingForOurReleaseAssigned}
                  </p>
                )}
                <p className="text-muted">
                  {r.roles.map((x) => roleLabels[x]).join(", ")} · {r.departments.length > 0 ? r.departments.join(", ") : c_mandatoryRulesPanel(de).allDepartments} · {fill(c_mandatoryRulesPanel(de).n0Days, r.dueInDays)} ·{" "}
                  {r.reminderDaysBefore > 0 ? (fill(c_mandatoryRulesPanel(de).reminder0DaysBefore, r.reminderDaysBefore)) : c_mandatoryRulesPanel(de).noReminder} ·{" "}
                  {fill(c_mandatoryRulesPanel(de).escalationAfter0Days, r.escalateAfterDays)}
                </p>
                {r.allowPlacementSkip && (
                  <p className="text-muted" data-testid="mandatory-skip-allowed">{c_mandatoryRulesPanel(de).skippingViaPlacementTestAllowed}</p>
                )}
                {(r.repeatEveryMonths !== null || !r.applyOnChange) && (
                  <p className="text-muted" data-testid="mandatory-extras">
                    {r.repeatEveryMonths !== null && (fill(c_mandatoryRulesPanel(de).repeats0MonthsAfterCompletion, r.repeatEveryMonths))}
                    {r.repeatEveryMonths !== null && !r.applyOnChange ? " · " : ""}
                    {!r.applyOnChange && (c_mandatoryRulesPanel(de).notOnRoleDepartmentChange)}
                  </p>
                )}
                <p className="mt-1">
                  {r.completed}/{r.assigned} {c_mandatoryRulesPanel(de).passed}
                  {r.overdue > 0 && <span className="ml-2 text-danger-text">{r.overdue} {c_mandatoryRulesPanel(de).overdue}</span>}
                </p>
              </div>
              {canEdit && (
                <button type="button" className={btn} disabled={busy} onClick={() => void remove(r.id)}>
                  {c_mandatoryRulesPanel(de).deleteRule}
                </button>
              )}
            </div>
          </li>
        ))}
        {rules.length === 0 && <li className="text-sm text-muted">{c_mandatoryRulesPanel(de).noMandatoryTrainingYet}</li>}
      </ul>

      {canEdit && (
        <form onSubmit={(e) => void create(e)} className="mt-5 flex flex-col gap-3 border-t border-border pt-4">
          <h3 className="font-medium">{c_mandatoryRulesPanel(de).newRule}</h3>
          <select className={`${field} min-w-0`} value={pathId} onChange={(e) => setPathId(e.target.value)} required aria-label={c_mandatoryRulesPanel(de).learningPath}>
            <option value="">{c_mandatoryRulesPanel(de).chooseLearningPath}</option>
            <optgroup label={c_mandatoryRulesPanel(de).yourCoursesAndReleasedCourses}>
              {free.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </optgroup>
            {freeCatalog.length > 0 && (
              <optgroup label={c_mandatoryRulesPanel(de).fromOurCatalogNotYet}>
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
              {c_mandatoryRulesPanel(de).thisCourseIsNotYet}
            </p>
          )}
          <fieldset className="flex flex-wrap gap-4 text-sm">
            <legend className="mb-1">{c_mandatoryRulesPanel(de).appliesTo}</legend>
            {(["learner", "mentor", "company_admin"] as const).map((role) => (
              <label key={role} className="flex items-center gap-2">
                <input type="checkbox" checked={roles.includes(role)} onChange={(e) => setRoles((s) => (e.target.checked ? [...s, role] : s.filter((x) => x !== role)))} />
                {roleLabels[role]}
              </label>
            ))}
          </fieldset>
          {departments.length > 0 && (
            <fieldset className="flex flex-wrap gap-4 text-sm">
              <legend className="mb-1">{c_mandatoryRulesPanel(de).departmentsNoneSelectedAll}</legend>
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
              { label: c_mandatoryRulesPanel(de).deadlineDays, value: dueInDays, set: setDueInDays, min: 1, max: 365 },
              { label: c_mandatoryRulesPanel(de).reminderDaysBefore0Off, value: reminder, set: setReminder, min: 0, max: 60 },
              { label: c_mandatoryRulesPanel(de).escalateDaysAfterDeadline, value: escalate, set: setEscalate, min: 1, max: 60 },
            ].map((f) => (
              <label key={f.label} className="flex flex-col gap-1 text-sm">
                {f.label}
                <input type="number" className={field} value={f.value} min={f.min} max={f.max} onChange={(e) => f.set(Number(e.target.value))} required />
              </label>
            ))}
          </div>
          <label className="flex flex-col gap-1 text-sm sm:max-w-xs">
            {c_mandatoryRulesPanel(de).repetition}
            <select
              className={field}
              value={repeat === null ? "" : String(repeat)}
              onChange={(e) => {
                setRepeat(e.target.value === "" ? null : Number(e.target.value));
                setConfirmReset(false);
              }}
              aria-label={c_mandatoryRulesPanel(de).repetition}
            >
              <option value="">{c_mandatoryRulesPanel(de).onceNoRepetition}</option>
              {[6, 12, 24, 36].map((m) => (
                <option key={m} value={m}>
                  {fill(c_mandatoryRulesPanel(de).every0MonthsAfterCompletion, m)}
                </option>
              ))}
            </select>
          </label>
          {repeat !== null && (
            <div role="note" className="rounded-md border border-warning/40 bg-warning-soft p-3 text-sm" data-testid="repeat-warning">
              <p className="font-medium">{c_mandatoryRulesPanel(de).warningTheStatusWillBe}</p>
              <p className="mt-1">
                {fill(c_mandatoryRulesPanel(de).n0MonthsAfterCompletionA, repeat)}
              </p>
              <label className="mt-2 flex items-start gap-2">
                <input type="checkbox" checked={confirmReset} onChange={(e) => setConfirmReset(e.target.checked)} className="mt-0.5" />
                <span>{c_mandatoryRulesPanel(de).iHaveReadThisAnd}</span>
              </label>
            </div>
          )}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={applyOnChange} onChange={(e) => setApplyOnChange(e.target.checked)} className="mt-0.5" />
            <span>
              {c_mandatoryRulesPanel(de).alsoAssignWhenSomeoneChanges}
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={allowPlacementSkip} onChange={(e) => setAllowPlacementSkip(e.target.checked)} className="mt-0.5" data-testid="allow-placement-skip" />
            <span>
              {c_mandatoryRulesPanel(de).allowSkippingChaptersViaA}
            </span>
          </label>
          {error && (
            <p role="alert" className="text-sm text-danger-text">
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
              {c_mandatoryRulesPanel(de).createRule}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
