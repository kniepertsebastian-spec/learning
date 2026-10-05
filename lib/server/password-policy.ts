import { z } from "zod";

/** bcrypt verarbeitet höchstens 72 Byte und schneidet den Rest still ab. */
export const MAX_PASSWORD_BYTES = 72;

/** Gemeinsame Regel für neue Passwörter (Registrierung und Passwortwechsel). */
export const newPasswordSchema = z
  .string()
  .min(8, "Das Passwort muss mindestens 8 Zeichen lang sein.")
  .refine((value) => Buffer.byteLength(value, "utf8") <= MAX_PASSWORD_BYTES, {
    message: `Das Passwort darf höchstens ${MAX_PASSWORD_BYTES} Byte lang sein.`,
  });
