/** Längste mögliche E-Mail-Adresse (RFC 5321); längere Eingaben sind nie gültig. */
export const MAX_EMAIL_LENGTH = 254;

/** Kanonische Form einer E-Mail-Adresse für Speicherung und Vergleich. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
