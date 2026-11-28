"use client";

import { c_autoSkillsToggle } from "@/lib/i18n/components/autoSkillsToggle";
import { fill } from "@/lib/i18n/fill";
import { useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { useLocale } from "@/lib/i18n";

/** Einstellung: Skills aus bestandenen Abschlussprüfungen und Zertifikaten automatisch ins Profil übernehmen. */
export function AutoSkillsToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const { locale } = useLocale();
  const de = locale === "de";
  const [enabled, setEnabled] = useState(initialEnabled);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Verhindert parallele Requests (Doppelklick); bewusst kein `disabled`, damit der Tastaturfokus erhalten bleibt.
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  async function change(next: boolean) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMsg(null);
    // Nicht optimistisch: `enabled` ändert sich erst nach Bestätigung des Servers, der letzte bestätigte Wert bleibt sonst stehen.
    try {
      const res = await fetch("/api/account/auto-skills", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: next }) });
      if (!res.ok) return setMsg({ ok: false, text: c_autoSkillsToggle(de).thatDidNotWork });
      setEnabled(next);
      const { added } = (await res.json().catch(() => ({ added: 0 }))) as { added: number };
      if (next) setMsg({ ok: true, text: fill(c_autoSkillsToggle(de).enabledAdded0SkillS, added) });
    } catch {
      setMsg({ ok: false, text: c_autoSkillsToggle(de).networkError });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <Card data-testid="auto-skills-toggle">
      <label className="flex min-h-11 items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-4 w-4" checked={enabled} aria-busy={busy} onChange={(e) => void change(e.target.checked)} />
        <span>
          <span className="block font-medium">{c_autoSkillsToggle(de).addSkillsToMyProfile}</span>
          <span className="text-subtle">
            {c_autoSkillsToggle(de).afterPassingAFinalExam}
          </span>
        </span>
      </label>
      {msg && <p role={msg.ok ? "status" : "alert"} className={msg.ok ? "mt-2 text-sm text-mint-text" : "mt-2 text-sm text-danger-text"}>{msg.text}</p>}
    </Card>
  );
}
