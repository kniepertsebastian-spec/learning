"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SearchField } from "@/components/ui/search-field";
import { cn } from "@/lib/cn";
import { useLocale } from "@/lib/i18n";
import { fmt } from "@/lib/quiz/keys";

export type AssignMember = { userId: string; name: string | null; email: string };
export type AssignPath = { id: string; name: string; kind: "general" | "internal" };
export type AssignGroup = { id: string; name: { de: string; en: string }; courses: number };

/** „Lernpfad zuweisen“ in drei Schritten: Personen → Lernpfad oder Kursgruppe → Frist. */
export function AssignDialog({
  open,
  onOpenChange,
  members,
  paths,
  groups,
  initialGroupId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  members: AssignMember[];
  paths: AssignPath[];
  groups: AssignGroup[];
  initialGroupId?: string | null;
}) {
  const { locale, t } = useLocale();
  const o = t.company_overview;
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState<{ type: "path" | "group"; id: string } | null>(initialGroupId ? { type: "group", id: initialGroupId } : null);
  const [due, setDue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const shown = members.filter((m) => `${m.name ?? ""} ${m.email}`.toLowerCase().includes(query.trim().toLowerCase()));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const steps = [o.wizPeople, o.wizCourses, o.wizDue];

  function next() {
    setError(null);
    if (step === 0 && selected.length === 0) return setError(o.wizNeedPeople);
    if (step === 1 && !target) return setError(o.wizNeedCourse);
    setStep((s) => s + 1);
  }

  function reset() {
    setStep(0);
    setSelected([]);
    setQuery("");
    setTarget(initialGroupId ? { type: "group", id: initialGroupId } : null);
    setDue("");
    setError(null);
    setDone(null);
  }

  async function submit() {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const url = target.type === "group" ? `/api/company/course-groups/${target.id}/assign` : "/api/company/assignments";
      const payload = target.type === "group" ? { userIds: selected, dueAt: due || null } : { userIds: selected, certificationId: target.id, dueAt: due || null };
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = (await res.json().catch(() => null)) as { assigned?: number | string[]; alreadyAssigned?: number | string[]; error?: string } | null;
      if (!res.ok) {
        setError(data?.error ?? o.wizFailed);
        return;
      }
      const count = (v: number | string[] | undefined) => (Array.isArray(v) ? v.length : (v ?? 0));
      setDone(fmt(o.wizDone, { a: count(data?.assigned), b: count(data?.alreadyAssigned) }));
      router.refresh();
    } catch {
      setError(o.wizFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent closeLabel={o.close} className="max-w-xl" data-testid="assign-dialog">
        <DialogTitle>{o.assign}</DialogTitle>
        <DialogDescription className="sr-only">{steps[step]}</DialogDescription>
        <ol className="mt-3 flex gap-1.5" aria-label={o.assign}>
          {steps.map((name, i) => (
            <li key={name} className="flex-1" aria-current={i === step ? "step" : undefined}>
              <span className={cn("block h-1 rounded-full", i <= step ? "bg-accent" : "bg-track")} />
              <span className={cn("mt-1 block text-xs", i === step ? "font-semibold" : "text-subtle")}>{i + 1} · {name}</span>
            </li>
          ))}
        </ol>

        {done ? (
          <div className="mt-6" role="status" data-testid="assign-done">
            <p className="font-medium">{done}</p>
            <div className="mt-4 flex justify-end"><Button onClick={() => onOpenChange(false)}>{o.close}</Button></div>
          </div>
        ) : (
          <>
            {step === 0 && (
              <div className="mt-4">
                <SearchField shortcutHint={false} placeholder={o.wizSearch} aria-label={o.wizSearch} value={query} onChange={(e) => setQuery(e.target.value)} />
                <div className="mt-2 flex items-center justify-between text-xs text-subtle">
                  <button type="button" className="font-medium text-link hover:underline" onClick={() => setSelected(shown.map((m) => m.userId))}>{o.wizSelectAll}</button>
                  <span>{fmt(o.wizSelected, { n: selected.length })}</span>
                </div>
                <ul className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto rounded-xl border border-border bg-surface-inset p-2">
                  {shown.map((m) => (
                    <li key={m.userId}>
                      <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm hover:bg-surface-2">
                        <input type="checkbox" className="h-4 w-4" checked={selected.includes(m.userId)} onChange={() => toggle(m.userId)} data-testid={`assign-person-${m.email}`} />
                        <span className="min-w-0 truncate">{m.name ? `${m.name} (${m.email})` : m.email}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {step === 1 && (
              <div className="mt-4 flex flex-col gap-4">
                {paths.length === 0 && groups.length === 0 && <p className="text-sm text-subtle">{o.noPaths}</p>}
                {groups.length > 0 && (
                  <fieldset>
                    <legend className="mb-1.5 text-xs font-semibold tracking-overline text-faint uppercase">{o.wizGroup}</legend>
                    <div className="flex flex-col gap-1.5">
                      {groups.map((g) => (
                        <label key={g.id} className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm", target?.type === "group" && target.id === g.id ? "border-accent bg-accent-soft" : "border-border-strong hover:bg-surface-2")}>
                          <input type="radio" name="target" className="h-4 w-4" checked={target?.type === "group" && target.id === g.id} onChange={() => setTarget({ type: "group", id: g.id })} data-testid={`assign-group-${g.id}`} />
                          <span className="min-w-0 flex-1 truncate">{g.name[locale]}</span>
                          <span className="text-xs text-faint">{fmt(o.groupCourses, { n: g.courses })}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
                {paths.length > 0 && (
                  <fieldset>
                    <legend className="mb-1.5 text-xs font-semibold tracking-overline text-faint uppercase">{o.wizPath}</legend>
                    <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
                      {paths.map((p) => (
                        <label key={p.id} className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm", target?.type === "path" && target.id === p.id ? "border-accent bg-accent-soft" : "border-border-strong hover:bg-surface-2")}>
                          <input type="radio" name="target" className="h-4 w-4" checked={target?.type === "path" && target.id === p.id} onChange={() => setTarget({ type: "path", id: p.id })} data-testid={`assign-path-${p.id}`} />
                          <span className="min-w-0 flex-1 truncate">{p.name}</span>
                          <span className="text-xs text-faint">{p.kind === "internal" ? o.kindInternal : o.kindGeneral}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="mt-4 space-y-3">
                <label className="block text-sm">
                  <span className="mb-1 block font-medium">{o.wizDueLabel}</span>
                  <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-full rounded-md border border-border-strong bg-control px-3 py-2" data-testid="assign-due" />
                </label>
                {target?.type === "group" && <p className="rounded-xl border border-border bg-surface-inset p-3 text-xs text-subtle">{o.wizGroupNote}</p>}
              </div>
            )}

            {error && <p role="alert" className="mt-3 text-sm text-danger-text">{error}</p>}
            <div className="mt-5 flex items-center justify-between gap-2">
              <Button variant="secondary" onClick={() => (step === 0 ? onOpenChange(false) : setStep(step - 1))}>{step === 0 ? o.cancel : o.wizBack}</Button>
              {step < 2 ? (
                <Button onClick={next} data-testid="assign-next">{o.wizNext}</Button>
              ) : (
                <Button onClick={() => void submit()} disabled={busy} data-testid="assign-submit">{o.wizAssign}</Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
