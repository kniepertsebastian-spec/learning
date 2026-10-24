import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { ProfileError } from "./profile-service";

export const uuid = z.string().uuid();

/** Einheitliche Fehlerantworten der Profil-Routen: Eingabefehler 400 (mit Liste der Gründe), alles andere weiterreichen. */
export function profileErrorResponse(error: unknown): NextResponse {
  if (error instanceof ProfileError) return NextResponse.json({ error: error.message, problems: error.problems }, { status: 400 });
  if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Eingabe." }, { status: 400 });
  throw error;
}
