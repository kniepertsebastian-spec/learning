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
      // Unter 600 px Breite liegen Toasts unten am Rand: über dem iOS-Home-Indicator bleiben (viewportFit „cover“).
      mobileOffset={{ bottom: "calc(16px + env(safe-area-inset-bottom))" }}
      toastOptions={{
        style: { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border-strong)", borderRadius: "12px" },
      }}
    />
  );
}
