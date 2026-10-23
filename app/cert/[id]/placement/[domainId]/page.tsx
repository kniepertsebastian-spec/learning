export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { PlacementTest } from "@/components/PlacementTest";
import { auth } from "@/lib/server/auth";
import { isCertificationHidden } from "@/lib/server/catalog/access";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { loadPlacementTest, PlacementNotFoundError } from "@/lib/server/placement/service";

/** Einstiegstest für ein Kapitel (Domain): „Kenne ich schon?“ (roadmap_didaktik Phase 4.2). */
export default async function PlacementPage({ params }: { params: Promise<{ id: string; domainId: string }> }) {
  const { id: slug, domainId } = await params;
  const session = await auth();
  if (!session?.user?.id) notFound(); // proxy.ts leitet nicht Angemeldete schon auf /login um
  const [cert] = await getDb().select().from(certifications).where(eq(certifications.slug, slug)).limit(1);
  if (!cert || !cert.includeSectionQuizzes || (await isCertificationHidden(session.user.id, cert.id))) notFound();
  let test;
  try {
    test = await loadPlacementTest(session.user.id, domainId);
  } catch (error) {
    if (error instanceof PlacementNotFoundError) notFound();
    throw error;
  }
  if (test.certificationId !== cert.id || test.questions.length === 0) notFound();
  return <PlacementTest slug={slug} test={test} />;
}
