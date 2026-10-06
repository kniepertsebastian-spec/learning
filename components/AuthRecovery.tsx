"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n";

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";
const buttonClass =
  "rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8">
        <h1 className="mb-6 text-xl font-semibold">{title}</h1>
        {children}
      </div>
    </div>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">
      {children}
    </p>
  );
}

/** Formular, das nur eine E-Mail-Adresse an einen Recovery-Endpunkt schickt (Passwort vergessen / Bestätigung erneut senden). */
export function EmailRequestForm({
  endpoint,
  title,
  intro,
  submitLabel,
  doneMessage,
}: {
  endpoint: string;
  title: { de: string; en: string };
  intro: { de: string; en: string };
  submitLabel: { de: string; en: string };
  doneMessage: { de: string; en: string };
}) {
  const { locale } = useLocale();
  const [state, setState] = useState<"idle" | "pending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("pending");
    setError(null);
    const email = new FormData(e.currentTarget).get("email");
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (res.ok) {
      setState("done");
      return;
    }
    const body = await res.json().catch(() => null);
    setError(body?.error ?? (locale === "de" ? "Anfrage fehlgeschlagen." : "Request failed."));
    setState("idle");
  }

  return (
    <Card title={title[locale]}>
      {state === "done" ? (
        <p role="status" className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-600" data-testid="request-done">
          {doneMessage[locale]}
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="text-sm text-foreground/70">{intro[locale]}</p>
          {error && <ErrorBox>{error}</ErrorBox>}
          <label className="text-sm font-medium">
            {locale === "de" ? "E-Mail-Adresse" : "Email address"}
            <input name="email" type="email" required autoComplete="email" className={`${inputClass} mt-1`} />
          </label>
          <button type="submit" disabled={state === "pending"} className={buttonClass}>
            {submitLabel[locale]}
          </button>
        </form>
      )}
      <p className="mt-4 text-center text-sm text-foreground/60">
        <Link href="/login" className="text-accent hover:underline">
          {locale === "de" ? "Zurück zur Anmeldung" : "Back to sign in"}
        </Link>
      </p>
    </Card>
  );
}

/** Neues Passwort per Reset-Link festlegen. */
export function ResetPasswordForm({ token }: { token: string }) {
  const { locale } = useLocale();
  const de = locale === "de";
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    if (fd.get("newPassword") !== fd.get("confirmPassword")) {
      setError(de ? "Die Passwörter stimmen nicht überein." : "The passwords do not match.");
      return;
    }
    setPending(true);
    const res = await fetch("/api/recovery/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword: fd.get("newPassword") }),
    });
    if (res.ok) {
      router.push("/login?passwordReset=1");
      return;
    }
    const body = await res.json().catch(() => null);
    setError(body?.error ?? (de ? "Zurücksetzen fehlgeschlagen." : "Reset failed."));
    setPending(false);
  }

  return (
    <Card title={de ? "Neues Passwort festlegen" : "Set a new password"}>
      <form onSubmit={submit} className="flex flex-col gap-4" data-testid="reset-password-form">
        {error && <ErrorBox>{error}</ErrorBox>}
        <label className="text-sm font-medium">
          {de ? "Neues Passwort (mindestens 8 Zeichen)" : "New password (at least 8 characters)"}
          <input name="newPassword" type="password" required minLength={8} autoComplete="new-password" className={`${inputClass} mt-1`} />
        </label>
        <label className="text-sm font-medium">
          {de ? "Passwort wiederholen" : "Repeat password"}
          <input name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" className={`${inputClass} mt-1`} />
        </label>
        <button type="submit" disabled={pending} className={buttonClass}>
          {de ? "Passwort speichern" : "Save password"}
        </button>
      </form>
    </Card>
  );
}

/** E-Mail per Klick bestätigen (POST, damit Link-Scanner im Postfach das Token nicht verbrauchen). */
export function VerifyEmailButton({ token }: { token: string }) {
  const { locale } = useLocale();
  const de = locale === "de";
  const [state, setState] = useState<"idle" | "pending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function verify() {
    setState("pending");
    setError(null);
    const res = await fetch("/api/recovery/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (res.ok) {
      setState("done");
      return;
    }
    const body = await res.json().catch(() => null);
    setError(body?.error ?? (de ? "Bestätigen fehlgeschlagen." : "Verification failed."));
    setState("idle");
  }

  return (
    <Card title={de ? "E-Mail-Adresse bestätigen" : "Confirm your email address"}>
      {state === "done" ? (
        <div className="flex flex-col gap-4">
          <p role="status" className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-600" data-testid="verified">
            {de ? "Deine E-Mail-Adresse ist bestätigt." : "Your email address is confirmed."}
          </p>
          <Link href="/login?verified=1" className={`${buttonClass} text-center`}>
            {de ? "Zur Anmeldung" : "Go to sign in"}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {error && <ErrorBox>{error}</ErrorBox>}
          <p className="text-sm text-foreground/70">
            {de ? "Klicke, um deine E-Mail-Adresse zu bestätigen." : "Click to confirm your email address."}
          </p>
          <button type="button" onClick={verify} disabled={state === "pending"} className={buttonClass}>
            {de ? "E-Mail bestätigen" : "Confirm email"}
          </button>
        </div>
      )}
    </Card>
  );
}

/** Firmen-E-Mail bestätigen (Link aus der Bestätigungsmail an die Firmenadresse). */
export function ConfirmCompanyButton({ token }: { token: string }) {
  const { locale } = useLocale();
  const de = locale === "de";
  const [state, setState] = useState<"idle" | "pending" | "done">("idle");
  const [company, setCompany] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setState("pending");
    setError(null);
    const res = await fetch("/api/company/claim/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (res.ok) {
      const body = await res.json().catch(() => null);
      setCompany(body?.organizationName ?? "");
      setState("done");
      return;
    }
    const body = await res.json().catch(() => null);
    setError(body?.error ?? (de ? "Bestätigen fehlgeschlagen." : "Confirmation failed."));
    setState("idle");
  }

  return (
    <Card title={de ? "Unternehmen bestätigen" : "Confirm your company"}>
      {state === "done" ? (
        <div className="flex flex-col gap-4">
          <p role="status" className="rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-600" data-testid="company-confirmed">
            {de ? `„${company}“ ist angelegt, du bist Firmen-Admin.` : `"${company}" was created, you are its company admin.`}
          </p>
          <Link href="/login?from=%2Fcompany" className={`${buttonClass} text-center`}>
            {de ? "Zum Firmenbereich" : "Go to company area"}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {error && <ErrorBox>{error}</ErrorBox>}
          <p className="text-sm text-foreground/70">
            {de
              ? "Klicke, um zu bestätigen, dass diese Firmen-E-Mail-Adresse dir gehört. Danach wird das Unternehmen angelegt."
              : "Click to confirm that this company email address is yours. The company is created afterwards."}
          </p>
          <button type="button" onClick={confirm} disabled={state === "pending"} className={buttonClass}>
            {de ? "Unternehmen bestätigen" : "Confirm company"}
          </button>
        </div>
      )}
    </Card>
  );
}
