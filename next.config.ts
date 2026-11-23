import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// Die vollständige, nonce-basierte CSP für Seiten setzt proxy.ts (lib/server/csp.ts).
// Diese Basis-Policy gilt zusätzlich für alle Routen, auch die vom Proxy
// ausgenommenen (API, statische Dateien); beide Policies werden gemeinsam erzwungen.
const baseContentSecurityPolicy =
  "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";

const securityHeaders = [
  { key: "Content-Security-Policy", value: baseContentSecurityPolicy },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

// Eine Kennung je Build. Next.js hängt sie an die Asset-Adressen (?dpl=) und schickt sie bei Client-Navigationen mit: passt sie
// nicht zum Server (offener Tab nach einem Deploy), lädt Next.js die Seite ganz neu, statt Chunks der alten Version
// nachzuladen, die es nicht mehr gibt. Über die Umgebung weitergereicht, damit alle Build-Prozesse dieselbe Kennung nutzen.
const deploymentId = process.env.NEXT_DEPLOYMENT_ID || process.env.GITHUB_SHA || `b${Date.now().toString(36)}`;
process.env.NEXT_DEPLOYMENT_ID = deploymentId;

// Kein `output: "standalone"`: Das Image startet mit `npm start` (`next start`) und braucht neben der App auch die
// Admin-Skripte und Migrationen (`docker compose exec app npm run ...`, drizzle-kit beim Start). `next start` verträgt sich
// nicht mit standalone (Next.js warnt), und der standalone-Ordner würde nur ungenutzt mitgebaut (Roadmap Teil 5, AP-07).
const nextConfig: NextConfig = {
  deploymentId,
  experimental: {
    // Enables next/navigation's forbidden()/unauthorized() so admin guards
    // (R0.2, lib/server/auth-guards.ts) can return real 403/401 responses
    // instead of only hiding UI.
    authInterrupts: true,
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Der Service Worker darf weder im Browser-HTTP-Cache noch bei Cloudflare/Proxys hängen bleiben, sonst kommen Updates
      // (neue Version, Sicherheitskorrekturen am Cache-Verhalten) verspätet oder gar nicht an. CDN-Cache-Control gilt nur
      // für Cloudflare & Co. und verbietet dort zusätzlich jede Edge-Kopie (deploy/Caddyfile, deploy/nginx.conf.example).
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "CDN-Cache-Control", value: "no-store" },
        ],
      },
      // Manifest: darf zwischengespeichert, muss aber bei jedem Abruf neu geprüft werden (Icons, Name, Shortcuts).
      {
        source: "/manifest.json",
        headers: [{ key: "Cache-Control", value: "public, max-age=0, must-revalidate" }],
      },
    ];
  },
};

// Offline-Einstieg vorab im Precache; die Revision wechselt mit jedem Build, damit er nach einem Deploy erneuert wird.
const precacheRevision = deploymentId;

// Icon und Badge der Push-Benachrichtigung (app/sw.ts, push-Handler), damit sie auch ohne Netz erscheinen. Achtung: Sobald
// additionalPrecacheEntries gesetzt ist, nimmt Serwist KEINE Dateien aus public/ mehr automatisch auf; was der Service Worker
// offline braucht, muss hier stehen. Revision = Inhalts-Hash: neu geladen wird nur, wenn sich die Datei ändert.
// Geprüft in e2e/push.spec.ts (PWA-Roadmap AP-04, m-3).
const PUSH_ICONS = ["/icons/icon-192x192.png", "/icons/badge-96x96.png"];
const fileRevision = (url: string) => createHash("sha256").update(readFileSync(path.join(process.cwd(), "public", url))).digest("hex").slice(0, 16);

const withSerwist = withSerwistInit({
  additionalPrecacheEntries: [
    { url: "/offline", revision: precacheRevision },
    { url: "/~offline", revision: precacheRevision },
    ...PUSH_ICONS.map((url) => ({ url, revision: fileRevision(url) })),
  ],
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  // Ein Netzwechsel darf keine laufende StudySession per Reload beenden.
  reloadOnOnline: false,
});

export default withSerwist(nextConfig);
