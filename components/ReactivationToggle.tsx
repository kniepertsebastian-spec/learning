"use client";

import { c_reactivationToggle } from "@/lib/i18n/components/reactivationToggle";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { useLocale } from "@/lib/i18n";

/** Opt-out für die Mails „Schön, dass du da bist“ nach längerer Pause. */
export function ReactivationToggle({ initialOptOut }: { initialOptOut: boolean }) {
  const { locale } = useLocale();
  const de = locale === "de";
  const [optOut, setOptOut] = useState(initialOptOut);
  const [error, setError] = useState(false);
  async function change(next: boolean) {
    setError(false);
    const res = await fetch("/api/account/reactivation", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ optOut: next }) });
    if (res.ok) setOptOut(next);
    else setError(true);
  }
  return (
    <Card data-testid="reactivation-toggle">
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={!optOut} onChange={(e) => void change(!e.target.checked)} />
        <span>
          <span className="block font-medium">{c_reactivationToggle(de).friendlyNudgeAfterABreak}</span>
          <span className="text-subtle">{c_reactivationToggle(de).aShortEmailAfter5}</span>
        </span>
      </label>
      {error && <p role="alert" className="mt-2 text-sm text-danger-text">{c_reactivationToggle(de).thatDidNotWork}</p>}
    </Card>
  );
}
