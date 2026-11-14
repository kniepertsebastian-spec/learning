export const dynamic = "force-dynamic";

import { c_howILearnPage } from "@/lib/i18n/components/howILearnPage";
import { fill } from "@/lib/i18n/fill";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LearningPreferencesForm } from "@/components/LearningPreferencesForm";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { getServerLocale } from "@/lib/server/locale";
import { getLearningContext } from "@/lib/server/study/learning-context";
import { personalFatigueStatements } from "@/lib/server/psrp/fatigue-db";
import type { FatigueStatement } from "@/lib/server/psrp/fatigue";
import { SelfReportSettings } from "@/components/SelfReportSettings";
import { isFeatureEnabled } from "@/lib/server/feature-flags";
import { getSelfReportSettings } from "@/lib/server/self-reports/service";

/** „Wie ich lerne“: Wochenziel, Serie, Sicherheitsangabe, Check-in und Feedback-Zeitpunkt an einer Stelle. */
export default async function HowILearnPage() {
  const [user, locale] = await Promise.all([getCurrentUser(), getServerLocale()]);
  if (!user) redirect("/login?from=%2Fhow-i-learn");
  const de = locale === "de";
  const selfReportsOn = isFeatureEnabled("self_reports", user.id);
  const [ctx, statements, selfReports] = await Promise.all([
    getLearningContext(user.id),
    personalFatigueStatements(user.id),
    selfReportsOn ? getSelfReportSettings(user.id) : Promise.resolve(null),
  ]);
  const t = c_howILearnPage(de);
  // Aufgabe 12: Ermüdung und Unterbrechungen nur als ganze Sätze, und nur wenn genug Sitzungen einen deutlichen Unterschied zeigen.
  const sentence = (s: FatigueStatement) =>
    s.kind === "more_errors_after" ? fill(t.moreErrorsAfter0, s.afterQuestions) : s.kind === "slower_towards_end" ? t.slowerTowardsEnd : fill(t.oftenInterrupted0Of1, s.interrupted, s.measured);
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-semibold">{c_howILearnPage(de).howILearn}</h1>
      <p className="mt-1 mb-4 text-sm text-subtle">
        {c_howILearnPage(de).extraInputsAreIntroducedStep}
      </p>
      <p className="mb-4 text-sm" data-testid="how-i-learn-week">
        {fill(c_howILearnPage(de).thisWeek0Of1, ctx.weekly.daysLearned, ctx.weekly.goal)}
      </p>
      <LearningPreferencesForm initial={ctx.preferences} locale={locale} />
      {/* Aufgabe 17: Schalter je Art von Selbstauskunft */}
      {selfReports && <SelfReportSettings initial={selfReports.map((s) => ({ ...s, pausedUntil: s.pausedUntil?.toISOString() ?? null }))} locale={locale} />}
      {statements.length > 0 && (
        <section className="mt-6 rounded-lg border border-border bg-surface p-4" data-testid="how-i-learn-sessions">
          <h2 className="text-lg font-medium">{t.yourSessions}</h2>
          {statements.map((s) => (
            <p key={s.kind} className="mt-2 text-sm">{sentence(s)}</p>
          ))}
          <p className="mt-2 text-xs text-subtle">{t.observationOnly}</p>
        </section>
      )}
      <Link href="/" className="mt-6 inline-block text-sm text-link hover:underline">{c_howILearnPage(de).back}</Link>
    </div>
  );
}
