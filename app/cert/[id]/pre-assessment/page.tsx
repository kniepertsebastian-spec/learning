export const dynamic = "force-dynamic";

import { redirect, notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { PreAssessment } from "@/components/PreAssessment";
import { auth } from "@/lib/server/auth";
import { isCertificationHidden } from "@/lib/server/catalog/access";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { getPreAssessmentRecord, loadPreAssessment } from "@/lib/server/pre-assessment/service";

/** Einstufungstest (10 Auswahlfragen quer durch den Kurs), einmalig direkt nach der Kurswahl. */
export default async function PreAssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: slug } = await params;
  const session = await auth();
  if (!session?.user?.id) notFound(); // proxy.ts leitet nicht Angemeldete schon auf /login um
  const [cert] = await getDb().select().from(certifications).where(eq(certifications.slug, slug)).limit(1);
  if (!cert || !cert.includeSectionQuizzes || (await isCertificationHidden(session.user.id, cert.id))) notFound();
  // Einmalig: wer ihn schon gemacht oder übersprungen hat, geht direkt in den Kurs.
  if (await getPreAssessmentRecord(session.user.id, cert.id)) redirect(`/cert/${slug}`);
  const test = await loadPreAssessment(cert.id);
  if (test.questions.length === 0) redirect(`/cert/${slug}`);
  return <PreAssessment slug={slug} test={test} />;
}
