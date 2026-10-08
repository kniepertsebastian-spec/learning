/**
 * Merkzettel nachträglich erzeugen (echte Postgres, nur mit TEST_DATABASE_URL; die KI ist durch eine Funktion ersetzt):
 * nur fehlende, Scanner, Fehler je Lektion, Abbruch bei kaputtem Zugang, ein Lauf je Lernpfad, Mandantentrennung, Rechte.
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
  cheatSheetRuns, certifications, domains, lessons, objectives, organizationMemberships, organizations, sections, users,
  type CompanyRole,
} from "@/lib/server/db/schema";
import { GET as statusGet, POST as startPost } from "@/app/api/internal-courses/[certId]/cheat-sheets/route";
import {
  backfillLessons, listCheatSheetStatus, NothingToDoError, NotOwnedError, RunAlreadyActiveError, startCheatSheetBackfill, STALE_RUN_MS,
  type CheatSheetGenerator,
} from "./cheat-sheets";

const run = TEST_DB ? describe : describe.skip;
const j = (...p: string[]) => p.join("");
const sheetOf = (title: string) => ({ de: `- Merke: ${title}`, en: `- Note: ${title}` });
const ctx = (certId: string) => ({ params: Promise.resolve({ certId }) }) as never;
const req = () => new Request("http://localhost/api", { method: "POST" });

run("Merkzettel nachträglich erzeugen (echte DB, KI ersetzt)", () => {
  const tag = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};
  const certs: string[] = [];
  let orgA = "";
  let orgB = "";

  async function mkUser(key: string) {
    const [u] = await getDb().insert(users).values({ email: `${key}-${tag}@test.example`, passwordHash: "x", name: key }).returning({ id: users.id });
    ids[key] = u.id;
  }
  const member = (org: string, key: string, role: CompanyRole) => getDb().insert(organizationMemberships).values({ organizationId: org, userId: ids[key], role });
  /** Lernpfad mit n Lektionen; `withSheet` = so viele (von vorn) haben schon einen Merkzettel. */
  async function mkCourse(key: string, n: number, withSheet: number, owner: string | null) {
    const d = getDb();
    const [c] = await d.insert(certifications).values({ slug: `cs-${key}-${tag}`, name: `CS ${key}`, provider: "T", examName: "T", examVersion: "1", ...(owner ? { kind: "internal" as const, ownerOrganizationId: owner } : {}) }).returning({ id: certifications.id });
    certs.push(c.id);
    const [dom] = await d.insert(domains).values({ certificationId: c.id, orderNum: 1, name: "D" }).returning();
    const [obj] = await d.insert(objectives).values({ domainId: dom.id, code: `O-${key}-${tag}`, title: "O" }).returning();
    for (let i = 1; i <= n; i++) {
      const [s] = await d.insert(sections).values({ objectiveId: obj.id, orderNum: i, title: { de: `L${i}`, en: `L${i}` } }).returning();
      await d.insert(lessons).values({ sectionId: s.id, content: { de: `Inhalt ${i}`, en: `Content ${i}` }, cheatSheet: i <= withSheet ? { de: `ALT ${i}`, en: `OLD ${i}` } : null });
    }
    return c.id;
  }
  const sheets = async (certId: string) =>
    (await getDb().select({ order: sections.orderNum, sheet: lessons.cheatSheet }).from(lessons).innerJoin(sections, eq(sections.id, lessons.sectionId)).innerJoin(objectives, eq(objectives.id, sections.objectiveId)).innerJoin(domains, eq(domains.id, objectives.domainId)).where(eq(domains.certificationId, certId)).orderBy(sections.orderNum));
  const ok: CheatSheetGenerator = async (l) => sheetOf(l.title.de);

  beforeAll(async () => {
    const d = getDb();
    orgA = (await d.insert(organizations).values({ name: `CsA ${tag}` }).returning())[0].id;
    orgB = (await d.insert(organizations).values({ name: `CsB ${tag}` }).returning())[0].id;
    for (const k of ["mentorA", "learnerA", "mentorB"]) await mkUser(k);
    await member(orgA, "mentorA", "mentor");
    await member(orgA, "learnerA", "learner");
    await member(orgB, "mentorB", "mentor");
  });
  afterAll(async () => {
    await getDb().delete(organizations).where(inArray(organizations.id, [orgA, orgB]));
    await getDb().delete(certifications).where(inArray(certifications.id, certs));
    await getDb().delete(users).where(inArray(users.id, Object.values(ids)));
  });
  beforeEach(() => authMock.mockReset());

  it("erzeugt nur fehlende Merkzettel, vorhandene bleiben unverändert (auch bei allgemeinen Lernpfaden)", async () => {
    const certId = await mkCourse("general", 4, 1, null);
    const result = await backfillLessons(certId, ok);
    expect(result).toMatchObject({ created: 3, skipped: 0, failed: 0, aborted: false });
    const rows = await sheets(certId);
    expect(rows[0].sheet).toEqual({ de: "ALT 1", en: "OLD 1" });
    expect(rows[1].sheet).toEqual(sheetOf("L2"));
    expect(rows.every((r) => r.sheet)).toBe(true);
    expect(await backfillLessons(certId, ok)).toMatchObject({ created: 0 }); // nichts mehr zu tun
  });

  it("Zugangsdaten im Merkzettel: verworfen und gezählt, die anderen Lektionen laufen weiter; Fehler je Lektion zählen nur diese", async () => {
    const certId = await mkCourse("mixed", 5, 0, null);
    const generate: CheatSheetGenerator = async (l) => {
      if (l.title.de === "L2") return { de: j("Zugang:\n-----BEGIN ", "PRIVATE KEY-----\nabc"), en: "access" };
      if (l.title.de === "L3") throw new Error("boom");
      if (l.title.de === "L4") return undefined;
      return sheetOf(l.title.de);
    };
    const result = await backfillLessons(certId, generate);
    expect(result).toMatchObject({ created: 2, skipped: 1, failed: 2, aborted: false });
    const rows = await sheets(certId);
    expect(rows.map((r) => (r.sheet ? 1 : 0))).toEqual([1, 0, 0, 0, 1]);
    expect(JSON.stringify(rows)).not.toContain("PRIVATE KEY");
  });

  it("schlagen alle ersten Aufrufe fehl (kaputter Zugang), bricht der Lauf ab statt weiter Anfragen zu schicken", async () => {
    const certId = await mkCourse("broken", 9, 0, null);
    let calls = 0;
    const result = await backfillLessons(certId, async () => {
      calls++;
      throw new Error("API key invalid");
    });
    expect(result).toMatchObject({ created: 0, aborted: true });
    expect(calls).toBeLessThanOrEqual(3);
  });

  it("Lauf der Firma: Fortschritt am Lauf, Ergebnis, Statuslisten nur der eigenen Firma", async () => {
    const certA = await mkCourse("ownA", 4, 1, orgA);
    const certB = await mkCourse("ownB", 2, 0, orgB);
    const before = (await listCheatSheetStatus(orgA)).find((s) => s.certificationId === certA)!;
    expect(before).toMatchObject({ lessons: 4, withCheatSheet: 1, run: null });
    const started = await startCheatSheetBackfill({ organizationId: orgA, userId: ids.mentorA, certificationId: certA }, { generate: ok, wait: true });
    expect(started.total).toBe(3);
    const after = (await listCheatSheetStatus(orgA)).find((s) => s.certificationId === certA)!;
    expect(after).toMatchObject({ lessons: 4, withCheatSheet: 4, run: { status: "done", total: 3, created: 3, skipped: 0, failed: 0 } });
    expect((await listCheatSheetStatus(orgA)).some((s) => s.certificationId === certB)).toBe(false);
    // alles vorhanden: nichts zu tun
    await expect(startCheatSheetBackfill({ organizationId: orgA, userId: ids.mentorA, certificationId: certA }, { generate: ok, wait: true })).rejects.toBeInstanceOf(NothingToDoError);
  });

  it("fremde Firma und allgemeine Lernpfade: nicht auffindbar", async () => {
    const own = await mkCourse("ownerCheck", 2, 0, orgA);
    const general = await mkCourse("general2", 2, 0, null);
    await expect(startCheatSheetBackfill({ organizationId: orgB, userId: ids.mentorB, certificationId: own }, { generate: ok, wait: true })).rejects.toBeInstanceOf(NotOwnedError);
    await expect(startCheatSheetBackfill({ organizationId: orgA, userId: ids.mentorA, certificationId: general }, { generate: ok, wait: true })).rejects.toBeInstanceOf(NotOwnedError);
    expect((await sheets(own)).every((r) => r.sheet === null)).toBe(true);
    expect((await sheets(general)).every((r) => r.sheet === null)).toBe(true);
  });

  it("höchstens ein laufender Lauf je Lernpfad, auch bei gleichzeitigem Start; ein abgebrochener Lauf (Neustart) blockiert nicht für immer", async () => {
    const certId = await mkCourse("parallel", 3, 0, orgA);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: CheatSheetGenerator = async (l) => {
      await gate;
      return sheetOf(l.title.de);
    };
    const [first, second] = await Promise.allSettled([
      startCheatSheetBackfill({ organizationId: orgA, userId: ids.mentorA, certificationId: certId }, { generate: slow }),
      startCheatSheetBackfill({ organizationId: orgA, userId: ids.mentorA, certificationId: certId }, { generate: slow }),
    ]);
    const outcomes = [first, second].map((x) => x.status);
    expect(outcomes.sort()).toEqual(["fulfilled", "rejected"]);
    const rejected = [first, second].find((x) => x.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(RunAlreadyActiveError);
    // während des Laufs sichtbar „läuft“
    expect((await listCheatSheetStatus(orgA)).find((s) => s.certificationId === certId)!.run?.status).toBe("running");
    release();
    await vi.waitFor(async () => {
      expect((await listCheatSheetStatus(orgA)).find((s) => s.certificationId === certId)!.run?.status).toBe("done");
    });

    // „hängender“ Lauf: gilt nach STALE_RUN_MS als abgebrochen, ein neuer Start ist wieder möglich
    const certStale = await mkCourse("stale", 2, 0, orgA);
    await getDb().insert(cheatSheetRuns).values({ organizationId: orgA, certificationId: certStale, total: 2, startedAt: new Date(Date.now() - STALE_RUN_MS - 60_000) });
    // Der Start selbst räumt auf (ohne dass vorher jemand die Liste ansieht)
    await expect(startCheatSheetBackfill({ organizationId: orgA, userId: ids.mentorA, certificationId: certStale }, { generate: ok, wait: true })).resolves.toMatchObject({ total: 2 });
    // Und die Liste zeigt einen hängenden Lauf als abgebrochen
    const certStale2 = await mkCourse("stale2", 2, 0, orgA);
    await getDb().insert(cheatSheetRuns).values({ organizationId: orgA, certificationId: certStale2, total: 2, startedAt: new Date(Date.now() - STALE_RUN_MS - 60_000) });
    const view = (await listCheatSheetStatus(orgA)).find((s) => s.certificationId === certStale2)!;
    expect(view.run).toMatchObject({ status: "failed" });
    expect(view.run?.message).toMatch(/nicht beendet/);
  });

  it("ein Merkzettel, der während des Laufs anderweitig entstanden ist, wird nicht überschrieben", async () => {
    const certId = await mkCourse("race", 2, 0, null);
    const racing: CheatSheetGenerator = async (l) => {
      if (l.title.de === "L1") {
        await getDb().update(lessons).set({ cheatSheet: { de: "VON HAND", en: "BY HAND" } }).where(eq(lessons.id, l.id));
      }
      return sheetOf(l.title.de);
    };
    const result = await backfillLessons(certId, racing);
    expect(result).toMatchObject({ created: 1 });
    expect((await sheets(certId))[0].sheet).toEqual({ de: "VON HAND", en: "BY HAND" });
  });

  it("alle Aufrufe schlagen fehl: Lauf endet als „fehlgeschlagen“ mit Hinweis auf den KI-Zugang", async () => {
    const certId = await mkCourse("allfail", 6, 0, orgA);
    await startCheatSheetBackfill({ organizationId: orgA, userId: ids.mentorA, certificationId: certId }, { generate: async () => { throw new Error("x"); }, wait: true });
    const view = (await listCheatSheetStatus(orgA)).find((s) => s.certificationId === certId)!;
    expect(view.run).toMatchObject({ status: "failed", created: 0 });
    expect(view.run?.message).toMatch(/KI-Zugang/);
    expect(view.withCheatSheet).toBe(0);
  });

  it("Routen: Lernende 403, andere Firma 404, ohne KI-Zugang der Firma 409 (und nichts wird erzeugt)", async () => {
    const certId = await mkCourse("route", 2, 0, orgA);
    authMock.mockResolvedValue({ user: { id: ids.learnerA } });
    expect((await startPost(req() as never, ctx(certId))).status).toBe(403);
    expect((await statusGet(req() as never, ctx(certId))).status).toBe(403);
    authMock.mockResolvedValue({ user: { id: ids.mentorB } });
    expect((await startPost(req() as never, ctx(certId))).status).toBe(404);
    expect((await statusGet(req() as never, ctx(certId))).status).toBe(404);
    authMock.mockResolvedValue({ user: { id: ids.mentorA } });
    expect((await startPost(req() as never, ctx("kein-uuid"))).status).toBe(404);
    const noAi = await startPost(req() as never, ctx(certId));
    expect(noAi.status).toBe(409);
    expect((await noAi.json()).error).toMatch(/KI-Zugang/);
    const status = await (await statusGet(req() as never, ctx(certId))).json();
    expect(status).toMatchObject({ lessons: 2, withCheatSheet: 0, run: null });
    expect(JSON.stringify(status)).not.toContain("Inhalt");
  });
});
