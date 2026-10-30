export const dynamic = "force-dynamic";

import { c_howILearnPage } from "@/lib/i18n/components/howILearnPage";
import { fill } from "@/lib/i18n/fill";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LearningPreferencesForm } from "@/components/LearningPreferencesForm";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { getServerLocale } from "@/lib/server/locale";
import { getLearningContext } from "@/lib/server/study/learning-context";

/** „Wie ich lerne“: Wochenziel, Serie, Sicherheitsangabe, Check-in und Feedback-Zeitpunkt an einer Stelle. */
export default async function HowILearnPage() {
  const [user, locale] = await Promise.all([getCurrentUser(), getServerLocale()]);
  if (!user) redirect("/login?from=%2Fhow-i-learn");
  const de = locale === "de";
  const ctx = await getLearningContext(user.id);
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
      <Link href="/" className="mt-6 inline-block text-sm text-link hover:underline">{c_howILearnPage(de).back}</Link>
    </div>
  );
}
