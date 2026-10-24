export const dynamic = "force-dynamic";

import { asc } from "drizzle-orm";
import type { Seal } from "@/lib/reviewers/seal";
import { getSealSummaries } from "@/lib/server/approvals/seal";
import { CatalogView } from "@/components/dashboard/CatalogView";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { visibleCertificationsCondition } from "@/lib/server/catalog/visibility";
import { categoryIdsByCertification } from "@/lib/server/catalog/categories";
import { getDb } from "@/lib/server/db/client";
import { certifications, courseCategories } from "@/lib/server/db/schema";
import { shortCodeOf } from "@/lib/dashboard/logic";

/** Katalog: alle für die Person sichtbaren Zertifizierungen, mit denselben Kursgruppen als Filter wie im Betreiberkatalog. */
export default async function CatalogPage() {
  const user = await getCurrentUser();
  const db = getDb();
  const [certs, groups] = await Promise.all([
    db.select().from(certifications).where(await visibleCertificationsCondition(user ? { id: user.id, role: user.role } : null)).orderBy(certifications.name),
    db.select().from(courseCategories).orderBy(asc(courseCategories.position)),
  ]);
  const groupIds = await categoryIdsByCertification(certs.map((c) => c.id));
  const seals = await getSealSummaries(certs.map((c) => c.id)).catch(() => new Map<string, Seal>());
  return (
    <CatalogView
      certs={certs.map((c) => ({ id: c.id, slug: c.slug, name: c.name, provider: c.provider, version: c.examVersion, shortCode: shortCodeOf(c.name, c.shortCode), categoryId: c.categoryId, categoryIds: groupIds.get(c.id) ?? [], custom: c.courseType === "custom", summary: c.overview?.summary ?? null, seal: seals.get(c.id) ?? null }))}
      groups={groups.map((g) => ({ id: g.id, name: g.name, color: g.color }))}
      signedIn={Boolean(user)}
    />
  );
}
