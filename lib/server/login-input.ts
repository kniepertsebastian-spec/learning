import { MAX_EMAIL_LENGTH, normalizeEmail } from "./email";

/**
 * E-Mail und Passwort aus den Credentials-Feldern der Anmeldung. Liefert `null` bei fehlenden Feldern oder einer E-Mail über
 * 254 Zeichen - eine solche Adresse gibt es nicht, und sie darf auch nicht als Schlüssel in den Rate-Limiter, sonst belegt
 * jeder Versuch beliebig viel Speicher (die Server Action nimmt Bodys bis etwa 1 MB an).
 */
export function parseLoginCredentials(
  credentials: Partial<Record<string, unknown>> | undefined,
): { email: string; password: string } | null {
  const email = typeof credentials?.email === "string" ? normalizeEmail(credentials.email) : undefined;
  const password = typeof credentials?.password === "string" ? credentials.password : undefined;
  if (!email || !password || email.length > MAX_EMAIL_LENGTH) return null;
  return { email, password };
}
