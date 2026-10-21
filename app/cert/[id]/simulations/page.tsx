export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
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
  const items = await listCourseSimulations(cert.id, session?.user?.id ?? null);

  return (
    <div className="mx-auto w-full max-w-3xl" data-testid="simulations-page">
      <Link href={`/cert/${slug}`} className="mb-4 inline-flex items-center gap-1 text-sm text-foreground/70 hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {cert.name}
      </Link>
      <div className="mb-5">
        <h1 className="text-2xl font-semibold">{de ? "Simulationen" : "Simulations"}</h1>
        <p className="text-sm text-foreground/70">{de ? "Hier wendest du das Gelernte selbst an. Jede Simulation steht in ihrer Lektion; ein Klick führt direkt dorthin." : "Apply what you've learned. Each simulation lives in its lesson; one click takes you straight there."}</p>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-foreground/70" data-testid="simulations-empty">
          {de ? "Dieser Kurs hat noch keine Simulationen." : "This course has no simulations yet."}
        </p>
      ) : (
        <SimulationsOverview certSlug={slug} items={items} locale={locale} signedIn={Boolean(session?.user?.id)} />
      )}
    </div>
  );
}
