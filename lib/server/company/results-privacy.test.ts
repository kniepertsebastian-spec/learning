/**
 * Leitplanke „Geschäftsführung und Mentor sehen keine Ergebnisse“ (echte Postgres, nur mit TEST_DATABASE_URL):
 * Von einer lernenden Person gibt es echte Ergebnisse (Beherrschungsgrad, Prüfungsversuch mit Punktzahl, nicht
 * bestanden). Firmen-Admin und Mentor derselben Firma dürfen davon über KEINE Route etwas erfahren: weder über die
 * Firmen-APIs (nur Status offen / in Arbeit / bestanden, Datum, Frist) noch über die Lern-APIs (die gehören der Person:
 * fremde Versuche sind „nicht gefunden“, die eigenen Daten der Rolleninhaber sind leer).
 */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth", () => ({ auth: authMock }));
// Die Lern-APIs lesen die Sprache aus dem Cookie; im Test gibt es keine Anfrage.
vi.mock("@/lib/server/locale", async (orig) => ({ ...(await orig<typeof import("@/lib/server/locale")>()), getServerLocale: async () => "de" }));

import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  certifications, companyAssignments, companyCourseEntitlements, domains, examAttempts, exams, objectiveProgress, objectives,
  organizationMemberships, organizations, users, type CompanyRole,
} from "@/lib/server/db/schema";
import { COMPANY_STATUS_FIELDS } from "./status";
import { GET as statusGet } from "@/app/api/company/status/route";
import { GET as onboardingsGet } from "@/app/api/company/onboardings/route";
import { GET as mandatoryGet } from "@/app/api/company/mandatory/route";
import { GET as departmentsGet } from "@/app/api/company/departments/route";
import { GET as practiceGet } from "@/app/api/company/practice-tasks/route";
import { GET as modulesGet } from "@/app/api/company/modules/route";
import { GET as invitationsGet } from "@/app/api/company/invitations/route";
import { GET as documentsGet } from "@/app/api/company/documents/route";
import { GET as courseRequestsGet } from "@/app/api/company/course-requests/route";
import { GET as attemptGet } from "@/app/api/exams/[certId]/attempts/[attemptId]/route";
import { GET as examExportGet } from "@/app/api/exams/[certId]/export/route";
import { GET as progressGet } from "@/app/api/progress/[certId]/route";
import { GET as progressObjectivesGet } from "@/app/api/progress/[certId]/objectives/route";
import { GET as progressDomainsGet } from "@/app/api/progress/[certId]/domains/route";
import { GET as remediationNeededGet } from "@/app/api/remediation/needed/route";
import { GET as readyGet } from "@/app/api/ready/route";
import { GET as studyProfileGet } from "@/app/api/study-profile/[certId]/route";

const run = TEST_DB ? describe : describe.skip;
const signInAs = (id: string | null) => authMock.mockResolvedValue(id ? { user: { id } } : null);
const get = () => new Request("http://localhost/api") as never;

/** Zahlen und Wörter, die nur in den Ergebnissen der Person vorkommen. Taucht eines davon in einer Antwort auf, ist es ein Leck. */
const SECRET_SCORE = "73.25";
const SECRET_MASTERY = "87.5";

