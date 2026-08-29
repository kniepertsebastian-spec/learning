export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import { certifications, domains, objectives, sections } from "@/lib/server/db/schema";
import { getServerLocale } from "@/lib/server/locale";

export default async function CertDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: slug } = await params;
  const db = getDb();

  const certRows = await db
    .select()
    .from(certifications)
    .where(eq(certifications.slug, slug))
    .limit(1);

  if (!certRows.length) notFound();
  const cert = certRows[0];

  const allDomains = await db
    .select()
    .from(domains)
    .where(eq(domains.certificationId, cert.id))
    .orderBy(domains.orderNum);

  const domainIds = allDomains.map((d) => d.id);
  const allObjectives =
    domainIds.length > 0
      ? await db.select().from(objectives).where(inArray(objectives.domainId, domainIds))
      : [];

  const objectiveIds = allObjectives.map((o) => o.id);
  const allSections =
    objectiveIds.length > 0
      ? await db
          .select()
          .from(sections)
          .where(inArray(sections.objectiveId, objectiveIds))
          .orderBy(sections.orderNum)
      : [];

  const [session, locale] = await Promise.all([auth(), getServerLocale()]);

  return (
    <div className="flex flex-1 flex-col">
      <Link
        href="/"
        className="mb-4 flex w-fit items-center gap-1.5 text-sm text-foreground/70 hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {locale === "de" ? "Zurück zum Dashboard" : "Back to dashboard"}
      </Link>

      <h1 className="mb-1 text-2xl font-semibold">{cert.name}</h1>
      <p className="mb-6 text-sm text-foreground/70">
        {cert.examName} {cert.examVersion}
      </p>

      {!session && (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-border bg-surface px-4 py-3">
          <p className="text-sm text-foreground/70">
            {locale === "de"
              ? "Melde dich an, um deinen Fortschritt zu speichern."
              : "Sign in to save your progress."}
          </p>
          <Link
            href="/login"
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
          >
            {locale === "de" ? "Anmelden" : "Sign in"}
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-8">
        {allDomains.map((domain) => {
          const domainObjectives = allObjectives.filter((o) => o.domainId === domain.id);
          return (
            <div key={domain.id}>
              <h2 className="mb-4 text-lg font-semibold">
                {domain.name}
                {domain.weightPercent && (
                  <span className="ml-2 text-sm font-normal text-foreground/60">
                    ({domain.weightPercent}%)
                  </span>
                )}
              </h2>
              <div className="flex flex-col gap-4">
                {domainObjectives.map((obj) => {
                  const objSections = allSections.filter((s) => s.objectiveId === obj.id);
                  return (
                    <div key={obj.id} className="rounded-lg border border-border bg-surface p-4">
                      <p className="mb-3 text-sm font-medium">
                        <span className="mr-2 font-mono text-xs text-foreground/50">{obj.code}</span>
                        {obj.title}
                      </p>
                      <div className="flex flex-col gap-1.5">
                        {objSections.map((section) => (
                          <Link
                            key={section.id}
                            href={`/cert/${slug}/section/${section.id}`}
                            className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:border-accent hover:bg-background"
                          >
                            <span>{section.title[locale]}</span>
                            {section.estimatedMinutes && (
                              <span className="shrink-0 text-xs text-foreground/50">
                                {section.estimatedMinutes} min
                              </span>
                            )}
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
