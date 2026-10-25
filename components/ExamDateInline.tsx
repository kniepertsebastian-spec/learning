"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check, Loader2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EXAM_DATE_HINT } from "@/lib/study/exam-date-hint";
import { DEFAULT_GOAL, type StudyGoalState } from "@/components/StudyGoalPanel";
import type { Locale } from "@/lib/types";

/**
 * Prüfungstermin direkt im Kurs-Dashboard ändern: ein Klick auf „Ändern“, Datum wählen, speichern. Der Rest des Lernziels bleibt wie
 * gespeichert (das Profil wird vollständig überschrieben, daher gehen die übrigen Werte mit). Der Termin ist ein Richtwert, das steht dabei.
 */
export function ExamDateInline({ certId, locale, goal }: { certId: string; locale: Locale; goal: StudyGoalState | null }) {
  const router = useRouter();
  const de = locale === "de";
  const current = goal?.examDate ?? null;
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(current ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: string | null) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/study-profile/${certId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(goal ?? DEFAULT_GOAL), examDate: next }),
      });
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? `Status ${response.status}`);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : de ? "Speichern fehlgeschlagen." : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  const shown = current ? new Date(`${current}T00:00:00Z`).toLocaleDateString(de ? "de-DE" : "en-GB", { timeZone: "UTC" }) : null;
  return (
    <div className="mb-6 rounded-lg border border-border bg-surface px-4 py-3" data-testid="exam-date-inline">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <CalendarClock className="h-4 w-4 text-link" aria-hidden="true" />
        <span className="font-medium">{de ? "Prüfungstermin" : "Exam date"}:</span>
        {editing ? (
          <>
            <input type="date" value={value} onChange={(e) => setValue(e.target.value)} aria-label={de ? "Prüfungstermin" : "Exam date"} className="rounded-md border border-border bg-background px-2 py-1 text-sm" data-testid="exam-date-input" />
            <Button size="sm" onClick={() => void save(value || null)} disabled={saving} iconLeft={saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />} data-testid="exam-date-save">
              {de ? "Speichern" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setValue(current ?? ""); }} disabled={saving}>{de ? "Abbrechen" : "Cancel"}</Button>
          </>
        ) : (
          <>
            <span data-testid="exam-date-current">{shown ?? (de ? "noch keiner gesetzt" : "not set yet")}</span>
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)} iconLeft={<Pencil className="h-3.5 w-3.5" aria-hidden="true" />} data-testid="exam-date-edit">
              {shown ? (de ? "Ändern" : "Change") : de ? "Termin setzen" : "Set a date"}
            </Button>
          </>
        )}
      </div>
      <p className="mt-2 text-xs text-subtle" data-testid="exam-date-hint">{EXAM_DATE_HINT[locale]}</p>
      {error && <p role="alert" className="mt-2 text-xs text-danger-text">{error}</p>}
    </div>
  );
}
