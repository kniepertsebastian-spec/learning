import { and, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, domains, lessons, objectives, sections } from "@/lib/server/db/schema";
import { visibleCertificationsCondition, type Viewer } from "@/lib/server/catalog/visibility";
import { escapeLike, extractCommands, normalizeQuery, queryTokens, rankByTitle, type PaletteHit } from "@/lib/palette/match";
import type { Locale } from "@/lib/types";

/**
 * Suche der Command-Palette (⌘K): Kurse, Abschnitte und Befehle aus den Merkzetteln. Sichtbar ist nur, was die Person auch auf den
 * Kursseiten sehen darf (`visibleCertificationsCondition`): interne Lernpfade einer Firma erscheinen nie bei Fremden und nie bei
 * Plattform-Admins, Entwürfe nur bei Admins. Die Seiten der Navigation kommen im Browser aus dem Shell-Menü.
 */

const LIMITS = { course: 5, section: 8, command: 6 } as const;

/** Schreibweisen eines Suchbegriffs für die Datenbank: wie getippt und mit Umlauten („pruefer“ → „prüfer“, „prufer“ bleibt unberührt). */
export function likeVariants(token: string): string[] {
  const umlauts = token.replace(/ae/g, "ä").replace(/oe/g, "ö").replace(/ue/g, "ü").replace(/ss/g, "ß");
  return [...new Set([token, umlauts])];
}

/** Alle Begriffe müssen vorkommen (UND), je Begriff genügt eine Schreibweise (ODER). */
function matchAll(column: SQL, tokens: string[]): SQL | undefined {
  const perToken = tokens.map((token) => or(...likeVariants(token).map((v) => ilike(column, `%${escapeLike(v)}%`))));
  return and(...perToken);
}

export async function searchPalette(viewer: NonNullable<Viewer>, rawQuery: string, locale: Locale): Promise<PaletteHit[]> {
  const query = normalizeQuery(rawQuery);
  if (!query) return [];
  const tokens = queryTokens(query);
  const visible = await visibleCertificationsCondition(viewer);
  const db = getDb();

  const courseWhere = and(
    visible,
    or(
      matchAll(sql`${certifications.name}`, tokens),
      matchAll(sql`${certifications.provider}`, tokens),
      matchAll(sql`coalesce(${certifications.shortCode}, '')`, tokens),
    ),
  );
  const sectionTitle = sql<string>`${sections.title} ->> ${locale}`;
  const cheatSheet = sql<string>`${lessons.cheatSheet} ->> ${locale}`;

  const [courseRows, sectionRows, commandRows] = await Promise.all([
    db
      .select({ id: certifications.id, slug: certifications.slug, name: certifications.name, provider: certifications.provider })
      .from(certifications)
      .where(courseWhere)
      .limit(40),
    db
      .select({ id: sections.id, title: sectionTitle, slug: certifications.slug, course: certifications.name })
      .from(sections)
      .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .innerJoin(certifications, eq(certifications.id, domains.certificationId))
      .where(and(visible, matchAll(sectionTitle, tokens)))
      .limit(60),
    db
      .select({ sectionId: sections.id, sectionTitle, slug: certifications.slug, course: certifications.name, cheatSheet })
      .from(lessons)
      .innerJoin(sections, eq(sections.id, lessons.sectionId))
      .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .innerJoin(certifications, eq(certifications.id, domains.certificationId))
      .where(and(visible, matchAll(cheatSheet, tokens)))
      .limit(60),
  ]);

  const courses: PaletteHit[] = rankByTitle(courseRows, query, (r) => `${r.name} ${r.provider}`)
    .slice(0, LIMITS.course)
    .map((r) => ({ kind: "course", id: r.id, title: r.name, subtitle: r.provider, href: `/cert/${r.slug}` }));

  const sectionHits: PaletteHit[] = rankByTitle(
    sectionRows.filter((r) => r.title),
    query,
    (r) => r.title,
  )
    .slice(0, LIMITS.section)
    .map((r) => ({ kind: "section", id: r.id, title: r.title, subtitle: r.course, href: `/cert/${r.slug}/section/${r.id}` }));

  const commands: PaletteHit[] = [];
  for (const row of commandRows) {
    const found = extractCommands(row.cheatSheet ?? "", query, 1)[0];
    if (!found) continue;
    commands.push({ kind: "command", id: row.sectionId, title: found, subtitle: `${row.sectionTitle ?? ""} · ${row.course}`.replace(/^ · /, ""), href: `/cert/${row.slug}/section/${row.sectionId}` });
    if (commands.length >= LIMITS.command) break;
  }

  return [...courses, ...sectionHits, ...commands];
}
