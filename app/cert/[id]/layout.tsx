import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { canViewCertification } from "@/lib/server/catalog/visibility";
import { LearningTimeTracker } from "@/components/LearningTimeTracker";

/**
 * Alle Seiten unter /cert/[id]: Lernpfade, die noch nicht fachlich freigegeben sind, und interne Lernpfade
 * anderer Firmen gibt es für alle außer Plattform-Admins nicht (404, nicht 403, damit nichts verraten wird).
 */
export default async function CertLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id: slug } = await params;
  const [cert] = await getDb()
    .select({ id: certifications.id, kind: certifications.kind, ownerOrganizationId: certifications.ownerOrganizationId, catalogStatus: certifications.catalogStatus })
    .from(certifications)
    .where(eq(certifications.slug, slug))
    .limit(1);
  if (!cert) return children; // die Seiten selbst melden „nicht gefunden“
  const user = await getCurrentUser();
  if (!(await canViewCertification(user ? { id: user.id, role: user.role } : null, cert))) notFound();
  return (
    <>
      {user && <LearningTimeTracker certificationId={cert.id} />}
      {children}
    </>
  );
}
