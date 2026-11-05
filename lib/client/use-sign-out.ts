"use client";

import { useTransition } from "react";
import { logoutAction } from "@/app/actions/auth";
import { clearLocalUserData } from "@/lib/client/clear-local-data";
import { removePushOnSignOut } from "@/lib/client/push";
import { countUnsyncedBeforeLogout } from "@/lib/client/logout-guard";
import { useLocale } from "@/lib/i18n";

/** R4.2 (roadmap.md): "Bei Logout nutzerbezogene lokale Daten entfernen" -
 * braucht einen Client-Handler vor dem Server-Action-Aufruf, da IndexedDB
 * und Cache Storage (Seiten-Cache des Service Workers) nur im Browser
 * erreichbar sind, siehe lib/client/clear-local-data.ts. */
/** Abmelden mit Aufräumen der lokalen Daten (R4.2); gemeinsam für Benutzermenü und Einzelknopf. */
export function useSignOut(userId: string) {
  const [isPending, startTransition] = useTransition();
  const { locale } = useLocale();
  const signOut = () =>
    startTransition(async () => {
      const unsynced = await countUnsyncedBeforeLogout(userId);
      if (unsynced > 0) {
        const message =
          locale === "de"
            ? `${unsynced} Lernergebnis(se) sind noch nicht übertragen und gehen beim Abmelden verloren. Trotzdem abmelden?`
            : `${unsynced} study result(s) have not been synced yet and will be lost if you sign out. Sign out anyway?`;
        if (!window.confirm(message)) return;
      }
      // Das Gerät gehört nach dem Abmelden nicht mehr dieser Person: Push-Abo beenden, solange die Sitzung noch gilt.
      await removePushOnSignOut();
      await clearLocalUserData(userId);
      await logoutAction();
    });
  return { signOut, isPending };
}
