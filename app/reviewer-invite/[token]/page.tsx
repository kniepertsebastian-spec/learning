export const dynamic = "force-dynamic";

import { c_reviewerInviteTokenPage } from "@/lib/i18n/components/reviewerInviteTokenPage";
import { fill } from "@/lib/i18n/fill";
import Link from "next/link";
import { auth } from "@/lib/server/auth";
import { getServerLocale } from "@/lib/server/locale";
import { getReviewerInvitationPreview } from "@/lib/server/reviewers/service";
import { AcceptReviewerInvitation } from "@/components/reviewer/AcceptReviewerInvitation";

/** Öffentliche Einladungsseite für fachliche Prüfer: ohne Anmeldung nur die Vorschau und der Weg zu Anmeldung oder Registrierung. */
export default async function ReviewerInvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [preview, session, locale] = await Promise.all([getReviewerInvitationPreview(token), auth(), getServerLocale()]);
  const de = locale === "de";
  const from = encodeURIComponent(`/reviewer-invite/${token}`);
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 py-10" data-testid="reviewer-invite">
      <h1 className="text-2xl font-semibold">{c_reviewerInviteTokenPage(de).invitationAsExpertReviewer}</h1>
      {!preview ? (
        <p className="text-sm text-subtle" data-testid="reviewer-invite-invalid">{c_reviewerInviteTokenPage(de).thisInvitationIsInvalidOr}</p>
      ) : (
        <>
          <p className="text-sm text-subtle">
            {c_reviewerInviteTokenPage(de).youCanReviewAndApprove} <strong>{preview.email}</strong>
            {preview.courses.length > 0 && (fill(c_reviewerInviteTokenPage(de).assigned0, preview.courses.join(", ")))}
          </p>
          {session?.user?.id ? (
            <AcceptReviewerInvitation token={token} locale={locale} />
          ) : (
            <p className="flex gap-3 text-sm">
              <Link className="text-link hover:underline" href={`/login?from=${from}`}>{c_reviewerInviteTokenPage(de).signIn}</Link>
              <Link className="text-link hover:underline" href={`/register?from=${from}`}>{c_reviewerInviteTokenPage(de).register}</Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
