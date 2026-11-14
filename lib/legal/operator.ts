/**
 * Angaben zum Betreiber für Impressum und Datenschutzerklärung (Aufgabe 07a, Review 12.11.2026). Sie stehen nicht im Code,
 * sondern in der Umgebung des Servers (.env, siehe .env.example): Name, Anschrift und Kontakt gehören dem Betreiber und
 * unterscheiden sich je Installation. Fehlt eine Pflichtangabe, zeigen die Seiten einen sichtbaren Hinweis statt einer
 * erfundenen Angabe, und sie bleiben für Suchmaschinen gesperrt.
 */
export interface OperatorInfo {
  name: string | null;
  /** Postanschrift, Zeilen mit Komma oder Zeilenumbruch getrennt. */
  addressLines: string[];
  email: string | null;
  phone: string | null;
  representative: string | null;
  register: string | null;
  vatId: string | null;
  /** Pflichtangaben vollständig: Name, Anschrift und E-Mail. */
  complete: boolean;
  /** Die Datenschutzerklärung wurde rechtlich geprüft und freigegeben (`LEGAL_PRIVACY_REVIEWED=true`). */
  privacyReviewed: boolean;
}

const clean = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export function getOperatorInfo(env: Record<string, string | undefined> = process.env): OperatorInfo {
  const name = clean(env.LEGAL_OPERATOR_NAME);
  const addressLines = (clean(env.LEGAL_OPERATOR_ADDRESS) ?? "")
    .split(/\\n|\n|;/)
    .map((line) => line.trim())
    .filter(Boolean);
  const email = clean(env.LEGAL_CONTACT_EMAIL);
  return {
    name,
    addressLines,
    email,
    phone: clean(env.LEGAL_PHONE),
    representative: clean(env.LEGAL_REPRESENTATIVE),
    register: clean(env.LEGAL_REGISTER),
    vatId: clean(env.LEGAL_VAT_ID),
    complete: Boolean(name && addressLines.length > 0 && email),
    privacyReviewed: env.LEGAL_PRIVACY_REVIEWED === "true",
  };
}
