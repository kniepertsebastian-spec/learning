import { AlertTriangle, Lightbulb, Rocket, Shield, Target } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/cn";

const TONES = {
  exam: { icon: Target, box: "border-mint-border bg-mint-soft", tile: "bg-mint-soft text-mint-text", title: "text-mint-text" },
  mistake: { icon: AlertTriangle, box: "border-warning/40 bg-warning-soft", tile: "bg-warning-soft text-warning-text", title: "text-warning-text" },
  memo: { icon: Lightbulb, box: "border-info/40 bg-info-soft", tile: "bg-info-soft text-info-text", title: "text-info-text" },
  possible: { icon: Rocket, box: "border-violet/40 bg-surface-2", tile: "bg-surface-2 text-violet", title: "text-violet" },
  info: { icon: Shield, box: "border-border-strong bg-surface-2", tile: "bg-surface-2 text-muted", title: "text-muted" },
} as const;

export type CalloutTone = keyof typeof TONES;

/** Hinweisblock: Icon-Kachel 32 px (Radius 9) + Overline-Titel 13/600 + Text 15/1.6 (Prüfungsrelevant, Häufiger Fehler, Merksatz, Hinweis). */
export function Callout({ tone, title, children, className }: { tone: CalloutTone; title: string; children: React.ReactNode; className?: string }) {
  const t = TONES[tone];
  const Icon = t.icon;
  return (
    <aside className={cn("flex gap-3 rounded-xl border p-4", t.box, className)} data-callout={tone}>
      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]", t.tile)} aria-hidden="true">
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
      </span>
      <div className="min-w-0">
        <p className={cn("text-meta font-semibold tracking-wide uppercase", t.title)}>{title}</p>
        <div className="mt-1 text-body leading-relaxed text-text-2">{children}</div>
      </div>
    </aside>
  );
}
