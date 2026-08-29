export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import { certifications, domains, objectives, sections, objectiveProgress } from "@/lib/server/db/schema";
import { getServerLocale } from "@/lib/server/locale";

interface ProgressData {
  [key: string]: { masteryScore: number; status: string };
}

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

  // Fetch progress data if user is authenticated
  let progressData: ProgressData = {};
  if (session?.user?.id) {
    const progress = await db
      .select()
      .from(objectiveProgress)
      .where(eq(objectiveProgress.userId, session.user.id));
    progressData = Object.fromEntries(
      progress.map((p) => [p.objectiveId, { masteryScore: Number(p.masteryScore), status: p.status }])
    );
  }

  // Calculate domain mastery
  const domainMastery: { [key: string]: { mastery: number; strong: number; ok: number; total: number } } = {};
  allDomains.forEach((domain) => {
    const domainObjs = allObjectives.filter((o) => o.domainId === domain.id);
    const strong = domainObjs.filter((o) => progressData[o.id]?.status === "STRONG").length;
    const ok = domainObjs.filter((o) => progressData[o.id]?.status === "OK").length;
    const total = domainObjs.length;
    const mastery = total > 0 ? Math.round(((strong * 100 + ok * 50) / (total * 100)) * 100) : 0;
    domainMastery[domain.id] = { mastery, strong, ok, total };
  });

  const getStatusColor = (status?: string): string => {
    switch (status) {
      case "STRONG":
        return "bg-green-500";
      case "OK":
        return "bg-blue-500";
      default:
        return "bg-gray-300";
    }
  };

  const getStatusLabel = (status?: string): string => {
    switch (status) {
      case "STRONG":
        return locale === "de" ? "Stark" : "Strong";
      case "OK":
        return locale === "de" ? "Gut" : "Good";
      default:
        return locale === "de" ? "Lernen" : "Learning";
    }
  };

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
          const { mastery } = domainMastery[domain.id] || { mastery: 0 };
          return (
            <div key={domain.id}>
              <div className="mb-4 flex items-end justify-between">
                <div>
                  <h2 className="text-lg font-semibold">
                    {domain.name}
                    {domain.weightPercent && (
                      <span className="ml-2 text-sm font-normal text-foreground/60">
                        ({domain.weightPercent}%)
                      </span>
                    )}
                  </h2>
                </div>
                {session && (
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-24 rounded-full bg-gray-300">
                      <div
                        className="h-full rounded-full bg-accent transition-all"
                        style={{ width: `${mastery}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-foreground/70">{mastery}%</span>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-4">
                {domainObjectives.map((obj) => {
                  const objSections = allSections.filter((s) => s.objectiveId === obj.id);
                  const progress = progressData[obj.id];
                  return (
                    <div key={obj.id} className="rounded-lg border border-border bg-surface p-4">
                      <div className="mb-3 flex items-start justify-between">
                        <div className="flex-1">
                          <p className="text-sm font-medium">
                            <span className="mr-2 font-mono text-xs text-foreground/50">{obj.code}</span>
                            {obj.title}
                          </p>
                        </div>
                        {session && progress && (
                          <div className="ml-4 flex shrink-0 flex-col items-end gap-1">
                            <div className="flex items-center gap-1.5">
                              <div className={`h-2 w-12 rounded-full ${getStatusColor(progress.status)}`} />
                              <span className="text-xs font-medium text-foreground/70">
                                {progress.masteryScore}%
                              </span>
                            </div>
                            <span className="text-xs text-foreground/60">{getStatusLabel(progress.status)}</span>
                          </div>
                        )}
                      </div>
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
