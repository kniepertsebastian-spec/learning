export const dynamic = "force-dynamic";

import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { requireAdminPage } from "@/lib/server/auth-guards";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { getServerLocale } from "@/lib/server/locale";
import { getReviewerOverview, listOpenReviewerComments } from "@/lib/server/reviewers/service";
import { ReviewersPanel } from "@/components/admin/ReviewersPanel";

/** Betreiber: fachliche Prüfer einladen, Kursen zuweisen und ihre Kommentare abarbeiten. */
export default async function AdminReviewersPage() {
  await requireAdminPage("/admin/reviewers");
  const locale = await getServerLocale();
  const [courses, overview, comments] = await Promise.all([
    getDb().select({ id: certifications.id, name: certifications.name }).from(certifications).where(eq(certifications.kind, "general")).orderBy(asc(certifications.name)),
    getReviewerOverview(),
    listOpenReviewerComments(),
  ]);
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <Link href="/admin" className="text-sm text-link hover:underline">← Admin</Link>
        <h1 className="mt-2 text-2xl font-semibold">{locale === "de" ? "Fachliche Prüfer" : "Expert reviewers"}</h1>
      </div>
      <ReviewersPanel
        locale={locale}
        courses={courses}
        reviewers={overview.reviewers}
        invitations={overview.invitations.map((i) => ({ ...i, expiresAt: i.expiresAt.toISOString() }))}
        comments={comments.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() }))}
      />
    </div>
  );
}
