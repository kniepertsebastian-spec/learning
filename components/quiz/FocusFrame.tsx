"use client";

import { LayoutGrid, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { SegmentedProgress, type SegmentState } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { useLocale } from "@/lib/i18n";

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
  const router = useRouter();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  // Im Browser nach document.body (außerhalb der App-Shell, die währenddessen inert ist); auf dem Server inline.
  const inBrowser = useSyncExternalStore(subscribeNoop, () => true, () => false);

  function requestClose() {
    if (confirmLeave) setLeaveOpen(true);
    else router.push(exitHref);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      requestClose();
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
    <div ref={rootRef} tabIndex={-1} className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-background text-foreground outline-none" data-testid="focus-frame" data-mode={mode}>
      <header className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-sidebar-border bg-sidebar px-4 py-2.5 sm:px-6">
        <button type="button" onClick={requestClose} aria-label={t.quiz.close} data-testid="focus-close" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border-strong bg-control hover:bg-surface-2">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1 basis-40">
          <div className="flex items-center gap-2">
            {contextLabel && <p className="truncate text-sm font-semibold">{contextLabel}</p>}
            <Badge tone={mode === "exam" ? "warning" : "accent"}>{mode === "exam" ? t.quiz.examMode : t.quiz.practiceMode}</Badge>
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
          <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setNavOpen(true)} iconLeft={<LayoutGrid className="h-4 w-4" aria-hidden="true" />} data-testid="open-navigator">
            {t.quiz.navigator}
          </Button>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-10">
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
            <Button variant="inverted" onClick={() => router.push(exitHref)} data-testid="leave-confirm">{t.quiz.leave}</Button>
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
