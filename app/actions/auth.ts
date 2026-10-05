"use server";

import { signIn, signOut } from "@/lib/server/auth";
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

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/" });
}
