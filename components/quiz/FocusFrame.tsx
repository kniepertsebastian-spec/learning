"use client";

import { ArrowLeft, House, LayoutGrid, WifiOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SegmentedProgress, type SegmentState } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/lib/i18n";
import { useOnlineStatus } from "@/lib/client/use-online-status";

/**
 * Fokusmodus für Übung, Wiederholung, Kurz-Check und Prüfung: legt sich über die App-Shell (keine Navigation während der Sitzung).
 * Fokusleiste: Schließen, Kontext + Modus, Fortschritt, rechts Timer o. Ä. Verlassen fragt nach, wenn Antworten verloren gingen.
 */
export function FocusFrame({
  exitHref,
  confirmLeave,
  contextLabel,
  mode,
  segments,
  counterText,
  scoreText,
  right,
  navigator,
  children,
}: {
  exitHref: string;
  confirmLeave: boolean;
  contextLabel?: string;
  mode: "practice" | "exam";
  segments: SegmentState[];
  counterText: string;
  scoreText?: string;
  right?: React.ReactNode;
  /** Fragenübersicht: rechte Spalte ab lg, darunter hinter einem Knopf in der Leiste (Sheet). */
  navigator?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { t } = useLocale();
  const online = useOnlineStatus();
  const router = useRouter();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveTo, setLeaveTo] = useState(exitHref);
  const [navOpen, setNavOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // Im Browser nach document.body (außerhalb der App-Shell, die währenddessen inert ist); auf dem Server inline.
  const inBrowser = useSyncExternalStore(subscribeNoop, () => true, () => false);

  function navigateOut(target: string) {
    if (typeof window !== "undefined" && window.navigator && !window.navigator.onLine) {
      window.location.assign(target);
      return;
    }
    router.push(target);
  }

  function requestClose(target: string = exitHref) {
    if (confirmLeave) {
      setLeaveTo(target);
      setLeaveOpen(true);
    } else navigateOut(target);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      requestClose(exitHref);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    rootRef.current?.focus();
    // Während der Sitzung ist die App-Shell darunter nicht erreichbar (Tab, Screenreader).
    const shell = document.querySelector("[data-app-shell]");
    shell?.setAttribute("inert", "");
    return () => shell?.removeAttribute("inert");
  }, []);

  const frame = (
    <div ref={rootRef} tabIndex={-1} className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-background pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-foreground outline-none" data-testid="focus-frame" data-mode={mode}>
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-sidebar-border bg-sidebar px-4 pt-[calc(0.625rem+env(safe-area-inset-top))] pb-2.5 sm:px-6">
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={() => requestClose(exitHref)} data-testid="focus-close" className="flex h-11 items-center gap-1.5 rounded-md border border-border-strong bg-control px-3 text-sm font-medium hover:bg-surface-2">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t.quiz.backToCourse}
          </button>
          <button type="button" onClick={() => requestClose("/")} aria-label={t.quiz.toDashboard} data-testid="focus-dashboard" className="flex h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-subtle hover:bg-surface-2 hover:text-foreground">
            <House className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">{t.quiz.toDashboard}</span>
          </button>
        </div>
        <div className="order-last min-w-0 basis-full sm:order-none sm:flex-1 sm:basis-40">
          <div className="flex items-center gap-2">
            {contextLabel && <p className="truncate text-sm font-semibold">{contextLabel}</p>}
            <Badge tone={mode === "exam" ? "warning" : "accent"}>{mode === "exam" ? t.quiz.examMode : t.quiz.practiceMode}</Badge>
            {/* Die App-Shell mit dem OfflineBanner ist während der Sitzung verdeckt (inert): kompakter Hinweis hier. */}
            {!online && (
              <Badge tone="neutral" role="status" className="shrink-0" data-testid="focus-offline">
                <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
                <span aria-hidden="true">Offline</span>
                <span className="sr-only">{t.pwa.offlineBanner}</span>
              </Badge>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-3">
            <SegmentedProgress segments={segments} label={counterText} className="max-w-md" />
            <p className="shrink-0 text-xs text-subtle tabular-nums" data-testid="focus-counter">
              {counterText}
              {scoreText ? ` · ${scoreText}` : ""}
            </p>
          </div>
        </div>
        {right}
        {navigator && (
          <Button variant="secondary" size="sm" className="ml-auto h-11 sm:ml-0 sm:h-9 lg:hidden" onClick={() => setNavOpen(true)} iconLeft={<LayoutGrid className="h-4 w-4" aria-hidden="true" />} aria-label={t.quiz.navigator} data-testid="open-navigator">
            <span className="hidden sm:inline">{t.quiz.navigator}</span>
          </Button>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-10">
          <div className="mx-auto w-full max-w-[760px]">{children}</div>
        </div>
        {navigator && <aside className="hidden w-[300px] shrink-0 overflow-y-auto border-l border-border p-5 lg:block">{navigator}</aside>}
      </div>

      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent closeLabel={t.quiz.close}>
          <DialogTitle>{t.quiz.leaveTitle}</DialogTitle>
          <DialogDescription>{t.quiz.leaveBody}</DialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setLeaveOpen(false)}>{t.quiz.stay}</Button>
            <Button variant="inverted" onClick={() => navigateOut(leaveTo)} data-testid="leave-confirm">{t.quiz.leave}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {navigator && (
        <Sheet open={navOpen} onOpenChange={setNavOpen}>
          <SheetContent closeLabel={t.quiz.close}>
            <SheetTitle>{t.quiz.navigator}</SheetTitle>
            <SheetDescription className="sr-only">{t.quiz.navigator}</SheetDescription>
            <div className="mt-4">{navigator}</div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
  return inBrowser ? createPortal(frame, document.body) : frame;
}

function subscribeNoop() {
  return () => {};
}
