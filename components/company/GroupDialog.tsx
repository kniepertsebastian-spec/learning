"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { useLocale } from "@/lib/i18n";
import type { CourseCategoryColor } from "@/lib/server/db/schema";
import type { AssignPath } from "@/components/company/AssignDialog";

const COLORS: CourseCategoryColor[] = ["info", "mint", "warning", "danger", "violet"];
export const GROUP_DOT: Record<CourseCategoryColor, string> = { info: "bg-info", mint: "bg-mint", warning: "bg-warning", danger: "bg-danger", violet: "bg-violet" };
const fieldClass = "w-full rounded-md border border-border-strong bg-control px-3 py-2 text-sm";

export type EditableGroup = { id: string; name: { de: string; en: string }; color: CourseCategoryColor; certificationIds: string[] };

/** Kursgruppe anlegen, bearbeiten oder löschen (Firmen-Admin und Mentor). */
export function GroupDialog({ open, onOpenChange, group, paths }: { open: boolean; onOpenChange: (o: boolean) => void; group: EditableGroup | null; paths: AssignPath[] }) {
  const { t } = useLocale();
  const o = t.company_overview;
  const router = useRouter();
  const [name, setName] = useState(group?.name.de ?? "");
  const [nameEn, setNameEn] = useState(group?.name.en ?? "");
  const [color, setColor] = useState<CourseCategoryColor>(group?.color ?? "info");
  const [ids, setIds] = useState<string[]>(group?.certificationIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(group ? `/api/company/course-groups/${group.id}` : "/api/company/course-groups", {
        method: group ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: { de: name, en: nameEn || name }, color, certificationIds: ids }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? o.wizFailed);
        return;
      }
      onOpenChange(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!group) return;
    setBusy(true);
    const res = await fetch(`/api/company/course-groups/${group.id}`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) return setError(o.wizFailed);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={o.close} className="max-w-xl" data-testid="group-dialog">
        <DialogTitle>{group ? o.editGroup : o.newGroup}</DialogTitle>
        <DialogDescription>{o.newGroupHint}</DialogDescription>
        <div className="mt-4 space-y-3">
          <label className="block text-sm"><span className="mb-1 block font-medium">{o.gName}</span><input value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} data-testid="cgroup-name" /></label>
          <label className="block text-sm"><span className="mb-1 block font-medium">{o.gNameEn}</span><input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className={fieldClass} /></label>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">{o.gColor}</legend>
            <div className="flex gap-2">
              {COLORS.map((c) => (
                <button key={c} type="button" aria-pressed={color === c} aria-label={c} onClick={() => setColor(c)} className={cn("flex h-9 w-9 items-center justify-center rounded-full border", color === c ? "border-foreground" : "border-border-strong")}>
                  <span className={cn("h-4 w-4 rounded-full", GROUP_DOT[c])} />
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset>
            <legend className="mb-1 text-sm font-medium">{o.gCourses}</legend>
            <ul className="flex max-h-52 flex-col gap-1 overflow-y-auto rounded-xl border border-border bg-surface-inset p-2">
              {paths.map((p) => (
                <li key={p.id}>
                  <label className="flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm hover:bg-surface-2">
                    <input type="checkbox" className="h-4 w-4" checked={ids.includes(p.id)} onChange={() => setIds((s) => (s.includes(p.id) ? s.filter((x) => x !== p.id) : [...s, p.id]))} data-testid={`cgroup-course-${p.id}`} />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="text-xs text-faint">{p.kind === "internal" ? o.kindInternal : o.kindGeneral}</span>
                  </label>
                </li>
              ))}
              {paths.length === 0 && <li className="px-2 py-1 text-sm text-subtle">{o.noPaths}</li>}
            </ul>
          </fieldset>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-danger-text">{error}</p>}
        <div className="mt-5 flex items-center justify-between gap-2">
          {group ? (
            <div>
              <Button variant="ghost" onClick={() => void remove()} disabled={busy}>{o.gDelete}</Button>
              <p className="mt-1 text-xs text-faint">{o.gDeleteNote}</p>
            </div>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>{o.cancel}</Button>
            <Button onClick={() => void save()} disabled={busy || !name.trim() || ids.length === 0} data-testid="cgroup-save">{o.gSave}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
