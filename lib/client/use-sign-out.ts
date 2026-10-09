"use client";

import { useTransition } from "react";
import { logoutAction } from "@/app/actions/auth";
import { clearLocalUserData } from "@/lib/client/clear-local-data";

/** R4.2 (roadmap.md): "Bei Logout nutzerbezogene lokale Daten entfernen" -
 * braucht einen Client-Handler vor dem Server-Action-Aufruf, da IndexedDB
 * und Cache Storage (Seiten-Cache des Service Workers) nur im Browser
 * erreichbar sind, siehe lib/client/clear-local-data.ts. */
/** Abmelden mit Aufräumen der lokalen Daten (R4.2); gemeinsam für Benutzermenü und Einzelknopf. */
export function useSignOut(userId: string) {
  const [isPending, startTransition] = useTransition();
  const signOut = () =>
    startTransition(async () => {
      await clearLocalUserData(userId);
      await logoutAction();
    });
  return { signOut, isPending };
}
