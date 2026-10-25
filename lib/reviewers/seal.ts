/**
 * Siegel „Fachlich geprüft von …“ (roadmap_pruefer Phase 4): reine Darstellungsregeln. Namen erscheinen nur bei veröffentlichtem Profil mit
 * Einwilligung; sonst gilt der neutrale Text („von einem externen Experten“), der auch nach Rückzug oder Löschung des Profils bleibt.
 */
import type { Locale } from "@/lib/types";

export interface SealReviewer {
  name: string;
  slug: string;
}

export interface Seal {
  /** Prüfer mit veröffentlichtem Profil (Name und Link). */
  reviewers: SealReviewer[];
  /** Weitere Prüfer ohne öffentliches Profil (kein Name). */
  anonymousCount: number;
  versionLabel: string;
  /** Datum der Freigabe (ISO), zugleich der „Stand“. */
  approvedAt: string;
  /** Änderungen seit der Prüfung; 0 = aktueller Stand. `null` = nicht ermittelt (Katalog zeigt nur den Stand der Prüfung). */
  changeCount: number | null;
  changes: { sections: number; questions: number } | null;
}

/** „einem externen Experten“ / „3 externen Experten“. */
export function anonymousLabel(count: number, locale: Locale): string {
  if (locale === "de") return count === 1 ? "einem externen Experten" : `${count} externen Experten`;
  return count === 1 ? "an external expert" : `${count} external experts`;
}

export function changeLabel(count: number, locale: Locale): string {
  if (locale === "de") return count === 1 ? "1 Änderung seit der Prüfung" : `${count} Änderungen seit der Prüfung`;
  return count === 1 ? "1 change since the review" : `${count} changes since the review`;
}

/** Nummern der Kategorien für die Details bei „geändert seit Prüfung“: „2 Abschnitte, 1 Frage“. */
export function changeDetail(changes: { sections: number; questions: number }, locale: Locale): string {
  const parts: string[] = [];
  if (changes.sections > 0) parts.push(locale === "de" ? `${changes.sections} ${changes.sections === 1 ? "Abschnitt" : "Abschnitte"}` : `${changes.sections} ${changes.sections === 1 ? "section" : "sections"}`);
  if (changes.questions > 0) parts.push(locale === "de" ? `${changes.questions} ${changes.questions === 1 ? "Frage" : "Fragen"}` : `${changes.questions} ${changes.questions === 1 ? "question" : "questions"}`);
  return parts.join(", ");
}

/** Gesamte Prüferzeile ohne Verlinkung, z. B. für Offline-Paket und Texte: „Eva Müller, Jan Kern und einem externen Experten“. */
export function reviewersText(seal: Pick<Seal, "reviewers" | "anonymousCount">, locale: Locale): string {
  const parts = seal.reviewers.map((r) => r.name);
  if (seal.anonymousCount > 0) parts.push(anonymousLabel(seal.anonymousCount, locale));
  if (parts.length <= 1) return parts[0] ?? anonymousLabel(1, locale);
  const and = locale === "de" ? "und" : "and";
  return `${parts.slice(0, -1).join(", ")} ${and} ${parts[parts.length - 1]}`;
}

/**
 * Was „geprüft“ bedeutet. Aussagen zu Bestehensgarantien und zu den Prüfungsbedingungen der Anbieter stehen bewusst nicht mehr im Kurs,
 * sondern in den Service Agreements / AGB (Seite /agb).
 */
export const SEAL_DISCLAIMER = {
  de: "„Geprüft“ bezieht sich auf die fachliche Richtigkeit der Inhalte zum angegebenen Stand.",
  en: "“Reviewed” refers to the technical correctness of the content at the stated date.",
} as const;

/** Der Satz zur fachlichen Prüfung, verbindlich: „Dieser Kurs wurde fachlich von [Experten-Name] geprüft.“ (ohne Verlinkung, z. B. für Texte und Metadaten). */
export function expertStatement(seal: Pick<Seal, "reviewers" | "anonymousCount">, locale: Locale): string {
  const who = reviewersText(seal, locale);
  return locale === "de" ? `Dieser Kurs wurde fachlich von ${who} geprüft.` : `This course was technically reviewed by ${who}.`;
}
