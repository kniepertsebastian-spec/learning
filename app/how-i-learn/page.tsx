export const dynamic = "force-dynamic";

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
      <h1 className="text-2xl font-semibold">{de ? "Wie ich lerne" : "How I learn"}</h1>
      <p className="mt-1 mb-4 text-sm text-subtle">
        {de
          ? "Zusätzliche Eingaben kommen Schritt für Schritt dazu, damit der Start leicht bleibt. Hier kannst du alles jederzeit ein- oder ausschalten."
          : "Extra inputs are introduced step by step to keep the start easy. Here you can switch everything on or off at any time."}
      </p>
      <p className="mb-4 text-sm" data-testid="how-i-learn-week">
        {de ? `Diese Woche: ${ctx.weekly.daysLearned} von ${ctx.weekly.goal} Lerntagen.` : `This week: ${ctx.weekly.daysLearned} of ${ctx.weekly.goal} study days.`}
      </p>
      <LearningPreferencesForm initial={ctx.preferences} locale={locale} />
      <Link href="/" className="mt-6 inline-block text-sm text-link hover:underline">{de ? "Zurück" : "Back"}</Link>
    </div>
  );
}
