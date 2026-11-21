"use client";

import { Search } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Kbd } from "@/components/ui/kbd";
import { useLocale } from "@/lib/i18n";
import { c_commandPalette } from "@/lib/i18n/components/commandPalette";

/**
 * Command-Palette (⌘K bzw. Strg+K): springt zu Seiten der Navigation und sucht Kurse, Abschnitte und Befehle aus Merkzetteln.
 * Hier stehen nur der Knopf und das Tastenkürzel; der Dialog mit Suche und Trefferliste (CommandPaletteDialog) ist ein eigener
 * Chunk und wird erst beim ersten Öffnen geladen (beim Überfahren des Knopfs schon vorab), damit er nicht auf jeder Seite im
 * Start-Bundle steckt.
 */

export interface PalettePage {
  href: string;
  label: string;
}

const loadDialog = () => import("@/components/shell/CommandPaletteDialog").then((m) => m.CommandPaletteDialog);
const CommandPaletteDialog = dynamic(loadDialog, { ssr: false });

export function CommandPalette({ pages }: { pages: PalettePage[] }) {
  const { locale } = useLocale();
  const tx = c_commandPalette(locale);
  const [open, setOpen] = useState(false);
  // Erst nach dem ersten Öffnen eingebunden (und dann behalten, damit Schließen-Animation und Zustand bleiben).
  const [wanted, setWanted] = useState(false);

  const setOpenAndLoad = (next: boolean) => {
    if (next) setWanted(true);
    setOpen(next);
  };

  // ⌘K / Strg+K öffnet und schließt die Palette, auch beim Tippen in einem Feld.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setWanted(true);
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpenAndLoad(true)}
        onPointerEnter={() => void loadDialog()}
        onFocus={() => void loadDialog()}
        aria-label={tx.open}
        aria-keyshortcuts="Control+K Meta+K"
        data-testid="command-palette-trigger"
        className="flex h-8 items-center gap-2 rounded-md border border-border-strong bg-control px-2.5 text-sm text-muted hover:bg-surface-2 hover:text-foreground"
      >
        <Search className="h-4 w-4" aria-hidden="true" />
        <span className="hidden sm:inline">{tx.open}</span>
        <Kbd className="hidden sm:inline-flex">{tx.shortcut}</Kbd>
      </button>
      {wanted && <CommandPaletteDialog pages={pages} open={open} setOpen={setOpenAndLoad} />}
    </>
  );
}
