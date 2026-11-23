"use client";

import { Toaster as Sonner, toast } from "sonner";
import { useTheme } from "@/lib/theme";

export { toast };

/** Toasts (sonner) in den Farben der Oberfläche; einmal im Layout einbinden. */
export function Toaster() {
  const { theme } = useTheme();
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      // Über dem iOS-Home-Indicator bleiben (viewportFit „cover“): unter 600 px gilt `mobileOffset`, darüber `offset` –
      // das betrifft iPads im Vollbild. Die übrigen Seiten behalten Sonners Standard (16 px mobil, 24 px sonst).
      mobileOffset={{ bottom: "calc(16px + env(safe-area-inset-bottom))" }}
      offset={{ bottom: "calc(24px + env(safe-area-inset-bottom))" }}
      toastOptions={{
        style: { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border-strong)", borderRadius: "12px" },
      }}
    />
  );
}
