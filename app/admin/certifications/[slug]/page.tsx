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
import { ContentReportQueue } from "@/components/ContentReportQueue";
import {
  estimateGenerationWork,
  getAiBudgetStatus,
  getLatestContentGenerationJob,
} from "@/lib/server/admin/content-generation";
import { getObjectiveCostsForCertification } from "@/lib/server/admin/objective-costs";

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
  const [initialGenerationJob, initialEstimate, initialBudget] = await Promise.all([
    getLatestContentGenerationJob(cert.id),
    estimateGenerationWork(cert.id),
    getAiBudgetStatus(),
  ]);

  // Run validation
  const validation = await ContentValidationService.validateCertificationContent(cert.id);

  const [domainAnalytics, objectiveAnalytics, contentAnalytics, objectiveCosts] = await Promise.all([
    AnalyticsService.getDomainAnalytics(cert.id),
    AnalyticsService.getObjectiveAnalytics(cert.id),
    AnalyticsService.getContentAnalytics(cert.id),
    getObjectiveCostsForCertification(cert.id),
  ]);
  const objectiveCostsWithData = objectiveCosts
    .filter((o) => o.promptTokens > 0)
    .sort((a, b) => (b.estimatedCostUsd ?? 0) - (a.estimatedCostUsd ?? 0));
  const totalObjectiveCostUsd = objectiveCostsWithData.every((o) => o.estimatedCostUsd !== null)
    ? objectiveCostsWithData.reduce((sum, o) => sum + (o.estimatedCostUsd ?? 0), 0)
    : null;
  const totalAcceptedLessons = objectiveCostsWithData.reduce((sum, o) => sum + o.acceptedLessonCount, 0);
  const totalAcceptedQuestions = objectiveCostsWithData.reduce((sum, o) => sum + o.acceptedQuestionCount, 0);

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

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-2xl font-semibold">{cert.name}</h1>
          <p className="text-sm text-foreground/70">
            {cert.examName} {cert.examVersion}
          </p>
        </div>
        <Link
          href={`/admin/certifications/${slug}/sources`}
          className="rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-background"
        >
          {locale === "de" ? "Offizielle Quellen verwalten" : "Manage official sources"}
        </Link>
      </div>

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
                model: initialGenerationJob.model,
                totalTokens: initialGenerationJob.totalTokens,
                estimatedCostUsd: initialGenerationJob.estimatedCostUsd,
              }
            : null
        }
        initialEstimate={initialEstimate}
        initialBudget={initialBudget}
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

        {/* R1.4: Quellenabdeckung - vollständige Ansicht (Adminbereich), nur
            relevant sobald eine Quelle freigegeben wurde. */}
        {validation.sourceCoverage.hasApprovedSource && (
          <div
            className={`rounded-lg border p-4 ${
              validation.sourceCoverage.objectivesWithoutReference.length > 0
                ? "border-yellow-200 bg-yellow-50"
                : "border-green-200 bg-green-50"
            }`}
          >
            <h3
              className={`mb-2 font-medium ${
                validation.sourceCoverage.objectivesWithoutReference.length > 0
                  ? "text-yellow-700"
                  : "text-green-700"
              }`}
            >
              {locale === "de" ? "Quellenabdeckung" : "Source coverage"}
            </h3>
            {validation.sourceCoverage.objectivesWithoutReference.length === 0 ? (
              <p className="text-sm text-green-700">
                {locale === "de"
                  ? "Jedes Objective hat mindestens eine Quellenreferenz."
                  : "Every objective has at least one source reference."}
              </p>
            ) : (
              <>
                <p className="mb-2 text-sm text-yellow-700">
                  {locale === "de"
                    ? `${validation.sourceCoverage.objectivesWithoutReference.length} Objective(s) ohne Quellenreferenz:`
                    : `${validation.sourceCoverage.objectivesWithoutReference.length} objective(s) without a source reference:`}
                </p>
                <ul className="space-y-1 text-sm text-yellow-700">
                  {validation.sourceCoverage.objectivesWithoutReference.map((o) => (
                    <li key={o.id}>
                      <span className="font-mono text-xs">{o.code}</span> {o.title}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {/* R1.5: veraltete Inhalte nach dem Freigeben einer neuen
            Quellenversion - Neugenerierung (Button oben) erzeugt gezielt
            nur diese neu. */}
        {(validation.staleContent.staleLessons > 0 || validation.staleContent.staleQuestions > 0) && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
            <h3 className="mb-1 font-medium text-yellow-700">
              {locale === "de" ? "Veraltete Inhalte" : "Stale content"}
            </h3>
            <p className="text-sm text-yellow-700">
              {locale === "de"
                ? `${validation.staleContent.staleLessons} Lesson(s) und ${validation.staleContent.staleQuestions} Frage(n) durch eine neuere Quellenversion veraltet. "Inhalte generieren" oben erzeugt gezielt nur diese neu.`
                : `${validation.staleContent.staleLessons} lesson(s) and ${validation.staleContent.staleQuestions} question(s) are stale due to a newer source version. "Generate content" above regenerates just those.`}
            </p>
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

        {/* R6 (roadmap.md): "Kosten je veröffentlichter Lesson, Mission und
            akzeptierter Frage" - Snapshot je Objective, siehe
            lib/server/admin/objective-costs.ts. */}
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="mb-3 font-medium">
            {locale === "de" ? "Kosten je Objective" : "Cost per objective"}
          </h3>
          {objectiveCostsWithData.length === 0 ? (
            <p className="text-sm text-foreground/60">
              {locale === "de"
                ? "Noch keine Kostendaten (werden bei der nächsten Generierung erfasst)."
                : "No cost data yet (recorded on the next generation run)."}
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-foreground/70">
                {locale === "de"
                  ? `Insgesamt ${totalObjectiveCostUsd !== null ? `$${totalObjectiveCostUsd.toFixed(4)}` : "unbekannt (Preise nicht konfiguriert)"} für ${totalAcceptedLessons} Lesson(s) und ${totalAcceptedQuestions} Frage(n) über ${objectiveCostsWithData.length} Objective(s).`
                  : `$${totalObjectiveCostUsd !== null ? totalObjectiveCostUsd.toFixed(4) : "unknown (pricing not configured)"} total for ${totalAcceptedLessons} lesson(s) and ${totalAcceptedQuestions} question(s) across ${objectiveCostsWithData.length} objective(s).`}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs text-foreground/50">
                      <th className="pb-2 pr-3 font-medium">{locale === "de" ? "Objective" : "Objective"}</th>
                      <th className="pb-2 pr-3 font-medium">{locale === "de" ? "Modell" : "Model"}</th>
                      <th className="pb-2 pr-3 text-right font-medium">Tokens</th>
                      <th className="pb-2 pr-3 text-right font-medium">
                        {locale === "de" ? "Kosten" : "Cost"}
                      </th>
                      <th className="pb-2 pr-3 text-right font-medium">
                        {locale === "de" ? "Lessons/Fragen" : "Lessons/questions"}
                      </th>
                      <th className="pb-2 text-right font-medium">
                        {locale === "de" ? "~je Element" : "~per item"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {objectiveCostsWithData.slice(0, 15).map((o) => (
                      <tr key={o.objectiveId} className="border-t border-border/60">
                        <td className="py-1.5 pr-3">
                          <span className="font-mono text-xs">{o.objectiveCode}</span> {o.objectiveTitle}
                        </td>
                        <td className="py-1.5 pr-3 text-xs text-foreground/60">{o.model ?? "–"}</td>
                        <td className="py-1.5 pr-3 text-right">{o.totalTokens.toLocaleString(locale)}</td>
                        <td className="py-1.5 pr-3 text-right">
                          {o.estimatedCostUsd !== null ? `$${o.estimatedCostUsd.toFixed(4)}` : "–"}
                        </td>
                        <td className="py-1.5 pr-3 text-right">
                          {o.acceptedLessonCount}/{o.acceptedQuestionCount}
                        </td>
                        <td className="py-1.5 text-right">
                          {o.estimatedCostPerItemUsd !== null ? `$${o.estimatedCostPerItemUsd.toFixed(4)}` : "–"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {objectiveCostsWithData.length > 15 && (
                  <p className="mt-2 text-xs text-foreground/50">
                    {locale === "de"
                      ? `Und ${objectiveCostsWithData.length - 15} weitere.`
                      : `And ${objectiveCostsWithData.length - 15} more.`}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <ContentReportQueue certificationId={cert.id} locale={locale} />
      </div>
    </div>
  );
}
