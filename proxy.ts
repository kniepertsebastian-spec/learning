import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { buildContentSecurityPolicy, generateNonce } from "@/lib/server/csp";
import { hasSessionCookie, hostnameFromHostHeader, isLocalHostname } from "@/lib/server/proxy-guards";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/cert/")) {
    if (!hasSessionCookie(request.cookies.getAll())) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("from", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Nonce-basierte CSP: Next.js liest die Nonce aus dem Request-Header
  // Content-Security-Policy und trägt sie in seine Skripte ein; app/layout.tsx
  // liest x-nonce für das Theme-Skript.
  const nonce = generateNonce();
  const isDev = process.env.NODE_ENV === "development";
  // upgrade-insecure-requests nur für echte Domains, nicht für den http://localhost-Produktionsbuild in CI/E2E.
  const hostname = hostnameFromHostHeader(request.headers.get("host")) ?? request.nextUrl.hostname;
  const csp = buildContentSecurityPolicy(nonce, isDev, !isDev && !isLocalHostname(hostname));

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-pathname", pathname);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Alle Seiten; ohne API, Next-Assets und Dateien mit Endung (sw.js, manifest.json, Icons).
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
