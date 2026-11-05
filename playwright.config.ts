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
      // Die Tests melden sich pro Lauf dutzendfach an (siehe lib/server/auth-rate-limit.ts).
      LOGIN_RATE_LIMIT_FACTOR: "50",
      // Nur für die Tests erzeugtes Schlüsselpaar (kein Geheimnis): schaltet Web Push im Test-Server ein, geschickt wird nichts.
      VAPID_PUBLIC_KEY: "BA50T__sWx9ravCcUBr6OR6RRlXDONtyYj5ltd2TIk8B4blm53kFGsQOG1wPDT5_dTdxys59VBXSB8kAxRemxoU",
      VAPID_PRIVATE_KEY: "lnBUcPgrbG5s3Y3fxBMxabKGXFRs2UDsM8_4SZIjqO4",
      VAPID_SUBJECT: "mailto:e2e@test.example",
    },
  },
});
