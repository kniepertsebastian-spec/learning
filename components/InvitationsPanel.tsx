"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Role = "company_admin" | "mentor" | "learner";
export type PendingInvitationView = { id: string; email: string; role: Role; expiresAt: string };

const ROLE_LABELS: Record<Role, { de: string; en: string }> = {
  company_admin: { de: "Firmen-Admin", en: "Company admin" },
  mentor: { de: "Mentor", en: "Mentor" },
  learner: { de: "Lernender", en: "Learner" },
};

/** Einladungen für Firmen-Admins: anlegen (Link wird einmalig angezeigt), offene ansehen, widerrufen. */
export function InvitationsPanel({
  invitations,
  locale,
  mailEnabled,
}: {
  invitations: PendingInvitationView[];
  locale: "de" | "en";
  /** E-Mail-Versand eingerichtet: die Einladung geht zusätzlich per E-Mail raus. */
  mailEnabled: boolean;
}) {
  const router = useRouter();
  const de = locale === "de";
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("learner");
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ email: string; url: string; emailSent: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setLink(null);
    setCopied(false);
    const res = await fetch("/api/company/invitations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const body = await res.json().catch(() => null);
    setPending(false);
    if (!res.ok) {
      setError(body?.error ?? (de ? "Einladung fehlgeschlagen." : "Could not create invitation."));
      return;
    }
    setLink({
      email: body.invitation.email,
      url: window.location.origin + body.invitePath,
      emailSent: Boolean(body.emailSent),
    });
    setEmail("");
    router.refresh();
  }

  async function revoke(id: string, inviteEmail: string) {
    setError(null);
    const res = await fetch(`/api/company/invitations/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError(de ? "Widerrufen fehlgeschlagen." : "Could not revoke.");
      return;
    }
    // Der Link der gerade widerrufenen Einladung ist wertlos: nicht weiter anzeigen.
    if (link?.email === inviteEmail) setLink(null);
    router.refresh();
  }

  async function copy() {
    if (!link) return;
    await navigator.clipboard.writeText(link.url).catch(() => {});
    setCopied(true);
  }

  return (
    <section className="rounded-lg border border-border bg-surface p-6" data-testid="invitations-panel">
      <h2 className="text-lg font-medium">{de ? "Mitarbeiter einladen" : "Invite people"}</h2>
      <p className="mt-1 text-sm text-foreground/70">
        {mailEnabled
          ? de
            ? "Die eingeladene Person bekommt eine E-Mail mit dem Link. Du siehst ihn zusätzlich hier und kannst ihn selbst weitergeben. Er gilt 7 Tage, einmal und nur für die eingegebene E-Mail-Adresse."
            : "The invited person receives an email with the link. You also see it here and can pass it on yourself. It is valid for 7 days, once, and only for the entered email address."
          : de
            ? "Es wird keine E-Mail verschickt. Du bekommst einen Link, den du selbst weitergibst. Er gilt 7 Tage, einmal und nur für die eingegebene E-Mail-Adresse."
            : "No email is sent. You get a link to pass on yourself. It is valid for 7 days, once, and only for the entered email address."}
      </p>

      <form onSubmit={create} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={de ? "E-Mail-Adresse" : "Email address"}
          aria-label={de ? "E-Mail-Adresse" : "Email address"}
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          aria-label={de ? "Rolle" : "Role"}
          className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        >
          {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r][locale]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {de ? "Link erzeugen" : "Create link"}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {error}
        </p>
      )}

      {link && (
        <div className="mt-4 rounded-md border border-border bg-background p-3" data-testid="invite-link-box">
          <p className="text-sm font-medium">
            {de ? `Link für ${link.email}` : `Link for ${link.email}`}
          </p>
          {mailEnabled && (
            <p className="mt-1 text-xs" data-testid="invite-mail-status">
              {link.emailSent
                ? de
                  ? `E-Mail an ${link.email} wurde verschickt.`
                  : `Email sent to ${link.email}.`
                : de
                  ? "Die E-Mail konnte nicht verschickt werden. Gib den Link selbst weiter."
                  : "The email could not be sent. Pass the link on yourself."}
            </p>
          )}
          <p className="mt-1 text-xs text-foreground/70">
            {de
              ? "Dieser Link wird nur jetzt angezeigt. Danach ist er nicht mehr abrufbar."
              : "This link is shown only now. It cannot be retrieved later."}
          </p>
          <input
            readOnly
            value={link.url}
            onFocus={(e) => e.currentTarget.select()}
            aria-label={de ? "Einladungslink" : "Invitation link"}
            data-testid="invite-link"
            className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs"
          />
          <button type="button" onClick={copy} className="mt-2 text-sm text-accent hover:underline">
            {copied ? (de ? "Kopiert" : "Copied") : de ? "Link kopieren" : "Copy link"}
          </button>
        </div>
      )}

      <h3 className="mt-6 text-sm font-medium">{de ? "Offene Einladungen" : "Open invitations"}</h3>
      {invitations.length === 0 ? (
        <p className="mt-2 text-sm text-foreground/70" data-testid="no-invitations">
          {de ? "Keine offenen Einladungen." : "No open invitations."}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border text-sm" data-testid="invitation-list">
          {invitations.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                {inv.email} · {ROLE_LABELS[inv.role][locale]} ·{" "}
                <span className="text-foreground/60">
                  {de ? "gültig bis " : "valid until "}
                  {new Date(inv.expiresAt).toLocaleDateString(locale)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => revoke(inv.id, inv.email)}
                className="text-red-500 hover:underline"
                aria-label={de ? `Einladung für ${inv.email} widerrufen` : `Revoke invitation for ${inv.email}`}
              >
                {de ? "Widerrufen" : "Revoke"}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
