"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useLocaleOptional } from "@/lib/i18n";

/** „Kopieren“ in die Zwischenablage; ein Fehler (z. B. gesperrte Zwischenablage) ändert nichts am Inhalt. */
export function CopyButton({ text, title }: { text: string; title?: string }) {
  const { t } = useLocaleOptional();
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {
      // Zwischenablage nicht verfügbar – nichts weiter tun
    }
  }
  return (
    <button type="button" onClick={() => void copy()} title={title ?? t.lesson_blocks.copyHint} data-testid="copy-button" className="flex min-h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-subtle hover:bg-surface-2 hover:text-foreground">
      {done ? <Check className="h-3.5 w-3.5 text-mint-text" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      <span role="status">{done ? t.lesson_blocks.copied : t.lesson_blocks.copy}</span>
    </button>
  );
}
