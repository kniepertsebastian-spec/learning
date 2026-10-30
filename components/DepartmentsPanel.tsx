"use client";

import { c_departmentsPanel } from "@/lib/i18n/components/departmentsPanel";
import { fill } from "@/lib/i18n/fill";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Member = { userId: string; name: string | null; email: string; role: "company_admin" | "mentor" | "learner"; departmentId: string | null };
type Department = { id: string; name: string; members: number };

const btn = "rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-background disabled:opacity-50";
const field = "rounded-md border border-border bg-background px-3 py-2 text-sm";

async function call(url: string, method: string, body?: unknown): Promise<{ error: string | null; data: Record<string, unknown> | null }> {
  const res = await fetch(url, { method, headers: body === undefined ? undefined : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  return res.ok ? { error: null, data } : { error: data?.error ?? `Fehler ${res.status}`, data: null };
}

/** Abteilungen der Firma anlegen und Mitglieder zuordnen. Pflichtregeln können auf Abteilungen eingeschränkt werden. */
export function DepartmentsPanel({ departments, members, locale }: { departments: Department[]; members: Member[]; locale: "de" | "en" }) {
  const de = locale === "de";
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<{ error: string | null; data: Record<string, unknown> | null }>) {
    setBusy(true);
    setNotice(null);
    const res = await fn();
    setBusy(false);
    setError(res.error);
    if (!res.error) {
      const assigned = Number(res.data?.assigned ?? 0);
      if (assigned > 0) setNotice(fill(c_departmentsPanel(de).mandatoryTraining0LearningPath, assigned));
      router.refresh();
    }
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-6" data-testid="departments-panel">
      <h2 className="text-lg font-medium">{c_departmentsPanel(de).departments}</h2>
      <p className="mt-1 text-sm text-muted">
        {c_departmentsPanel(de).assignMembersToDepartmentsMandatory}
      </p>

      <form
        className="mt-4 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(async () => {
            const r = await call("/api/company/departments", "POST", { name });
            if (!r.error) setName("");
            return r;
          });
        }}
      >
        <input className={`${field} min-w-0 flex-1`} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={c_departmentsPanel(de).newDepartmentEGOperations} aria-label={c_departmentsPanel(de).departmentName} />
        <button type="submit" className={btn} disabled={busy || name.trim().length < 2}>
          {c_departmentsPanel(de).create}
        </button>
      </form>

      {departments.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2" data-testid="department-list">
          {departments.map((d) => (
            <li key={d.id} className="flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm">
              <span>
                {d.name} ({d.members})
              </span>
              <button type="button" className="text-danger-text hover:underline" disabled={busy} onClick={() => void run(() => call(`/api/company/departments/${d.id}`, "DELETE"))} aria-label={`${d.name} ${c_departmentsPanel(de).delete}`}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <ul className="mt-4 divide-y divide-border text-sm">
        {members.map((m) => (
          <li key={m.userId} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="min-w-0 break-words">{m.name ? `${m.name} (${m.email})` : m.email}</span>
            <select
              className={`${field} min-w-0`}
              value={m.departmentId ?? ""}
              disabled={busy}
              onChange={(e) => void run(() => call(`/api/company/department-members/${m.userId}`, "PUT", { departmentId: e.target.value || null }))}
              aria-label={`${c_departmentsPanel(de).departmentOf} ${m.email}`}
            >
              <option value="">{c_departmentsPanel(de).noDepartment}</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger-text">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mt-2 text-sm" data-testid="department-notice">
          {notice}
        </p>
      )}
    </section>
  );
}
