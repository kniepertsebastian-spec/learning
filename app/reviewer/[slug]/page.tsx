export const dynamic = "force-dynamic";

import { SolutionView } from "@/components/quiz/FormatAnswerInput";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, users } from "@/lib/server/db/schema";
import { describeChanges, getReviewerApprovalView } from "@/lib/server/approvals/service";
import { getServerLocale } from "@/lib/server/locale";
import { requireReviewerPage } from "@/lib/server/reviewers/guard";
import { canReviewCourse, listOwnComments } from "@/lib/server/reviewers/service";
import { isQualified } from "@/lib/server/reviewers/probe-service";
import { getReviewerCourseView } from "@/lib/server/reviewers/course-view";
import { CourseSources } from "@/components/CourseSources";
import { RichText } from "@/components/RichText";
import { getCourseSources } from "@/lib/server/sources/course-sources";
import { FeedbackQueue } from "@/components/FeedbackQueue";
import { listOpenFeedback } from "@/lib/server/feedback/service";
import { ReviewerApprovalPanel, type ReviewerApprovalData } from "@/components/reviewer/ReviewerApprovalPanel";
import { ReviewerItemComment } from "@/components/reviewer/ReviewerItemComment";

/** Prüfer-Ansicht des zugewiesenen Kurses: Inhalt lesen (ohne Lerndaten, ohne KI), kommentieren, Fragen melden, von Hand bearbeiten und freigeben. */
export default async function ReviewerCoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireReviewerPage(`/reviewer/${slug}`);
  const [locale] = await Promise.all([getServerLocale()]);
  const de = locale === "de";
  const [cert] = await getDb().select({ id: certifications.id, name: certifications.name }).from(certifications).where(eq(certifications.slug, slug)).limit(1);
  // Nicht zugewiesene und interne Kurse sehen aus wie nicht vorhanden.
  if (!cert || !(await canReviewCourse(user.id, cert.id))) notFound();

  const [tree, view, own, [me], courseSources, feedback] = await Promise.all([
    getReviewerCourseView(cert.id),
    getReviewerApprovalView(cert.id, user.id),
    listOwnComments(cert.id, user.id),
    getDb().select({ name: users.name }).from(users).where(eq(users.id, user.id)).limit(1),
    getCourseSources(cert.id).catch(() => []),
    listOpenFeedback(cert.id),
  ]);
  const described = view.diffSinceOwn && view.changesSinceOwn > 0 ? await describeChanges(view.diffSinceOwn) : null;
  const approval: ReviewerApprovalData = {
    state: view.status.state,
    approvedBy: view.status.approval?.reviewerDisplayName ?? null,
    versionLabel: view.status.approval?.versionLabel ?? null,
    approvedAtIso: view.status.approval?.approvedAt.toISOString() ?? null,
    sinceOwn: view.diffSinceOwn ? { count: view.changesSinceOwn, sections: described?.sections ?? [], questions: described?.questions ?? [] } : null,
    suggestedName: me?.name ?? "",
  };
  const commentsFor = (type: "section" | "question", id: string) => own.filter((c) => c.targetType === type && c.targetId === id).map((c) => ({ kind: c.kind, text: c.text, status: c.status }));

  return (
    <div className="flex flex-col" data-testid="reviewer-course-page">
      <Link href="/reviewer" className="mb-4 flex w-fit items-center gap-1.5 text-sm text-subtle hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {de ? "Zurück zu meinen Kursen" : "Back to my courses"}
      </Link>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{cert.name}</h1>
        <Link href={`/reviewer/${slug}/workshop`} className="rounded-md border border-accent px-3 py-1.5 text-sm font-medium text-link hover:bg-accent-soft" data-testid="reviewer-edit-link">
          {de ? "Kurs bearbeiten" : "Edit course"}
        </Link>
      </div>
      <FeedbackQueue items={feedback.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() }))} locale={locale} canResolve={false} />
      <ReviewerApprovalPanel certId={cert.id} data={approval} locale={locale} canApprove={await isQualified(user.id)} />
      {tree.map((domain) => (
        <section key={domain.id} className="mb-8">
          <h2 className="mb-3 text-lg font-semibold">{domain.name}</h2>
          {domain.objectives.map((objective) => (
            <div key={objective.id} className="mb-6 rounded-lg border border-border bg-surface p-4">
              <h3 className="font-medium">{objective.code} {objective.title}</h3>
              {objective.sections.map((s) => (
                <details key={s.id} className="mt-3 text-sm" data-testid="reviewer-section">
                  <summary className="cursor-pointer font-medium">{s.title[locale]}</summary>
                  <div className="mt-2 text-text-2"><RichText text={s.content[locale]} /></div>
                  <ReviewerItemComment certId={cert.id} targetType="section" targetId={s.id} locale={locale} existing={commentsFor("section", s.id)} />
                </details>
              ))}
              {objective.questions.length > 0 && (
                <div className="mt-4 flex flex-col gap-3">
                  {objective.questions.map((q) => (
                    <div key={q.id} className="rounded-md border border-border bg-background p-3 text-sm" data-testid="reviewer-question">
                      <p className="text-xs text-subtle">{q.humanId}</p>
                      <p className="font-medium">{q.question[locale]}</p>
                      <ul className="mt-1 flex flex-col gap-0.5">
                        {q.options.map((o) => (
                          <li key={o.id} className={o.isCorrect ? "font-medium text-mint-text" : ""}>
                            {o.isCorrect ? "✓ " : "· "}
                            {o.text[locale]}
                            {o.rationale ? <span className="text-subtle"> ({o.rationale[locale]})</span> : null}
                          </li>
                        ))}
                      </ul>
                      {q.solution && <SolutionView solution={q.solution} locale={locale} />}
                      <p className="mt-1 text-xs text-subtle">{de ? "Erklärung" : "Explanation"}: {q.explanation[locale]}</p>
                      <ReviewerItemComment certId={cert.id} targetType="question" targetId={q.id} locale={locale} existing={commentsFor("question", q.id)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </section>
      ))}
      <CourseSources sources={courseSources} locale={locale} />
    </div>
  );
}
