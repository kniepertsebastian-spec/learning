"use client";

import { useTransition } from "react";
import { logoutAction } from "@/app/actions/auth";
import { clearOfflineDataForUser } from "@/lib/client/offline-db";

/** Seiten-Cache des Service Workers (app/sw.ts, StaleWhileRevalidate für
 * Navigationen) - enthält angemeldet gerenderte Seiten und muss beim Logout
 * weg, sonst sieht auf einem geteilten Gerät die nächste Person sie. */
const UI_CACHE_NAME = "ui-cache";

/** R4.2 (roadmap.md): "Bei Logout nutzerbezogene lokale Daten entfernen" -
 * braucht einen Client-Handler vor dem Server-Action-Aufruf, da IndexedDB
 * und Cache Storage nur im Browser erreichbar sind. Best-effort: ein Fehler
 * beim Leeren der lokalen Daten darf das eigentliche Abmelden nicht
 * verhindern. */
export function SignOutButton({ userId }: { userId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await clearOfflineDataForUser(userId).catch(() => {});
      if ("caches" in window) {
        await caches.delete(UI_CACHE_NAME).catch(() => {});
      }
      await logoutAction();
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface disabled:opacity-60"
    >
      Sign out
    </button>
  );
}
