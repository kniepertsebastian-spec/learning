export const dynamic = "force-dynamic";

import { eq } from "drizzle-orm";
import { ArrowLeft, Radar } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { c_certIdWeaknessesPage } from "@/lib/i18n/components/certIdWeaknessesPage";
import { fill } from "@/lib/i18n/fill";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import { certifications } from "@/lib/server/db/schema";
import { getServerLocale } from "@/lib/server/locale";
import { getWeaknessRadar } from "@/lib/server/weakness/radar";

/** Mehr Themen zeigt ein Lernpfad praktisch nie; die Grenze hält die Seite und die Abfrage klein. */
const MAX_TOPICS = 100;

/**
 * „Meine Schwachstellen“ (docs/roadmaps/ROADMAP-UI.md, Später): alle Themen eines Kurses, bei denen die letzte Antwort in den
 * „Sitzt das?“-Quizzes falsch war, mit einem Klick auf die gezielte Übung. Die Sichtbarkeit des Kurses prüft das Layout von /cert/[id].
 */
export default async function WeaknessesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: slug } = await params;
  const [session, locale] = await Promise.all([auth(), getServerLocale()]);
  const tx = c_certIdWeaknessesPage(locale);

  if (!session?.user?.id) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center">
        <p className="text-muted">{tx.pleaseSignIn}</p>
        <Link href="/login" className="mt-4 text-link hover:underline">
          {tx.signIn}
        </Link>
      </div>
    );
  }

  const [cert] = await getDb().select().from(certifications).where(eq(certifications.slug, slug)).limit(1);
  if (!cert) notFound();
  const radar = await getWeaknessRadar(session.user.id, cert.id, MAX_TOPICS);

  return (
    <div className="flex flex-1 flex-col gap-5">
      <Link href={`/cert/${slug}`} className="flex w-fit items-center gap-1.5 text-sm text-muted hover:text-foreground">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {tx.backToCertification}
      </Link>
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold" data-testid="weaknesses-title">
          <Radar className="h-5 w-5" aria-hidden="true" />
          {tx.title}
        </h1>
        <p className="mt-1 text-sm text-muted">{cert.name}</p>
        <p className="mt-2 max-w-2xl text-sm text-subtle">{tx.intro}</p>
      </div>

      {!radar.hasData ? (
        <EmptyState icon={<Radar />} title={tx.noDataTitle} description={tx.noDataText} />
      ) : radar.topics.length === 0 ? (
        <EmptyState icon={<Radar />} title={tx.emptyTitle} description={tx.emptyText} />
      ) : (
        <>
          <ol aria-label={tx.listLabel} className="flex flex-col gap-3" data-testid="weaknesses-list">
            {radar.topics.map((topic) => (
              <li key={topic.objectiveId}>
                <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" data-testid="weaknesses-topic">
                  <div className="min-w-0">
                    <p className="font-medium">
                      <span className="font-mono text-xs text-subtle">{topic.code}</span> {topic.title}
                    </p>
                    <p className="mt-0.5 text-sm text-subtle">{fill(tx.wrongOf, topic.wrong, topic.answered)}</p>
                  </div>
                  <Button asChild variant="secondary" className="shrink-0">
                    <Link href={`/cert/${slug}/remediation/${topic.objectiveId}`}>{tx.practice}</Link>
                  </Button>
                </Card>
              </li>
            ))}
          </ol>
          <p className="text-xs text-subtle">{tx.hint}</p>
        </>
      )}
    </div>
  );
}
