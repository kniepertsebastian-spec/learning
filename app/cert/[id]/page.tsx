export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq, inArray } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import { certifications, domains, objectives, sections, lessons, objectiveProgress } from "@/lib/server/db/schema";
import { getServerLocale } from "@/lib/server/locale";
import { RemediationService } from "@/lib/server/remediation/service";

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

  const sectionIds = allSections.map((section) => section.id);
  const lessonRows =
    sectionIds.length > 0
      ? await db
          .select({ sectionId: lessons.sectionId })
          .from(lessons)
          .where(inArray(lessons.sectionId, sectionIds))
      : [];
  const sectionsWithLessons = new Set(lessonRows.map((lesson) => lesson.sectionId));

  const [session, locale] = await Promise.all([auth(), getServerLocale()]);

  // Fetch progress data if user is authenticated
  let progressData: ProgressData = {};
  let needsRemediation: Array<{ objectiveId: string; objectiveTitle: string }> = [];
  if (session?.user?.id) {
    const [progress, remediationTargets] = await Promise.all([
      db.select().from(objectiveProgress).where(eq(objectiveProgress.userId, session.user.id)),
      RemediationService.findObjectivesNeedingRemediation(session.user.id),
    ]);
    progressData = Object.fromEntries(
      progress.map((p) => [p.objectiveId, { masteryScore: Number(p.masteryScore), status: p.status }])
    );
    // Only show objectives that belong to this certification
    const certObjectiveIds = new Set(allObjectives.map((o) => o.id));
    needsRemediation = remediationTargets.filter((r) => certObjectiveIds.has(r.objectiveId));
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

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="mb-1 text-2xl font-semibold">{cert.name}</h1>
          <p className="text-sm text-foreground/70">
            {cert.examName} {cert.examVersion}
          </p>
        </div>
        {session && (
          <Link
            href={`/cert/${slug}/final-exam`}
            className="shrink-0 rounded-md border border-accent px-3 py-1.5 text-sm font-medium text-accent hover:bg-accent/10"
          >
            {locale === "de" ? "Abschlussprüfung" : "Final practice exam"}
          </Link>
        )}
      </div>

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

      {needsRemediation.length > 0 && (
        <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3">
          <p className="mb-2 text-sm font-medium text-yellow-800">
            {locale === "de"
              ? `${needsRemediation.length} Bereich(e) benötigen Wiederholung:`
              : `${needsRemediation.length} area(s) need review:`}
          </p>
          <div className="flex flex-wrap gap-2">
            {needsRemediation.map((r) => (
              <Link
                key={r.objectiveId}
                href={`/cert/${slug}/remediation/${r.objectiveId}`}
                className="rounded-md border border-yellow-300 bg-white px-3 py-1.5 text-sm text-yellow-800 hover:bg-yellow-100"
              >
                {r.objectiveTitle}
              </Link>
            ))}
          </div>
        </div>
      )}

      {allSections.length === 0 && (
        <div className="mb-6 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
          <p className="font-medium">
            {locale === "de" ? "Für diesen Kurs wurden noch keine Lerninhalte erzeugt." : "Learning content has not been generated for this course yet."}
          </p>
          <p className="mt-1 text-sm text-foreground/70">
            {locale === "de"
              ? "Im Adminbereich siehst du den Content-Status. Danach müssen Curriculum und Lektionen einmalig im App-Container erzeugt werden."
              : "Admin shows the content status. The curriculum and lessons then need to be generated once in the app container."}
          </p>
          {session && (
            <Link href={`/admin/certifications/${slug}`} className="mt-3 inline-block text-sm font-medium text-accent hover:underline">
              {locale === "de" ? "Zum Adminbereich" : "Open admin"}
            </Link>
          )}
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
                        {objSections.map((section) => {
                          const isReady = sectionsWithLessons.has(section.id);
                          const content = (
                            <>
                              <span>{section.title[locale]}</span>
                              <span className="shrink-0 text-xs text-foreground/50">
                                {isReady
                                  ? section.estimatedMinutes && `${section.estimatedMinutes} min`
                                  : locale === "de" ? "Inhalt fehlt" : "Content missing"}
                              </span>
                            </>
                          );

                          return isReady ? (
                            <Link
                              key={section.id}
                              href={`/cert/${slug}/section/${section.id}`}
                              className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm hover:border-accent hover:bg-background"
                            >
                              {content}
                            </Link>
                          ) : (
                            <div
                              key={section.id}
                              className="flex cursor-not-allowed items-center justify-between rounded-md border border-border px-3 py-2 text-sm opacity-60"
                            >
                              {content}
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
        })}
      </div>
    </div>
  );
}
