export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowLeft, CheckCircle, AlertCircle, AlertTriangle } from "lucide-react";
import { eq } from "drizzle-orm";
import { requireAdminPage } from "@/lib/server/auth-guards";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { getServerLocale } from "@/lib/server/locale";
import { ContentValidationService } from "@/lib/server/admin/validation";
import { AnalyticsService } from "@/lib/server/analytics/service";
import { ContentGenerationControl } from "@/components/ContentGenerationControl";
import {
  estimateGenerationWork,
  getLatestContentGenerationJob,
} from "@/lib/server/admin/content-generation";

export default async function AdminCertificationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  await requireAdminPage(`/admin/certifications/${slug}`);
  const locale = await getServerLocale();
  const db = getDb();

  const certRows = await db
    .select()
    .from(certifications)
    .where(eq(certifications.slug, slug))
    .limit(1);

  if (!certRows.length) {
    return (
      <div className="flex flex-1 flex-col">
        <Link
          href="/admin"
          className="mb-4 flex w-fit items-center gap-1.5 text-sm text-foreground/70 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {locale === "de" ? "Zurück zum Admin-Dashboard" : "Back to admin dashboard"}
        </Link>
        <p className="text-foreground/70">{locale === "de" ? "Zertifizierung nicht gefunden" : "Certification not found"}</p>
      </div>
    );
  }

  const cert = certRows[0];
  const [initialGenerationJob, initialEstimate] = await Promise.all([
    getLatestContentGenerationJob(cert.id),
    estimateGenerationWork(cert.id),
  ]);

  // Run validation
  const validation = await ContentValidationService.validateCertificationContent(cert.id);

  const [domainAnalytics, objectiveAnalytics, contentAnalytics] = await Promise.all([
    AnalyticsService.getDomainAnalytics(cert.id),
    AnalyticsService.getObjectiveAnalytics(cert.id),
    AnalyticsService.getContentAnalytics(cert.id),
  ]);

  const errorIssues = validation.results.flatMap((r) => r.issues).filter((i) => i.severity === "error");
  const warningIssues = validation.results.flatMap((r) => r.issues).filter((i) => i.severity === "warning");

  return (
    <div className="flex flex-1 flex-col">
      <Link
        href="/admin"
        className="mb-4 flex w-fit items-center gap-1.5 text-sm text-foreground/70 hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {locale === "de" ? "Zurück zum Admin-Dashboard" : "Back to admin dashboard"}
      </Link>

      <h1 className="mb-1 text-2xl font-semibold">{cert.name}</h1>
      <p className="mb-6 text-sm text-foreground/70">
        {cert.examName} {cert.examVersion}
      </p>

      <ContentGenerationControl
        certificationId={cert.id}
        locale={locale}
        initialJob={
          initialGenerationJob
            ? {
                id: initialGenerationJob.id,
                status: initialGenerationJob.status,
                phase: initialGenerationJob.phase,
                progress: initialGenerationJob.progress,
                message: initialGenerationJob.message,
                error: initialGenerationJob.error,
                errorClass: initialGenerationJob.errorClass,
              }
            : null
        }
        initialEstimate={initialEstimate}
      />

      <div className="grid gap-6">
        {/* Validation Summary */}
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="text-xs text-foreground/60">{locale === "de" ? "Gesamt" : "Total"}</p>
            <p className="mt-1 text-xl font-semibold">{validation.totalContent}</p>
          </div>
          <div className="rounded-lg border border-green-200/50 bg-green-50 p-4">
            <p className="text-xs text-green-700">{locale === "de" ? "Gültig" : "Valid"}</p>
            <p className="mt-1 text-xl font-semibold text-green-700">{validation.validContent}</p>
          </div>
          <div className="rounded-lg border border-red-200/50 bg-red-50 p-4">
            <p className="text-xs text-red-700">{locale === "de" ? "Fehler" : "Errors"}</p>
            <p className="mt-1 text-xl font-semibold text-red-700">{validation.invalidContent}</p>
          </div>
          <div className="rounded-lg border border-yellow-200/50 bg-yellow-50 p-4">
            <p className="text-xs text-yellow-700">{locale === "de" ? "Warnungen" : "Warnings"}</p>
            <p className="mt-1 text-xl font-semibold text-yellow-700">{validation.warnings}</p>
          </div>
        </div>

        {/* Issues by severity */}
        {errorIssues.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="h-5 w-5 text-red-700" />
              <h3 className="font-semibold text-red-700">
                {locale === "de" ? "Fehler" : "Errors"} ({errorIssues.length})
              </h3>
            </div>
            <ul className="space-y-1 text-sm text-red-700">
              {errorIssues.slice(0, 5).map((issue, i) => (
                <li key={i}>• {issue.message}</li>
              ))}
              {errorIssues.length > 5 && <li>• {locale === "de" ? "Und" : "And"} {errorIssues.length - 5} {locale === "de" ? "weitere..." : "more..."}</li>}
            </ul>
          </div>
        )}

        {warningIssues.length > 0 && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-yellow-700" />
              <h3 className="font-semibold text-yellow-700">
                {locale === "de" ? "Warnungen" : "Warnings"} ({warningIssues.length})
              </h3>
            </div>
            <ul className="space-y-1 text-sm text-yellow-700">
              {warningIssues.slice(0, 5).map((issue, i) => (
                <li key={i}>• {issue.message}</li>
              ))}
              {warningIssues.length > 5 && <li>• {locale === "de" ? "Und" : "And"} {warningIssues.length - 5} {locale === "de" ? "weitere..." : "more..."}</li>}
            </ul>
          </div>
        )}

        {errorIssues.length === 0 && warningIssues.length === 0 && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-700" />
              <p className="font-semibold text-green-700">
                {locale === "de" ? "Alle Inhalte validieren sich erfolgreich!" : "All content validates successfully!"}
              </p>
            </div>
          </div>
        )}

        {/* Analytics */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-3 font-medium">{locale === "de" ? "Domain-Mastery" : "Domain mastery"}</h3>
          {domainAnalytics.domains.length === 0 ? (
            <p className="text-sm text-foreground/60">
              {locale === "de" ? "Noch keine Lerndaten." : "No learner data yet."}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {domainAnalytics.domains.map((d) => (
                <div key={d.domainId} className="flex items-center justify-between text-sm">
                  <span>{d.domainName}</span>
                  <span className="text-foreground/70">
                    {d.avgMastery}% {locale === "de" ? "Ø Mastery" : "avg mastery"} · {d.completionRate}%{" "}
                    {locale === "de" ? "abgeschlossen" : "complete"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {objectiveAnalytics.problematicObjectives > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <h3 className="mb-3 font-medium text-red-700">
              {locale === "de" ? "Objectives mit niedriger Mastery (< 60%)" : "Objectives with low mastery (< 60%)"}
            </h3>
            <ul className="space-y-1 text-sm text-red-700">
              {objectiveAnalytics.objectivesByMastery
                .filter((o) => o.needsReview)
                .slice(0, 10)
                .map((o) => (
                  <li key={o.objectiveId}>
                    <span className="font-mono text-xs">{o.code}</span> {o.title} - {o.avgMastery}% (
                    {o.learnerCount} {locale === "de" ? "Lerner" : "learners"})
                  </li>
                ))}
            </ul>
          </div>
        )}

        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-3 font-medium">
            {locale === "de" ? "Problematische Fragen" : "Problem questions"}
          </h3>
          {contentAnalytics.problemQuestions.length === 0 ? (
            <p className="text-sm text-foreground/60">
              {locale === "de"
                ? `Keine Fragen mit niedriger Erfolgsquote (Ø ${contentAnalytics.avgSuccessRate}%, ${contentAnalytics.questionsWithEnoughData} Fragen mit genug Daten).`
                : `No questions with a low success rate (avg ${contentAnalytics.avgSuccessRate}%, ${contentAnalytics.questionsWithEnoughData} questions with enough data).`}
            </p>
          ) : (
            <ul className="space-y-1 text-sm text-foreground/70">
              {contentAnalytics.problemQuestions.map((q) => (
                <li key={q.questionId}>
                  <span className="font-mono text-xs">{q.humanId}</span> - {q.successRate}% (
                  {q.correctAttempts}/{q.totalAttempts})
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Content review workflow info */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-3 font-medium">
            {locale === "de" ? "Inhalts-Review-Workflow" : "Content Review Workflow"}
          </h3>
          <div className="space-y-2 text-sm text-foreground/70">
            <p>{locale === "de" ? "Status:" : "Status:"} <span className="font-medium">Generated</span></p>
            <p className="mt-2 text-xs">
              {locale === "de"
                ? "Inhalte durchlaufen: Generated → Pending Review → Approved → Published"
                : "Content flows through: Generated → Pending Review → Approved → Published"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
