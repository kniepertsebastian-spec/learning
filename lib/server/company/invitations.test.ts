/**
 * Tests für Einladungen per Link (Phase 2) gegen eine ECHTE Postgres-Datenbank. Wie
 * company-access.test.ts nur mit TEST_DATABASE_URL, sonst übersprungen.
 */
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));

import { and, eq, inArray, like } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  companyInvitations,
  organizationMemberships,
  organizations,
  users,
  type CompanyRole,
} from "@/lib/server/db/schema";
import { GET as listInvitations, POST as createInvitationRoute } from "@/app/api/company/invitations/route";
import { DELETE as revokeRoute } from "@/app/api/company/invitations/[id]/route";
import { POST as acceptRoute } from "@/app/api/invitations/accept/route";
import { POST as registerRoute } from "@/app/api/register/route";
import {
  acceptInvitation,
  createInvitation,
  getInvitationPreview,
  hasPendingInvitationForEmail,
  hashInvitationToken,
  INVITATION_LIST_FIELDS,
} from "./invitations";

const run = TEST_DB ? describe : describe.skip;

function signInAs(userId: string | null) {
  authMock.mockResolvedValue(userId ? { user: { id: userId } } : null);
}

const json = (body: unknown) => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

run("Einladungen per Link (echte DB)", () => {
  const tag = randomUUID().slice(0, 8);
  // Wie in der App: E-Mail-Adressen sind normalisiert (klein), siehe lib/server/email.ts.
  const emailOf = (key: string) => `${key}-${tag}@test.example`.toLowerCase();
  const ids: Record<string, string> = {};
  let orgA = "";
  let orgB = "";

  async function makeUser(key: string) {
    const [u] = await getDb()
      .insert(users)
      .values({ email: emailOf(key), passwordHash: "x", name: key })
      .returning({ id: users.id });
    ids[key] = u.id;
    return u.id;
  }
  async function addMember(orgId: string, userId: string, role: CompanyRole) {
    await getDb().insert(organizationMemberships).values({ organizationId: orgId, userId, role });
  }
  const tokenFromPath = (path: string) => path.replace("/invite/", "");

  async function inviteViaApi(adminKey: string, email: string, role: CompanyRole = "learner") {
    signInAs(ids[adminKey]);
    const res = await createInvitationRoute(
      new Request("http://localhost/api/company/invitations", json({ email, role })),
    );
    return { status: res.status, body: await res.json() };
  }
  async function acceptViaApi(userKey: string, token: string) {
    signInAs(ids[userKey]);
    const res = await acceptRoute(new Request("http://localhost/api/invitations/accept", json({ token })));
    return { status: res.status, body: await res.json() };
  }

  beforeAll(async () => {
    const db = getDb();
    const [a] = await db.insert(organizations).values({ name: `Firma A ${tag}` }).returning();
    const [b] = await db.insert(organizations).values({ name: `Firma B ${tag}` }).returning();
    orgA = a.id;
    orgB = b.id;
    await addMember(orgA, await makeUser("adminA"), "company_admin");
    await addMember(orgA, await makeUser("mentorA"), "mentor");
    await addMember(orgA, await makeUser("learnerA"), "learner");
    await addMember(orgB, await makeUser("adminB"), "company_admin");
    await makeUser("loner");
  });

  afterAll(async () => {
    const db = getDb();
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
    await db.delete(users).where(like(users.email, `%-${tag}@test.example`));
  });

  beforeEach(() => authMock.mockReset());

  it("speichert nur den Hash des Tokens, nie das Token selbst", async () => {
    const { invitation, token } = await createInvitation({
      organizationId: orgA,
      createdByUserId: ids.adminA,
      email: emailOf("hash"),
      role: "learner",
    });
    const [row] = await getDb()
      .select()
      .from(companyInvitations)
      .where(eq(companyInvitations.id, invitation.id));
    expect(row.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(token.length).toBeGreaterThanOrEqual(43); // 32 Byte, base64url
  });

  it("API: nur Firmen-Admin darf einladen und listen (sonst 401/403)", async () => {
    signInAs(null);
    expect((await listInvitations()).status).toBe(401);
    for (const key of ["mentorA", "learnerA", "loner"]) {
      signInAs(ids[key]);
      expect((await listInvitations()).status, key).toBe(403);
      const res = await createInvitationRoute(
        new Request("http://x/api/company/invitations", json({ email: emailOf("x"), role: "learner" })),
      );
      expect(res.status, key).toBe(403);
    }
  });

  it("API: Einladung anlegen liefert den Link einmalig, die Liste enthält weder Token noch Hash", async () => {
    const created = await inviteViaApi("adminA", emailOf("neu"), "mentor");
    expect(created.status).toBe(201);
    expect(created.body.invitePath).toMatch(/^\/invite\/[A-Za-z0-9_-]{43}$/);

    signInAs(ids.adminA);
    const list = await (await listInvitations()).json();
    const mine = list.invitations.find((i: { email: string }) => i.email === emailOf("neu"));
    expect(mine).toBeTruthy();
    expect(Object.keys(mine).sort()).toEqual([...INVITATION_LIST_FIELDS].sort());
    expect(JSON.stringify(list)).not.toContain(tokenFromPath(created.body.invitePath));
    expect(JSON.stringify(list)).not.toMatch(/token/i);
  });

  it("API: ungültige Eingaben werden abgelehnt (400)", async () => {
    signInAs(ids.adminA);
    for (const body of [{ email: "kein-email", role: "learner" }, { email: emailOf("a"), role: "boss" }, {}]) {
      const res = await createInvitationRoute(new Request("http://x/api/company/invitations", json(body)));
      expect(res.status).toBe(400);
    }
  });

  it("Mandantentrennung: Admin B sieht und widerruft Einladungen von Firma A nicht", async () => {
    const created = await inviteViaApi("adminA", emailOf("fremd"), "learner");
    const id = (await getDb().select().from(companyInvitations).where(eq(companyInvitations.email, emailOf("fremd"))))[0].id;

    signInAs(ids.adminB);
    const listB = await (await listInvitations()).json();
    expect(JSON.stringify(listB)).not.toContain(emailOf("fremd"));

    const del = await revokeRoute(new Request("http://x", { method: "DELETE" }), { params: Promise.resolve({ id }) });
    expect(del.status).toBe(404);
    expect(await hasPendingInvitationForEmail(emailOf("fremd"))).toBe(true);

    signInAs(ids.adminA);
    const ok = await revokeRoute(new Request("http://x", { method: "DELETE" }), { params: Promise.resolve({ id }) });
    expect(ok.status).toBe(204);
    expect(await getInvitationPreview(tokenFromPath(created.body.invitePath))).toBeNull();
  });

  it("annehmen: richtige E-Mail legt die Mitgliedschaft mit der eingeladenen Rolle an", async () => {
    const userId = await makeUser("invitee1");
    const created = await inviteViaApi("adminA", emailOf("invitee1"), "mentor");
    const token = tokenFromPath(created.body.invitePath);

    expect(await getInvitationPreview(token)).toMatchObject({
      organizationName: `Firma A ${tag}`,
      role: "mentor",
      email: emailOf("invitee1"),
    });

    const res = await acceptViaApi("invitee1", token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ role: "mentor", organizationName: `Firma A ${tag}` });

    const [member] = await getDb().select().from(organizationMemberships).where(eq(organizationMemberships.userId, userId));
    expect(member).toMatchObject({ organizationId: orgA, role: "mentor" });
    expect(await getInvitationPreview(token)).toBeNull(); // verbraucht
  });

  it("annehmen: falsche E-Mail wird abgelehnt (403), die Einladung bleibt für die richtige Person offen", async () => {
    const created = await inviteViaApi("adminA", emailOf("invitee2"), "learner");
    const token = tokenFromPath(created.body.invitePath);

    const wrong = await acceptViaApi("loner", token);
    expect(wrong.status).toBe(403);
    const [stillNoMember] = await getDb().select().from(organizationMemberships).where(eq(organizationMemberships.userId, ids.loner));
    expect(stillNoMember).toBeUndefined();

    await makeUser("invitee2");
    expect((await acceptViaApi("invitee2", token)).status).toBe(200);
  });

  it("annehmen: Einmalverwendung - ein verbrauchtes Token wirkt nie wieder", async () => {
    const userId = await makeUser("invitee3");
    const created = await inviteViaApi("adminA", emailOf("invitee3"), "learner");
    const token = tokenFromPath(created.body.invitePath);
    expect((await acceptViaApi("invitee3", token)).status).toBe(200);

    // Mitgliedschaft entfernen (wie company:remove-member) und denselben Link erneut versuchen
    await getDb().delete(organizationMemberships).where(eq(organizationMemberships.userId, userId));
    const again = await acceptViaApi("invitee3", token);
    expect(again.status).toBe(404);
  });

  it("annehmen: abgelaufene und widerrufene Einladungen sind ungültig", async () => {
    await makeUser("invitee4");
    await makeUser("invitee5");
    const expired = tokenFromPath((await inviteViaApi("adminA", emailOf("invitee4"))).body.invitePath);
    await getDb()
      .update(companyInvitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(companyInvitations.tokenHash, hashInvitationToken(expired)));
    expect(await getInvitationPreview(expired)).toBeNull();
    expect(await hasPendingInvitationForEmail(emailOf("invitee4"))).toBe(false);
    expect((await acceptViaApi("invitee4", expired)).status).toBe(404);

    const revoked = tokenFromPath((await inviteViaApi("adminA", emailOf("invitee5"))).body.invitePath);
    await getDb()
      .update(companyInvitations)
      .set({ revokedAt: new Date() })
      .where(eq(companyInvitations.tokenHash, hashInvitationToken(revoked)));
    expect((await acceptViaApi("invitee5", revoked)).status).toBe(404);
  });

  it("zufälliges oder fremdes Token: 404, kein Hinweis auf bestehende Einladungen", async () => {
    expect((await acceptViaApi("loner", randomUUID() + randomUUID())).status).toBe(404);
    expect(await getInvitationPreview("x".repeat(43))).toBeNull();
  });

  it("neue Einladung für dieselbe E-Mail macht den alten Link ungültig", async () => {
    const first = tokenFromPath((await inviteViaApi("adminA", emailOf("zweimal"))).body.invitePath);
    const second = tokenFromPath((await inviteViaApi("adminA", emailOf("zweimal"))).body.invitePath);
    expect(await getInvitationPreview(first)).toBeNull();
    expect(await getInvitationPreview(second)).not.toBeNull();
    const open = await getDb()
      .select()
      .from(companyInvitations)
      .where(and(eq(companyInvitations.email, emailOf("zweimal")), eq(companyInvitations.organizationId, orgA)));
    expect(open.filter((r) => !r.revokedAt && !r.acceptedAt)).toHaveLength(1);
  });

  it("E-Mail-Schreibweise: Einladung für Groß-/Kleinschreibung gemischt wird normalisiert", async () => {
    await makeUser("mixed");
    const created = await inviteViaApi("adminA", emailOf("mixed").toUpperCase());
    expect(created.status).toBe(201);
    expect(created.body.invitation.email).toBe(emailOf("mixed"));
    expect((await acceptViaApi("mixed", tokenFromPath(created.body.invitePath))).status).toBe(200);
  });

  it("bereits Mitglied dieser Organisation: 409 beim Einladen", async () => {
    const res = await inviteViaApi("adminA", emailOf("mentorA"), "learner");
    expect(res.status).toBe(409);
  });

  it("Mitglied einer ANDEREN Organisation: Einladen klappt (kein Leak), Annehmen scheitert und verbraucht nichts", async () => {
    const created = await inviteViaApi("adminA", emailOf("adminB"), "learner");
    expect(created.status).toBe(201);
    const token = tokenFromPath(created.body.invitePath);
    const res = await acceptViaApi("adminB", token);
    expect(res.status).toBe(409);
    expect(await getInvitationPreview(token)).not.toBeNull(); // nicht verbraucht
  });

  it("parallele Annahmen: genau eine gewinnt, genau eine Mitgliedschaft entsteht", async () => {
    const userId = await makeUser("race");
    const token = tokenFromPath((await inviteViaApi("adminA", emailOf("race"))).body.invitePath);
    const attempts = await Promise.all(
      Array.from({ length: 6 }, () => acceptInvitation({ userId, userEmail: emailOf("race"), token })),
    );
    expect(attempts.filter((a) => a.ok)).toHaveLength(1);
    const members = await getDb().select().from(organizationMemberships).where(eq(organizationMemberships.userId, userId));
    expect(members).toHaveLength(1);
  });

  it("Registrierung: nur mit offener Einladung erlaubt, sonst 403 (Allowlist leer)", async () => {
    const prev = process.env.REGISTRATION_ALLOWED_EMAILS;
    process.env.REGISTRATION_ALLOWED_EMAILS = "";
    try {
      const register = async (email: string) => {
        const res = await registerRoute(
          new Request("http://x/api/register", {
            ...json({ email, password: "Password-123" }),
            headers: { "content-type": "application/json", "cf-connecting-ip": `10.7.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` },
          }),
        );
        return res.status;
      };

      const email = emailOf("newcomer");
      expect(await register(email)).toBe(403); // ohne Einladung

      const created = await inviteViaApi("adminA", email, "learner");
      expect(await register(emailOf("someone-else"))).toBe(403); // andere Adresse bleibt gesperrt
      expect(await register(email)).toBe(201); // mit Einladung

      // nach dem Widerruf wieder gesperrt
      const email2 = emailOf("newcomer2");
      await inviteViaApi("adminA", email2, "learner");
      await getDb().update(companyInvitations).set({ revokedAt: new Date() }).where(eq(companyInvitations.email, email2));
      expect(await register(email2)).toBe(403);
      expect(created.status).toBe(201);
    } finally {
      if (prev === undefined) delete process.env.REGISTRATION_ALLOWED_EMAILS;
      else process.env.REGISTRATION_ALLOWED_EMAILS = prev;
    }
  });
});
