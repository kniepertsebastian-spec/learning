"use client";

import { c_authRecovery } from "@/lib/i18n/components/authRecovery";
import { fill } from "@/lib/i18n/fill";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n";

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent";
const buttonClass =
  "rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50";

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
    <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-text">
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
    try {
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
      setError(body?.error ?? (c_authRecovery(locale).requestFailed));
    } catch {
      // Offline oder Netzabbruch: fetch() wirft, statt eine Antwort zu liefern.
      setError(c_authRecovery(locale).networkError);
    }
    setState("idle");
  }

  return (
    <Card title={title[locale]}>
      {state === "done" ? (
        <p role="status" className="rounded-md bg-success-soft px-3 py-2 text-sm text-success-text" data-testid="request-done">
          {doneMessage[locale]}
        </p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="text-sm text-muted">{intro[locale]}</p>
          {error && <ErrorBox>{error}</ErrorBox>}
          <label className="text-sm font-medium">
            {c_authRecovery(locale).emailAddress}
            <input name="email" type="email" required autoComplete="email" className={`${inputClass} mt-1`} />
          </label>
          <button type="submit" disabled={state === "pending"} className={buttonClass}>
            {submitLabel[locale]}
          </button>
        </form>
      )}
      <p className="mt-4 text-center text-sm text-subtle">
        <Link href="/login" className="text-link hover:underline">
          {c_authRecovery(locale).backToSignIn}
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
      setError(c_authRecovery(de).thePasswordsDoNotMatch);
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/recovery/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: fd.get("newPassword") }),
      });
      if (res.ok) {
        // Button bleibt bis zur Navigation deaktiviert, damit das Token nicht doppelt eingelöst wird.
        router.push("/login?passwordReset=1");
        return;
      }
      const body = await res.json().catch(() => null);
      setError(body?.error ?? (c_authRecovery(de).resetFailed));
    } catch {
      setError(c_authRecovery(de).networkError);
    }
    setPending(false);
  }

  return (
    <Card title={c_authRecovery(de).setANewPassword}>
      <form onSubmit={submit} className="flex flex-col gap-4" data-testid="reset-password-form">
        {error && <ErrorBox>{error}</ErrorBox>}
        <label className="text-sm font-medium">
          {c_authRecovery(de).newPasswordAtLeast8}
          <input name="newPassword" type="password" required minLength={8} autoComplete="new-password" className={`${inputClass} mt-1`} />
        </label>
        <label className="text-sm font-medium">
          {c_authRecovery(de).repeatPassword}
          <input name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" className={`${inputClass} mt-1`} />
        </label>
        <button type="submit" disabled={pending} className={buttonClass}>
          {c_authRecovery(de).savePassword}
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
    try {
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
      setError(body?.error ?? (c_authRecovery(de).verificationFailed));
    } catch {
      setError(c_authRecovery(de).networkError);
    }
    setState("idle");
  }

  return (
    <Card title={c_authRecovery(de).confirmYourEmailAddress}>
      {state === "done" ? (
        <div className="flex flex-col gap-4">
          <p role="status" className="rounded-md bg-success-soft px-3 py-2 text-sm text-success-text" data-testid="verified">
            {c_authRecovery(de).yourEmailAddressIsConfirmed}
          </p>
          <Link href="/login?verified=1" className={`${buttonClass} text-center`}>
            {c_authRecovery(de).goToSignIn}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {error && <ErrorBox>{error}</ErrorBox>}
          <p className="text-sm text-muted">
            {c_authRecovery(de).clickToConfirmYourEmail}
          </p>
          <button type="button" onClick={verify} disabled={state === "pending"} className={buttonClass}>
            {c_authRecovery(de).confirmEmail}
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
    try {
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
      setError(body?.error ?? (c_authRecovery(de).confirmationFailed));
    } catch {
      setError(c_authRecovery(de).networkError);
    }
    setState("idle");
  }

  return (
    <Card title={c_authRecovery(de).confirmYourCompany}>
      {state === "done" ? (
        <div className="flex flex-col gap-4">
          <p role="status" className="rounded-md bg-success-soft px-3 py-2 text-sm text-success-text" data-testid="company-confirmed">
            {fill(c_authRecovery(de).n0WasCreatedYouAre, company)}
          </p>
          <Link href="/login?from=%2Fcompany" className={`${buttonClass} text-center`}>
            {c_authRecovery(de).goToCompanyArea}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {error && <ErrorBox>{error}</ErrorBox>}
          <p className="text-sm text-muted">
            {c_authRecovery(de).clickToConfirmThatThis}
          </p>
          <button type="button" onClick={confirm} disabled={state === "pending"} className={buttonClass}>
            {c_authRecovery(de).confirmCompany}
          </button>
        </div>
      )}
    </Card>
  );
}
