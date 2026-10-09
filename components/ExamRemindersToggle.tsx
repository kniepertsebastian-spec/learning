"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { useLocale } from "@/lib/i18n";

/** Opt-out für die E-Mail-Erinnerungen des Prüfungsplaners (Voucher, Prüfungstermin, Wiederholungsversuch). */
export function ExamRemindersToggle({ initialOptOut }: { initialOptOut: boolean }) {
  const { locale } = useLocale();
  const de = locale === "de";
  const [optOut, setOptOut] = useState(initialOptOut);
  const [error, setError] = useState(false);
  async function change(next: boolean) {
    setError(false);
    const res = await fetch("/api/account/exam-reminders", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ optOut: next }) });
    if (res.ok) setOptOut(next);
    else setError(true);
  }
  return (
    <Card data-testid="exam-reminders-toggle">
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={!optOut} onChange={(e) => void change(!e.target.checked)} />
        <span>
          <span className="block font-medium">{de ? "E-Mail-Erinnerungen des Prüfungsplaners" : "Exam planner email reminders"}</span>
          <span className="text-subtle">{de ? "Voucher läuft ab, Prüfung steht bevor, Wiederholungsversuch enthalten." : "Voucher expiring, exam coming up, retake included."}</span>
        </span>
      </label>
      {error && <p role="alert" className="mt-2 text-sm text-danger-text">{de ? "Das hat nicht geklappt." : "That did not work."}</p>}
    </Card>
  );
}
