export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, domains, lessons, objectives, sections } from "@/lib/server/db/schema";
import { getServerLocale } from "@/lib/server/locale";
import { CheatSheetDone } from "@/components/CheatSheetDone";
import { PrintButton } from "@/components/PrintButton";
import { RichText } from "@/components/RichText";

/**
 * Alle Merkzettel eines Lernpfads in Kursreihenfolge, zum Nachschlagen und Drucken. Die Sichtbarkeit regelt das Layout
 * unter /cert/[id]: wer den Lernpfad nicht sehen darf (z. B. fremde Firma), bekommt „nicht gefunden“.
 */
export default async function CheatSheetsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: slug } = await params;
  const db = getDb();
  const [cert] = await db.select({ id: certifications.id, name: certifications.name }).from(certifications).where(eq(certifications.slug, slug)).limit(1);
  if (!cert) notFound();
  const locale = await getServerLocale();
  const de = locale === "de";

  const rows = await db
    .select({
      domain: domains.name,
      domainOrder: domains.orderNum,
      objectiveCode: objectives.code,
      objectiveTitle: objectives.title,
      sectionId: sections.id,
      sectionOrder: sections.orderNum,
      sectionTitle: sections.title,
      cheatSheet: lessons.cheatSheet,
    })
    .from(lessons)
    .innerJoin(sections, eq(sections.id, lessons.sectionId))
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(and(eq(domains.certificationId, cert.id), isNotNull(lessons.cheatSheet)))
    .orderBy(asc(domains.orderNum), asc(objectives.code), asc(sections.orderNum));

  return (
    <div className="mx-auto w-full max-w-3xl" data-testid="cheatsheets-page">
      <Link href={`/cert/${slug}`} className="mb-4 inline-flex items-center gap-1 text-sm text-foreground/70 hover:text-foreground print:hidden">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {cert.name}
      </Link>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{de ? "Merkzettel" : "Cheat sheets"}</h1>
          <p className="text-sm text-foreground/70">{cert.name}</p>
        </div>
        {rows.length > 0 && <PrintButton label={de ? "Drucken / als PDF speichern" : "Print / save as PDF"} />}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-foreground/70" data-testid="cheatsheets-empty">
          {de ? "Zu diesem Kurs gibt es noch keine Merkzettel. Neue Kurse bekommen nach jeder Lektion einen." : "This course has no cheat sheets yet. New courses get one after every lesson."}
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {rows.map((r) => (
            <section key={r.sectionId} className="break-inside-avoid rounded-lg border border-border bg-surface p-4" data-testid="cheatsheet-entry">
              <p className="text-xs text-foreground/60">
                {r.domain} · {r.objectiveCode} {r.objectiveTitle}
              </p>
              <h2 className="mb-2 font-medium">
                <Link href={`/cert/${slug}/section/${r.sectionId}`} className="hover:underline">
                  {r.sectionTitle[locale]}
                </Link>
              </h2>
              <div className="text-sm text-foreground/90">
                <RichText text={r.cheatSheet![locale]} />
              </div>
            </section>
          ))}
        </div>
      )}
      {rows.length > 0 && <CheatSheetDone certificationId={cert.id} />}
    </div>
  );
}
