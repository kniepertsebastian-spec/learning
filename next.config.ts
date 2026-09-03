import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  output: "standalone",
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