run("Ergebnisse bleiben bei der Person (echte DB)", () => {
  const tag = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};
  let orgA = "";
  let certId = "";
  let attemptId = "";

  async function mkUser(key: string) {
    const [u] = await getDb().insert(users).values({ email: `${key}-${tag}@test.example`, passwordHash: "x", name: key, emailVerifiedAt: new Date() }).returning({ id: users.id });
    ids[key] = u.id;
  }
  const member = (key: string, role: CompanyRole) => getDb().insert(organizationMemberships).values({ organizationId: orgA, userId: ids[key], role });

  beforeAll(async () => {
    const d = getDb();
    orgA = (await d.insert(organizations).values({ name: `Privat ${tag}` }).returning())[0].id;
    for (const k of ["boss", "mentor", "learner"]) await mkUser(k);
    await member("boss", "company_admin");
    await member("mentor", "mentor");
    await member("learner", "learner");
    const [c] = await d.insert(certifications).values({ slug: `priv-${tag}`, name: `Priv ${tag}`, provider: "T", examName: "T", examVersion: "1" }).returning({ id: certifications.id });
    certId = c.id;
    await d.insert(companyCourseEntitlements).values({ organizationId: orgA, certificationId: certId });
    const [dom] = await d.insert(domains).values({ certificationId: certId, orderNum: 1, name: "D" }).returning();
    const [obj] = await d.insert(objectives).values({ domainId: dom.id, code: `P-${tag}`, title: "O" }).returning();
    await d.insert(companyAssignments).values({ organizationId: orgA, userId: ids.learner, certificationId: certId, status: "in_progress", dueAt: new Date(Date.now() + 86_400_000) });
    // echte Ergebnisse der Person: schwach beherrscht und eine nicht bestandene Prüfung
    await d.insert(objectiveProgress).values({ userId: ids.learner, objectiveId: obj.id, status: "NEEDS_REMEDIATION", masteryScore: SECRET_MASTERY, lastAttemptAt: new Date() });
    const [exam] = await d.insert(exams).values({ certificationId: certId, blueprint: {} }).returning();
    const [attempt] = await d.insert(examAttempts).values({ examId: exam.id, userId: ids.learner, score: SECRET_SCORE, passed: false, readiness: "NOT_READY", completedAt: new Date() }).returning();
    attemptId = attempt.id;
  });
  afterAll(async () => {
    await getDb().delete(organizations).where(eq(organizations.id, orgA));
    await getDb().delete(certifications).where(eq(certifications.id, certId));
    await getDb().delete(users).where(inArray(users.id, Object.values(ids)));
  });
  beforeEach(() => authMock.mockReset());

  const roles = ["boss", "mentor"] as const;
  const FORBIDDEN = [SECRET_SCORE, SECRET_MASTERY, "NEEDS_REMEDIATION", "NOT_READY", "masteryScore", "isCorrect", "readiness", "answers"];

  it("Firmen-Status: genau die freigegebenen Felder, nur die drei Stände, nie ein Ergebnis", async () => {
    for (const role of roles) {
      signInAs(ids[role]);
      const res = await statusGet();
      expect(res.status, role).toBe(200);
      const body = await res.json();
      expect(body.entries).toHaveLength(1);
      expect(Object.keys(body.entries[0]).sort(), role).toEqual([...COMPANY_STATUS_FIELDS].sort());
      expect(["assigned", "in_progress", "completed"]).toContain(body.entries[0].status);
      const text = JSON.stringify(body);
      for (const word of FORBIDDEN) expect(text, `${role}: ${word}`).not.toContain(word);
    }
  });

  it("alle Firmen-APIs (Lesen): kein Ergebnis in irgendeiner Antwort", async () => {
    const getters = { onboardingsGet, mandatoryGet, departmentsGet, practiceGet, modulesGet, invitationsGet, documentsGet, courseRequestsGet };
    for (const role of roles) {
      signInAs(ids[role]);
      for (const [name, handler] of Object.entries(getters)) {
        const res = await (handler as () => Promise<Response>)();
        if (res.status === 403) continue; // z. B. Einladungen: nur Firmen-Admin
        expect(res.status, `${role} ${name}`).toBe(200);
        const text = JSON.stringify(await res.json());
        for (const word of FORBIDDEN) expect(text, `${role} ${name}: ${word}`).not.toContain(word);
        expect(text, `${role} ${name}`).not.toContain(attemptId);
      }
    }
  });

  it("Lern-APIs: fremde Prüfungsversuche sind nicht auffindbar, Fortschritt und Export zeigen nur die EIGENEN (leeren) Daten", async () => {
    const certCtx = { params: Promise.resolve({ certId }) } as never;
    for (const role of roles) {
      signInAs(ids[role]);
      const attempt = await attemptGet(get(), { params: Promise.resolve({ certId, attemptId }) } as never);
      expect(attempt.status, `${role} Versuch`).toBe(404);
      for (const [name, res] of [
        ["export", await examExportGet(get(), certCtx)],
        ["progress", await progressGet(get(), certCtx)],
        ["objectives", await progressObjectivesGet(get(), certCtx)],
        ["domains", await progressDomainsGet(get(), certCtx)],
        ["study-profile", await studyProfileGet(get(), certCtx)],
        ["remediation/needed", await remediationNeededGet()],
        ["ready", await readyGet()],
      ] as const) {
        const text = await res.text();
        for (const word of [SECRET_SCORE, SECRET_MASTERY, "NEEDS_REMEDIATION", "NOT_READY", attemptId]) {
          expect(text, `${role} ${name}: ${word}`).not.toContain(word);
        }
      }
    }
  });

  it("Gegenprobe: die Person selbst sieht ihre Ergebnisse (der Test prüft also wirklich etwas)", async () => {
    signInAs(ids.learner);
    const attempt = await attemptGet(get(), { params: Promise.resolve({ certId, attemptId }) } as never);
    expect(attempt.status).toBe(200);
    expect(await attempt.text()).toContain("73.25");
    const progress = await progressObjectivesGet(get(), { params: Promise.resolve({ certId }) } as never);
    expect(await progress.text()).toContain("87.5");
  });
});
