export const dynamic = "force-dynamic";

import { c_inviteTokenPage } from "@/lib/i18n/components/inviteTokenPage";
import { fill } from "@/lib/i18n/fill";
import Link from "next/link";
import { AcceptInvitationButton } from "@/components/AcceptInvitationButton";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { STATUS_VIEW_ROLES } from "@/lib/server/company/access";
import { getInvitationPreview } from "@/lib/server/company/invitations";
import type { CompanyRole } from "@/lib/server/db/schema";
import { normalizeEmail } from "@/lib/server/email";
import { getServerLocale } from "@/lib/server/locale";

const ROLE_LABELS: Record<CompanyRole, { de: string; en: string }> = {
  company_admin: { de: "Firmen-Admin", en: "Company admin" },
  mentor: { de: "Mentor", en: "Mentor" },
  learner: { de: "Lernender", en: "Learner" },
};

/**
 * Einladungsseite (öffentlich, das Token im Link ist das Geheimnis). Unbekannt, benutzt,
 * widerrufen und abgelaufen sehen gleich aus.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [preview, user, locale] = await Promise.all([
    getInvitationPreview(token),
    getCurrentUser(),
    getServerLocale(),
  ]);
  const de = locale === "de";

  if (!preview) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <p className="text-lg font-semibold" data-testid="invite-invalid">
          {c_inviteTokenPage(de).invitationInvalidOrExpired}
        </p>
        <p className="text-muted">
          {c_inviteTokenPage(de).pleaseAskForANew}
        </p>
        <Link href="/" className="mt-4 text-link hover:underline">
          {c_inviteTokenPage(de).backToHome}
        </Link>
      </div>
    );
  }

  const from = `/invite/${token}`;
  const query = `from=${encodeURIComponent(from)}`;
  const homePath = STATUS_VIEW_ROLES.includes(preview.role) ? "/company" : "/";

  return (
    <div className="flex flex-1 flex-col items-center justify-center">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-8">
        <h1 className="text-xl font-semibold">{c_inviteTokenPage(de).invitation}</h1>
        <p className="mt-3 text-sm" data-testid="invite-summary">
          {c_inviteTokenPage(de).youWereInvitedTo}
          <strong>{preview.organizationName}</strong>
          {c_inviteTokenPage(de).as}
          <strong>{ROLE_LABELS[preview.role][locale]}</strong>.
        </p>
        <p className="mt-1 text-sm text-muted">
          {c_inviteTokenPage(de).for}
          {preview.email}
        </p>

        <div className="mt-6">
          {!user ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted">
                {c_inviteTokenPage(de).signInWithThisEmail}
              </p>
              <Link
                href={`/register?${query}&email=${encodeURIComponent(preview.email)}`}
                className="rounded-md bg-primary px-4 py-2.5 text-center text-sm font-medium text-on-primary hover:opacity-90"
              >
                {c_inviteTokenPage(de).register}
              </Link>
              <Link
                href={`/login?${query}`}
                className="rounded-md border border-border px-4 py-2.5 text-center text-sm font-medium hover:bg-background"
              >
                {c_inviteTokenPage(de).signIn}
              </Link>
            </div>
          ) : normalizeEmail(user.email) !== preview.email ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-text" data-testid="invite-mismatch">
              {fill(c_inviteTokenPage(de).thisInvitationIsFor0, preview.email, user.email)}
            </p>
          ) : (
            <AcceptInvitationButton token={token} locale={locale} homePath={homePath} />
          )}
        </div>
      </div>
    </div>
  );
}
