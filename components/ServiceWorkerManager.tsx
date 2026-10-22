"use client";

import { useEffect, useRef } from "react";
import { reconcileCacheOwner, clearPagesCache } from "@/lib/client/cache-owner";
import { useLocale } from "@/lib/i18n";
import { toast } from "@/components/ui/toaster";

/**
 * Service-Worker-Verwaltung im Browser (roadmap_pwa Phase 3), ohne eigene Oberfläche:
 *  - Seiten-Cache gehört einem Nutzer: bei anderer Nutzer-ID (auch nach abgelaufener Sitzung) wird er geleert.
 *  - Update-Fluss: ein wartender Service Worker löst einen Toast „Neue Version verfügbar“ aus; erst der Klick schickt
 *    SKIP_WAITING, danach lädt die Seite beim Wechsel des Controllers neu. Ohne Klick läuft die alte Version weiter.
 */
export function ServiceWorkerManager({ userId }: { userId: string | null }) {
  const { t } = useLocale();
  const label = useRef({ message: t.pwa.updateAvailable, action: t.pwa.updateReload });
  useEffect(() => {
    label.current = { message: t.pwa.updateAvailable, action: t.pwa.updateReload };
  }, [t]);

  useEffect(() => {
    let storage: Storage | null = null;
    try {
      storage = window.localStorage;
    } catch {
      // Speicher gesperrt
    }
    void reconcileCacheOwner(userId, storage ?? { getItem: () => null, setItem: () => {} }, clearPagesCache);
  }, [userId]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let reloadRequested = false;
    let shown = false;

    const announce = (worker: ServiceWorker) => {
      if (shown) return;
      shown = true;
      toast(label.current.message, {
        id: "sw-update",
        duration: Infinity,
        action: {
          label: label.current.action,
          onClick: () => {
            reloadRequested = true;
            worker.postMessage({ type: "SKIP_WAITING" });
          },
        },
      });
    };

    const onControllerChange = () => {
      if (reloadRequested) window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    let cancelled = false;
    const watch = (registration: ServiceWorkerRegistration) => {
      // Es gibt nur dann etwas zu „aktualisieren“, wenn schon ein Worker die Seite steuert (nicht bei der Erstinstallation).
      const hasController = () => Boolean(navigator.serviceWorker.controller);
      if (registration.waiting && hasController()) announce(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const installing = registration.installing;
        installing?.addEventListener("statechange", () => {
          if (installing.state === "installed" && hasController() && registration.waiting) announce(registration.waiting);
        });
      });
    };
    // `ready` statt `getRegistration()`: beim ersten Besuch wird der Worker erst nach dem Laden der Seite registriert.
    void navigator.serviceWorker.ready.then((registration) => {
      if (!cancelled) watch(registration);
    });

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
