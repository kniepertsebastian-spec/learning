/**
 * E-Mail-Benachrichtigungen zu Kundenanfragen gegen eine ECHTE Postgres-Datenbank und einen lokalen SMTP-Server
 * (nur mit TEST_DATABASE_URL): Betreiber bei neuer Anfrage, Firma bei jeder Statusänderung. Geprüft wird auch,
 * wer KEINE Mail bekommt (andere Firmen, Lernende, unbestätigte Konten) und dass ohne Versand alles weiterläuft.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));

import { inArray, like } from "drizzle-orm";
import type { ParsedMail } from "mailparser";
import { getDb } from "@/lib/server/db/client";
import { certifications, organizationMemberships, organizations, users, type CompanyRole } from "@/lib/server/db/schema";
import { POST as customerCreate } from "@/app/api/company/course-requests/route";
import { PATCH as adminStatus } from "@/app/api/admin/course-requests/[id]/route";
import { POST as adminRelease } from "@/app/api/admin/course-requests/[id]/release/route";
import { DELETE as revoke } from "@/app/api/admin/entitlements/route";
import { startSmtpSink, useSmtpSinkEnv, type SmtpSink } from "@/lib/server/mail/test-smtp";

const run = TEST_DB ? describe : describe.skip;
const signInAs = (id: string | null) => authMock.mockResolvedValue(id ? { user: { id } } : null);
const req = (method: string, body?: unknown) =>
  new Request("http://localhost/api", { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

run("Benachrichtigungen zu Anfragen (echte DB + SMTP-Testserver)", () => {
  const tag = randomUUID().slice(0, 8);
  const mail = (key: string) => `${key}-${tag}@test.example`;
  const ids: Record<string, string> = {};
  const certIds: string[] = [];
  let orgA = "";
  let orgB = "";
  let cloud = "";
  let sink: SmtpSink;
  let restoreEnv: () => void;

  const addressesOf = (m: ParsedMail) => {
    const to = m.to as { value: { address: string }[] } | { value: { address: string }[] }[] | undefined;
    return (Array.isArray(to) ? to : to ? [to] : []).flatMap((a) => a.value.map((v) => v.address));
  };
  const mailsTo = (email: string, subjectPart?: string) =>
    sink.messages.filter((m) => addressesOf(m).includes(email) && (!subjectPart || (m.subject ?? "").includes(subjectPart)));
  const waitMail = (email: string, subjectPart: string) => sink.waitFor((m) => addressesOf(m).includes(email) && (m.subject ?? "").includes(subjectPart));

  async function mkUser(key: string, extra: Partial<typeof users.$inferInsert> = {}) {
    const [u] = await getDb().insert(users).values({ email: mail(key), passwordHash: "x", name: key, emailVerifiedAt: new Date(), ...extra }).returning({ id: users.id });
    ids[key] = u.id;
  }
  const member = (org: string, key: string, role: CompanyRole) => getDb().insert(organizationMemberships).values({ organizationId: org, userId: ids[key], role });
  const ask = async (as: string, body: Record<string, unknown>) => {
    signInAs(ids[as]);
    const res = await customerCreate(req("POST", body));
    expect(res.status).toBe(201);
    return (await res.json()).id as string;
  };

  beforeAll(async () => {
    sink = await startSmtpSink();
    restoreEnv = useSmtpSinkEnv(sink.port);
    orgA = (await getDb().insert(organizations).values({ name: `NotifA ${tag}` }).returning())[0].id;
    orgB = (await getDb().insert(organizations).values({ name: `NotifB ${tag}` }).returning())[0].id;
    await mkUser("operator", { role: "admin" });
    await mkUser("operator2", { role: "admin" });
    await mkUser("operatorUnverified", { role: "admin", emailVerifiedAt: null });
    for (const k of ["adminA", "adminA2", "mentorA", "learnerA", "adminB"]) await mkUser(k);
    await member(orgA, "adminA", "company_admin");
    await member(orgA, "adminA2", "company_admin");
    await member(orgA, "mentorA", "mentor");
    await member(orgA, "learnerA", "learner");
    await member(orgB, "adminB", "company_admin");
    const [c] = await getDb().insert(certifications).values({ slug: `notif-${tag}`, name: `Cloud ${tag}`, provider: "T", examName: "T", examVersion: "1" }).returning({ id: certifications.id });
    cloud = c.id;
    certIds.push(c.id);
  });
  afterAll(async () => {
    restoreEnv();
    await sink.close();
    await getDb().delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
    await getDb().delete(certifications).where(inArray(certifications.id, certIds));
    await getDb().delete(users).where(like(users.email, `%-${tag}@test.example`));
  });
  beforeEach(() => authMock.mockReset());

  it("neue Anfrage: alle bestätigten Betreiber bekommen eine Mail mit Firma, Anfragendem, Titel und Link; sonst niemand", async () => {
    await ask("mentorA", { wishTitle: "Kubernetes für Einsteiger" });
    const m1 = await waitMail(mail("operator"), "Neue Anfrage");
    await waitMail(mail("operator2"), "Neue Anfrage");
    expect(m1.subject).toContain(`NotifA ${tag}`);
    expect(m1.text).toContain("Kubernetes für Einsteiger");
    expect(m1.text).toContain("mentorA");
    expect(m1.text).toContain("https://learning.example.test/admin/requests");
    await wait(300);
    expect(mailsTo(mail("operatorUnverified"))).toHaveLength(0);
    for (const k of ["adminA", "adminA2", "mentorA", "learnerA", "adminB"]) expect(mailsTo(mail(k)), k).toHaveLength(0);
  });

  let requestId = "";
  it("Stand setzen: Anfragender und Firmen-Admins bekommen die Mail (ohne Dubletten), Lernende und fremde Firmen nicht", async () => {
    requestId = await ask("mentorA", { certificationId: cloud });
    await sink.waitFor((m) => addressesOf(m).includes(mail("operator")) && (m.text ?? "").includes(`Cloud ${tag}`));
    signInAs(ids.operator);
    expect((await adminStatus(req("PATCH", { status: "in_creation", note: "Wird in KW 44 erstellt" }), ctx(requestId) as never)).status).toBe(204);
    for (const k of ["mentorA", "adminA", "adminA2"]) {
      const m = await waitMail(mail(k), "In Erstellung");
      expect(m.text, k).toContain("Wird in KW 44 erstellt");
      expect(m.text).toContain("https://learning.example.test/company");
    }
    await wait(300);
    for (const k of ["mentorA", "adminA", "adminA2"]) expect(mailsTo(mail(k), "In Erstellung"), k).toHaveLength(1);
    for (const k of ["learnerA", "adminB", "operator"]) expect(mailsTo(mail(k), "In Erstellung"), k).toHaveLength(0);
  });

  it("Freigabe und Ablehnung: Firma wird benachrichtigt", async () => {
    signInAs(ids.operator);
    expect((await adminRelease(req("POST", { note: "Viel Erfolg" }), ctx(requestId) as never)).status).toBe(200);
    const m = await waitMail(mail("adminA"), "Freigegeben");
    expect(m.text).toContain("Viel Erfolg");
    await waitMail(mail("mentorA"), "Freigegeben");

    const other = await ask("adminB", { wishTitle: "Etwas anderes" });
    signInAs(ids.operator);
    expect((await adminStatus(req("PATCH", { status: "rejected", note: "Aktuell nicht geplant" }), ctx(other) as never)).status).toBe(204);
    const rej = await waitMail(mail("adminB"), "Abgelehnt");
    expect(rej.text).toContain("Aktuell nicht geplant");
    await wait(300);
    expect(mailsTo(mail("adminA"), "Abgelehnt")).toHaveLength(0); // andere Firma
  });

  it("Freigabe entzogen: die Firma bekommt eine Mail mit dem Hinweis", async () => {
    signInAs(ids.operator);
    expect((await revoke(req("DELETE", { organizationId: orgA, certificationId: cloud, note: "Vertrag beendet" }))).status).toBe(200);
    const m = await waitMail(mail("adminA2"), "Freigabe entzogen");
    expect(m.text).toContain("Vertrag beendet");
    expect(m.subject).toContain(`Cloud ${tag}`);
    await wait(300);
    expect(mailsTo(mail("adminB"), "Freigabe entzogen")).toHaveLength(0);
    expect(mailsTo(mail("learnerA"), "Freigabe entzogen")).toHaveLength(0);
  });

  it("ohne eingerichteten Versand laufen alle Aktionen unverändert weiter", async () => {
    const saved = process.env.MAIL_SMTP_HOST;
    delete process.env.MAIL_SMTP_HOST;
    try {
      const before = sink.messages.length;
      const id = await ask("adminA", { wishTitle: "Ohne Versand" });
      signInAs(ids.operator);
      expect((await adminStatus(req("PATCH", { status: "on_hold" }), ctx(id) as never)).status).toBe(204);
      await wait(300);
      expect(sink.messages.length).toBe(before);
    } finally {
      process.env.MAIL_SMTP_HOST = saved;
    }
  });
});
