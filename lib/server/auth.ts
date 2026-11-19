import { cache } from "react";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { checkLoginRateLimit, clientIp } from "./auth-rate-limit";
import { authenticateUser } from "./credentials";
import { isSessionTokenValid } from "./session-validity";
import { parseLoginCredentials } from "./login-input";
import { consumeLoginTicket } from "./sso/service";

/**
 * Credentials-Provider mit JWT-Sessions - kein Auth.js-Adapter/DB-Sessiontabellen
 * nötig (die wären nur für OAuth/DB-Sessions/Magic-Link erforderlich). Siehe
 * roadmap2.md Dev-Order Schritt 2.
 */
const nextAuth = NextAuth({
  session: { strategy: "jwt" },
  secret: process.env.AUTH_SECRET,
  // Läuft hinter dem cloudflared-Tunnel (siehe docker-compose.yml), nicht hinter
  // Vercels eigenem Proxy - Auth.js vertraut dem Host-Header dort standardmäßig
  // nicht (Schutz vor Host-Header-Injection). Der Tunnel selbst terminiert TLS
  // korrekt an der Cloudflare-Edge, daher ist das hier sicher.
  trustHost: true,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: async (credentials, request) => {
        // Fehlende Felder und zu lange E-Mails (über 254 Zeichen) lehnen wir ab, bevor sie den Rate-Limiter erreichen.
        const input = parseLoginCredentials(credentials);
        if (!input) return null;

        // Gesperrte Versuche liefern dieselbe Antwort wie falsche Zugangsdaten.
        if (!checkLoginRateLimit(clientIp(request.headers), input.email).allowed) return null;

        // Passwortprüfung inkl. E-Mail-Bestätigung: lib/server/credentials.ts
        return authenticateUser(input.email, input.password);
      },
    }),
    // Anmeldung über das Firmenkonto: nur mit einem einmaligen Ticket, das /api/sso/callback nach geprüfter Rückkehr vom IdP ausstellt.
    Credentials({
      id: "sso",
      credentials: { ticket: { label: "Ticket", type: "text" } },
      authorize: async (credentials) => {
        const ticket = typeof credentials?.ticket === "string" ? credentials.ticket : undefined;
        return ticket ? consumeLoginTicket(ticket) : null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        // sessionVersion setzt authorize() (Typ-Erweiterung von User greift in Auth.js nicht).
        const version = (user as { sessionVersion?: unknown }).sessionVersion;
        token.sv = typeof version === "number" ? version : 0;
        // Zeitpunkt der Anmeldung (Sekunden). Kontolöschung ohne Passwort verlangt eine frische Anmeldung (Aufgabe 09).
        token.at = Math.floor(Date.now() / 1000);
        return token;
      }
      // Bei jedem späteren Lesen: Nutzer gelöscht oder Passwort geändert -> Sitzung beenden
      // (null löscht das Cookie, auth() liefert dann keine Sitzung).
      if (typeof token.id !== "string") return null;
      const tokenVersion = typeof token.sv === "number" ? token.sv : undefined;
      return (await isSessionTokenValid(token.id, tokenVersion)) ? token : null;
    },
    async session({ session, token }) {
      if (session.user && typeof token.id === "string") {
        session.user.id = token.id;
      }
      // Ältere Tokens ohne Zeitpunkt gelten als nicht frisch (lesen: lib/server/session-auth-time.ts).
      Object.assign(session, { authenticatedAt: typeof token.at === "number" ? token.at : null });
      return session;
    },
  },
});

export const { handlers, signIn, signOut } = nextAuth;

/**
 * Die Sitzung, einmal je Anfrage gelesen (React `cache`, R6): Root-Layout, Kurs-Layout und Seite rufen `auth()` jeweils
 * selbst auf, und jeder Aufruf führt den jwt-Callback samt Datenbankabfrage aus. Außerhalb des Renderns ruft `cache` durch.
 */
export const auth = cache(() => nextAuth.auth());
