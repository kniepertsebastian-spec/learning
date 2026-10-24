export const dynamic = "force-dynamic";

import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { requireAdminPage } from "@/lib/server/auth-guards";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { getServerLocale } from "@/lib/server/locale";
import { getReviewerOverview, listOpenReviewerComments } from "@/lib/server/reviewers/service";
import { listCertificationsForAdmin } from "@/lib/server/reviewers/profile-service";
import { ReviewerCertVerification } from "@/components/admin/ReviewerCertVerification";
import { ReviewersPanel } from "@/components/admin/ReviewersPanel";

/** Betreiber: fachliche Prüfer einladen, Kursen zuweisen und ihre Kommentare abarbeiten. */
export default async function AdminReviewersPage() {
  await requireAdminPage("/admin/reviewers");
  const locale = await getServerLocale();
  const [courses, overview, comments, certs] = await Promise.all([
    getDb().select({ id: certifications.id, name: certifications.name }).from(certifications).where(eq(certifications.kind, "general")).orderBy(asc(certifications.name)),
    getReviewerOverview(),
    listOpenReviewerComments(),
    listCertificationsForAdmin(),
  ]);
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <Link href="/admin" className="text-sm text-link hover:underline">← Admin</Link>
        <h1 className="mt-2 text-2xl font-semibold">{locale === "de" ? "Fachliche Prüfer" : "Expert reviewers"}</h1>
        <p className="mt-1 text-sm"><Link href="/admin/reviewers/probe" className="text-link hover:underline" data-testid="admin-probe-link">{locale === "de" ? "Probe-Review und Freischaltung" : "Trial review and clearance"}</Link></p>
      </div>
      <ReviewersPanel
        locale={locale}
        courses={courses}
        reviewers={overview.reviewers}
        invitations={overview.invitations.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString() }))}
        comments={comments.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }))}
      />
      <ReviewerCertVerification locale={locale} certs={certs.map((c) => ({ id: c.id, reviewerName: c.reviewerName, vendor: c.vendor, name: c.name, earnedOn: c.earnedOn, validUntil: c.validUntil, verificationUrl: c.verificationUrl, verifiedAt: c.verifiedAt ? c.verifiedAt.toISOString() : null }))} />
    </div>
  );
}
