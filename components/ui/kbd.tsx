import * as React from "react";
import { cn } from "@/lib/cn";

/** Tastenkürzel: Geist Mono 11 px, Rahmen `--border-strong`, Radius 5–6. */
export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return <kbd className={cn("inline-flex min-w-5 items-center justify-center rounded-xs border border-border-strong bg-control px-1.5 py-0.5 font-mono text-2xs text-muted", className)} {...props} />;
}
