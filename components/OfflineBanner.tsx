"use client";

import { useEffect } from "react";
import { WifiOff } from "lucide-react";
import { hardNavigationTarget } from "@/lib/client/offline-nav";
import { useOnlineStatus } from "@/lib/client/use-online-status";
import { useLocale } from "@/lib/i18n";

/**
 * Hinweisbalken „Du bist offline“ (roadmap_pwa Phase 2) und harte Navigation für interne Links, solange kein Netz da ist.
 * Das Abfangen der Klicks läuft in der Capture-Phase, vor dem Link-Handler von Next.
 */
export function OfflineBanner() {
  const online = useOnlineStatus();
  const { t } = useLocale();

  useEffect(() => {
    if (online) return;
    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor) return;
      const target = hardNavigationTarget(
        {
          href: anchor.getAttribute("href"),
          target: anchor.getAttribute("target"),
          download: anchor.hasAttribute("download"),
          button: event.button,
          modified: event.metaKey || event.ctrlKey || event.shiftKey || event.altKey,
          defaultPrevented: event.defaultPrevented,
        },
        window.location.origin,
        navigator.onLine,
      );
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      window.location.assign(target);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [online]);

  if (online) return null;
  return (
    <div role="status" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-warning/40 bg-warning-soft px-4 py-2 text-sm text-warning-text" data-testid="offline-banner">
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{t.pwa.offlineBanner}</span>
      <a href="/offline" className="font-medium underline underline-offset-2">{t.pwa.offlineBannerLink}</a>
    </div>
  );
}
