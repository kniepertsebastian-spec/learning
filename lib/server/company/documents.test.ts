/**
 * Tests für Firmendokumente (Upload, Secret-Scanner, Mandantentrennung) gegen eine ECHTE Postgres-Datenbank.
 * Wie company-access.test.ts nur mit TEST_DATABASE_URL, sonst übersprungen.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));

import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  auditEvents,
  companyDocumentFiles,
  companyDocuments,
  organizationMemberships,
  organizations,
  users,
  type CompanyRole,
} from "@/lib/server/db/schema";
import { GET as listRoute, POST as uploadRoute } from "@/app/api/company/documents/route";
import { DELETE as deleteRoute } from "@/app/api/company/documents/[id]/route";
import { GET as downloadRoute } from "@/app/api/company/documents/[id]/download/route";
import { makePdf } from "@/lib/server/documents/pdf-fixture";
import { DOCUMENT_LIST_FIELDS } from "./documents";

const run = TEST_DB ? describe : describe.skip;
const j = (...p: string[]) => p.join("");
const signInAs = (userId: string | null) => authMock.mockResolvedValue(userId ? { user: { id: userId } } : null);
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

function uploadReq(file: { name: string; type: string; data: Buffer }, extra: Record<string, string> = {}) {
  const form = new FormData();
  form.set("file", new File([new Uint8Array(file.data)], file.name, { type: file.type }));
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  return new Request("http://localhost/api/company/documents", { method: "POST", body: form });
}
const txt = (name: string, body: string) => ({ name, type: "text/plain", data: Buffer.from(body, "utf8") });

run("Firmendokumente (echte DB)", () => {
  const tag = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};
  let orgA = "";
  let orgB = "";

  async function makeUser(key: string) {
    const [u] = await getDb().insert(users).values({ email: `${key}-${tag}@test.example`, passwordHash: "x", name: key }).returning({ id: users.id });
    ids[key] = u.id;
  }
  const addMember = (orgId: string, key: string, role: CompanyRole) =>
    getDb().insert(organizationMemberships).values({ organizationId: orgId, userId: ids[key], role });
  async function upload(asKey: string, file: { name: string; type: string; data: Buffer }, extra: Record<string, string> = {}) {
    signInAs(ids[asKey]);
    return uploadRoute(uploadReq(file, extra));
  }
  const docsOf = (orgId: string) => getDb().select().from(companyDocuments).where(eq(companyDocuments.organizationId, orgId));

  beforeAll(async () => {
    const db = getDb();
    orgA = (await db.insert(organizations).values({ name: `DokA ${tag}` }).returning())[0].id;
    orgB = (await db.insert(organizations).values({ name: `DokB ${tag}` }).returning())[0].id;
    for (const k of ["adminA", "mentorA", "learnerA", "adminB", "loner"]) await makeUser(k);
    await addMember(orgA, "adminA", "company_admin");
    await addMember(orgA, "mentorA", "mentor");
    await addMember(orgA, "learnerA", "learner");
    await addMember(orgB, "adminB", "company_admin");
  });
  afterAll(async () => {
    const db = getDb();
    await db.delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
    await db.delete(users).where(inArray(users.id, Object.values(ids)));
  });
  beforeEach(() => authMock.mockReset());

  it("Zugriff: ohne Anmeldung 401, Lernende und Nutzer ohne Organisation 403 (Liste und Upload)", async () => {
    signInAs(null);
    expect((await listRoute()).status).toBe(401);
    expect((await uploadRoute(uploadReq(txt("a.txt", "Text genug genug")))).status).toBe(401);
    for (const k of ["learnerA", "loner"]) {
      signInAs(ids[k]);
      expect((await listRoute()).status, k).toBe(403);
      expect((await uploadRoute(uploadReq(txt("a.txt", "Text genug genug")))).status, k).toBe(403);
    }
    expect(await docsOf(orgA)).toHaveLength(0);
  });

  let docA = "";
  it("Firmen-Admin und Mentor laden hoch; Titel, Größe, Seiten, Uploader und KI-Option werden gespeichert", async () => {
    const res = await upload("adminA", txt("Onboarding.txt", "Willkommen im Team.\nHier die Regeln."), { title: "Onboarding Neu", excludeFromAi: "true" });
    expect(res.status).toBe(201);
    docA = (await res.json()).document.id;
    const [row] = await docsOf(orgA);
    expect(row).toMatchObject({ title: "Onboarding Neu", originalFilename: "Onboarding.txt", mimeType: "text/plain", pageCount: 1, excludeFromAi: true, uploadedByUserId: ids.adminA, organizationId: orgA });
    expect(row.checksum).toMatch(/^[0-9a-f]{64}$/);

    const pdf = await upload("mentorA", { name: "Handbuch.pdf", type: "application/pdf", data: makePdf([["Seite eins mit genug Text."], ["Seite zwei mit genug Text."]]) });
    expect(pdf.status).toBe(201);
    expect((await docsOf(orgA)).find((d) => d.originalFilename === "Handbuch.pdf")).toMatchObject({ pageCount: 2, excludeFromAi: false, title: "Handbuch" });
  });

  it("dieselbe Datei in derselben Firma wird nicht doppelt gespeichert, in einer anderen Firma schon", async () => {
    const before = (await docsOf(orgA)).length;
    const again = await upload("mentorA", txt("Anders-benannt.txt", "Willkommen im Team.\nHier die Regeln."));
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ alreadyExisted: true, document: { id: docA } });
    expect((await docsOf(orgA)).length).toBe(before);
    const other = await upload("adminB", txt("Onboarding.txt", "Willkommen im Team.\nHier die Regeln."));
    expect(other.status).toBe(201);
    expect(await docsOf(orgB)).toHaveLength(1);
  });

  it("Zugangsdaten im Dokument: 422 mit Art, Seite und Zeile, nichts gespeichert, Audit ohne Wert", async () => {
    const before = (await getDb().select().from(companyDocuments)).length;
    const secret = "Sommer2024!";
    const cases: [string, { name: string; type: string; data: Buffer }, string][] = [
      ["Schlüssel (Text)", txt("k.txt", `Anleitung\n${j("-----BEGIN RSA ", "PRIVATE KEY-----")}\nabc`), "private_key"],
      ["Passwort (Text)", txt("p.txt", `Zugang\nPasswort: ${secret}`), "password_assignment"],
      ["Token (PDF)", { name: "t.pdf", type: "application/pdf", data: makePdf([["Harmlose Seite genug Text."], [`token ${j("gh", "p_", "a".repeat(36))}`]]) }, "github_token"],
    ];
    for (const [name, file, kind] of cases) {
      const res = await upload("adminA", file);
      expect(res.status, name).toBe(422);
      const body = await res.json();
      expect(body.code).toBe("secrets_found");
      expect(body.findings[0]).toMatchObject({ kind });
      expect(JSON.stringify(body), name).not.toContain(secret);
    }
    // PDF-Fund meldet die richtige Seite
    const pdfBody = await (await upload("adminA", cases[2][1])).json();
    expect(pdfBody.findings[0]).toMatchObject({ pageNumber: 2 });
    expect((await getDb().select().from(companyDocuments)).length).toBe(before);
    expect((await getDb().select().from(companyDocumentFiles)).length).toBe(before);

    const events = await getDb().select().from(auditEvents).where(eq(auditEvents.actorUserId, ids.adminA));
    const rejected = events.filter((e) => e.action === "document.rejected");
    expect(rejected.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(rejected.map((e) => e.metadata))).not.toContain(secret);
    expect(rejected[0].metadata).toMatchObject({ reason: "secrets_found" });
  });

  it("andere Ablehnungen: falscher Typ, kein Text, ohne Datei, zu großer Upload", async () => {
    expect((await upload("adminA", { name: "x.exe", type: "application/octet-stream", data: Buffer.from("MZ....") })).status).toBe(400);
    expect((await upload("adminA", { name: "scan.pdf", type: "application/pdf", data: makePdf([[""]]) })).status).toBe(400);
    signInAs(ids.adminA);
    expect((await uploadRoute(new Request("http://localhost/api", { method: "POST", body: new FormData() }))).status).toBe(400);
    const big = new Request("http://localhost/api", { method: "POST", headers: { "content-length": String(50 * 1024 * 1024) }, body: new FormData() });
    expect((await uploadRoute(big)).status).toBe(413);
  });

  it("Liste: nur eigene Dokumente, nur freigegebene Felder, nie Inhalt", async () => {
    signInAs(ids.adminA);
    const a = await (await listRoute()).json();
    expect(a.documents.length).toBe(2);
    for (const d of a.documents) expect(Object.keys(d).sort()).toEqual([...DOCUMENT_LIST_FIELDS].sort());
    expect(JSON.stringify(a)).not.toContain("Willkommen im Team");
    expect(a.documents.find((d: { id: string }) => d.id === docA).uploadedByName).toBe("adminA");
    signInAs(ids.adminB);
    const b = await (await listRoute()).json();
    expect(b.documents).toHaveLength(1);
    expect(b.documents[0].id).not.toBe(docA);
  });

  it("Download: Original mit sicheren Headern; fremde Firma 404; Lernende 403", async () => {
    signInAs(ids.mentorA);
    const res = await downloadRoute(new Request("http://localhost"), ctx(docA));
    expect(res.status).toBe(200);
    expect(Buffer.from(await res.arrayBuffer()).toString("utf8")).toBe("Willkommen im Team.\nHier die Regeln.");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="Onboarding.txt"/);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(res.headers.get("cache-control")).toBe("no-store");
    signInAs(ids.adminB);
    expect((await downloadRoute(new Request("http://localhost"), ctx(docA))).status).toBe(404);
    signInAs(ids.learnerA);
    expect((await downloadRoute(new Request("http://localhost"), ctx(docA))).status).toBe(403);
    signInAs(ids.adminA);
    expect((await downloadRoute(new Request("http://localhost"), ctx("kein-uuid"))).status).toBe(404);
  });

  it("Löschen: fremde Firma 404 (Dokument bleibt), Lernende 403, eigene Firma löscht samt Dateiinhalt", async () => {
    signInAs(ids.adminB);
    expect((await deleteRoute(new Request("http://localhost"), ctx(docA))).status).toBe(404);
    signInAs(ids.learnerA);
    expect((await deleteRoute(new Request("http://localhost"), ctx(docA))).status).toBe(403);
    expect(await getDb().select().from(companyDocuments).where(eq(companyDocuments.id, docA))).toHaveLength(1);

    signInAs(ids.mentorA);
    expect((await deleteRoute(new Request("http://localhost"), ctx(docA))).status).toBe(204);
    expect(await getDb().select().from(companyDocuments).where(eq(companyDocuments.id, docA))).toHaveLength(0);
    expect(await getDb().select().from(companyDocumentFiles).where(eq(companyDocumentFiles.documentId, docA))).toHaveLength(0);
    expect((await deleteRoute(new Request("http://localhost"), ctx(docA))).status).toBe(404);
    const events = await getDb().select().from(auditEvents).where(inArray(auditEvents.actorUserId, [ids.adminA, ids.mentorA]));
    expect(events.map((e) => e.action)).toEqual(expect.arrayContaining(["document.uploaded", "document.deleted", "document.rejected"]));
  });

  it("Löschen der Organisation oder des Uploaders: Organisation nimmt alles mit, Dokument überlebt den Uploader", async () => {
    const up = await upload("mentorA", txt("Bleibt.txt", "Dieses Dokument gehört der Firma."));
    const id = (await up.json()).document.id;
    await getDb().delete(users).where(eq(users.id, ids.mentorA));
    const [row] = await getDb().select().from(companyDocuments).where(eq(companyDocuments.id, id));
    expect(row.uploadedByUserId).toBeNull();
    await getDb().delete(organizations).where(eq(organizations.id, orgB));
    expect(await docsOf(orgB)).toHaveLength(0);
    expect(await getDb().select().from(companyDocumentFiles).where(eq(companyDocumentFiles.documentId, id))).toHaveLength(1);
  });
});
