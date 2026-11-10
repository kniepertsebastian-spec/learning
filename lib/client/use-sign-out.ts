"use client";

import { useTransition } from "react";
import { logoutAction } from "@/app/actions/auth";
import { clearLocalUserData } from "@/lib/client/clear-local-data";
import { removePushOnSignOut } from "@/lib/client/push";
import { countUnsyncedBeforeLogout } from "@/lib/client/logout-guard";
import { useLocale } from "@/lib/i18n";
import { c_useSignOut } from "@/lib/i18n/components/useSignOut";
import { fill } from "@/lib/i18n/fill";

/** R4.2 (roadmap.md): "Bei Logout nutzerbezogene lokale Daten entfernen" -
 * braucht einen Client-Handler vor dem Server-Action-Aufruf, da IndexedDB
 * und Cache Storage (Seiten-Cache des Service Workers) nur im Browser
 * erreichbar sind, siehe lib/client/clear-local-data.ts. */
/** Abmelden mit Aufräumen der lokalen Daten (R4.2); gemeinsam für Benutzermenü und Einzelknopf. */
export function useSignOut(userId: string) {
  const [isPending, startTransition] = useTransition();
  const { locale } = useLocale();
  const t = c_useSignOut(locale);
  const signOut = () =>
    startTransition(async () => {
      const unsynced = await countUnsyncedBeforeLogout(userId);
      if (unsynced > 0) {
        // Die Warteschlange bleibt beim Abmelden auf dem Gerät (nur das Kurspaket wird gelöscht) - der Dialog sagt das so.
        const message = unsynced === 1 ? t.unsyncedOne : fill(t.unsyncedMany, unsynced);
        if (!window.confirm(message)) return;
      }
      // Das Gerät gehört nach dem Abmelden nicht mehr dieser Person: Push-Abo beenden, solange die Sitzung noch gilt.
      await removePushOnSignOut();
      await clearLocalUserData(userId);
      await logoutAction();
    });
  return { signOut, isPending };
}
