export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, RotateCcw, TrendingDown, TrendingUp } from "lucide-react";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { getServerLocale } from "@/lib/server/locale";
import { ExamAttemptNotFoundError, getExamAttemptDetail } from "@/lib/server/exam/history";

function formatDuration(seconds: number | null, locale: "de" | "en"): string {
  if (seconds === null) return "–";
  const minutes = Math.round(seconds / 60);
  return locale === "de" ? `${minutes} Min.` : `${minutes} min`;
}

/**
 * R3 (roadmap.md): "Detailseite pro Versuch mit Domain- und Objective-
 * Auswertung" + "Vergleich mit dem vorherigen Versuch" + "wiederholt falsch
 * beantwortete Themen hervorheben" + "Direkten Einstieg in Remediation oder
 * Tagesplan anbieten". Zeigt bewusst KEINEN Fragewortlaut - siehe R3-Regel
 * "Fragewortlaut nach einer Prüfung nur anzeigen, wenn dies mit der
 * gewünschten Wiederverwendungsstrategie der Fragen vereinbar ist": nur
 * Domain-/Objective-Aggregate.
 */
export default async function ExamAttemptDetailPage({
  params,
}: {
  params: Promise<{ id: string; attemptId: string }>;
}) {
  const { id: slug, attemptId } = await params;
  const [session, locale] = await Promise.all([auth(), getServerLocale()]);

  if (!session?.user?.id) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center">
        <p className="text-foreground/70">
          {locale === "de" ? "Bitte melde dich an." : "Please sign in."}
        </p>
      </div>
    );
  }

  const [cert] = await getDb()
    .select()
    .from(certifications)
    .where(eq(certifications.slug, slug))
    .limit(1);
  if (!cert) notFound();

  let detail;
  try {
    detail = await getExamAttemptDetail(session.user.id, attemptId, locale);
  } catch (error) {
    if (error instanceof ExamAttemptNotFoundError) notFound();
    throw error;
  }

  const { scoring, previousScore, repeatedWeakObjectiveCodes } = detail;
  const delta = previousScore !== null ? scoring.overallScore - previousScore : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-1 flex-col py-6">
      <Link
        href={`/cert/${slug}/history`}
        className="mb-4 flex w-fit items-center gap-1.5 text-sm text-foreground/70 hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {locale === "de" ? "Zurück zu meinen Prüfungen" : "Back to my exams"}
      </Link>

      <div className="mb-6 rounded-lg border border-border bg-surface p-6 text-center">
        <p className="mb-1 text-4xl font-bold">{scoring.overallScore}%</p>
        <p className="mb-1 text-lg font-medium">{scoring.readinessLabel}</p>
        <p className="mb-2 text-xs text-foreground/50">
          {detail.completedAt?.toLocaleDateString(locale === "de" ? "de-DE" : "en-US")} ·{" "}
          {formatDuration(detail.durationSeconds, locale)}
        </p>

        {previousScore === null ? (
          <p className="text-xs text-foreground/50">
            {locale === "de" ? "Kein vorheriger Versuch zum Vergleich." : "No previous attempt to compare."}
          </p>
        ) : (
          <p
            className={`flex items-center justify-center gap-1 text-xs font-medium ${
              delta !== null && delta > 0
                ? "text-green-600"
                : delta !== null && delta < 0
                  ? "text-red-600"
                  : "text-foreground/60"
            }`}
          >
            {delta !== null && delta > 0 && <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />}
            {delta !== null && delta < 0 && <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />}
            {locale === "de" ? "vs. voriger Versuch" : "vs. previous attempt"}: {previousScore}% (
            {delta !== null && delta >= 0 ? "+" : ""}
            {delta}%)
          </p>
        )}
      </div>

      {scoring.domainPerformance.length > 0 && (
        <div className="mb-6 rounded-lg border border-border bg-surface p-4">
          <h2 className="mb-3 font-medium">{locale === "de" ? "Nach Domain" : "By domain"}</h2>
          <div className="flex flex-col gap-2">
            {scoring.domainPerformance.map((d) => (
              <div key={d.domainId} className="flex items-center justify-between text-sm">
                <span>{d.domainName}</span>
                <span className="font-medium">{d.score}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {scoring.weakObjectives.length > 0 && (
        <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <h2 className="mb-3 font-medium text-yellow-800">
            {locale === "de" ? "Schwache Bereiche" : "Weak areas"}
          </h2>
          <ul className="flex flex-col gap-2">
            {scoring.weakObjectives.map((w) => {
              const isRepeated = repeatedWeakObjectiveCodes.includes(w.objectiveCode);
              return (
                <li key={w.objectiveId} className="text-sm text-yellow-800">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-xs">{w.objectiveCode}</span>
                    <span>{w.objectiveTitle}</span>
                    <span className="text-xs">({w.examScore}%)</span>
                    {isRepeated && (
                      <span className="flex items-center gap-1 rounded-full bg-yellow-200 px-1.5 py-0.5 text-[10px] font-medium text-yellow-900">
                        <RotateCcw className="h-2.5 w-2.5" aria-hidden="true" />
                        {locale === "de" ? "wiederholt schwach" : "repeatedly weak"}
                      </span>
                    )}
                  </div>
                  <Link
                    href={`/cert/${slug}/remediation/${w.objectiveId}`}
                    className="mt-1 inline-block text-xs font-medium text-accent hover:underline"
                  >
                    {locale === "de" ? "Gezielt üben →" : "Practice this now →"}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {scoring.recommendations.length > 0 && (
        <div className="mb-6 rounded-lg border border-border bg-surface p-4">
          <h2 className="mb-2 font-medium">{locale === "de" ? "Empfehlungen" : "Recommendations"}</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm text-foreground/70">
            {scoring.recommendations.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href={`/cert/${slug}/session`}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          {locale === "de" ? "Heute lernen" : "Study today"}
        </Link>
        <Link
          href={`/cert/${slug}`}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-surface"
        >
          {locale === "de" ? "Zurück zur Zertifizierung" : "Back to certification"}
        </Link>
      </div>
    </div>
  );
}
