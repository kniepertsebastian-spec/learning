export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { getServerLocale } from "@/lib/server/locale";
import { StartExamButton } from "@/components/StartExamButton";

export default async function FinalExamStartPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: slug } = await params;
  const [session, locale] = await Promise.all([auth(), getServerLocale()]);
  const db = getDb();

  const certRows = await db
    .select()
    .from(certifications)
    .where(eq(certifications.slug, slug))
    .limit(1);

  if (!certRows.length) notFound();
  const cert = certRows[0];

  if (!session?.user?.id) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center">
        <p className="text-foreground/70">
          {locale === "de" ? "Bitte melde dich an." : "Please sign in."}
        </p>
        <Link href="/login" className="mt-4 text-accent hover:underline">
          {locale === "de" ? "Anmelden" : "Sign in"}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <Link
        href={`/cert/${slug}`}
        className="mb-4 flex w-fit items-center gap-1.5 text-sm text-foreground/70 hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {locale === "de" ? "Zurück zur Zertifizierung" : "Back to certification"}
      </Link>

      <div className="mx-auto flex max-w-lg flex-1 flex-col items-center justify-center text-center">
        <h1 className="mb-2 text-2xl font-semibold">
          {locale === "de" ? "Abschlussprüfung" : "Final Practice Exam"}
        </h1>
        <p className="mb-6 text-sm text-foreground/70">
          {cert.name} ({cert.examName} {cert.examVersion})
        </p>

        <div className="mb-8 w-full rounded-lg border border-border bg-surface p-5 text-left text-sm text-foreground/80">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              {locale === "de"
                ? "90 Fragen, verteilt nach offizieller Domain-Gewichtung"
                : "90 questions distributed by official domain weighting"}
            </li>
            <li>
              {locale === "de"
                ? "Vermeidet Fragen, die du bereits in Quizzes beantwortet hast"
                : "Avoids questions you've already answered in quizzes"}
            </li>
            <li>
              {locale === "de"
                ? "Am Ende: Bereitschafts-Einschätzung, keine Bestehens-Garantie"
                : "At the end: a practice readiness assessment, not a pass guarantee"}
            </li>
          </ul>
        </div>

        <StartExamButton certId={cert.id} certSlug={slug} locale={locale} />
      </div>
    </div>
  );
}
