import { eq } from "drizzle-orm";
import { forbidden, redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { auth } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db/client";
import { users, type UserRole } from "@/lib/server/db/schema";

export type SessionUser = { id: string; email: string; role: UserRole };

/**
 * Loads the current user's role fresh from the DB on every call instead of
 * trusting a JWT claim, so revoking an admin role (via the
 * `npm run user:set-role` script - see R0.2) takes effect on the very next
 * request instead of waiting for the session token to expire.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [user] = await getDb()
    .select({ id: users.id, email: users.email, role: users.role })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  return user ?? null;
}

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

  const user = await getCurrentUser();
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

  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return { ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, user };
}
