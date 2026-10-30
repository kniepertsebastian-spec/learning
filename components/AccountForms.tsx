"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clearLocalUserData } from "@/lib/client/clear-local-data";

type Locale = "de" | "en";

const inputClass =
  "w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

function Message({ kind, children }: { kind: "error" | "ok"; children: React.ReactNode }) {
  return (
    <p
      role={kind === "error" ? "alert" : "status"}
      className={
        kind === "error"
          ? "rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500"
          : "rounded-md bg-green-500/10 px-3 py-2 text-sm text-green-600"
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
      setError(de ? "Die neuen Passwörter stimmen nicht überein." : "The new passwords do not match.");
      setPending(false);
      return;
    }
    const res = await fetch("/api/account/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentPassword: fd.get("currentPassword"),
        newPassword: fd.get("newPassword"),
      }),
    });
    if (res.ok) {
      await clearLocalUserData(userId);
      router.push("/login?passwordChanged=1");
      router.refresh();
      return;
    }
    const body = await res.json().catch(() => null);
    setError(body?.error ?? (de ? "Passwort konnte nicht geändert werden." : "Could not change the password."));
    setPending(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" data-testid="change-password-form">
      <p className="text-sm text-muted">
        {de
          ? "Nach dem Ändern wirst du auf allen Geräten abgemeldet und meldest dich neu an."
          : "After changing it you are signed out on all devices and sign in again."}
      </p>
      {error && <Message kind="error">{error}</Message>}
      <label className="text-sm font-medium">
        {de ? "Aktuelles Passwort" : "Current password"}
        <input name="currentPassword" type="password" required autoComplete="current-password" className={`${inputClass} mt-1`} />
      </label>
      <label className="text-sm font-medium">
        {de ? "Neues Passwort (mindestens 8 Zeichen)" : "New password (at least 8 characters)"}
        <input name="newPassword" type="password" required minLength={8} autoComplete="new-password" className={`${inputClass} mt-1`} />
      </label>
      <label className="text-sm font-medium">
        {de ? "Neues Passwort wiederholen" : "Repeat new password"}
        <input name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" className={`${inputClass} mt-1`} />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-50"
      >
        {de ? "Passwort ändern" : "Change password"}
      </button>
    </form>
  );
}

/** Konto löschen: verlangt das Passwort und eine ausdrückliche Bestätigung. */
export function DeleteAccountForm({ userId, locale }: { userId: string; locale: Locale }) {
  const router = useRouter();
  const de = locale === "de";
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/account", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: fd.get("password") }),
    });
    if (res.ok) {
      await clearLocalUserData(userId);
      router.push("/login?accountDeleted=1");
      router.refresh();
      return;
    }
    const body = await res.json().catch(() => null);
    setError(body?.error ?? (de ? "Konto konnte nicht gelöscht werden." : "Could not delete the account."));
    setPending(false);
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" data-testid="delete-account-form">
      <p className="text-sm text-muted">
        {de
          ? "Dein Konto und alle deine Lern- und Mitgliedsdaten werden unwiderruflich gelöscht. Das lässt sich nicht rückgängig machen. Exportiere vorher deine Daten, wenn du sie behalten willst."
          : "Your account and all your learning and membership data are deleted permanently. This cannot be undone. Export your data first if you want to keep it."}
      </p>
      {error && <Message kind="error">{error}</Message>}
      <label className="text-sm font-medium">
        {de ? "Passwort zur Bestätigung" : "Password to confirm"}
        <input name="password" type="password" required autoComplete="current-password" className={`${inputClass} mt-1`} />
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input name="confirm" type="checkbox" required className="mt-0.5" />
        <span>
          {de
            ? "Ich weiß, dass mein Konto und meine Daten endgültig gelöscht werden."
            : "I understand my account and data will be deleted for good."}
        </span>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="self-start rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {de ? "Konto endgültig löschen" : "Delete account permanently"}
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
    const res = await fetch("/api/account/company", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyName: fd.get("companyName"), companyEmail: fd.get("companyEmail") }),
    });
    setPending(false);
    if (res.ok) {
      setSentTo(String(fd.get("companyEmail")));
      return;
    }
    const body = await res.json().catch(() => null);
    setError(body?.error ?? (de ? "Anfrage fehlgeschlagen." : "Request failed."));
  }

  if (sentTo) {
    return (
      <Message kind="ok">
        {de
          ? `Wir haben einen Bestätigungslink an ${sentTo} geschickt. Mit dem Klick wird das Unternehmen angelegt.`
          : `We sent a confirmation link to ${sentTo}. Clicking it creates the company.`}
      </Message>
    );
  }

  return (
    <form onSubmit={submit} className="flex max-w-sm flex-col gap-3">
      {error && <Message kind="error">{error}</Message>}
      <div>
        <label htmlFor="companyName" className="mb-1 block text-sm font-medium">
          {de ? "Firmenname" : "Company name"}
        </label>
        <input id="companyName" name="companyName" required maxLength={120} className={inputClass} />
      </div>
      <div>
        <label htmlFor="companyEmail" className="mb-1 block text-sm font-medium">
          {de ? "Firmen-E-Mail" : "Company email"}
        </label>
        <input id="companyEmail" name="companyEmail" type="email" required className={inputClass} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:opacity-90 disabled:opacity-50"
      >
        {de ? "Bestätigungslink senden" : "Send confirmation link"}
      </button>
    </form>
  );
}
