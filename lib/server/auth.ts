import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { getDb } from "./db/client";
import { users } from "./db/schema";
import { checkRateLimit, getClientIp } from "./rate-limit";

// Brute-Force-Schutz: pro Konto UND pro IP begrenzt - das Konto-Limit greift
// auch, wenn ein Angreifer IPs wechselt, das IP-Limit auch beim Durchprobieren
// vieler Konten.
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LIMIT_PER_EMAIL = 10;
const LOGIN_LIMIT_PER_IP = 30;

/**
 * Credentials-Provider mit JWT-Sessions - kein Auth.js-Adapter/DB-Sessiontabellen
 * nötig (die wären nur für OAuth/DB-Sessions/Magic-Link erforderlich). Siehe
 * roadmap2.md Dev-Order Schritt 2.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
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
        const email =
          typeof credentials?.email === "string" ? credentials.email.trim().toLowerCase() : undefined;
        const password =
          typeof credentials?.password === "string" ? credentials.password : undefined;
        if (!email || !password) return null;

        const ip = getClientIp(request.headers);
        if (
          !checkRateLimit(`login:email:${email}`, LOGIN_LIMIT_PER_EMAIL, LOGIN_WINDOW_MS).ok ||
          !checkRateLimit(`login:ip:${ip}`, LOGIN_LIMIT_PER_IP, LOGIN_WINDOW_MS).ok
        ) {
          return null;
        }

        // lower() auf beiden Seiten: Bestandskonten können noch mit
        // Großbuchstaben gespeichert sein (vor der Normalisierung in
        // /api/register), sollen aber unabhängig von der Schreibweise beim
        // Login gefunden werden.
        const [user] = await getDb()
          .select()
          .from(users)
          .where(sql`lower(${users.email}) = ${email}`)
          .limit(1);
        if (!user) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.id === "string") {
        session.user.id = token.id;
      }
      return session;
    },
  },
});
