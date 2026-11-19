"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { c_notFound } from "@/lib/i18n/components/not-found";
import { useLocaleOptional } from "@/lib/i18n";

/**
 * Platzhalter, solange der Server eine Seite rendert (loading.tsx, R9). Ohne ihn passiert auf langsamen Verbindungen nach
 * einem Klick sichtbar nichts. Grobe Form der Zielseite, damit beim Einblenden wenig springt.
 */
export function PageSkeleton({ variant }: { variant: "dashboard" | "course" | "session" | "list" }) {
  const { locale } = useLocaleOptional();
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 py-6" role="status" aria-live="polite" data-testid={`page-skeleton-${variant}`}>
      <span className="sr-only">{c_notFound(locale).loading}</span>
      {variant === "session" ? (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <div className="mt-2 flex flex-col gap-3">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-8 w-2/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
          {variant === "dashboard" && (
            <div className="grid gap-4 sm:grid-cols-3">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          )}
          {variant === "course" && <Skeleton className="h-28 w-full rounded-xl" />}
          <div className="flex flex-col gap-3">
            {Array.from({ length: variant === "list" ? 6 : 4 }, (_, i) => (
              <Skeleton key={i} className={variant === "list" ? "h-12 w-full" : "h-20 w-full rounded-xl"} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
