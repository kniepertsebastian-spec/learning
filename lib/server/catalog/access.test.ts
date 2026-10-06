/**
 * Sichtbarkeit in den Lern-APIs gegen eine ECHTE Postgres-Datenbank (nur mit TEST_DATABASE_URL).
 * Die IDs der APIs sind UUIDs und nicht geheim: Entwürfe und interne Lernpfade anderer Firmen
 * müssen auch hier „nicht vorhanden“ sein, nicht nur auf den Seiten.
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));

import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  domains,
  exams,
  lessons,
  objectives,
  organizationMemberships,
  organizations,
  questions,
  sections,
  studySessions,
  users,
} from "@/lib/server/db/schema";
import {
  isCertificationHidden,
  isExamHidden,
  isObjectiveHidden,
  isSectionHidden,
  isStudySessionHidden,
  resolveContentTarget,
} from "./access";
import { GET as progressGet } from "@/app/api/progress/[certId]/route";
import { GET as profileGet } from "@/app/api/study-profile/[certId]/route";
import { GET as offlineGet } from "@/app/api/cert/[certId]/offline-package/route";
import { POST as sectionAttempt } from "@/app/api/sections/[id]/attempt/route";
import { GET as remediationGet } from "@/app/api/remediation/[objectiveId]/route";
import { POST as startSession } from "@/app/api/study-sessions/start/route";
import { POST as reportRoute } from "@/app/api/content-reports/route";

const run = TEST_DB ? describe : describe.skip;

type Target = { cert: string; objective: string; section: string; lesson: string; question: string; exam: string; session: string };

run("Lern-APIs prüfen die Sichtbarkeit (echte DB)", () => {
  const tag = randomUUID().slice(0, 8);
  const db = () => getDb();
  const t: Record<"allgemein" | "entwurf" | "internA", Target> = {} as never;
  const orgIds: string[] = [];
  const certIds: string[] = [];
  const userIds: string[] = [];
  const u: Record<string, string> = {};

  const as = (key: string | null) => authMock.mockResolvedValue(key ? { user: { id: u[key] } } : null);
  const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) });
  const post = (body: unknown) => new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const asNext = (r: Request) => r as any;

  beforeAll(async () => {
    const d = db();
    const [orgA] = await d.insert(organizations).values({ name: `Acc A ${tag}` }).returning();
    const [orgB] = await d.insert(organizations).values({ name: `Acc B ${tag}` }).returning();
    orgIds.push(orgA.id, orgB.id);

    const mk = async (key: keyof typeof t, extra: Partial<typeof certifications.$inferInsert>) => {
      const [c] = await d.insert(certifications).values({ slug: `acc-${key}-${tag}`, name: key, provider: "T", examName: "T", examVersion: "1", ...extra }).returning();
      certIds.push(c.id);
      const [dom] = await d.insert(domains).values({ certificationId: c.id, orderNum: 1, name: "D" }).returning();
      const [obj] = await d.insert(objectives).values({ domainId: dom.id, code: `O-${key}-${tag}`, title: "O" }).returning();
      const [sec] = await d.insert(sections).values({ objectiveId: obj.id, orderNum: 1, title: { de: "S", en: "S" } }).returning();
      const [les] = await d.insert(lessons).values({ sectionId: sec.id, content: { de: "x", en: "x" } }).returning();
      const [q] = await d.insert(questions).values({ humanId: `Q-${key}-${tag}`, objectiveId: obj.id, difficulty: "easy", type: "single", question: { de: "?", en: "?" }, explanation: { de: "!", en: "!" } }).returning();
      const [ex] = await d.insert(exams).values({ certificationId: c.id, blueprint: {} }).returning();
      t[key] = { cert: c.id, objective: obj.id, section: sec.id, lesson: les.id, question: q.id, exam: ex.id, session: "" };
    };
    await mk("allgemein", {});
    await mk("entwurf", { catalogStatus: "draft" });
    await mk("internA", { kind: "internal", ownerOrganizationId: orgA.id });

    const mkUser = async (key: string, role: "learner" | "admin", org?: string) => {
      const [x] = await d.insert(users).values({ email: `${key}-${tag}@test.example`, passwordHash: "x", role }).returning({ id: users.id });
      u[key] = x.id;
      userIds.push(x.id);
      if (org) await d.insert(organizationMemberships).values({ organizationId: org, userId: x.id, role: "learner" });
    };
    await mkUser("memberA", "learner", orgA.id);
    await mkUser("memberB", "learner", orgB.id);
    await mkUser("solo", "learner");
    await mkUser("operator", "admin");

    // Lernsitzungen von „solo“ auf dem Entwurf und auf dem fremden internen Lernpfad (Altbestand).
    for (const key of ["entwurf", "internA"] as const) {
      const [s] = await d.insert(studySessions).values({ userId: u.solo, certificationId: t[key].cert, goalType: "questions", goalValue: 5 }).returning();
      t[key].session = s.id;
    }
  });
  afterAll(async () => {
    const d = db();
    await d.delete(users).where(inArray(users.id, userIds));
    await d.delete(organizations).where(inArray(organizations.id, orgIds));
    await d.delete(certifications).where(inArray(certifications.id, certIds));
  });

  it("Hilfsfunktionen: allgemein sichtbar, Entwurf nur für den Betreiber, intern nur für die eigene Firma", async () => {
    const hidden = async (user: string, key: keyof typeof t) => [
      await isCertificationHidden(u[user], t[key].cert),
      await isObjectiveHidden(u[user], t[key].objective),
      await isSectionHidden(u[user], t[key].section),
      await isExamHidden(u[user], t[key].exam),
    ];
    expect(await hidden("solo", "allgemein")).toEqual([false, false, false, false]);
    expect(await hidden("solo", "entwurf")).toEqual([true, true, true, true]);
    expect(await hidden("operator", "entwurf")).toEqual([false, false, false, false]);
    expect(await hidden("memberA", "internA")).toEqual([false, false, false, false]);
    expect(await hidden("memberB", "internA")).toEqual([true, true, true, true]);
    expect(await hidden("solo", "internA")).toEqual([true, true, true, true]);
    // Auch der Betreiber sieht interne Lernpfade einer Firma nicht.
    expect(await hidden("operator", "internA")).toEqual([true, true, true, true]);
  });

  it("fehlende Ziele und ungültige IDs sind nicht „gesperrt“ (die Route meldet sie selbst)", async () => {
    expect(await isCertificationHidden(u.solo, randomUUID())).toBe(false);
    expect(await isCertificationHidden(u.solo, "kein-uuid")).toBe(false);
    expect(await isSectionHidden(u.solo, "kein-uuid")).toBe(false);
  });

  it("Routen: fremder interner Lernpfad und Entwurf geben 404, der eigene und allgemeine 200", async () => {
    const get = (h: (r: never, c: never) => Promise<Response>, key: string, params: Record<string, string>) => {
      as(key);
      return h(asNext(new Request("http://x")) as never, ctx(params) as never);
    };
    for (const h of [progressGet, profileGet, offlineGet]) {
      const name = "certId";
      expect((await get(h as never, "memberB", { [name]: t.internA.cert })).status).toBe(404);
      expect((await get(h as never, "solo", { [name]: t.entwurf.cert })).status).toBe(404);
      expect((await get(h as never, "operator", { [name]: t.internA.cert })).status).toBe(404);
      expect((await get(h as never, "memberB", { [name]: t.allgemein.cert })).status).not.toBe(404);
    }
    expect((await get(progressGet as never, "memberA", { certId: t.internA.cert })).status).toBe(200);
    expect((await get(progressGet as never, "operator", { certId: t.entwurf.cert })).status).toBe(200);
  });

  it("Abschnitt, Lernziel, Lernsitzung starten: gesperrte Ziele geben 404", async () => {
    as("memberB");
    expect((await sectionAttempt(asNext(post({ answers: [] })), ctx({ id: t.internA.section }) as never)).status).toBe(404);
    expect((await remediationGet(asNext(new Request("http://x")), ctx({ objectiveId: t.internA.objective }) as never)).status).toBe(404);
    expect((await startSession(asNext(post({ certificationId: t.internA.cert, goalValue: 5, goalType: "questions" })))).status).toBe(404);
    as("solo");
    expect((await startSession(asNext(post({ certificationId: t.entwurf.cert, goalValue: 5, goalType: "questions" })))).status).toBe(404);
  });

  it("Lernsitzungen: Altbestand auf einem inzwischen gesperrten Lernpfad ist nicht mehr nutzbar", async () => {
    expect(await isStudySessionHidden(u.solo, t.entwurf.session)).toBe(true);
    expect(await isStudySessionHidden(u.solo, t.internA.session)).toBe(true);
  });

  it("Inhaltsmeldungen: gesperrt 404, intern 422 (gehen nie an den Betreiber), allgemein 201", async () => {
    expect(await resolveContentTarget(u.solo, "question", t.allgemein.question)).toBe("ok");
    expect(await resolveContentTarget(u.solo, "lesson", t.entwurf.lesson)).toBe("hidden");
    expect(await resolveContentTarget(u.memberA, "question", t.internA.question)).toBe("internal");
    expect(await resolveContentTarget(u.solo, "question", randomUUID())).toBe("missing");

    as("memberA");
    expect((await reportRoute(asNext(post({ targetType: "question", targetId: t.internA.question, reason: "incorrect" })))).status).toBe(422);
    as("memberB");
    expect((await reportRoute(asNext(post({ targetType: "lesson", targetId: t.internA.lesson, reason: "unclear" })))).status).toBe(404);
    as("solo");
    expect((await reportRoute(asNext(post({ targetType: "question", targetId: t.allgemein.question, reason: "outdated" })))).status).toBe(201);
  });
});
