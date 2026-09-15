"use client";

import { useTransition } from "react";
import { logoutAction } from "@/app/actions/auth";
import { clearOfflineDataForUser } from "@/lib/client/offline-db";

/** R4.2 (roadmap.md): "Bei Logout nutzerbezogene lokale Daten entfernen" -
 * braucht einen Client-Handler vor dem Server-Action-Aufruf, da IndexedDB
 * nur im Browser erreichbar ist. Best-effort: ein Fehler beim Leeren der
 * lokalen Daten darf das eigentliche Abmelden nicht verhindern. */
export function SignOutButton({ userId }: { userId: string }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await clearOfflineDataForUser(userId).catch(() => {});
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
