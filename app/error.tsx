"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { isChunkLoadError, reloadOnceForChunkError } from "@/lib/client/chunk-error";
import { useLocale } from "@/lib/i18n";

/**
 * Fehlerseite für alle Routen unter dem Root-Layout. Nach einem Deploy fehlen alten Tabs Skript-Chunks (ChunkLoadError):
 * dann einmal neu laden statt eine Fehlerseite zu zeigen (roadmap_pwa Phase 3).
 */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const { t } = useLocale();
  const chunkError = isChunkLoadError(error);

  useEffect(() => {
    let reloading = false;
    try {
      reloading = reloadOnceForChunkError(error, window.sessionStorage, () => window.location.reload());
    } catch {
      // Speicher gesperrt: Fehlerseite zeigen
    }
    if (!reloading) console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-3 py-16 text-center" role="alert" data-testid="error-page" data-chunk-error={chunkError}>
      <h1 className="text-xl font-semibold">{t.pwa.errorTitle}</h1>
      <p className="text-sm text-subtle">{t.pwa.errorBody}</p>
      <Button onClick={() => (chunkError ? window.location.reload() : retry())}>{t.pwa.errorRetry}</Button>
    </div>
  );
}
