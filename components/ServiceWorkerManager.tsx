"use client";

import { useEffect, useRef } from "react";
import { reconcileCacheOwner, clearPagesCache } from "@/lib/client/cache-owner";
import { getLastUserId, setLastUserId } from "@/lib/client/last-user";
import { startSyncTriggers } from "@/lib/client/sync-queue";
import { checkOfflinePackageAccess } from "@/lib/client/offline-download";
import { deleteOfflinePackage, isOfflineStorageSupported, listOfflinePackages, markOfflinePackageVerified, notifyPackagesChanged } from "@/lib/client/offline-db";
import { pruneRevokedPackages } from "@/lib/client/revoked-packages";
import { useLocale } from "@/lib/i18n";
import { toast } from "@/components/ui/toaster";
import { startInstallCapture } from "@/lib/client/install-prompt";

/**
 * Service-Worker-Verwaltung im Browser (roadmap_pwa Phase 3), ohne eigene Oberfläche:
 *  - Seiten-Cache gehört einem Nutzer: bei anderer Nutzer-ID (auch nach abgelaufener Sitzung) wird er geleert.
 *  - Update-Fluss: ein wartender Service Worker löst einen Toast „Neue Version verfügbar“ aus; erst der Klick schickt
 *    SKIP_WAITING, danach lädt die Seite beim Wechsel des Controllers neu. Ohne Klick läuft die alte Version weiter.
 */
export function ServiceWorkerManager({ userId }: { userId: string | null }) {
  const { t, locale } = useLocale();
  const label = useRef({ message: t.pwa.updateAvailable, action: t.pwa.updateReload });
  useEffect(() => {
    label.current = { message: t.pwa.updateAvailable, action: t.pwa.updateReload };
  }, [t]);

  // `beforeinstallprompt` feuert oft vor dem Öffnen einer Seite mit Installationshinweis: früh festhalten.
  useEffect(() => startInstallCapture(), []);

  // Übertragung der Warteschlange: Start, online, Vordergrund, Hintergrund (auch auf `/offline`, wo der Header fehlt).
  useEffect(() => startSyncTriggers(() => userId ?? getLastUserId()), [userId]);

  // Entzogener Zugriff (z. B. aus der Firma entfernt): lokale Pakete verschwinden, sobald das Gerät online ist.
  const de = locale === "de";
  useEffect(() => {
    const prune = async () => {
      const id = userId ?? getLastUserId();
      if (!id || !navigator.onLine || !isOfflineStorageSupported()) return;
      const removed = await pruneRevokedPackages({
        list: async () => (await listOfflinePackages(id)).map((p) => ({ certificationId: p.certificationId, certName: p.certName })),
        check: checkOfflinePackageAccess,
        remove: (certificationId) => deleteOfflinePackage(id, certificationId),
        verified: (certificationId) => markOfflinePackageVerified(id, certificationId),
      }).catch(() => []);
      notifyPackagesChanged(); // gesperrte Pakete (Ablauf) können durch die Prüfung wieder frei sein
      if (removed.length === 0) return;
      toast(de ? "Ein Kurs ist nicht mehr für dich freigegeben und wurde vom Gerät entfernt." : "A course is no longer shared with you and was removed from this device.", { id: "package-revoked", duration: 8000 });
    };
    void prune();
    window.addEventListener("online", prune);
    return () => window.removeEventListener("online", prune);
  }, [userId, de]);

  useEffect(() => {
    if (userId) setLastUserId(userId); // Offline-Einstieg (/offline) weiß so, welche Pakete zu zeigen sind
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
