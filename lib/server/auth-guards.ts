import { cache } from "react";
import type { Session } from "next-auth";
import { forbidden, redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { auth } from "@/lib/server/auth";
import { type UserRole } from "@/lib/server/db/schema";
import { loadAuthUserRow } from "@/lib/server/session-validity";

export type SessionUser = { id: string; email: string; role: UserRole };

/**
 * Loads the current user's role fresh from the DB on every call instead of
 * trusting a JWT claim, so revoking an admin role (via the
 * `npm run user:set-role` script - see R0.2) takes effect on the very next
 * request instead of waiting for the session token to expire.
 */
async function userForSession(session: Session | null): Promise<SessionUser | null> {
  if (!session?.user?.id) return null;
  // Dieselbe, je Anfrage gemerkte Zeile wie im jwt-Callback (lib/server/session-validity.ts).
  const row = await loadAuthUserRow(session.user.id);
  return row ? { id: row.id, email: row.email, role: row.role } : null;
}

/** Einmal je Anfrage (React `cache`, R6); die Rolle kommt trotzdem bei jeder Anfrage frisch aus der Datenbank. */
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => userForSession(await auth()));

/**
 * Guard for admin Server Components/Server Actions (R0.2): redirects
 * unauthenticated visitors to /login, and renders Next's 403 boundary
 * (app/forbidden.tsx) for authenticated non-admins - a real 403 response,
 * not just a hidden admin link.
 */
export async function requireAdminPage(fromPath?: string): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect(fromPath ? `/login?from=${encodeURIComponent(fromPath)}` : "/login");
  }

  const user = await userForSession(session);
  if (!user || user.role !== "admin") {
    forbidden();
  }
  return user;
}

/**
 * Guard for admin API routes (R0.2): returns the admin user on success, or a
 * ready-to-return Response (401 unauthenticated / 403 authenticated but not
 * admin) otherwise.
 */
export async function requireAdminApi(): Promise<
  { ok: true; user: SessionUser } | { ok: false; response: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const user = await userForSession(session);
  if (!user || user.role !== "admin") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, user };
}
