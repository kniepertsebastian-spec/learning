import { Search } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/cn";
import { Kbd } from "./kbd";

/** Suchfeld mit ⌘K-Hinweis (die Palette selbst folgt später, siehe docs/roadmaps/ROADMAP-UI.md „Später“). */
export const SearchField = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { shortcutHint?: boolean }>(function SearchField({ className, shortcutHint = true, ...props }, ref) {
  return (
    <label className={cn("relative flex h-11 w-full items-center rounded-md border border-border-strong bg-control text-sm focus-within:border-accent", className)}>
      <Search className="pointer-events-none absolute left-3 h-4 w-4 text-faint" aria-hidden="true" />
      <input ref={ref} type="search" className="h-full w-full rounded-md bg-transparent pr-14 pl-9 text-foreground outline-none placeholder:text-faint" {...props} />
      {shortcutHint && <Kbd className="pointer-events-none absolute right-3">⌘K</Kbd>}
    </label>
  );
});
