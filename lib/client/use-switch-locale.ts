"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/lib/i18n";
import type { Locale } from "@/lib/types";

/**
 * Sprache umschalten und die Server-Komponenten der aktuellen Seite neu laden: sie lesen die Sprache aus dem Cookie
 * (lib/server/locale.ts) und blieben sonst bis zur nächsten Navigation in der alten Sprache. Offline bleibt es beim
 * Umschalten im Browser.
 */
export function useSwitchLocale(): (next: Locale) => void {
  const { setLocale } = useLocale();
  const router = useRouter();
  return useCallback(
    (next: Locale) => {
      setLocale(next);
      if (typeof navigator === "undefined" || navigator.onLine) router.refresh();
    },
    [setLocale, router],
  );
}
