import * as React from "react";
import { cn } from "@/lib/cn";

const FILL = { accent: "bg-accent", mint: "bg-mint", info: "bg-info", warning: "bg-warning", danger: "bg-danger" } as const;
const HEIGHT = { sm: "h-[5px]", md: "h-1.5", lg: "h-2" } as const;

/** Fortschrittsbalken: Höhe 5/6/8 px, Track `--track`, Füllung Akzent oder Ton. */
export function ProgressBar({ value, size = "md", tone = "accent", label, className }: { value: number; size?: keyof typeof HEIGHT; tone?: keyof typeof FILL; label?: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label} className={cn("w-full overflow-hidden rounded-full bg-track", HEIGHT[size], className)}>
      <div className={cn("h-full rounded-full transition-[width] duration-200", FILL[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

export type SegmentState = "open" | "current" | "correct" | "wrong";
const SEGMENT: Record<SegmentState, string> = { open: "bg-track", current: "bg-info", correct: "bg-mint", wrong: "bg-danger" };

/** N Segmente à 6 px, Lücke 4 px; Zustände offen/aktuell/richtig/falsch (nie nur über Farbe: Zahl steht im Text daneben). */
export function SegmentedProgress({ segments, label, className }: { segments: SegmentState[]; label?: string; className?: string }) {
  return (
    <div role="img" aria-label={label} className={cn("flex w-full gap-1", className)}>
      {segments.map((state, i) => (
        <span key={i} className={cn("h-1.5 flex-1 rounded-full", SEGMENT[state])} />
      ))}
    </div>
  );
}

/** Ring (SVG, r=52, Strich 10) mit Wert mittig (28 px, 700) und Unterzeile „von 100“. */
export function ProgressRing({ value, caption, label, markAt, className }: { value: number; caption?: string; label?: string; /** Markierung (z. B. Bestehensgrenze) in Prozent */ markAt?: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const r = 52;
  const c = 2 * Math.PI * r;
  const mark = markAt === undefined ? null : (markAt / 100) * 2 * Math.PI - Math.PI / 2;
  return (
    <div className={cn("relative inline-flex h-[132px] w-[132px] items-center justify-center", className)} role="img" aria-label={label ?? `${Math.round(pct)}`}>
      <svg viewBox="0 0 120 120" className="absolute inset-0 -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-track" />
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} className="stroke-accent transition-[stroke-dashoffset] duration-200" />
      </svg>
      {mark !== null && (
        <svg viewBox="0 0 120 120" className="absolute inset-0" aria-hidden="true">
          <line x1={60 + 44 * Math.cos(mark)} y1={60 + 44 * Math.sin(mark)} x2={60 + 62 * Math.cos(mark)} y2={60 + 62 * Math.sin(mark)} strokeWidth="3" className="stroke-foreground" />
        </svg>
      )}
      <div className="text-center">
        <p className="text-[28px] leading-none font-bold tabular-nums">{Math.round(pct)}</p>
        {caption && <p className="mt-1 text-xs text-faint">{caption}</p>}
      </div>
    </div>
  );
}
