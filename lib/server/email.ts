/** Kanonische Form einer E-Mail-Adresse für Speicherung und Vergleich. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
