/** Katalog-Kursgruppen (UI U7), echte DB nur mit TEST_DATABASE_URL. */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { auditEvents, certifications, courseCategories, organizations, users } from "@/lib/server/db/schema";
import { PUT as assignPut } from "@/app/api/admin/certifications/[certId]/category/route";
import { GET as listGet, POST as createPost } from "@/app/api/admin/course-categories/route";
import { PATCH as renamePatch } from "@/app/api/admin/course-categories/[id]/route";
import { assignCategory, CategoryError, CategoryNotFoundError, createCategory, listCategories, renameCategory, reorderCategories, slugifyName } from "./categories";

const run = TEST_DB ? describe : describe.skip;
const tag = randomUUID().slice(0, 8);
const json = (body: unknown) => new Request("http://localhost/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const ctx = (p: Record<string, string>) => ({ params: Promise.resolve(p) }) as never;

describe("slugifyName", () => {
  it("macht saubere Slugs", () => {
    expect(slugifyName("Infrastructure & Networking")).toBe("infrastructure-und-networking");
    expect(slugifyName("???")).toBe("gruppe");
  });
});

run("Kursgruppen (echte DB)", () => {
  const ids: Record<string, string> = {};
  const certIds: string[] = [];
  const catIds: string[] = [];

  beforeAll(async () => {
    const d = getDb();
    const mk = async (key: string, role: "admin" | "learner") => {
      const [u] = await d.insert(users).values({ email: `${key}-${tag}@test.example`, passwordHash: "x", name: key, role }).returning({ id: users.id });
      ids[key] = u.id;
    };
    await mk("admin", "admin");
    await mk("learner", "learner");
    const [org] = await d.insert(organizations).values({ name: `Org ${tag}` }).returning({ id: organizations.id });
    ids.org = org.id;
    const [gen] = await d.insert(certifications).values({ slug: `cat-gen-${tag}`, name: "Gen", provider: "T", examName: "T", examVersion: "1" }).returning({ id: certifications.id });
    const [internal] = await d.insert(certifications).values({ slug: `cat-int-${tag}`, name: "Int", provider: "T", examName: "T", examVersion: "1", kind: "internal", ownerOrganizationId: org.id }).returning({ id: certifications.id });
    ids.gen = gen.id;
    ids.internal = internal.id;
    certIds.push(gen.id, internal.id);
  });
  afterAll(async () => {
    const d = getDb();
    await d.delete(certifications).where(inArray(certifications.id, certIds));
    if (catIds.length) await d.delete(courseCategories).where(inArray(courseCategories.id, catIds));
    await d.delete(organizations).where(eq(organizations.id, ids.org));
    await d.delete(users).where(inArray(users.id, [ids.admin, ids.learner]));
  });

  it("die fünf Startgruppen sind angelegt", async () => {
    const slugs = (await listCategories()).map((c) => c.slug);
    for (const s of ["infrastruktur-netzwerk", "plattform-kubernetes", "observability", "security", "cloud"]) expect(slugs).toContain(s);
  });

  it("anlegen, umbenennen, zuordnen, zurücksetzen – alles auditiert", async () => {
    const cat = await createCategory({ name: { de: `Neu ${tag}`, en: `New ${tag}` }, color: "mint", actorUserId: ids.admin });
    catIds.push(cat.id);
    await renameCategory({ id: cat.id, name: { de: `Neu2 ${tag}`, en: `New2 ${tag}` }, actorUserId: ids.admin });
    const { previous } = await assignCategory({ certificationId: ids.gen, categoryId: cat.id, actorUserId: ids.admin });
    expect(previous).toBeNull();
    const [c] = await getDb().select({ categoryId: certifications.categoryId }).from(certifications).where(eq(certifications.id, ids.gen));
    expect(c.categoryId).toBe(cat.id);
    const back = await assignCategory({ certificationId: ids.gen, categoryId: previous, actorUserId: ids.admin });
    expect(back.previous).toBe(cat.id);
    const actions = (await getDb().select({ a: auditEvents.action }).from(auditEvents).where(and(eq(auditEvents.actorUserId, ids.admin)))).map((r) => r.a);
    expect(actions).toEqual(expect.arrayContaining(["course_category.create", "course_category.rename", "course_category.assign"]));
  });

  it("interne Firmenlernpfade lassen sich nicht zuordnen, unbekannte Gruppen auch nicht", async () => {
    await expect(assignCategory({ certificationId: ids.internal, categoryId: null, actorUserId: ids.admin })).rejects.toBeInstanceOf(CategoryNotFoundError);
    await expect(assignCategory({ certificationId: ids.gen, categoryId: randomUUID(), actorUserId: ids.admin })).rejects.toBeInstanceOf(CategoryNotFoundError);
  });

  it("Reihenfolge muss alle Gruppen genau einmal enthalten", async () => {
    const all = await listCategories();
    await expect(reorderCategories({ ids: all.slice(1).map((c) => c.id), actorUserId: ids.admin })).rejects.toBeInstanceOf(CategoryError);
    const reversed = [...all].reverse().map((c) => c.id);
    await reorderCategories({ ids: reversed, actorUserId: ids.admin });
    expect((await listCategories()).map((c) => c.id)).toEqual(reversed);
    await reorderCategories({ ids: all.map((c) => c.id), actorUserId: ids.admin });
  });

  it("Namen brauchen Deutsch und Englisch", async () => {
    await expect(createCategory({ name: { de: "", en: "X" }, color: "info", actorUserId: ids.admin })).rejects.toBeInstanceOf(CategoryError);
  });

  it("API: nur Betreiber; Lernende bekommen 403", async () => {
    authMock.mockResolvedValue({ user: { id: ids.learner } });
    expect((await listGet()).status).toBe(403);
    expect((await createPost(json({ name: { de: "a", en: "a" }, color: "info" }))).status).toBe(403);
    expect((await assignPut(json({ categoryId: null }), ctx({ certId: ids.gen }))).status).toBe(403);
    authMock.mockResolvedValue({ user: { id: ids.admin } });
    expect((await listGet()).status).toBe(200);
    const created = await createPost(json({ name: { de: `Api ${tag}`, en: `Api ${tag}` }, color: "violet" }));
    expect(created.status).toBe(201);
    const cat = (await created.json()) as { id: string };
    catIds.push(cat.id);
    expect((await renamePatch(json({ name: { de: "x", en: "y" } }), ctx({ id: cat.id }))).status).toBe(204);
    expect((await createPost(json({ name: { de: "a", en: "a" }, color: "pink" }))).status).toBe(400);
    const res = await assignPut(json({ categoryId: cat.id }), ctx({ certId: ids.gen }));
    expect(res.status).toBe(200);
    expect((await assignPut(json({ categoryId: null }), ctx({ certId: ids.internal }))).status).toBe(404);
  });
});
