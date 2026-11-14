/**
 * Tests für E-Mail-Bestätigung, Passwort-Reset und E-Mail-Versand gegen eine ECHTE Postgres-
 * Datenbank und einen lokalen SMTP-Server, der wie Gmail eine Anmeldung verlangt und Mails abfängt.
 * Nur mit TEST_DATABASE_URL, sonst übersprungen.
 */
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));

import { and, eq, like } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  accountTokens,
  auditEvents,
  organizationMemberships,
  organizations,
  users,
} from "@/lib/server/db/schema";
import { POST as forgotRoute } from "@/app/api/recovery/forgot-password/route";
import { POST as resetRoute } from "@/app/api/recovery/reset-password/route";
import { POST as verifyRoute } from "@/app/api/recovery/verify-email/route";
import { POST as resendRoute } from "@/app/api/recovery/resend-verification/route";
import { POST as registerRoute } from "@/app/api/register/route";
import { POST as inviteRoute } from "@/app/api/company/invitations/route";
import { authenticateUser } from "@/lib/server/credentials";
import { isSessionTokenValid } from "@/lib/server/session-validity";
import { linkFrom, startSmtpSink, useSmtpSinkEnv, type SmtpSink } from "@/lib/server/mail/test-smtp";
import {
  requestPasswordReset,
  resendVerificationEmail,
  resetPasswordWithToken,
  verifyEmailWithToken,
} from "./recovery";
import {
  consumeAccountToken,
  createAccountToken,
  hashAccountToken,
  RESET_PASSWORD_TTL_MS,
  VERIFY_EMAIL_TTL_MS,
} from "./tokens";

const run = TEST_DB ? describe : describe.skip;
const PASSWORD = "Altes-passwort-1";

const post = (data: unknown, ip = `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`) =>
  new Request("http://x/api", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": ip },
    body: JSON.stringify(data),
  });
const tokenOf = (link: string) => link.split("/").pop()!;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

