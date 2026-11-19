"use server";

import { auth, signIn, signOut } from "@/lib/server/auth";
import { endAllSessions } from "@/lib/server/account/sessions";
import { AuthError } from "next-auth";
import { safeRedirectPath } from "@/lib/safe-redirect";

export async function loginAction(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      // Rückkehr z. B. zur Einladungsseite; nur Pfade der eigenen Seite (lib/safe-redirect.ts).
      redirectTo: safeRedirectPath(formData.get("from")),
    });
    return null;
  } catch (error) {
    if (error instanceof AuthError) return "invalid_credentials";
    throw error;
  }
}

/**
 * Abmelden gilt auf allen Geräten (Entscheidung zu Aufgabe 20): Erst steigt die Sitzungsversion,
 * dann löscht signOut das Cookie. So ist auch eine Kopie des Tokens danach wertlos.
 */
export async function logoutAction(): Promise<void> {
  const session = await auth();
  if (session?.user?.id) await endAllSessions(session.user.id);
  await signOut({ redirectTo: "/" });
}
