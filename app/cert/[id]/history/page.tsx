export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { getServerLocale } from "@/lib/server/locale";
import { listExamAttempts } from "@/lib/server/exam/history";

function formatDuration(seconds: number | null, locale: "de" | "en"): string {
  if (seconds === null) return "–";
  const minutes = Math.round(seconds / 60);
  return locale === "de" ? `${minutes} Min.` : `${minutes} min`;
}

const READINESS_LABEL: Record<string, { de: string; en: string }> = {
  WELL_PREPARED: { de: "Gut vorbereitet", en: "Well prepared" },
  ADEQUATELY_PREPARED: { de: "Angemessen vorbereitet", en: "Adequately prepared" },
  SOMEWHAT_PREPARED: { de: "Teilweise vorbereitet", en: "Somewhat prepared" },
  NEEDS_PREPARATION: { de: "Nicht ausreichend vorbereitet", en: "Needs more preparation" },
};

/** R3 (roadmap.md): "Seite 'Meine Prüfungen' mit Datum, Ergebnis, Dauer und
 * Readiness". */
export default async function ExamHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: slug } = await params;
  const [session, locale] = await Promise.all([auth(), getServerLocale()]);

  if (!session?.user?.id) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center">
        <p className="text-foreground/70">
          {locale === "de" ? "Bitte melde dich an." : "Please sign in."}
        </p>
      </div>
    );
  }

  const [cert] = await getDb()
    .select()
    .from(certifications)
    .where(eq(certifications.slug, slug))
    .limit(1);
  if (!cert) notFound();

  const attempts = await listExamAttempts(session.user.id, cert.id);

  return (
    <div className="flex flex-1 flex-col">
      <Link
        href={`/cert/${slug}`}
        className="mb-4 flex w-fit items-center gap-1.5 text-sm text-foreground/70 hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {locale === "de" ? "Zurück zur Zertifizierung" : "Back to certification"}
      </Link>

      <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold">
        <ClipboardList className="h-5 w-5" aria-hidden="true" />
        {locale === "de" ? "Meine Prüfungen" : "My exams"}
      </h1>
      <p className="mb-6 text-sm text-foreground/70">{cert.name}</p>

      {attempts.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-foreground/60">
          {locale === "de"
            ? "Noch keine Abschlussprüfung absolviert."
            : "No practice exam completed yet."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-surface text-xs text-foreground/60">
              <tr>
                <th className="px-4 py-2.5 font-medium">{locale === "de" ? "Datum" : "Date"}</th>
                <th className="px-4 py-2.5 font-medium">{locale === "de" ? "Ergebnis" : "Result"}</th>
                <th className="px-4 py-2.5 font-medium">{locale === "de" ? "Dauer" : "Duration"}</th>
                <th className="px-4 py-2.5 font-medium">Readiness</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((attempt) => (
                <tr key={attempt.attemptId} className="border-b border-border last:border-0">
                  <td className="px-4 py-2.5">
                    {attempt.completedAt ? (
                      <Link
                        href={`/cert/${slug}/history/${attempt.attemptId}`}
                        className="text-accent hover:underline"
                      >
                        {attempt.completedAt.toLocaleDateString(locale === "de" ? "de-DE" : "en-US")}
                      </Link>
                    ) : (
                      <span className="text-foreground/50">
                        {locale === "de" ? "nicht abgeschlossen" : "not completed"}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-medium">
                    {attempt.score !== null ? `${attempt.score}%` : "–"}
                  </td>
                  <td className="px-4 py-2.5 text-foreground/70">
                    {formatDuration(attempt.durationSeconds, locale)}
                  </td>
                  <td className="px-4 py-2.5 text-foreground/70">
                    {attempt.readiness && READINESS_LABEL[attempt.readiness]
                      ? READINESS_LABEL[attempt.readiness][locale]
                      : "–"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
