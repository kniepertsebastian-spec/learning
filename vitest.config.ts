import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // Komponententests (renderToStaticMarkup) brauchen die automatische JSX-Umwandlung.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
