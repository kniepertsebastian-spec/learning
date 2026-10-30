import * as React from "react";
import { cn } from "@/lib/cn";

/** Leerer Zustand: Icon, ein Satz, eine klare Aktion. Ersetzt alle „Noch keine …“-Zeilen. */
export function EmptyState({ icon, title, description, action, className }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center gap-3 rounded-xl border border-dashed border-border-strong px-6 py-10 text-center", className)}>
      {icon && <span className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-subtle [&>svg]:h-5 [&>svg]:w-5">{icon}</span>}
      <p className="text-body font-semibold">{title}</p>
      {description && <p className="max-w-sm text-sm text-subtle">{description}</p>}
      {action}
    </div>
  );
}
