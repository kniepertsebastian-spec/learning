"use client";

import { c_unsubscribeReactivation } from "@/lib/i18n/components/unsubscribeReactivation";
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
  if (state === "done") return <p role="status" className="text-sm" data-testid="unsubscribed">{c_unsubscribeReactivation(de).doneYouWillNotGet}</p>;
  return (
    <>
      <p className="text-sm text-subtle">{c_unsubscribeReactivation(de).afterALongerBreakWe}</p>
      <Button onClick={() => void unsubscribe()} disabled={state === "busy"} className="w-fit" data-testid="unsubscribe-button">
        {c_unsubscribeReactivation(de).unsubscribe}
      </Button>
      {state === "error" && <p role="alert" className="text-sm text-danger-text">{c_unsubscribeReactivation(de).thatDidNotWork}</p>}
    </>
  );
}
