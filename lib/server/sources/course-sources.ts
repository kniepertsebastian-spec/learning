import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certificationSources, certifications, courseGenerationJobs } from "@/lib/server/db/schema";

/** Eine Quelle, wie Lernende und Prüfer sie am Kursende sehen (Titel, Herausgeber, Link, Ausgabe). */
export interface CourseSourceEntry {
  title: string;
  provider: string | null;
  url: string | null;
  version: string | null;
  /** ISO-Datum der Veröffentlichung, falls bekannt. */
  publishedAt: string | null;
}

/** Nur echte Web-Adressen werden verlinkt (nie `javascript:` o. Ä.). */
export function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Gleiche Quelle nur einmal (nach Adresse bzw. Titel), Quellen mit mehr Angaben gehen vor. */
export function mergeSources(entries: readonly CourseSourceEntry[]): CourseSourceEntry[] {
  const byKey = new Map<string, CourseSourceEntry>();
  const score = (e: CourseSourceEntry) => [e.provider, e.version, e.publishedAt, e.url].filter(Boolean).length;
  for (const e of entries) {
    const key = (e.url ?? e.title).toLowerCase().replace(/\/+$/, "");
    const known = byKey.get(key);
    if (!known || score(e) > score(known)) byKey.set(key, e);
  }
  return [...byKey.values()].sort((a, b) => a.title.localeCompare(b.title, "de"));
}

/**
 * Quellen und Fachliteratur eines allgemeinen Kurses: die geprüften Unterlagen aus der Quellenverwaltung (nicht fehlgeschlagene,
 * nicht abgelöste) und die Adressen, aus denen der Kurs erzeugt wurde. Interne Lernpfade einer Firma zeigen hier nichts (deren
 * Unterlagen sind nicht öffentlich).
 */
export async function getCourseSources(certificationId: string): Promise<CourseSourceEntry[]> {
  const db = getDb();
  const [cert] = await db.select({ kind: certifications.kind }).from(certifications).where(eq(certifications.id, certificationId)).limit(1);
  if (!cert || cert.kind !== "general") return [];
  const [rows, [job]] = await Promise.all([
    db
      .select()
      .from(certificationSources)
      .where(and(eq(certificationSources.certificationId, certificationId), inArray(certificationSources.status, ["parsed", "reviewed", "approved"]))),
    db.select({ urls: courseGenerationJobs.sourceUrls, report: courseGenerationJobs.sourceReport }).from(courseGenerationJobs).where(eq(courseGenerationJobs.resultCertificationId, certificationId)).orderBy(desc(courseGenerationJobs.createdAt)).limit(1),
  ]);
  const entries: CourseSourceEntry[] = rows.map((r) => ({ title: r.title, provider: r.provider || null, url: safeUrl(r.sourceUrl), version: r.versionLabel, publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null }));
  const primary = job?.report?.primary;
  if (primary) entries.push({ title: primary.title, provider: null, url: safeUrl(primary.url), version: null, publishedAt: null });
  // Übersprungene Quellen (beim Start nicht verwendbar) flossen nicht in den Kurs ein und gehören nicht in die Quellenliste.
  const skippedUrls = new Set((job?.report?.skipped ?? []).map((s) => s.url));
  for (const url of job?.urls ?? []) {
    if (skippedUrls.has(url)) continue;
    const safe = safeUrl(url);
    if (safe) entries.push({ title: hostOf(safe), provider: null, url: safe, version: null, publishedAt: null });
  }
  return mergeSources(entries);
}
