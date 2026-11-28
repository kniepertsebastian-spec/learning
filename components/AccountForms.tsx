"use client";

import { c_accountForms } from "@/lib/i18n/components/accountForms";
import { fill } from "@/lib/i18n/fill";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { clearLocalUserData } from "@/lib/client/clear-local-data";
import { removePushOnSignOut } from "@/lib/client/push";

type Locale = "de" | "en";

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-accent";

function Message({ kind, children }: { kind: "error" | "ok"; children: React.ReactNode }) {
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={
        kind === "error"
          ? "rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-text"
          : "rounded-md bg-success-soft px-3 py-2 text-sm text-success-text"
      }
    >
      {children}
    </p>
  );
}

/** Passwort ändern. Danach sind alle Sitzungen beendet, es geht zur Anmeldung. */
export function ChangePasswordForm({ userId, locale }: { userId: string; locale: Locale }) {
  const router = useRouter();
  const de = locale === "de";
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    if (fd.get("newPassword") !== fd.get("confirmPassword")) {
      setError(c_accountForms(de).theNewPasswordsDoNot);
      setPending(false);
      return;
    }
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: fd.get("currentPassword"),
          newPassword: fd.get("newPassword"),
        }),
      });
      if (res.ok) {
        // Der Server hat alle Push-Abos beendet; hier wird auch das Browser-Abo dieses Geräts gelöst.
        await removePushOnSignOut();
        await clearLocalUserData(userId);
        router.push("/login?passwordChanged=1");
        router.refresh();
        return;
      }
      const body = await res.json().catch(() => null);
      setError(body?.error ?? (c_accountForms(de).couldNotChangeThePassword));
    } catch {
      setError(c_accountForms(de).networkError);
    }
    setPending(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" data-testid="change-password-form">
      <p className="text-sm text-muted">
        {c_accountForms(de).afterChangingItYouAre}
      </p>
      {error && <Message kind="error">{error}</Message>}
      <label className="text-sm font-medium">
        {c_accountForms(de).currentPassword}
        <input name="currentPassword" type="password" required autoComplete="current-password" className={`${inputClass} mt-1`} />
      </label>
      <label className="text-sm font-medium">
        {c_accountForms(de).newPasswordAtLeast8}
        <input name="newPassword" type="password" required minLength={8} autoComplete="new-password" className={`${inputClass} mt-1`} />
      </label>
      <label className="text-sm font-medium">
        {c_accountForms(de).repeatNewPassword}
        <input name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" className={`${inputClass} mt-1`} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-primary px-4 py-2 min-h-11 sm:min-h-9 text-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
      >
        {c_accountForms(de).changePassword}
      </button>
    </form>
  );
}

/**
 * Konto löschen: verlangt das Passwort und eine ausdrückliche Bestätigung. SSO-Konten ohne eigenes Passwort tippen stattdessen
 * ihre E-Mail-Adresse ein (Aufgabe 09); der Server verlangt dann eine frische Anmeldung.
 */
export function DeleteAccountForm({ userId, locale, confirmWith = "password" }: { userId: string; locale: Locale; confirmWith?: "password" | "email" }) {
  const router = useRouter();
  const de = locale === "de";
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(confirmWith === "email" ? { email: fd.get("email") } : { password: fd.get("password") }),
      });
      if (res.ok) {
        // Die Abos auf dem Server sind mit dem Konto gelöscht (CASCADE); hier wird das Browser-Abo gelöst.
        await removePushOnSignOut();
        await clearLocalUserData(userId, { includeSyncQueue: true });
        router.push("/login?accountDeleted=1");
        router.refresh();
        return;
      }
      const body = await res.json().catch(() => null);
      setError(body?.error ?? (c_accountForms(de).couldNotDeleteTheAccount));
    } catch {
      setError(c_accountForms(de).networkError);
    }
    setPending(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" data-testid="delete-account-form">
      <p className="text-sm text-muted">
        {c_accountForms(de).yourAccountAndAllYour}
      </p>
      {error && <Message kind="error">{error}</Message>}
      {confirmWith === "email" ? (
        <>
          <p className="text-sm text-muted">{c_accountForms(de).ssoDeleteHint}</p>
          <label className="text-sm font-medium">
            {c_accountForms(de).emailToConfirm}
            <input name="email" type="email" required autoComplete="off" className={`${inputClass} mt-1`} />
          </label>
        </>
      ) : (
        <label className="text-sm font-medium">
          {c_accountForms(de).passwordToConfirm}
          <input name="password" type="password" required autoComplete="current-password" className={`${inputClass} mt-1`} />
        </label>
      )}
      <label className="flex min-h-11 items-start gap-2 text-sm">
        <input name="confirm" type="checkbox" required className="mt-0.5" />
        <span>
          {c_accountForms(de).iUnderstandMyAccountAnd}
        </span>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-danger px-4 py-2 min-h-11 sm:min-h-9 text-sm font-medium text-on-danger hover:opacity-90 disabled:opacity-50"
      >
        {c_accountForms(de).deleteAccountPermanently}
      </button>
    </form>
  );
}

/** Privatperson legt ein Unternehmen fest; die Firma entsteht erst nach Bestätigung per Mail. */
export function CompanyForm({ locale }: { locale: Locale }) {
  const de = locale === "de";
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/account/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName: fd.get("companyName"), companyEmail: fd.get("companyEmail") }),
      });
      if (res.ok) {
        setSentTo(String(fd.get("companyEmail")));
        return;
      }
      const body = await res.json().catch(() => null);
      setError(body?.error ?? (c_accountForms(de).requestFailed));
    } catch {
      setError(c_accountForms(de).networkError);
    } finally {
      setPending(false);
    }
  }

  if (sentTo) {
    return (
      <Message kind="ok">
        {fill(c_accountForms(de).weSentAConfirmationLink, sentTo)}
      </Message>
    );
  }

  return (
    <form onSubmit={submit} className="flex max-w-sm flex-col gap-3">
      {error && <Message kind="error">{error}</Message>}
      <div>
        <label htmlFor="companyName" className="mb-1 block text-sm font-medium">
          {c_accountForms(de).companyName}
        </label>
        <input id="companyName" name="companyName" required maxLength={120} className={inputClass} />
      </div>
      <div>
        <label htmlFor="companyEmail" className="mb-1 block text-sm font-medium">
          {c_accountForms(de).companyEmail}
        </label>
        <input id="companyEmail" name="companyEmail" type="email" required className={inputClass} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-primary px-4 py-2 min-h-11 sm:min-h-9 text-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
      >
        {c_accountForms(de).sendConfirmationLink}
      </button>
    </form>
  );
}
