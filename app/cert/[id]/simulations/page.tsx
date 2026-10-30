export const dynamic = "force-dynamic";

import { c_certIdSimulationsPage } from "@/lib/i18n/components/certIdSimulationsPage";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import { unlockedForSimulations } from "@/lib/chapters/logic";
import { getChapterOverview } from "@/lib/server/chapters/service";
import { certifications, domains } from "@/lib/server/db/schema";
import { getServerLocale } from "@/lib/server/locale";
import { listCourseSimulations } from "@/lib/server/simulations/service";
import { SimulationsOverview } from "@/components/SimulationsOverview";

/**
 * Alle Simulationen eines Kurses mit dem eigenen Stand (offen, mit Mühe gelöst, gelöst). Die Sichtbarkeit regelt das
 * Layout unter /cert/[id] wie bei den Merkzetteln.
 */
export default async function SimulationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: slug } = await params;
  const [cert] = await getDb().select({ id: certifications.id, name: certifications.name }).from(certifications).where(eq(certifications.slug, slug)).limit(1);
  if (!cert) notFound();
  const [session, locale] = await Promise.all([auth(), getServerLocale()]);
  const de = locale === "de";
  const all = await listCourseSimulations(cert.id, session?.user?.id ?? null);
  // Wiederholungs-Hub: anwählbar sind nur Simulationen aus abgeschlossenen Kapiteln, die übrigen bleiben gesperrt.
  const chapters = session?.user?.id
    ? await getChapterOverview(session.user.id, cert.id)
    : (await getDb().select({ id: domains.id, orderNum: domains.orderNum, name: domains.name }).from(domains).where(eq(domains.certificationId, cert.id)).orderBy(asc(domains.orderNum))).map((d) => ({ domainId: d.id, orderNum: d.orderNum, name: d.name, completed: false }));
  const unlocked = unlockedForSimulations(chapters);
  const items = all.filter((i) => unlocked.has(i.domainId));
  const locked = chapters
    .filter((c) => !unlocked.has(c.domainId))
    .map((c) => ({ name: c.name, count: all.filter((i) => i.domainId === c.domainId).length }))
    .filter((c) => c.count > 0);

  return (
    <div className="mx-auto w-full max-w-3xl" data-testid="simulations-page">
      <Link href={`/cert/${slug}`} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {cert.name}
      </Link>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">{c_certIdSimulationsPage(de).simulations}</h1>
        <p className="text-sm text-muted">{c_certIdSimulationsPage(de).applyWhatYouVeLearned}</p>
      </div>
      {all.length === 0 ? (
        <p className="text-sm text-muted" data-testid="simulations-empty">
          {c_certIdSimulationsPage(de).thisCourseHasNoSimulations}
        </p>
      ) : (
        <SimulationsOverview certSlug={slug} items={items} locked={locked} locale={locale} signedIn={Boolean(session?.user?.id)} />
      )}
    </div>
  );
}
