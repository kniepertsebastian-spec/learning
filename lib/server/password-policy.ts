import { z } from "zod";

/** bcrypt verarbeitet höchstens 72 Byte und schneidet den Rest still ab. */
export const MAX_PASSWORD_BYTES = 72;
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Was an einem neuen Passwort fehlt (leer = erfüllt die Regel): mindestens 8 Zeichen, ein Groß- und ein
 * Kleinbuchstabe und ein Sonderzeichen (alles, was weder Buchstabe, Ziffer noch Leerraum ist). Die Prüfung ist
 * Unicode-fähig, ein „Ä“ zählt als Großbuchstabe. Gilt nur für NEUE Passwörter; bestehende bleiben gültig, die
 * Anmeldung prüft die Regel nicht.
 */
export function passwordProblems(value: string): string[] {
  const problems: string[] = [];
  if ([...value].length < MIN_PASSWORD_LENGTH) problems.push(`Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`);
  if (!/\p{Lu}/u.test(value)) problems.push("Das Passwort braucht mindestens einen Großbuchstaben.");
  if (!/\p{Ll}/u.test(value)) problems.push("Das Passwort braucht mindestens einen Kleinbuchstaben.");
  if (!/[^\p{L}\p{N}\s]/u.test(value)) problems.push("Das Passwort braucht mindestens ein Sonderzeichen (z. B. ! ? # - _).");
  if (Buffer.byteLength(value, "utf8") > MAX_PASSWORD_BYTES) problems.push(`Das Passwort darf höchstens ${MAX_PASSWORD_BYTES} Byte lang sein.`);
  return problems;
}

/** Gemeinsame Regel für neue Passwörter (Registrierung, Passwortwechsel und Zurücksetzen). */
export const newPasswordSchema = z.string().superRefine((value, ctx) => {
  for (const message of passwordProblems(value)) ctx.addIssue({ code: "custom", message });
});
