"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type OnboardingPersonView = {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  status: "open" | "discussed" | "reviewed";
  coursesDone: number;
  coursesTotal: number;
};
export type OnboardingPlanRow = {
  id: string;
  name: string;
  description: string | null;
  mentor: { userId: string; name: string | null; email: string } | null;
  courses: { id: string; name: string }[];
  people: OnboardingPersonView[];
};
type PersonOption = { userId: string; name: string | null; email: string };

const btn = "rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-background disabled:opacity-50";
const field = "rounded-md border border-border bg-background px-3 py-2 text-sm";
const label = (p: PersonOption) => (p.name ? `${p.name} (${p.email})` : p.email);

async function call(url: string, method: string, body?: unknown): Promise<string | null> {
  const res = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.ok) return null;
  const data = await res.json().catch(() => null);
  return data?.error ?? `Fehler ${res.status}`;
}

const STATUS_DE = { open: "offen", discussed: "besprochen", reviewed: "geprüft" } as const;
const STATUS_EN = { open: "open", discussed: "discussed", reviewed: "reviewed" } as const;

function PlanCard({ plan, members, canSetStatus, de }: { plan: OnboardingPlanRow; members: PersonOption[]; canSetStatus: (plan: OnboardingPlanRow) => boolean; de: boolean }) {
  const router = useRouter();
  const [pick, setPick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const taken = new Set(plan.people.map((p) => p.userId));
  const candidates = members.filter((m) => !taken.has(m.userId));

  async function run(fn: () => Promise<string | null>) {
    setBusy(true);
    const err = await fn();
    setBusy(false);
    setError(err);
    if (!err) router.refresh();
  }

  return (
    <li className="rounded-md border border-border p-4" data-testid="onboarding-plan">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-medium">{plan.name}</h3>
          <p className="text-sm text-muted">
            {de ? "Mentor: " : "Mentor: "}
            {plan.mentor ? label(plan.mentor) : de ? "niemand (bitte neu zuordnen)" : "nobody (please reassign)"}
          </p>
          {plan.description && <p className="mt-1 whitespace-pre-line text-sm text-text-2">{plan.description}</p>}
        </div>
        <button type="button" className={btn} disabled={busy} onClick={() => void run(() => call(`/api/company/onboardings/${plan.id}`, "DELETE"))}>
          {de ? "Plan archivieren" : "Archive plan"}
        </button>
      </div>
      <p className="mt-2 text-sm">
        <span className="font-medium">{de ? "Benötigte Kurse: " : "Required courses: "}</span>
        {plan.courses.map((c) => c.name).join(", ")}
      </p>

      {plan.people.length > 0 && (
        <ul className="mt-3 divide-y divide-border text-sm">
          {plan.people.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2" data-testid="onboarding-person">
              <span className="min-w-0 flex-1 break-words">{label(p)}</span>
              <span className="text-muted">
                {p.coursesDone}/{p.coursesTotal} {de ? "Kurse" : "courses"}
              </span>
              <span className="rounded-full border border-border px-2 py-0.5 text-xs" data-testid="onboarding-status">
                {(de ? STATUS_DE : STATUS_EN)[p.status]}
              </span>
              {canSetStatus(plan) && p.status !== "reviewed" && (
                <span className="flex gap-2">
                  {p.status === "open" && (
                    <button type="button" className={btn} disabled={busy} onClick={() => void run(() => call(`/api/company/onboarding-status/${p.id}`, "PATCH", { status: "discussed" }))}>
                      {de ? "Besprochen" : "Mark discussed"}
                    </button>
                  )}
                  <button
                    type="button"
                    className={btn}
                    disabled={busy || p.coursesDone < p.coursesTotal}
                    title={p.coursesDone < p.coursesTotal ? (de ? "Erst wenn alle Kurse abgeschlossen sind" : "Only once all courses are completed") : undefined}
                    onClick={() => void run(() => call(`/api/company/onboarding-status/${p.id}`, "PATCH", { status: "reviewed" }))}
                  >
                    {de ? "Geprüft" : "Mark reviewed"}
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select value={pick} onChange={(e) => setPick(e.target.value)} className={`${field} min-w-0 max-w-full`} aria-label={de ? "Person für dieses Onboarding" : "Person for this onboarding"}>
          <option value="">{de ? "Person wählen …" : "Choose person …"}</option>
          {candidates.map((m) => (
            <option key={m.userId} value={m.userId}>
              {label(m)}
            </option>
          ))}
        </select>
        <button type="button" className={btn} disabled={busy || !pick} onClick={() => void run(async () => { const err = await call(`/api/company/onboardings/${plan.id}`, "POST", { userIds: [pick] }); if (!err) setPick(""); return err; })}>
          {de ? "Onboarding starten" : "Start onboarding"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </li>
  );
}

/**
 * Onboardings: Pläne wie „Operations Infrastruktur“ mit benötigten Kursen und Mentor; Personen starten das Onboarding
 * (alle Kurse werden zugewiesen), der Mentor setzt „besprochen“ bzw. „geprüft“.
 */
export function OnboardingsPanel({
  plans,
  paths,
  mentors,
  members,
  currentUserId,
  isAdmin,
  locale,
}: {
  plans: OnboardingPlanRow[];
  paths: { id: string; name: string }[];
  mentors: PersonOption[];
  members: PersonOption[];
  currentUserId: string;
  isAdmin: boolean;
  locale: "de" | "en";
}) {
  const de = locale === "de";
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mentor, setMentor] = useState(currentUserId);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const err = await call("/api/company/onboardings", "POST", { name, description: description || null, mentorUserId: mentor || null, certificationIds: selected });
    setBusy(false);
    setError(err);
    if (!err) {
      setName("");
      setDescription("");
      setSelected([]);
      router.refresh();
    }
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-6" data-testid="onboardings-panel">
      <h2 className="text-lg font-medium">Onboarding</h2>
      <p className="mt-1 text-sm text-muted">
        {de
          ? "Lege fest, welche Kurse neue Personen absolvieren müssen und wer sie als Mentor begleitet. Beim Start werden alle Kurse zugewiesen; der Mentor setzt den Stand „besprochen“ und, sobald alle Kurse abgeschlossen sind, „geprüft“."
          : "Define which courses new people must complete and who mentors them. Starting an onboarding assigns all courses; the mentor marks it “discussed” and, once every course is completed, “reviewed”."}
      </p>

      <ul className="mt-4 flex flex-col gap-3">
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} members={members} canSetStatus={(p) => isAdmin || p.mentor?.userId === currentUserId} de={de} />
        ))}
        {plans.length === 0 && <li className="text-sm text-muted">{de ? "Noch kein Onboarding-Plan." : "No onboarding plan yet."}</li>}
      </ul>

      <form onSubmit={(e) => void create(e)} className="mt-6 flex flex-col gap-3 border-t border-border pt-4">
        <h3 className="font-medium">{de ? "Neuer Plan" : "New plan"}</h3>
        <input className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required placeholder={de ? "Name, z. B. Operations Infrastruktur" : "Name, e.g. Operations Infrastructure"} aria-label="Name" />
        <textarea className={field} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={2} placeholder={de ? "Beschreibung (optional)" : "Description (optional)"} aria-label={de ? "Beschreibung" : "Description"} />
        <label className="flex flex-col gap-1 text-sm">
          {de ? "Mentor" : "Mentor"}
          <select className={`${field} min-w-0`} value={mentor} onChange={(e) => setMentor(e.target.value)}>
            {mentors.map((m) => (
              <option key={m.userId} value={m.userId}>
                {label(m)}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="flex flex-col gap-1 text-sm">
          <legend className="mb-1">{de ? "Benötigte Kurse" : "Required courses"}</legend>
          {paths.length === 0 && <span className="text-muted">{de ? "Noch keine zuweisbaren Kurse." : "No assignable courses yet."}</span>}
          {paths.map((p) => (
            <label key={p.id} className="flex items-center gap-2">
              <input type="checkbox" checked={selected.includes(p.id)} onChange={(e) => setSelected((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))} />
              <span className="min-w-0 break-words">{p.name}</span>
            </label>
          ))}
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <div>
          <button type="submit" className={btn} disabled={busy || selected.length === 0 || name.trim().length < 3}>
            {de ? "Plan anlegen" : "Create plan"}
          </button>
        </div>
      </form>
    </section>
  );
}
