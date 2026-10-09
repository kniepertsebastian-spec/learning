import * as React from "react";
import { cn } from "@/lib/cn";

/** Karte: `surface`, Rahmen `border`, Radius 16. Variante `hero`: der einzige Verlauf der Oberfläche (Radius 18). */
export function Card({ className, variant = "default", ...props }: React.HTMLAttributes<HTMLDivElement> & { variant?: "default" | "hero" | "inset" }) {
  return (
    <div
      className={cn(
        variant === "hero" && "hero-surface rounded-3xl border p-6",
        variant === "default" && "rounded-2xl border border-border bg-surface p-5",
        variant === "inset" && "rounded-xl border border-border-subtle bg-surface-inset p-4",
        className,
      )}
      {...props}
    />
  );
}

export function Overline({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-[11px] font-semibold tracking-[0.07em] text-faint uppercase", className)} {...props} />;
}
