import * as React from "react";
import { cn } from "@/lib/cn";

const PALETTE = ["bg-mint-soft text-mint-text", "bg-info-soft text-info-text", "bg-warning-soft text-warning-text", "bg-danger-soft text-danger-text", "bg-surface-2 text-violet"] as const;
const SIZE = { sm: "h-[26px] w-[26px] text-[11px]", md: "h-8 w-8 text-xs", lg: "h-[34px] w-[34px] text-[13px]" } as const;

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function toneOf(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Initialen auf farbiger Fläche; die Farbe ergibt sich stabil aus dem Namen. `dashed` für offene Einladungen. */
export function Avatar({ name, size = "md", dashed = false, className }: { name: string; size?: keyof typeof SIZE; dashed?: boolean; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", SIZE[size], dashed ? "border border-dashed border-border-strong text-faint" : toneOf(name), className)}>
      {initialsOf(name)}
    </span>
  );
}

/** Überlappende Avatare (−6 px) mit 2 px Ring in `--surface`; Rest als „+n“. */
export function AvatarStack({ names, max = 4, size = "sm", className }: { names: string[]; max?: number; size?: keyof typeof SIZE; className?: string }) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return (
    <span className={cn("inline-flex items-center", className)}>
      {shown.map((n, i) => (
        <Avatar key={`${n}-${i}`} name={n} size={size} className={cn("ring-2 ring-surface", i > 0 && "-ml-1.5")} />
      ))}
      {rest > 0 && <span className={cn("-ml-1.5 inline-flex items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-muted ring-2 ring-surface", SIZE[size])}>+{rest}</span>}
    </span>
  );
}
