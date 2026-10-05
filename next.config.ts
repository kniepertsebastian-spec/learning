import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

// Die vollständige, nonce-basierte CSP für Seiten setzt proxy.ts (lib/server/csp.ts).
// Diese Basis-Policy gilt zusätzlich für alle Routen, auch die vom Proxy
// ausgenommenen (API, statische Dateien); beide Policies werden gemeinsam erzwungen.
const baseContentSecurityPolicy =
  "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'";

const securityHeaders = [
  { key: "Content-Security-Policy", value: baseContentSecurityPolicy },
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // Enables next/navigation's forbidden()/unauthorized() so admin guards
    // (R0.2, lib/server/auth-guards.ts) can return real 403/401 responses
    // instead of only hiding UI.
    authInterrupts: true,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

export default withSerwist(nextConfig);
