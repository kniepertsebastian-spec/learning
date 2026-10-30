"use client";

import { Check, ChevronDown } from "lucide-react";
import { Select as SelectPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/cn";

/** Auswahlfeld (Radix: Tastatur, Typeahead). `options` genügt für den Normalfall. */
export function Select({ value, onValueChange, options, placeholder, label, disabled, className }: { value: string; onValueChange: (value: string) => void; options: { value: string; label: string }[]; placeholder?: string; label?: string; disabled?: boolean; className?: string }) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger aria-label={label} className={cn("flex h-10 w-full items-center justify-between gap-2 rounded-md border border-border-strong bg-control px-3 text-sm text-foreground hover:bg-surface-2 disabled:opacity-50", className)}>
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown className="h-4 w-4 text-faint" aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={6} className="anim-pop-in z-50 max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-border bg-surface p-1.5 shadow-overlay">
          <SelectPrimitive.Viewport>
            {options.map((o) => (
              <SelectPrimitive.Item key={o.value} value={o.value} className="flex min-h-10 cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 text-sm text-foreground outline-none data-[highlighted]:bg-surface-2">
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator>
                  <Check className="h-4 w-4 text-link" aria-hidden="true" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
