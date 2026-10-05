"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AcceptInvitationButton({
  token,
  locale,
  homePath,
}: {
  token: string;
  locale: "de" | "en";
  /** Ziel nach dem Annehmen: /company für Admin und Mentor, sonst Startseite. */
  homePath: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const de = locale === "de";

  async function accept() {
    setPending(true);
    setError(null);
    const res = await fetch("/api/invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (res.ok) {
      router.push(homePath);
      router.refresh();
      return;
    }
    const body = await res.json().catch(() => null);
    setError(body?.error ?? (de ? "Annehmen fehlgeschlagen." : "Could not accept the invitation."));
    setPending(false);
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={accept}
        disabled={pending}
        className="rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {pending ? (de ? "Wird angenommen…" : "Accepting…") : de ? "Einladung annehmen" : "Accept invitation"}
      </button>
    </div>
  );
}
