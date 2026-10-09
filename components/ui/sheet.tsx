"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/cn";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

/** Seitenpanel (rechts 360–420 px, links für Navigation auf dem Handy); Schatten nur hier und bei Dialogen. */
export function SheetContent({ className, children, side = "right", closeLabel = "Schließen", ...props }: React.ComponentProps<typeof DialogPrimitive.Content> & { side?: "right" | "left"; closeLabel?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="anim-fade-in fixed inset-0 z-50 bg-background/70" />
      <DialogPrimitive.Content
        className={cn(
          "anim-sheet-in fixed top-0 z-50 flex h-full w-[min(420px,100vw)] flex-col overflow-y-auto border-border bg-surface p-5 shadow-sheet",
          side === "right" ? "right-0 border-l" : "left-0 border-r [animation-direction:normal]",
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close aria-label={closeLabel} className="absolute top-3 right-3 flex h-10 w-10 items-center justify-center rounded-md text-subtle hover:bg-surface-2 hover:text-foreground">
          <X className="h-4 w-4" aria-hidden="true" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function SheetTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn("pr-10 text-base font-semibold", className)} {...props} />;
}

export function SheetDescription({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn("mt-1 text-sm text-subtle", className)} {...props} />;
}
