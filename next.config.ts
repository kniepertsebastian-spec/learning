import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// Sicherheits-Header für alle Routen. Die CSP beschränkt bewusst nur
// Einbettung, Plugins, <base> und Formularziele - kein script-src/default-src:
// eine strikte Nonce-CSP erzwingt dynamisches Rendering aller Seiten und
// muss separat gegen die laufende App geprüft werden (siehe
// docs/ROADMAP-TECHNISCH.md, Phase 0).
const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  experimental: {
    // Enables next/navigation's forbidden()/unauthorized() so admin guards
    // (R0.2, lib/server/auth-guards.ts) can return real 403/401 responses
    // instead of only hiding UI.
    authInterrupts: true,
  },
};

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

export default withSerwist(nextConfig);
