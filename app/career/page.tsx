export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { CareerPaths } from "@/components/career/CareerPaths";
import { getCurrentUser } from "@/lib/server/auth-guards";
import { getCareerView } from "@/lib/server/career/service";
import { getServerLocale } from "@/lib/server/locale";

/** Karrierepfade auf Abruf: passende Stellen aus Profil und Skills, mit Kursreihenfolge aus dem Katalog und Gehalt. */
export default async function CareerPage() {
  const [user, locale] = await Promise.all([getCurrentUser(), getServerLocale()]);
  if (!user) redirect("/login?from=%2Fcareer");
  const view = await getCareerView(user.id, locale);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8 sm:px-6" data-testid="career-page">
      <CareerPaths initial={view} locale={locale} />
    </main>
  );
}
