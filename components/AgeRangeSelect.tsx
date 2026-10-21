"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { useLocale } from "@/lib/i18n";

const OPTIONS: Array<{ value: string; label: string }> = [
  { value: "under_18", label: "< 18" },
  { value: "18_24", label: "18–24" },
  { value: "25_34", label: "25–34" },
  { value: "35_44", label: "35–44" },
  { value: "45_54", label: "45–54" },
  { value: "55_plus", label: "55+" },
];

/** Optionale Altersspanne; sie beeinflusst nur die Startwerte der Wiederholungsplanung. */
export function AgeRangeSelect({ initial }: { initial: string | null }) {
  const { locale } = useLocale();
  const de = locale === "de";
  const [value, setValue] = useState(initial ?? "");
  const [error, setError] = useState(false);
  async function change(next: string) {
    setError(false);
    const res = await fetch("/api/account/age-range", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ageRange: next === "" ? null : next }),
    });
    if (res.ok) setValue(next);
    else setError(true);
  }
  return (
    <Card data-testid="age-range">
      <label className="block text-sm">
        <span className="block font-medium">{de ? "Altersspanne (optional)" : "Age range (optional)"}</span>
        <span className="mb-2 block text-subtle">
          {de ? "Wird nur für die Startwerte der Wiederholungsplanung genutzt." : "Only used for the starting values of review scheduling."}
        </span>
        <select value={value} onChange={(e) => void change(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1.5 text-sm">
          <option value="">{de ? "Keine Angabe" : "Prefer not to say"}</option>
          {OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
      {error && <p role="alert" className="mt-2 text-sm text-danger-text">{de ? "Das hat nicht geklappt." : "That did not work."}</p>}
    </Card>
  );
}
