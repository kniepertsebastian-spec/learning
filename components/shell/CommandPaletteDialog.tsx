"use client";

import { ArrowRight, BookOpen, FileText, Search, SquareTerminal, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { useLocale } from "@/lib/i18n";
import { c_commandPalette } from "@/lib/i18n/components/commandPalette";
import { fill } from "@/lib/i18n/fill";
import type { PalettePage } from "@/components/shell/CommandPalette";
import { normalizeQuery, rankByTitle, type PaletteHit } from "@/lib/palette/match";

/**
 * Dialog der Command-Palette: springt zu Seiten der Navigation und sucht Kurse, Abschnitte und Befehle aus Merkzetteln. Die
 * Treffer kommen von /api/palette und enthalten nur, was die Person sehen darf. Ohne Eingabe stehen die Seiten der Navigation da.
 * Eigener Chunk: wird erst geladen, wenn die Palette zum ersten Mal geöffnet wird (Knopf und ⌘K in CommandPalette.tsx).
 */

type Item = { key: string; group: "pages" | "course" | "section" | "command"; title: string; subtitle: string | null; href: string };

const ICONS: Record<Item["group"], LucideIcon> = { pages: ArrowRight, course: BookOpen, section: FileText, command: SquareTerminal };
const DEBOUNCE_MS = 200;

export function CommandPaletteDialog({ pages, open, setOpen }: { pages: PalettePage[]; open: boolean; setOpen: (open: boolean) => void }) {
  const { locale } = useLocale();
  const tx = c_commandPalette(locale);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PaletteHit[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [active, setActive] = useState(0);
  const listId = "command-palette-list";
  const inputRef = useRef<HTMLInputElement>(null);

  const valid = normalizeQuery(query);

  // Suche beim Server, kurz nach dem letzten Tastendruck; ein neuer Tastendruck bricht die alte Anfrage ab.
  useEffect(() => {
    if (!open || !valid) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setState("loading");
      try {
        const response = await fetch(`/api/palette?q=${encodeURIComponent(valid)}`, { signal: controller.signal, credentials: "same-origin" });
        if (!response.ok) throw new Error(String(response.status));
        const body = (await response.json()) as { hits: PaletteHit[] };
        setHits(body.hits);
        setState("idle");
        setActive(0);
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setHits([]);
        setState("error");
      }
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, valid]);

  const items: Item[] = useMemo(() => {
    const pageItems: Item[] = (valid ? rankByTitle(pages, valid, (p) => p.label) : pages).map((p) => ({ key: `page:${p.href}`, group: "pages", title: p.label, subtitle: null, href: p.href }));
    const hitItems: Item[] = valid ? hits.map((h) => ({ key: `${h.kind}:${h.id}:${h.title}`, group: h.kind, title: h.title, subtitle: h.subtitle, href: h.href })) : [];
    // Reihenfolge der Gruppen wie im Menü: Kurse, Abschnitte, Befehle, zuletzt die Seiten.
    const order: Item["group"][] = valid ? ["course", "section", "command", "pages"] : ["pages"];
    return order.flatMap((g) => [...pageItems, ...hitItems].filter((i) => i.group === g));
  }, [pages, hits, valid]);

  const groupLabel = (g: Item["group"]) => ({ pages: tx.groupPages, course: tx.groupCourses, section: tx.groupSections, command: tx.groupCommands })[g];
  const close = useCallback(() => setOpen(false), [setOpen]);
  const choose = useCallback(
    (item: Item | undefined) => {
      if (!item) return;
      close();
      router.push(item.href);
    },
    [close, router],
  );

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setQuery("");
      setHits([]);
      setState("idle");
      setActive(0);
    }
  };

  const onInputKey = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (items.length === 0) return;
      setActive((a) => (event.key === "ArrowDown" ? (a + 1) % items.length : (a - 1 + items.length) % items.length));
    } else if (event.key === "Enter") {
      event.preventDefault();
      choose(items[active]);
    }
  };

  const activeId = items[active] ? `command-palette-option-${active}` : undefined;
  const showEmpty = valid && state === "idle" && items.length === 0;
  const showHint = !valid && query.trim().length > 0;
  let lastGroup: Item["group"] | null = null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={tx.close}
        className="top-[12%] max-h-[75vh] max-w-xl -translate-y-0 p-0"
        data-testid="command-palette"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogTitle className="sr-only">{tx.title}</DialogTitle>
        <DialogDescription className="sr-only">{tx.description}</DialogDescription>
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-faint" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKey}
            placeholder={tx.placeholder}
            aria-label={tx.placeholder}
            data-testid="command-palette-input"
            className="h-12 w-full bg-transparent pr-8 text-sm text-foreground outline-none placeholder:text-faint"
          />
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-2">
          <ul id={listId} role="listbox" aria-label={tx.title} className="flex flex-col">
            {items.map((item, index) => {
              const showHeading = item.group !== lastGroup;
              lastGroup = item.group;
              const Icon = ICONS[item.group];
              return (
                <li key={item.key} role="presentation">
                  {showHeading && <p className="px-2 pt-2 pb-1 text-2xs font-semibold tracking-overline text-faint uppercase">{groupLabel(item.group)}</p>}
                  <button
                    type="button"
                    role="option"
                    id={`command-palette-option-${index}`}
                    aria-selected={index === active}
                    tabIndex={-1}
                    onMouseMove={() => setActive(index)}
                    onClick={() => choose(item)}
                    data-testid="command-palette-option"
                    className={cn("flex min-h-11 w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left text-sm", index === active ? "bg-nav-active text-foreground" : "text-muted hover:bg-nav-active/60")}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-subtle" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate", item.group === "command" && "font-mono text-xs")}>{item.title}</span>
                      {item.subtitle && <span className="block truncate text-xs text-subtle">{item.subtitle}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div aria-live="polite" role="status" className="px-2 py-2 text-sm text-subtle">
            {state === "loading" && tx.searching}
            {state === "error" && tx.error}
            {showEmpty && tx.empty}
            {showHint && tx.hint}
            {valid && state === "idle" && items.length > 0 && <span className="sr-only">{fill(tx.results, items.length)}</span>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
