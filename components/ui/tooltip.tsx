"use client";

import { Tooltip as TooltipPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/cn";

export const TooltipProvider = TooltipPrimitive.Provider;

/** Kurzer Hinweistext; erscheint auch bei Tastaturfokus. */
export function Tooltip({ content, children, className }: { content: React.ReactNode; children: React.ReactElement; className?: string }) {
  return (
    <TooltipPrimitive.Root delayDuration={250}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content sideOffset={6} className={cn("anim-fade-in z-50 max-w-64 rounded-md border border-border-strong bg-surface-2 px-2.5 py-1.5 text-xs text-foreground", className)}>
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
