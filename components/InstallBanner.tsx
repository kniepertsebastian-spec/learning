"use client";

import { useEffect, useState } from "react";
import { Share, SquarePlus, X } from "lucide-react";
import { useLocale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { currentInstallOffer, dismissInstallOffer, promptInstall, subscribeInstall, startInstallCapture } from "@/lib/client/install-prompt";
import type { InstallOffer } from "@/lib/pwa/install";

/**
 * Hinweis „App installieren“ (roadmap_pwa Phase 5): eigener Button, wenn der Browser die Installation anbietet; auf
 * iPhone/iPad in Safari die Anleitung „Teilen → Zum Home-Bildschirm“. Kein Zwang: „Nicht jetzt“ pausiert 30 Tage.
 */
export function InstallBanner() {
  const { locale } = useLocale();
  const de = locale === "de";
  const [offer, setOffer] = useState<InstallOffer>(null);

  useEffect(() => {
    startInstallCapture();
    const update = () => setOffer(currentInstallOffer());
    update();
    return subscribeInstall(update);
  }, []);

  if (!offer) return null;
  return (
    <div role="region" aria-label={de ? "App installieren" : "Install the app"} data-testid="install-banner" className="flex flex-wrap items-start gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{de ? "ProofPath als App installieren" : "Install ProofPath as an app"}</p>
        {offer === "native" ? (
          <p className="mt-1 text-sm text-muted">{de ? "Schneller starten, offline lernen und Ergebnisse im Hintergrund übertragen." : "Start faster, study offline and upload results in the background."}</p>
        ) : (
          <ol className="mt-1 flex list-decimal flex-col gap-0.5 pl-5 text-sm text-muted" data-testid="install-ios-steps">
            <li>
              {de ? "Tippe unten in Safari auf „Teilen“ " : "Tap “Share” "}
              <Share className="inline h-4 w-4 align-text-bottom" aria-hidden="true" />
            </li>
            <li>
              {de ? "Wähle „Zum Home-Bildschirm“ " : "Choose “Add to Home Screen” "}
              <SquarePlus className="inline h-4 w-4 align-text-bottom" aria-hidden="true" />
            </li>
          </ol>
        )}
      </div>
      <div className="flex items-center gap-2">
        {offer === "native" && (
          <Button onClick={() => void promptInstall()} data-testid="install-button">
            {de ? "Installieren" : "Install"}
          </Button>
        )}
        <button type="button" onClick={dismissInstallOffer} aria-label={de ? "Nicht jetzt (30 Tage Ruhe)" : "Not now (30 days)"} data-testid="install-dismiss" className="flex h-10 items-center gap-1 rounded-md px-2 text-sm text-subtle hover:bg-surface-2 hover:text-foreground">
          <X className="h-4 w-4" aria-hidden="true" />
          {de ? "Nicht jetzt" : "Not now"}
        </button>
      </div>
    </div>
  );
}
