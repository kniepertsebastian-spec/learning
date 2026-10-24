import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { PROBE_ERROR_TYPES } from "@/lib/reviewers/probe";
import { ProbeError } from "./probe-service";

export const uuid = z.string().uuid();
export const errorType = z.enum(PROBE_ERROR_TYPES as [string, ...string[]]);

/** Einheitliche Fehlerantworten der Probe-Review-Routen: Eingabefehler 400 mit Gründen, alles andere weiterreichen. */
export function probeErrorResponse(error: unknown): NextResponse {
  if (error instanceof ProbeError) return NextResponse.json({ error: error.message, problems: error.problems }, { status: 400 });
  if (error instanceof ZodError || error instanceof SyntaxError) return NextResponse.json({ error: "Ungültige Eingabe." }, { status: 400 });
  throw error;
}
