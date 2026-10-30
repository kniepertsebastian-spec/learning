"use client";

import { c_installBanner } from "@/lib/i18n/components/installBanner";
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
    <div role="region" aria-label={c_installBanner(de).installTheApp} data-testid="install-banner" className="flex flex-wrap items-start gap-3 rounded-2xl border border-border bg-surface p-5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{c_installBanner(de).installKnowviaAsAnApp}</p>
        {offer === "native" ? (
          <p className="mt-1 text-sm text-muted">{c_installBanner(de).startFasterStudyOfflineAnd}</p>
        ) : (
          <ol className="mt-1 flex list-decimal flex-col gap-0.5 pl-5 text-sm text-muted" data-testid="install-ios-steps">
            <li>
              {c_installBanner(de).tapShare}
              <Share className="inline h-4 w-4 align-text-bottom" aria-hidden="true" />
            </li>
            <li>
              {c_installBanner(de).chooseAddToHomeScreen}
              <SquarePlus className="inline h-4 w-4 align-text-bottom" aria-hidden="true" />
            </li>
          </ol>
        )}
      </div>
      <div className="flex items-center gap-2">
        {offer === "native" && (
          <Button onClick={() => void promptInstall()} data-testid="install-button">
            {c_installBanner(de).install}
          </Button>
        )}
        <button type="button" onClick={dismissInstallOffer} aria-label={c_installBanner(de).notNow30Days} data-testid="install-dismiss" className="flex h-10 items-center gap-1 rounded-md px-2 text-sm text-subtle hover:bg-surface-2 hover:text-foreground">
          <X className="h-4 w-4" aria-hidden="true" />
          {c_installBanner(de).notNow}
        </button>
      </div>
    </div>
  );
}
