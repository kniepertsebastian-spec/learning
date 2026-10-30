import * as React from "react";
import { cn } from "@/lib/cn";

const SUB_TONE = { default: "text-faint", accent: "text-mint-text", warning: "text-warning-text", danger: "text-danger-text", info: "text-info-text" } as const;

/** Kennzahl-Kachel: Label (13), Wert (26–28, 600, tabular-nums), Unterzeile (12; optional farbig). */
export function StatTile({ label, value, sub, subTone = "default", className }: { label: string; value: React.ReactNode; sub?: React.ReactNode; subTone?: keyof typeof SUB_TONE; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-surface p-4", className)}>
      <p className="text-meta text-subtle">{label}</p>
      <p className="mt-1 text-stat leading-tight font-semibold tabular-nums">{value}</p>
      {sub && <p className={cn("mt-1 text-xs", SUB_TONE[subTone])}>{sub}</p>}
    </div>
  );
}