run("E-Mail-Bestätigung, Passwort-Reset, Versand (echte DB + SMTP-Testserver)", () => {
  const tag = randomUUID().slice(0, 8);
  const emailOf = (key: string) => `${key}-${tag}@test.example`.toLowerCase();
  const ids: Record<string, string> = {};
  const orgs: string[] = [];
  let passwordHash = "";
  let sink: SmtpSink;
  let restoreEnv: () => void;
  const toOf = (email: string) => (m: { to?: unknown }) => {
    const to = m.to as { value: { address: string }[] } | { value: { address: string }[] }[] | undefined;
    const list = Array.isArray(to) ? to : to ? [to] : [];
    return list.some((a) => a.value.some((v) => v.address === email));
  };
  const mailsTo = (email: string) => sink.messages.filter(toOf(email));

  async function makeUser(key: string, verified = true) {
    const [u] = await getDb()
      .insert(users)
      .values({ email: emailOf(key), passwordHash, name: key, emailVerifiedAt: verified ? new Date() : null })
      .returning({ id: users.id });
    ids[key] = u.id;
    return u.id;
  }
  const withoutMail = async <T>(fn: () => Promise<T>): Promise<T> => {
    const saved = process.env.MAIL_SMTP_HOST;
    delete process.env.MAIL_SMTP_HOST;
    try {
      return await fn();
    } finally {
      process.env.MAIL_SMTP_HOST = saved;
    }
  };

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 4);
    sink = await startSmtpSink();
    restoreEnv = useSmtpSinkEnv(sink.port);
  });
  afterAll(async () => {
    restoreEnv();
    await sink.close();
    const db = getDb();
    if (orgs.length) await db.delete(organizations).where(eq(organizations.id, orgs[0]));
    await db.delete(users).where(like(users.email, `%-${tag}@test.example`));
  });
  beforeEach(() => authMock.mockReset());

  describe("Tokens", () => {
    it("speichert nur den Hash und setzt die Gültigkeit je Zweck (Reset 1 h, Bestätigung 24 h)", async () => {
      const id = await makeUser("tok-hash");
      const now = new Date("2026-01-01T10:00:00Z");
      const reset = await createAccountToken(id, "reset_password", now);
      const verify = await createAccountToken(id, "verify_email", now);
      const rows = await getDb().select().from(accountTokens).where(eq(accountTokens.userId, id));
      const byPurpose = Object.fromEntries(rows.map((r) => [r.purpose, r]));
      expect(byPurpose.reset_password.tokenHash).toBe(hashAccountToken(reset));
      expect(byPurpose.reset_password.expiresAt.getTime()).toBe(now.getTime() + RESET_PASSWORD_TTL_MS);
      expect(byPurpose.verify_email.expiresAt.getTime()).toBe(now.getTime() + VERIFY_EMAIL_TTL_MS);
      expect(JSON.stringify(rows)).not.toContain(reset);
      expect(JSON.stringify(rows)).not.toContain(verify);
      expect(reset.length).toBeGreaterThanOrEqual(43);
    });

    it("ein neuer Link ersetzt den alten desselben Zwecks, andere Zwecke bleiben", async () => {
      const id = await makeUser("tok-replace");
      const first = await createAccountToken(id, "reset_password");
      const verify = await createAccountToken(id, "verify_email");
      const second = await createAccountToken(id, "reset_password");
      expect(await consumeAccountToken(first, "reset_password")).toBeNull();
      expect(await consumeAccountToken(second, "reset_password")).toBe(id);
      expect(await consumeAccountToken(verify, "verify_email")).toBe(id);
    });

    it("einmalig, zweckgebunden, befristet; parallele Versuche: genau einer gewinnt", async () => {
      const id = await makeUser("tok-use");
      const token = await createAccountToken(id, "reset_password");
      expect(await consumeAccountToken(token, "verify_email")).toBeNull(); // falscher Zweck
      expect(await consumeAccountToken(token, "reset_password", new Date(Date.now() + RESET_PASSWORD_TTL_MS + 1000))).toBeNull(); // abgelaufen
      const results = await Promise.all(Array.from({ length: 6 }, () => consumeAccountToken(token, "reset_password")));
      expect(results.filter(Boolean)).toHaveLength(1);
      expect(await consumeAccountToken(token, "reset_password")).toBeNull(); // schon benutzt
      expect(await consumeAccountToken("x".repeat(43), "reset_password")).toBeNull();
    });
  });

  describe("E-Mail bestätigen", () => {
    it("Link bestätigt die Adresse, einmalig", async () => {
      const id = await makeUser("verify", false);
      const token = await createAccountToken(id, "verify_email");
      expect(await verifyEmailWithToken(token)).toBe(true);
      const [row] = await getDb().select().from(users).where(eq(users.id, id));
      expect(row.emailVerifiedAt).toBeInstanceOf(Date);
      expect(await verifyEmailWithToken(token)).toBe(false);
      expect(await verifyEmailWithToken("falsch".repeat(8))).toBe(false);
    });

    it("API: 200 mit gültigem Token, 400 sonst (generische Meldung)", async () => {
      const id = await makeUser("verify-api", false);
      const token = await createAccountToken(id, "verify_email");
      expect((await verifyRoute(post({ token }))).status).toBe(200);
      const again = await verifyRoute(post({ token }));
      expect(again.status).toBe(400);
      expect((await again.json()).error).toMatch(/ungültig oder abgelaufen/);
      expect((await verifyRoute(post({}))).status).toBe(400);
    });

    it("erneut senden: nur für unbestätigte Konten, mit Link in der Mail", async () => {
      await makeUser("resend-ok", false);
      await makeUser("resend-verified", true);
      await resendVerificationEmail(emailOf("resend-ok"));
      await resendVerificationEmail(emailOf("resend-verified"));
      await resendVerificationEmail(emailOf("gibt-es-nicht"));
      const mail = await sink.waitFor(toOf(emailOf("resend-ok")));
      expect(mail.subject).toMatch(/bestätige/i);
      const token = tokenOf(linkFrom(mail, "/verify-email/"));
      expect(await verifyEmailWithToken(token)).toBe(true);
      await wait(100);
      expect(mailsTo(emailOf("resend-verified"))).toHaveLength(0);
      expect(mailsTo(emailOf("gibt-es-nicht"))).toHaveLength(0);
    });
  });

  describe("Passwort zurücksetzen", () => {
    it("Link in der Mail setzt ein neues Passwort, beendet Sitzungen, verbraucht alle Links", async () => {
      const id = await makeUser("reset", false);
      await getDb().update(users).set({ passwordSet: false }).where(eq(users.id, id)); // wie ein SSO-Konto (Aufgabe 09)
      await requestPasswordReset(emailOf("reset").toUpperCase()); // Schreibweise wird normalisiert
      const mail = await sink.waitFor(toOf(emailOf("reset")));
      expect(mail.subject).toMatch(/Passwort/);
      expect(mail.text).toContain("https://learning.example.test/reset-password/");
      const token = tokenOf(linkFrom(mail, "/reset-password/"));

      expect(await resetPasswordWithToken(token, "ganz-neues-passwort-9")).toBe(true);
      const [row] = await getDb().select().from(users).where(eq(users.id, id));
      expect(await bcrypt.compare("ganz-neues-passwort-9", row.passwordHash)).toBe(true);
      expect(await bcrypt.compare(PASSWORD, row.passwordHash)).toBe(false);
      expect(row.sessionVersion).toBe(1);
      expect(row.passwordSet).toBe(true); // ab jetzt gibt es ein bekanntes Passwort
      expect(row.emailVerifiedAt).toBeInstanceOf(Date); // Link aus dem Postfach beweist die Adresse
      expect(await isSessionTokenValid(id, 0)).toBe(false);
      expect(await resetPasswordWithToken(token, "noch-ein-passwort-9")).toBe(false); // einmalig
      const audit = await getDb().select().from(auditEvents).where(and(eq(auditEvents.actorUserId, id), eq(auditEvents.action, "account.password_reset")));
      expect(audit).toHaveLength(1);
      expect(JSON.stringify(audit)).not.toContain("passwort-9");
    });

    it("unbekannte Adresse: keine Mail, kein Token", async () => {
      const before = sink.messages.length;
      await requestPasswordReset(emailOf("niemand"));
      await wait(150);
      expect(sink.messages.length).toBe(before);
    });

    it("ein zweiter Antrag macht den ersten Link ungültig", async () => {
      await makeUser("reset2");
      await requestPasswordReset(emailOf("reset2"));
      await requestPasswordReset(emailOf("reset2"));
      await wait(200);
      const [first, second] = mailsTo(emailOf("reset2")).map((m) => tokenOf(linkFrom(m, "/reset-password/")));
      expect(await resetPasswordWithToken(first, "irgendein-passwort-1")).toBe(false);
      expect(await resetPasswordWithToken(second, "irgendein-passwort-1")).toBe(true);
    });

    it("API: gleiche Antwort für bekannte und unbekannte Adresse, Limit je Adresse, 503 ohne Versand", async () => {
      await makeUser("forgot");
      const known = await forgotRoute(post({ email: emailOf("forgot") }));
      const unknown = await forgotRoute(post({ email: emailOf("unbekannt-xyz") }));
      expect(known.status).toBe(200);
      expect(unknown.status).toBe(200);
      expect(await known.json()).toEqual(await unknown.json());
      await sink.waitFor(toOf(emailOf("forgot")));
      expect(mailsTo(emailOf("unbekannt-xyz"))).toHaveLength(0);

      expect((await forgotRoute(post({ email: "kein-email" }))).status).toBe(400);

      // Limit: 3 pro Adresse und Stunde (die Adresse "forgot" hat schon 1)
      const email = emailOf("limit-adresse");
      const statuses = [];
      for (let i = 0; i < 4; i++) statuses.push((await forgotRoute(post({ email }))).status);
      expect(statuses).toEqual([200, 200, 200, 429]);

      await withoutMail(async () => {
        expect((await forgotRoute(post({ email: emailOf("forgot") }))).status).toBe(503);
        expect((await resendRoute(post({ email: emailOf("forgot") }))).status).toBe(503);
      });
    });

    it("API reset-password: schwaches Passwort 400, ungültiger Link 400, gültig 200, Wiederholung 400", async () => {
      const id = await makeUser("reset-api");
      const token = await createAccountToken(id, "reset_password");
      expect((await resetRoute(post({ token, newPassword: "kurz" }))).status).toBe(400);
      expect((await resetRoute(post({ token, newPassword: "ä".repeat(40) }))).status).toBe(400); // > 72 Byte
      const invalid = await resetRoute(post({ token: "x".repeat(43), newPassword: "Gutes-passwort-1" }));
      expect(invalid.status).toBe(400);
      expect((await invalid.json()).error).toMatch(/ungültig oder abgelaufen/);
      expect((await resetRoute(post({ token, newPassword: "Gutes-passwort-1" }))).status).toBe(200);
      expect((await resetRoute(post({ token, newPassword: "Gutes-passwort-2" }))).status).toBe(400);
    });
  });

  describe("Anmeldung und Registrierung", () => {
    it("authenticateUser: unbestätigte Adresse zählt nur, wenn der Versand eingerichtet ist", async () => {
      await makeUser("auth-ok", true);
      await makeUser("auth-unverified", false);
      expect(await authenticateUser(emailOf("auth-ok").toUpperCase(), PASSWORD)).toMatchObject({ email: emailOf("auth-ok") });
      expect(await authenticateUser(emailOf("auth-ok"), "falsch")).toBeNull();
      expect(await authenticateUser(emailOf("gibt-es-nicht"), PASSWORD)).toBeNull();
      expect(await authenticateUser(emailOf("auth-unverified"), PASSWORD)).toBeNull(); // Versand an
      await withoutMail(async () => {
        expect(await authenticateUser(emailOf("auth-unverified"), PASSWORD)).toMatchObject({ email: emailOf("auth-unverified") });
      });
    });

    it("Registrierung mit Versand: unbestätigt, Bestätigungsmail, Anmeldung erst nach Klick auf den Link", async () => {
      const prev = process.env.REGISTRATION_ALLOWED_EMAILS;
      process.env.REGISTRATION_ALLOWED_EMAILS = emailOf("reg-new");
      try {
        const res = await registerRoute(post({ email: emailOf("reg-new"), password: PASSWORD }));
        expect(res.status).toBe(201);
        expect((await res.json()).verificationRequired).toBe(true);
        const [row] = await getDb().select().from(users).where(eq(users.email, emailOf("reg-new")));
        expect(row.emailVerifiedAt).toBeNull();
        expect(await authenticateUser(emailOf("reg-new"), PASSWORD)).toBeNull();

        const mail = await sink.waitFor(toOf(emailOf("reg-new")));
        expect(await verifyEmailWithToken(tokenOf(linkFrom(mail, "/verify-email/")))).toBe(true);
        expect(await authenticateUser(emailOf("reg-new"), PASSWORD)).toMatchObject({ email: emailOf("reg-new") });
      } finally {
        if (prev === undefined) delete process.env.REGISTRATION_ALLOWED_EMAILS;
        else process.env.REGISTRATION_ALLOWED_EMAILS = prev;
      }
    });

    it("Registrierung ohne Versand: sofort bestätigt (es gäbe sonst keinen Weg), keine Mail", async () => {
      const prev = process.env.REGISTRATION_ALLOWED_EMAILS;
      process.env.REGISTRATION_ALLOWED_EMAILS = emailOf("reg-nomail");
      try {
        await withoutMail(async () => {
          const res = await registerRoute(post({ email: emailOf("reg-nomail"), password: PASSWORD }));
          expect(res.status).toBe(201);
          expect((await res.json()).verificationRequired).toBe(false);
          const [row] = await getDb().select().from(users).where(eq(users.email, emailOf("reg-nomail")));
          expect(row.emailVerifiedAt).toBeInstanceOf(Date);
        });
        await wait(100);
        expect(mailsTo(emailOf("reg-nomail"))).toHaveLength(0);
      } finally {
        if (prev === undefined) delete process.env.REGISTRATION_ALLOWED_EMAILS;
        else process.env.REGISTRATION_ALLOWED_EMAILS = prev;
      }
    });
  });

  describe("Einladung per E-Mail", () => {
    async function adminFixture() {
      if (ids["mail-admin"]) {
        authMock.mockResolvedValue({ user: { id: ids["mail-admin"] } });
        return;
      }
      const [org] = await getDb().insert(organizations).values({ name: `Mail-Firma ${tag}` }).returning();
      orgs.push(org.id);
      const adminId = await makeUser("mail-admin");
      await getDb().insert(organizationMemberships).values({ organizationId: org.id, userId: adminId, role: "company_admin" });
      authMock.mockResolvedValue({ user: { id: adminId } });
    }

    it("verschickt den Einladungslink zusätzlich per E-Mail und zeigt ihn weiter an", async () => {
      await adminFixture();
      const res = await inviteRoute(new Request("http://x/api/company/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: emailOf("eingeladen"), role: "mentor" }),
      }));
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.emailSent).toBe(true);
      const mail = await sink.waitFor(toOf(emailOf("eingeladen")));
      expect(mail.subject).toBe(`Einladung zu Mail-Firma ${tag}`);
      expect(mail.text).toContain("Mentor");
      expect(linkFrom(mail, "/invite/")).toBe(`https://learning.example.test${body.invitePath}`);
    });

    it("scheitert der Versand, bleibt die Einladung bestehen (emailSent=false, Link wird angezeigt)", async () => {
      await adminFixture();
      const saved = process.env.MAIL_SMTP_PORT;
      process.env.MAIL_SMTP_PORT = "1";
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});
      try {
        const res = await inviteRoute(new Request("http://x/api/company/invitations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: emailOf("eingeladen2"), role: "learner" }),
        }));
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.emailSent).toBe(false);
        expect(body.invitePath).toMatch(/^\/invite\//);
      } finally {
        spy.mockRestore();
        process.env.MAIL_SMTP_PORT = saved;
      }
    });
  });
});
