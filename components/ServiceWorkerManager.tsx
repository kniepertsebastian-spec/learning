"use client";

import { c_serviceWorkerManager } from "@/lib/i18n/components/serviceWorkerManager";
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
 * Als installierte App (standalone) bleibt die Seite oft tagelang offen; der Browser sucht dann nur selten selbst nach einem
 * neuen Service Worker. Beim Zurückholen in den Vordergrund wird höchstens alle 30 Minuten aktiv nachgefragt.
 */
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Service-Worker-Verwaltung im Browser (roadmap_pwa Phase 3), ohne eigene Oberfläche:
 *  - Seiten-Cache gehört einem Nutzer: bei anderer Nutzer-ID (auch nach abgelaufener Sitzung) wird er geleert.
 *  - Update-Fluss: ein wartender Service Worker löst einen Toast „Neue Version verfügbar“ aus; erst der Klick schickt
 *    SKIP_WAITING, danach lädt die Seite beim Wechsel des Controllers neu. Ohne Klick läuft die alte Version weiter.
 *    Angekündigt wird je Worker-Instanz: wird der Toast weggeklickt oder kommt später ein weiterer Deploy, meldet sich
 *    der nächste wartende Worker erneut (vorher blieb ein einmal gezeigter Hinweis für die ganze Sitzung „verbraucht“).
 *  - Weitere offene Tabs: Der neue Worker übernimmt sie sofort (clientsClaim), ihr geladenes JavaScript ist aber noch
 *    das alte. Statt sie ungefragt neu zu laden (Eingaben gingen verloren), zeigen sie einen Hinweis mit „Neu laden“.
 *  - Update-Suche: beim Wechsel in den Vordergrund (gedrosselt, UPDATE_CHECK_INTERVAL_MS), Fehler bleiben folgenlos.
 */
export function ServiceWorkerManager({ userId }: { userId: string | null }) {
  const { t, locale } = useLocale();
  const label = useRef({ message: t.pwa.updateAvailable, activated: t.pwa.updateActivated, action: t.pwa.updateReload });
  useEffect(() => {
    label.current = { message: t.pwa.updateAvailable, activated: t.pwa.updateActivated, action: t.pwa.updateReload };
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
      toast(c_serviceWorkerManager(de).aCourseIsNoLonger, { id: "package-revoked", duration: 8000 });
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
    // Der zuletzt angekündigte wartende Worker. Derselbe wird nicht doppelt gemeldet, ein neuer (weiterer Deploy) schon.
    let announcedWorker: ServiceWorker | null = null;

    const announce = (worker: ServiceWorker) => {
      if (announcedWorker === worker) return;
      announcedWorker = worker;
      const forget = () => {
        if (announcedWorker === worker) announcedWorker = null;
      };
      toast(label.current.message, {
        id: "sw-update",
        duration: Infinity,
        onDismiss: forget,
        action: {
          label: label.current.action,
          onClick: () => {
            reloadRequested = true;
            worker.postMessage({ type: "SKIP_WAITING" });
          },
        },
      });
    };

    // Erstinstallation: der Worker übernimmt eine bisher ungesteuerte Seite - das ist kein Versionswechsel.
    let hadController = Boolean(navigator.serviceWorker.controller);
    const onControllerChange = () => {
      if (reloadRequested) {
        window.location.reload();
        return;
      }
      if (!hadController) {
        hadController = true;
        return;
      }
      // Ein anderer Tab hat das Update bestätigt: dieser Tab läuft mit altem JavaScript unter dem neuen Worker weiter.
      announcedWorker = null;
      toast(label.current.activated, {
        id: "sw-update",
        duration: Infinity,
        action: { label: label.current.action, onClick: () => window.location.reload() },
      });
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
    // Vordergrund-Wechsel: neue Version suchen. Offline zählt nicht als Versuch, damit der nächste Online-Wechsel prüft.
    let activeRegistration: ServiceWorkerRegistration | null = null;
    let lastUpdateCheck = Date.now();
    const onVisibilityChange = () => {
      if (document.visibilityState !== "visible" || !activeRegistration) return;
      // Ein weggewischter Hinweis kommt beim nächsten Zurückholen wieder, solange die neue Version noch wartet.
      if (activeRegistration.waiting && navigator.serviceWorker.controller) announce(activeRegistration.waiting);
      if (!navigator.onLine) return;
      const now = Date.now();
      if (now - lastUpdateCheck < UPDATE_CHECK_INTERVAL_MS) return;
      lastUpdateCheck = now;
      activeRegistration.update().catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    // `ready` statt `getRegistration()`: beim ersten Besuch wird der Worker erst nach dem Laden der Seite registriert.
    // Das `catch` verhindert unbehandelte Rejections in Kontexten ohne Service-Worker-Zugriff (z. B. gesperrter Speicher).
    void navigator.serviceWorker.ready
      .then((registration) => {
        if (cancelled) return;
        activeRegistration = registration;
        watch(registration);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
