export const dynamic = "force-dynamic";

import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { isCertificationHidden } from "@/lib/server/catalog/access";
import { peekActiveOrTodaySession, startStudySession } from "@/lib/server/study/session-service";

/**
 * Ziel des Links in der Reaktivierungs-Mail: startet direkt eine 3-Minuten-Runde und öffnet sie. Läuft heute schon eine
 * Session, geht es dorthin. Ohne Anmeldung leitet proxy.ts zur Anmeldung und danach hierher zurück.
 */
export default async function RestartPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: slug } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?from=${encodeURIComponent(`/cert/${slug}/restart`)}`);
  const userId = session.user.id;

  const [cert] = await getDb().select().from(certifications).where(eq(certifications.slug, slug)).limit(1);
  if (!cert || (await isCertificationHidden(userId, cert.id))) notFound();
  if (!cert.includeSectionQuizzes) redirect(`/cert/${slug}`);

  if (!(await peekActiveOrTodaySession(userId, cert.id))) {
    try {
      await startStudySession(userId, cert.id, 3, "minutes");
    } catch (error) {
      // Gleichzeitiger Start (zweiter Klick): die vorhandene Session wird unten ohnehin geöffnet.
      const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === "23505";
      if (!duplicate) throw error;
    }
  }
  redirect(`/cert/${slug}/session`);
}
