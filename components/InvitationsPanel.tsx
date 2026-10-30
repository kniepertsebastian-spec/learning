"use client";

import { c_invitationsPanel } from "@/lib/i18n/components/invitationsPanel";
import { fill } from "@/lib/i18n/fill";
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
      setError(body?.error ?? (c_invitationsPanel(de).couldNotCreateInvitation));
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
      setError(c_invitationsPanel(de).couldNotRevoke);
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
      <h2 className="text-lg font-medium">{c_invitationsPanel(de).invitePeople}</h2>
      <p className="mt-1 text-sm text-muted">
        {mailEnabled
          ? c_invitationsPanel(de).theInvitedPersonReceivesAn
          : c_invitationsPanel(de).noEmailIsSentYou}
      </p>

      <form onSubmit={create} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={c_invitationsPanel(de).emailAddress}
          aria-label={c_invitationsPanel(de).emailAddress}
          className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as Role)}
          aria-label={c_invitationsPanel(de).role}
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
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary hover:opacity-90 disabled:opacity-50"
        >
          {c_invitationsPanel(de).createLink}
        </button>
      </form>

      {error && (
        <p role="alert" className="mt-3 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-text">
          {error}
        </p>
      )}

      {link && (
        <div className="mt-4 rounded-md border border-border bg-background p-3" data-testid="invite-link-box">
          <p className="text-sm font-medium">
            {fill(c_invitationsPanel(de).linkFor0, link.email)}
          </p>
          {mailEnabled && (
            <p className="mt-1 text-xs" data-testid="invite-mail-status">
              {link.emailSent
                ? fill(c_invitationsPanel(de).emailSentTo0, link.email)
                : c_invitationsPanel(de).theEmailCouldNotBe}
            </p>
          )}
          <p className="mt-1 text-xs text-muted">
            {c_invitationsPanel(de).thisLinkIsShownOnly}
          </p>
          <input
            readOnly
            value={link.url}
            onFocus={(e) => e.currentTarget.select()}
            aria-label={c_invitationsPanel(de).invitationLink}
            data-testid="invite-link"
            className="mt-2 w-full rounded-md border border-border bg-surface px-3 py-2 font-mono text-xs"
          />
          <button type="button" onClick={copy} className="mt-2 text-sm text-link hover:underline">
            {copied ? (c_invitationsPanel(de).copied) : c_invitationsPanel(de).copyLink}
          </button>
        </div>
      )}

      <h3 className="mt-6 text-sm font-medium">{c_invitationsPanel(de).openInvitations}</h3>
      {invitations.length === 0 ? (
        <p className="mt-2 text-sm text-muted" data-testid="no-invitations">
          {c_invitationsPanel(de).noOpenInvitations}
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-border text-sm" data-testid="invitation-list">
          {invitations.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between gap-3 py-2">
              <span>
                {inv.email} · {ROLE_LABELS[inv.role][locale]} ·{" "}
                <span className="text-subtle">
                  {c_invitationsPanel(de).validUntil}
                  {new Date(inv.expiresAt).toLocaleDateString(locale)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => revoke(inv.id, inv.email)}
                className="text-danger-text hover:underline"
                aria-label={fill(c_invitationsPanel(de).revokeInvitationFor0, inv.email)}
              >
                {c_invitationsPanel(de).revoke}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
