"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { isChunkLoadError, prepareServiceWorkerForChunkReload, reloadOnceForChunkError } from "@/lib/client/chunk-error";
import { reportClientError } from "@/lib/client/report-client-error";
import { c_notFound } from "@/lib/i18n/components/not-found";
import "./globals.css";

function reloadWithFreshServiceWorker() {
  void prepareServiceWorkerForChunkReload().finally(() => window.location.reload());
}

/**
 * Fehler im Root-Layout selbst (R9), z. B. Datenbank nicht erreichbar: ersetzt das ganze Dokument, deshalb eigenes
 * <html>/<body>, ohne LocaleProvider und ohne App-Rahmen. Die Sprache ist hier nicht sicher bekannt, deshalb stehen beide
 * Sprachen da. Das dunkle Design kommt wie im Root-Layout aus dem gespeicherten Theme bzw. dem Browser.
 *
 * Nach einem Deploy fehlen offenen Tabs und der installierten App Skript-Chunks der alten Version (ChunkLoadError). Dann
 * wie in app/error.tsx einmal Seiten-Cache und wartenden Service Worker aktualisieren und neu laden, mit Sperre gegen eine
 * Reload-Schleife (lib/client/chunk-error.ts). Jeder Fehler geht zusätzlich ins Server-Log (POST /api/client-errors).
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const chunkError = isChunkLoadError(error);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    let willReload = false;
    try {
      willReload = reloadOnceForChunkError(error, window.sessionStorage, reloadWithFreshServiceWorker);
    } catch {
      // Speicher gesperrt: Fehlerseite zeigen
    }
    // Zustand nach außen spiegeln (Hinweis statt Fehlertext), der Effekt reagiert hier auf den gerade aufgefangenen Fehler.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReloading(willReload);
    if (!willReload) console.error(error);
    reportClientError(error, { boundary: "global", reloading: willReload });
    try {
      const stored = window.localStorage.getItem("certstudy-theme");
      const dark = stored === "dark" || stored === "light" ? stored === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.classList.toggle("dark", dark);
    } catch {
      // Speicher gesperrt: helles Design
    }
  }, [error]);

  const de = c_notFound("de");
  const en = c_notFound("en");
  return (
    <html lang="de" className="h-full antialiased" suppressHydrationWarning>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <title>Knowvia</title>
        {reloading ? (
          <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center" role="status" data-testid="global-error-reloading">
            <p className="text-sm text-subtle">{de.globalErrorUpdating}</p>
            <p className="text-sm text-subtle" lang="en">
              {en.globalErrorUpdating}
            </p>
          </main>
        ) : (
          <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center" role="alert" data-testid="global-error-page" data-chunk-error={chunkError}>
            <h1 className="text-xl font-semibold">{de.globalErrorTitle}</h1>
            <p className="text-sm text-subtle">{de.globalErrorBody}</p>
            <p className="text-sm text-subtle" lang="en">
              {en.globalErrorTitle}. {en.globalErrorBody}
            </p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {/* Bei einem Chunk-Fehler hilft retry() nicht: die alten Chunks bleiben weg, nur ein ganzer Seitenaufruf holt die neuen. */}
              <Button onClick={() => (chunkError ? reloadWithFreshServiceWorker() : retry())}>
                {de.retry} / <span lang="en">{en.retry}</span>
              </Button>
              {/* Ganzer Seitenaufruf statt Client-Navigation: das Root-Layout soll komplett neu laden. */}
              <Button asChild variant="secondary">
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a href="/">
                  {de.home} / <span lang="en">{en.home}</span>
                </a>
              </Button>
            </div>
          </main>
        )}
      </body>
    </html>
  );
}
