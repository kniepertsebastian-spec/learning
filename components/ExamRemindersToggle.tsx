"use client";

import { c_examRemindersToggle } from "@/lib/i18n/components/examRemindersToggle";
import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { useLocale } from "@/lib/i18n";

/** Opt-out für die E-Mail-Erinnerungen des Prüfungsplaners (Voucher, Prüfungstermin, Wiederholungsversuch). */
export function ExamRemindersToggle({ initialOptOut }: { initialOptOut: boolean }) {
  const { locale } = useLocale();
  const de = locale === "de";
  const [optOut, setOptOut] = useState(initialOptOut);
  const [error, setError] = useState<null | "failed" | "network">(null);
  // Verhindert parallele Requests (Doppelklick); bewusst kein `disabled`, damit der Tastaturfokus erhalten bleibt.
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  async function change(next: boolean) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    // Nicht optimistisch: `optOut` ändert sich erst nach Bestätigung des Servers, der letzte bestätigte Wert bleibt sonst stehen.
    try {
      const res = await fetch("/api/account/exam-reminders", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ optOut: next }) });
      if (res.ok) setOptOut(next);
      else setError("failed");
    } catch {
      setError("network");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <Card data-testid="exam-reminders-toggle">
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={!optOut} aria-busy={busy} onChange={(e) => void change(!e.target.checked)} />
        <span>
          <span className="block font-medium">{c_examRemindersToggle(de).examPlannerEmailReminders}</span>
          <span className="text-subtle">{c_examRemindersToggle(de).voucherExpiringExamComingUp}</span>
        </span>
      </label>
      {error && <p role="alert" className="mt-2 text-sm text-danger-text">{error === "network" ? c_examRemindersToggle(de).networkError : c_examRemindersToggle(de).thatDidNotWork}</p>}
    </Card>
  );
}
