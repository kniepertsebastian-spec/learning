export const dynamic = "force-dynamic";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SecondReviewList, type SecondReviewCardData } from "@/components/reviewer/SecondReviewList";
import { c_reviewerQuality } from "@/lib/i18n/components/reviewerQuality";
import { getServerLocale } from "@/lib/server/locale";
import { requireReviewerPage } from "@/lib/server/reviewers/guard";
import { listPendingSecondReviews } from "@/lib/server/reviewers/second-review";
import type { AnswerSolution } from "@/lib/questions/answer-formats";
import type { Locale } from "@/lib/types";

/** Die Lösung der neuen Antwortformate als lesbarer Text (Reihenfolge, Kurzantwort, Zuordnung). */
function solutionText(solution: AnswerSolution, locale: Locale): string {
  if (solution.format === "ordering") return solution.steps.map((s, i) => `${i + 1}. ${s.text[locale]}`).join("\n");
  if (solution.format === "short_answer") return solution.accepted.join("\n");
  return solution.pairs.map((p) => `${p.left[locale]} → ${p.right[locale]}`).join("\n");
}

/** Zweitprüfung als Stichprobe (docs/roadmaps/archiv/roadmap_pruefer.md, Phase 6): die Fragen, die der zweite Prüfer des Kurses beurteilen soll. */
export default async function SecondReviewPage() {
  const user = await requireReviewerPage("/reviewer/second-review");
  const locale = await getServerLocale();
  const tx = c_reviewerQuality(locale);
  const items = await listPendingSecondReviews(user.id);
  const cards: SecondReviewCardData[] = items.map(({ id, courseName, versionLabel, question }) => ({
    id,
    courseName,
    versionLabel,
    humanId: question.humanId,
    question: question.question[locale],
    explanation: question.explanation[locale],
    options: question.options.map((o) => ({ id: o.id, text: o.text[locale], isCorrect: o.isCorrect })),
    solution: question.solution ? solutionText(question.solution, locale) : null,
  }));
  return (
    <div className="flex flex-col gap-4" data-testid="second-review-page">
      <Link href="/reviewer" className="flex w-fit items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {tx.backToHome}
      </Link>
      <h1 className="text-2xl font-semibold">{tx.pageTitle}</h1>
      <p className="max-w-2xl text-sm text-subtle">{tx.pageIntro}</p>
      <SecondReviewList items={cards} locale={locale} />
    </div>
  );
}
