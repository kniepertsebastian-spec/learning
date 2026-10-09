"use client";

import { Check } from "lucide-react";
import { DropdownMenu as MenuPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/cn";

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;
export const DropdownMenuSeparator = ({ className, ...props }: React.ComponentProps<typeof MenuPrimitive.Separator>) => <MenuPrimitive.Separator className={cn("my-1 h-px bg-border-subtle", className)} {...props} />;

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: React.ComponentProps<typeof MenuPrimitive.Content>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content sideOffset={sideOffset} className={cn("anim-pop-in z-50 min-w-56 rounded-xl border border-border bg-surface p-1.5 shadow-sheet", className)} {...props} />
    </MenuPrimitive.Portal>
  );
}

const itemClass = "flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm text-foreground outline-none data-[highlighted]:bg-surface-2 data-[disabled]:opacity-50";

export function DropdownMenuItem({ className, ...props }: React.ComponentProps<typeof MenuPrimitive.Item>) {
  return <MenuPrimitive.Item className={cn(itemClass, className)} {...props} />;
}

/** Eintrag mit Häkchen beim aktiven Element (Kontext-Switcher, Sprache, Theme). */
export function DropdownMenuCheckItem({ className, checked, children, ...props }: React.ComponentProps<typeof MenuPrimitive.CheckboxItem>) {
  return (
    <MenuPrimitive.CheckboxItem checked={checked} className={cn(itemClass, "justify-between", className)} {...props}>
      <span className="flex items-center gap-2.5">{children}</span>
      <MenuPrimitive.ItemIndicator>
        <Check className="h-4 w-4 text-link" aria-hidden="true" />
      </MenuPrimitive.ItemIndicator>
    </MenuPrimitive.CheckboxItem>
  );
}

export function DropdownMenuLabel({ className, ...props }: React.ComponentProps<typeof MenuPrimitive.Label>) {
  return <MenuPrimitive.Label className={cn("px-2.5 py-1.5 text-[11px] font-semibold tracking-[0.07em] text-faint uppercase", className)} {...props} />;
}
