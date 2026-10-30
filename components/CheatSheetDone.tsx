"use client";

import { c_cheatSheetDone } from "@/lib/i18n/components/cheatSheetDone";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLocaleOptional } from "@/lib/i18n";

/** „Durchgesehen“: zählt nicht als Review, aber als Lernaktivität für das Wochenziel (roadmap_motivation Phase 4). */
export function CheatSheetDone({ certificationId }: { certificationId: string }) {
  const { locale } = useLocaleOptional();
  const de = locale === "de";
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");

  async function mark() {
    setState("saving");
    try {
      const res = await fetch("/api/learning-activity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "cheat_sheet", certificationId }) });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3 print:hidden" data-testid="cheatsheet-done">
      <Button variant="secondary" onClick={() => void mark()} disabled={state === "saving" || state === "done"}>
        {c_cheatSheetDone(de).doneReading}
      </Button>
      <p className="text-xs text-subtle" role="status">
        {state === "done"
          ? c_cheatSheetDone(de).savedCountsAsAStudy
          : state === "error"
            ? c_cheatSheetDone(de).thatDidNotWork
            : c_cheatSheetDone(de).countsAsActivityForYour}
      </p>
    </div>
  );
}
