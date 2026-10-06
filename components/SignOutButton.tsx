"use client";

import { LogOut } from "lucide-react";
import { useTransition } from "react";
import { logoutAction } from "@/app/actions/auth";
import { clearLocalUserData } from "@/lib/client/clear-local-data";

/** R4.2 (roadmap.md): "Bei Logout nutzerbezogene lokale Daten entfernen" -
 * braucht einen Client-Handler vor dem Server-Action-Aufruf, da IndexedDB
 * und Cache Storage (Seiten-Cache des Service Workers) nur im Browser
 * erreichbar sind, siehe lib/client/clear-local-data.ts. */
export function SignOutButton({ userId, compact = false }: { userId: string; compact?: boolean }) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      await clearLocalUserData(userId);
      await logoutAction();
    });
  }

  if (compact) {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        aria-label="Sign out / Abmelden"
        title="Sign out / Abmelden"
        data-testid="header-logout"
        className="rounded-md border border-border p-2 hover:bg-background disabled:opacity-60"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
      </button>
    );
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
