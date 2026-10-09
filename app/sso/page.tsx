"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function SsoPage() {
  return (
    <Suspense>
      <SsoForm />
    </Suspense>
  );
}

/** Anmeldung über das Firmenkonto: Die E-Mail-Domain bestimmt die Firma, dann geht es zum Anmeldedienst der Firma. */
function SsoForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(params.get("error"));
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/sso/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const data = await res.json().catch(() => null);
      if (!res.ok || typeof data?.url !== "string") {
        setError(data?.error ?? "Das hat nicht geklappt. Bitte erneut versuchen.");
        setBusy(false);
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError("Keine Verbindung. Bitte erneut versuchen.");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8" data-testid="sso-page">
        <h1 className="mb-2 text-xl font-semibold">Mit Firmenkonto anmelden</h1>
        <p className="mb-5 text-sm text-foreground/70">Gib deine Firmen-E-Mail-Adresse ein. Du wirst zum Anmeldedienst deiner Firma weitergeleitet.</p>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {error && (
            <p role="alert" data-testid="sso-error" className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">
              {error}
            </p>
          )}
          <div>
            <label htmlFor="sso-email" className="mb-1 block text-sm font-medium">E-Mail</label>
            <input id="sso-email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="sso-email" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent" />
          </div>
          <button type="submit" disabled={busy} data-testid="sso-submit" className="rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50">
            {busy ? "Weiter …" : "Weiter zum Firmenkonto"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-foreground/60">
          <Link href="/login" className="text-accent hover:underline">Zurück zur Anmeldung mit Passwort</Link>
        </p>
      </div>
    </div>
  );
}
