"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function UnsubscribeReactivation({ userId, token, locale }: { userId: string; token: string; locale: "de" | "en" }) {
  const de = locale === "de";
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  async function unsubscribe() {
    setState("busy");
    const res = await fetch("/api/unsubscribe/reactivation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ u: userId, t: token }) });
    setState(res.ok ? "done" : "error");
  }
  if (state === "done") return <p role="status" className="text-sm" data-testid="unsubscribed">{de ? "Erledigt. Du bekommst keine Erinnerungen dieser Art mehr." : "Done. You will not get reminders of this kind any more."}</p>;
  return (
    <>
      <p className="text-sm text-subtle">{de ? "Wir schreiben dir nach längerer Pause höchstens dreimal. Möchtest du sie ganz abschalten?" : "After a longer break we write at most three times. Do you want to switch them off completely?"}</p>
      <Button onClick={() => void unsubscribe()} disabled={state === "busy"} className="w-fit" data-testid="unsubscribe-button">
        {de ? "Abmelden" : "Unsubscribe"}
      </Button>
      {state === "error" && <p role="alert" className="text-sm text-danger-text">{de ? "Das hat nicht geklappt." : "That did not work."}</p>}
    </>
  );
}
