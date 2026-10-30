export const dynamic = "force-dynamic";

import { c_adminCertificationsSlugPage } from "@/lib/i18n/components/adminCertificationsSlugPage";
import { fill } from "@/lib/i18n/fill";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { StatTile } from "@/components/ui/stat-tile";
import { ArrowLeft, CheckCircle, AlertCircle, AlertTriangle } from "lucide-react";
import { eq } from "drizzle-orm";
import { requireAdminPage } from "@/lib/server/auth-guards";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { getServerLocale } from "@/lib/server/locale";
import { ContentValidationService } from "@/lib/server/admin/validation";
import { AnalyticsService } from "@/lib/server/analytics/service";
import { ContentGenerationControl } from "@/components/ContentGenerationControl";
import { ExamInfoForm } from "@/components/admin/ExamInfoForm";
import { DeleteCertification } from "@/components/DeleteCertification";
import { ContentReportQueue } from "@/components/ContentReportQueue";
import { FeedbackQueue } from "@/components/FeedbackQueue";
import { listOpenFeedback } from "@/lib/server/feedback/service";
import { PrerequisiteReviewQueue } from "@/components/PrerequisiteReviewQueue";
import { ExplanationReviewQueue } from "@/components/ExplanationReviewQueue";
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
          className="mb-4 flex w-fit items-center gap-1.5 text-sm text-muted hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {c_adminCertificationsSlugPage(locale).backToAdminDashboard}
        </Link>
        <p className="text-muted">{c_adminCertificationsSlugPage(locale).certificationNotFound}</p>
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
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-2xl font-semibold tracking-title sm:text-title">{cert.name}</h1>
          <p className="text-sm text-muted">
            {cert.examName} {cert.examVersion}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
        {cert.kind === "general" && (
          <Link href={`/admin/certifications/${slug}/workshop`} className={buttonVariants({ size: "md" })} data-testid="open-workshop">
            {c_adminCertificationsSlugPage(locale).editCourse}
          </Link>
        )}
        <Link
          href={`/admin/certifications/${slug}/sources`}
          className={buttonVariants({ variant: "secondary", size: "md" })}
        >
          {c_adminCertificationsSlugPage(locale).manageOfficialSources}
        </Link>
        </div>
      </div>

      <nav aria-label={c_adminCertificationsSlugPage(locale).sections} className="sticky top-14 z-10 -mx-1 mb-6 flex gap-1 overflow-x-auto bg-background px-1 py-2 md:top-10">
        {[
          ["generation", c_adminCertificationsSlugPage(locale).generateContent],
          ["exam-info", c_adminCertificationsSlugPage(locale).examData],
          ["quality", c_adminCertificationsSlugPage(locale).quality],
          ["feedback", c_adminCertificationsSlugPage(locale).reports],
          ...(cert.kind === "general" ? [["reviews", c_adminCertificationsSlugPage(locale).reviewQueues], ["danger", c_adminCertificationsSlugPage(locale).deleteCourse]] : []),
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="shrink-0 rounded-full border border-border px-3 py-1.5 text-meta font-medium text-muted hover:border-border-strong hover:text-foreground">
            {label}
          </a>
        ))}
      </nav>

      <div id="generation" className="scroll-mt-28">
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
      </div>

      <div id="exam-info" className="mb-6 scroll-mt-28">
        <ExamInfoForm
          certId={cert.id}
          locale={locale}
          initial={{ examProvider: cert.examProvider, deliveryModes: cert.deliveryModes, bookingUrl: cert.bookingUrl, testCenterUrl: cert.testCenterUrl, validityMonths: cert.validityMonths, successorNote: cert.successorNote }}
        />
      </div>

      <div className="grid gap-6">
        <h2 id="quality" className="scroll-mt-28 text-lg font-semibold">{c_adminCertificationsSlugPage(locale).contentQuality}</h2>
        {/* Validation Summary */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label={c_adminCertificationsSlugPage(locale).total} value={validation.totalContent} />
          <StatTile label={c_adminCertificationsSlugPage(locale).valid} value={<span className="text-success-text">{validation.validContent}</span>} />
          <StatTile label={c_adminCertificationsSlugPage(locale).errors} value={<span className={validation.invalidContent > 0 ? "text-danger-text" : undefined}>{validation.invalidContent}</span>} />
          <StatTile label={c_adminCertificationsSlugPage(locale).warnings} value={<span className={validation.warnings > 0 ? "text-warning-text" : undefined}>{validation.warnings}</span>} />
        </div>

        {/* Issues by severity */}
        {errorIssues.length > 0 && (
          <div className="rounded-lg border border-danger/40 bg-danger-soft p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertCircle className="h-5 w-5 text-danger-text" />
              <h3 className="font-semibold text-danger-text">
                {c_adminCertificationsSlugPage(locale).errors} ({errorIssues.length})
              </h3>
            </div>
            <ul className="space-y-1 text-sm text-danger-text">
              {errorIssues.slice(0, 5).map((issue, i) => (
                <li key={i}>• {issue.message}</li>
              ))}
              {errorIssues.length > 5 && <li>• {c_adminCertificationsSlugPage(locale).and} {errorIssues.length - 5} {c_adminCertificationsSlugPage(locale).more}</li>}
            </ul>
          </div>
        )}

        {warningIssues.length > 0 && (
          <div className="rounded-lg border border-warning/40 bg-warning-soft p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-warning-text" />
              <h3 className="font-semibold text-warning-text">
                {c_adminCertificationsSlugPage(locale).warnings} ({warningIssues.length})
              </h3>
            </div>
            <ul className="space-y-1 text-sm text-warning-text">
              {warningIssues.slice(0, 5).map((issue, i) => (
                <li key={i}>• {issue.message}</li>
              ))}
              {warningIssues.length > 5 && <li>• {c_adminCertificationsSlugPage(locale).and} {warningIssues.length - 5} {c_adminCertificationsSlugPage(locale).more}</li>}
            </ul>
          </div>
        )}

        {errorIssues.length === 0 && warningIssues.length === 0 && (
          <div className="rounded-lg border border-success-border bg-success-soft p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-success-text" />
              <p className="font-semibold text-success-text">
                {c_adminCertificationsSlugPage(locale).allContentValidatesSuccessfully}
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
                ? "border-warning/40 bg-warning-soft"
                : "border-success-border bg-success-soft"
            }`}
          >
            <h3
              className={`mb-2 font-medium ${
                validation.sourceCoverage.objectivesWithoutReference.length > 0
                  ? "text-warning-text"
                  : "text-success-text"
              }`}
            >
              {c_adminCertificationsSlugPage(locale).sourceCoverage}
            </h3>
            {validation.sourceCoverage.objectivesWithoutReference.length === 0 ? (
              <p className="text-sm text-success-text">
                {c_adminCertificationsSlugPage(locale).everyObjectiveHasAtLeast}
              </p>
            ) : (
              <>
                <p className="mb-2 text-sm text-warning-text">
                  {fill(c_adminCertificationsSlugPage(locale).n0ObjectiveSWithoutA, validation.sourceCoverage.objectivesWithoutReference.length)}
                </p>
                <ul className="space-y-1 text-sm text-warning-text">
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
          <div className="rounded-lg border border-warning/40 bg-warning-soft p-4">
            <h3 className="mb-1 font-medium text-warning-text">
              {c_adminCertificationsSlugPage(locale).staleContent}
            </h3>
            <p className="text-sm text-warning-text">
              {fill(c_adminCertificationsSlugPage(locale).n0LessonSAnd1, validation.staleContent.staleLessons, validation.staleContent.staleQuestions)}
            </p>
          </div>
        )}

        {/* Analytics */}
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="mb-3 font-medium">{c_adminCertificationsSlugPage(locale).domainMastery}</h3>
          {domainAnalytics.domains.length === 0 ? (
            <p className="text-sm text-subtle">
              {c_adminCertificationsSlugPage(locale).noLearnerDataYet}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {domainAnalytics.domains.map((d) => (
                <div key={d.domainId} className="flex items-center justify-between text-sm">
                  <span>{d.domainName}</span>
                  <span className="text-muted">
                    {d.avgMastery}% {c_adminCertificationsSlugPage(locale).avgMastery} · {d.completionRate}%{" "}
                    {c_adminCertificationsSlugPage(locale).complete}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {objectiveAnalytics.problematicObjectives > 0 && (
          <div className="rounded-lg border border-danger/40 bg-danger-soft p-4">
            <h3 className="mb-3 font-medium text-danger-text">
              {c_adminCertificationsSlugPage(locale).objectivesWithLowMastery60}
            </h3>
            <ul className="space-y-1 text-sm text-danger-text">
              {objectiveAnalytics.objectivesByMastery
                .filter((o) => o.needsReview)
                .slice(0, 10)
                .map((o) => (
                  <li key={o.objectiveId}>
                    <span className="font-mono text-xs">{o.code}</span> {o.title} - {o.avgMastery}% (
                    {o.learnerCount} {c_adminCertificationsSlugPage(locale).learners})
                  </li>
                ))}
            </ul>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="mb-3 font-medium">
            {c_adminCertificationsSlugPage(locale).problemQuestions}
          </h3>
          {contentAnalytics.problemQuestions.length === 0 ? (
            <p className="text-sm text-subtle">
              {fill(c_adminCertificationsSlugPage(locale).noQuestionsWithALow, contentAnalytics.avgSuccessRate, contentAnalytics.questionsWithEnoughData)}
            </p>
          ) : (
            <ul className="space-y-1 text-sm text-muted">
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
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h3 className="mb-3 font-medium">
            {c_adminCertificationsSlugPage(locale).costPerObjective}
          </h3>
          {objectiveCostsWithData.length === 0 ? (
            <p className="text-sm text-subtle">
              {c_adminCertificationsSlugPage(locale).noCostDataYetRecorded}
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">
                {locale === "de"
                  ? `Insgesamt ${totalObjectiveCostUsd !== null ? `$${totalObjectiveCostUsd.toFixed(4)}` : "unbekannt (Preise nicht konfiguriert)"} für ${totalAcceptedLessons} Lesson(s) und ${totalAcceptedQuestions} Frage(n) über ${objectiveCostsWithData.length} Objective(s).`
                  : `$${totalObjectiveCostUsd !== null ? totalObjectiveCostUsd.toFixed(4) : "unknown (pricing not configured)"} total for ${totalAcceptedLessons} lesson(s) and ${totalAcceptedQuestions} question(s) across ${objectiveCostsWithData.length} objective(s).`}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs text-faint">
                      <th className="pb-2 pr-3 font-medium">{c_adminCertificationsSlugPage(locale).objective}</th>
                      <th className="pb-2 pr-3 font-medium">{c_adminCertificationsSlugPage(locale).model}</th>
                      <th className="pb-2 pr-3 text-right font-medium">Tokens</th>
                      <th className="pb-2 pr-3 text-right font-medium">
                        {c_adminCertificationsSlugPage(locale).cost}
                      </th>
                      <th className="pb-2 pr-3 text-right font-medium">
                        {c_adminCertificationsSlugPage(locale).lessonsQuestions}
                      </th>
                      <th className="pb-2 text-right font-medium">
                        {c_adminCertificationsSlugPage(locale).perItem}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {objectiveCostsWithData.slice(0, 15).map((o) => (
                      <tr key={o.objectiveId} className="border-t border-border/60">
                        <td className="py-1.5 pr-3">
                          <span className="font-mono text-xs">{o.objectiveCode}</span> {o.objectiveTitle}
                        </td>
                        <td className="py-1.5 pr-3 text-xs text-subtle">{o.model ?? "–"}</td>
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
                  <p className="mt-2 text-xs text-faint">
                    {fill(c_adminCertificationsSlugPage(locale).and0More, objectiveCostsWithData.length - 15)}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <h2 id="feedback" className="mt-4 scroll-mt-28 text-lg font-semibold">{c_adminCertificationsSlugPage(locale).reportsAndFeedback}</h2>
        <ContentReportQueue certificationId={cert.id} locale={locale} />
        {cert.kind === "general" && <FeedbackQueue items={(await listOpenFeedback(cert.id)).map((f) => ({ ...f, createdAt: f.createdAt.toISOString() }))} locale={locale} canResolve />}
        {cert.kind === "general" && <h2 id="reviews" className="mt-4 scroll-mt-28 text-lg font-semibold">{c_adminCertificationsSlugPage(locale).reviewQueues}</h2>}
        {cert.kind === "general" && <ExplanationReviewQueue certificationId={cert.id} locale={locale} />}
        {cert.kind === "general" && <PrerequisiteReviewQueue certificationId={cert.id} locale={locale} />}
        {cert.kind === "general" && <div id="danger" className="mt-4 scroll-mt-28" />}
        {cert.kind === "general" && <DeleteCertification certificationId={cert.id} slug={cert.slug} name={cert.name} locale={locale} />}
      </div>
    </div>
  );
}
