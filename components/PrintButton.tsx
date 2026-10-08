"use client";

import { Printer } from "lucide-react";

/** Öffnet den Druckdialog des Browsers (auch zum Speichern als PDF). */
export function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface print:hidden">
      <Printer className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}
