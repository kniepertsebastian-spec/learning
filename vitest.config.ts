import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Komponententests (renderToStaticMarkup) brauchen die automatische JSX-Umwandlung.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    setupFiles: ["./test-support/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // Nachgeladene Komponenten synchron renderbar machen (siehe test-support/next-dynamic.tsx).
      "next/dynamic": path.resolve(__dirname, "test-support/next-dynamic.tsx"),
    },
  },
});
