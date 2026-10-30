"use client";

import { Tabs as TabsPrimitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/cn";

/** Tabs mit Unterstrich (Radix: Tastatur, ARIA). */
export const Tabs = TabsPrimitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("flex gap-5 overflow-x-auto border-b border-border", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "-mb-px h-11 border-b-2 border-transparent px-0.5 text-sm font-medium whitespace-nowrap text-subtle transition-colors duration-150 hover:text-foreground data-[state=active]:border-accent data-[state=active]:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

export const TabsContent = TabsPrimitive.Content;

/** Pillen auf eingelassener Fläche (z. B. „Alle / Überfällig / Abgeschlossen“, Varianten in Lektionen). */
export function SegmentedControl<T extends string>({ value, onChange, options, label, className }: { value: T; onChange: (value: T) => void; options: { value: T; label: string }[]; label?: string; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex max-w-full gap-1 overflow-x-auto rounded-lg border border-border-subtle bg-surface-inset p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn("h-8 rounded-md px-3 text-meta font-medium transition-colors duration-150", value === o.value ? "bg-surface-2 text-foreground" : "text-subtle hover:text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
