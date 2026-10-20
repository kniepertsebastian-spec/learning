"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { useLocale } from "@/lib/i18n";

/** Einstellung: Skills aus bestandenen Abschlussprüfungen und Zertifikaten automatisch ins Profil übernehmen. */
export function AutoSkillsToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const { locale } = useLocale();
  const de = locale === "de";
  const [enabled, setEnabled] = useState(initialEnabled);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function change(next: boolean) {
    setMsg(null);
    const res = await fetch("/api/account/auto-skills", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: next }) });
    if (!res.ok) return setMsg({ ok: false, text: de ? "Das hat nicht geklappt." : "That did not work." });
    setEnabled(next);
    const { added } = (await res.json()) as { added: number };
    if (next) setMsg({ ok: true, text: de ? `Eingeschaltet. ${added} Skill(s) aus bisherigen Abschlüssen ergänzt.` : `Enabled. Added ${added} skill(s) from earlier completions.` });
  }
  return (
    <Card data-testid="auto-skills-toggle">
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={enabled} onChange={(e) => void change(e.target.checked)} />
        <span>
          <span className="block font-medium">{de ? "Skills automatisch ins Profil übernehmen" : "Add skills to my profile automatically"}</span>
          <span className="text-subtle">
            {de
              ? "Nach einer bestandenen Abschlussprüfung oder einem Zertifikat kommt der Kurs als Skill in dein Profil (mit Herkunft, jederzeit löschbar). Beim Einschalten werden bisherige Abschlüsse nachgetragen."
              : "After passing a final exam or earning a certificate, the course is added to your profile as a skill (with its source, removable at any time). Turning this on also adds earlier completions."}
          </span>
        </span>
      </label>
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "mt-2 text-sm text-mint-text" : "mt-2 text-sm text-danger-text"}>{msg.text}</p>}
    </Card>
  );
}
