import { defineConfig } from "@playwright/test";

/**
 * E2E-Tests der PWA gegen den PRODUKTIONS-Build (der Service Worker ist im Dev-Server abgeschaltet):
 *   npm run build && npm run test:e2e
 * Braucht eine migrierte Postgres-Datenbank (E2E_DATABASE_URL oder DATABASE_URL). Siehe docs/PWA.md.
 */
const databaseUrl = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
export const APP_PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  globalSetup: "./e2e/global-setup.ts",
  // Die Tests teilen sich Nutzer und Kurs aus dem Seeding und einen Server.
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  use: { trace: "retain-on-failure", locale: "en-US" },
  webServer: {
    command: `node node_modules/next/dist/bin/next start -p ${APP_PORT}`,
    url: `http://localhost:${APP_PORT}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: {
      DATABASE_URL: databaseUrl,
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-only-secret",
      AUTH_TRUST_HOST: "true",
    },
  },
});
