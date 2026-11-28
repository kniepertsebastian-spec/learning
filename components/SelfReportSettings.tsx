"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { c_selfReportSettings } from "@/lib/i18n/components/selfReportSettings";
import { fill } from "@/lib/i18n/fill";
import type { SelfReportKind } from "@/lib/self-reports";

export interface SelfReportSettingView {
  kind: SelfReportKind;
  enabled: boolean;
  /** ISO-Zeitpunkt, bis zu dem die Frage nach dreimaligem Überspringen pausiert. */
  pausedUntil: string | null;
}

/** Schalter je Art von Selbstauskunft unter „Wie ich lerne“ (Aufgabe 17). */
export function SelfReportSettings({ initial, locale }: { initial: SelfReportSettingView[]; locale: "de" | "en" }) {
  const t = c_selfReportSettings(locale);
  const [settings, setSettings] = useState(initial);
  const [error, setError] = useState(false);
  async function change(kind: SelfReportKind, enabled: boolean) {
    setError(false);
    const res = await fetch("/api/self-reports/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, enabled }) });
    if (res.ok) setSettings((list) => list.map((s) => (s.kind === kind ? { ...s, enabled } : s)));
    else setError(true);
  }
  const date = (iso: string) => new Date(iso).toLocaleDateString(locale === "de" ? "de-DE" : "en-GB");
  return (
    <Card data-testid="self-report-settings" className="mt-6">
      <h2 className="text-lg font-medium">{t.questionsForYou}</h2>
      <p className="mt-1 text-sm text-subtle">{t.intro}</p>
      <ul className="mt-3 flex flex-col gap-3">
        {settings.map((s) => (
          <li key={s.kind}>
            <label className="flex min-h-11 items-start gap-3 text-sm">
              <input type="checkbox" className="mt-0.5 h-4 w-4" checked={s.enabled} onChange={(e) => void change(s.kind, e.target.checked)} data-testid={`self-report-${s.kind}`} />
              <span>
                <span className="block font-medium">{t.kinds[s.kind].label}</span>
                <span className="text-subtle">{t.kinds[s.kind].hint}</span>
                {s.enabled && s.pausedUntil && <span className="block text-subtle">{fill(t.pausedUntil0, date(s.pausedUntil))}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-2 text-sm text-danger-text">{t.thatDidNotWork}</p>}
    </Card>
  );
}
