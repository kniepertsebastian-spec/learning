"use client";

import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLocale } from "@/lib/i18n";

export function OfflineFallback() {
  const { t } = useLocale();
  return (
    <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-3 py-16 text-center" data-testid="offline-fallback">
      <WifiOff className="h-8 w-8 text-subtle" aria-hidden="true" />
      <h1 className="text-xl font-semibold">{t.pwa.offlineFallbackTitle}</h1>
      <p className="text-sm text-subtle">{t.pwa.offlineFallbackBody}</p>
      {/* Normales <a>: harte Navigation, kein RSC-Abruf ohne Netz */}
      <Button asChild><a href="/offline">{t.pwa.offlineBannerLink}</a></Button>
    </div>
  );
}
