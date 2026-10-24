"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function AcceptReviewerInvitation({ token, locale }: { token: string; locale: "de" | "en" }) {
  const router = useRouter();
  const de = locale === "de";
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function accept() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/reviewer-invitations/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    setBusy(false);
    if (!res.ok) return setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Fehler ${res.status}`);
    router.push("/reviewer");
    router.refresh();
  }
  return (
    <div className="flex flex-col gap-2">
      <Button onClick={() => void accept()} disabled={busy} className="w-fit" data-testid="reviewer-accept">
        {de ? "Einladung annehmen" : "Accept invitation"}
      </Button>
      {error && <p role="alert" className="text-sm text-danger-text" data-testid="reviewer-accept-error">{error}</p>}
    </div>
  );
}
