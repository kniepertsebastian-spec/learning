/** „Mentor fragen“ gegen echte DB (nur mit TEST_DATABASE_URL): nur auf Auslösung der Person, nur ihr eigener Text, richtige Empfänger. */
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { mentorRequests, onboardingPlans, onboardings, organizationMemberships, organizations, users, type CompanyRole } from "@/lib/server/db/schema";
import {
  AlreadyAnsweredError,
  answerMentorRequest,
  createMentorRequest,
  findMentorUserId,
  InvalidMentorRequestError,
  listMyMentorRequests,
  listOpenMentorRequests,
  MentorRequestNotFoundError,
  mentorRequestStats,
  NoMentorError,
  SelfAnswerError,
} from "./mentor-requests";

const run = TEST_DB ? describe : describe.skip;

run("Mentor fragen (echte DB)", () => {
  const tag = randomUUID().slice(0, 8);
  async function mkUser(key: string) {
    const [u] = await getDb().insert(users).values({ email: `${key}-${tag}-${randomUUID().slice(0, 4)}@test.example`, passwordHash: "x", name: key }).returning({ id: users.id });
    return u.id;
  }
  async function mkOrg() {
    const [org] = await getDb().insert(organizations).values({ name: `Org ${tag}-${randomUUID().slice(0, 4)}` }).returning({ id: organizations.id });
    return org.id;
  }
  const member = (organizationId: string, userId: string, role: CompanyRole) => getDb().insert(organizationMemberships).values({ organizationId, userId, role });

  async function setup() {
    const orgId = await mkOrg();
    const [mentor, otherMentor, admin, learner, loner] = await Promise.all(["mentor", "other", "admin", "learner", "loner"].map(mkUser));
    await member(orgId, mentor, "mentor");
    await member(orgId, otherMentor, "mentor");
    await member(orgId, admin, "company_admin");
    await member(orgId, learner, "learner");
    await member(orgId, loner, "learner");
    const [plan] = await getDb().insert(onboardingPlans).values({ organizationId: orgId, name: "Plan", mentorUserId: mentor }).returning({ id: onboardingPlans.id });
    await getDb().insert(onboardings).values({ planId: plan.id, organizationId: orgId, userId: learner });
    return { orgId, mentor, otherMentor, admin, learner, loner };
  }

  it("geht nur nach ausdrücklichem Absenden an den Mentor des Plans und enthält nur den Text der Person", async () => {
    const t = await setup();
    expect(await findMentorUserId(t.orgId, t.learner)).toBe(t.mentor);
    expect(await findMentorUserId(t.orgId, t.loner)).toBeNull();
    expect(await listOpenMentorRequests(t.orgId, t.mentor, "mentor")).toHaveLength(0);

    const { id } = await createMentorRequest({ organizationId: t.orgId, userId: t.learner, topic: "Subnetting", message: "Thema: Subnetting\n\nWo ich hänge: Ich verstehe die Maske nicht." });
    const [row] = await getDb().select().from(mentorRequests).where(eq(mentorRequests.id, id));
    expect(row).toMatchObject({ mentorUserId: t.mentor, topic: "Subnetting", status: "open", certificationId: null });
    // Es gibt keine Spalte für Fehlerhistorie, Antworten oder Lernzeit: nur diese Felder sind gespeichert
    expect(Object.keys(row).sort()).toEqual(["answerNote", "answeredAt", "answeredByUserId", "certificationId", "createdAt", "id", "mentorUserId", "message", "organizationId", "status", "topic", "userId"]);

    expect((await listOpenMentorRequests(t.orgId, t.mentor, "mentor")).map((r) => r.id)).toEqual([id]);
    expect(await listOpenMentorRequests(t.orgId, t.otherMentor, "mentor")).toHaveLength(0);
    expect((await listOpenMentorRequests(t.orgId, t.admin, "company_admin")).map((r) => r.id)).toEqual([id]);
    expect(await listOpenMentorRequests(t.orgId, t.learner, "learner")).toHaveLength(0);
    expect((await listMyMentorRequests(t.orgId, t.learner)).map((r) => r.id)).toEqual([id]);
  });

  it("lehnt ungültige Texte und Personen ohne Mentor ab", async () => {
    const t = await setup();
    await expect(createMentorRequest({ organizationId: t.orgId, userId: t.learner, topic: "X", message: "kurz" })).rejects.toBeInstanceOf(InvalidMentorRequestError);
    await expect(createMentorRequest({ organizationId: t.orgId, userId: t.learner, topic: "", message: "Ein ausreichend langer Text" })).rejects.toBeInstanceOf(InvalidMentorRequestError);
    await expect(createMentorRequest({ organizationId: t.orgId, userId: t.loner, topic: "X", message: "Ein ausreichend langer Text" })).rejects.toBeInstanceOf(NoMentorError);
    // der Mentor selbst hat keinen Mentor über den eigenen Plan
    expect(await findMentorUserId(t.orgId, t.mentor)).toBeNull();
  });

  it("beantworten: nur Empfänger-Mentor oder Admin, nie die eigene Anfrage, nie in einer fremden Firma, nur einmal", async () => {
    const t = await setup();
    const { id } = await createMentorRequest({ organizationId: t.orgId, userId: t.learner, topic: "Routing", message: "Ich komme bei der Routing-Tabelle nicht weiter." });
    await expect(answerMentorRequest({ organizationId: t.orgId, requestId: id, userId: t.otherMentor, role: "mentor" })).rejects.toBeInstanceOf(MentorRequestNotFoundError);
    const foreign = await setup();
    await expect(answerMentorRequest({ organizationId: foreign.orgId, requestId: id, userId: foreign.admin, role: "company_admin" })).rejects.toBeInstanceOf(MentorRequestNotFoundError);
    await expect(answerMentorRequest({ organizationId: t.orgId, requestId: id, userId: t.learner, role: "learner" })).rejects.toBeInstanceOf(MentorRequestNotFoundError);

    await answerMentorRequest({ organizationId: t.orgId, requestId: id, userId: t.mentor, role: "mentor", note: "Wir schauen es uns morgen an." });
    const [row] = await getDb().select().from(mentorRequests).where(eq(mentorRequests.id, id));
    expect(row).toMatchObject({ status: "answered", answerNote: "Wir schauen es uns morgen an.", answeredByUserId: t.mentor });
    await expect(answerMentorRequest({ organizationId: t.orgId, requestId: id, userId: t.admin, role: "company_admin" })).rejects.toBeInstanceOf(AlreadyAnsweredError);
    expect((await listMyMentorRequests(t.orgId, t.learner))[0]).toMatchObject({ status: "answered", answerNote: "Wir schauen es uns morgen an." });

    // Admin, der selbst fragt und im eigenen Plan Mentor wäre, beantwortet seine Anfrage nicht
    const orgId = t.orgId;
    const [plan] = await getDb().insert(onboardingPlans).values({ organizationId: orgId, name: "Admin-Plan", mentorUserId: t.mentor }).returning({ id: onboardingPlans.id });
    await getDb().insert(onboardings).values({ planId: plan.id, organizationId: orgId, userId: t.admin });
    const own = await createMentorRequest({ organizationId: orgId, userId: t.admin, topic: "Eigene", message: "Das ist meine eigene Frage." });
    await expect(answerMentorRequest({ organizationId: orgId, requestId: own.id, userId: t.admin, role: "company_admin" })).rejects.toBeInstanceOf(SelfAnswerError);
  });

  it("Kennzahlen nur ab fünf verschiedenen Fragenden und ohne Namen", async () => {
    const orgId = await mkOrg();
    const mentor = await mkUser("mentor");
    await member(orgId, mentor, "mentor");
    const [plan] = await getDb().insert(onboardingPlans).values({ organizationId: orgId, name: "P", mentorUserId: mentor }).returning({ id: onboardingPlans.id });
    const askers: string[] = [];
    for (let i = 0; i < 5; i++) {
      const u = await mkUser(`l${i}`);
      askers.push(u);
      await member(orgId, u, "learner");
      await getDb().insert(onboardings).values({ planId: plan.id, organizationId: orgId, userId: u });
    }
    for (let i = 0; i < 4; i++) await createMentorRequest({ organizationId: orgId, userId: askers[i], topic: "T", message: "Eine ausreichend lange Frage." });
    expect(await mentorRequestStats(orgId)).toBeNull();
    const last = await createMentorRequest({ organizationId: orgId, userId: askers[4], topic: "T", message: "Eine ausreichend lange Frage." });
    await answerMentorRequest({ organizationId: orgId, requestId: last.id, userId: mentor, role: "mentor" });
    const stats = await mentorRequestStats(orgId);
    expect(stats).toMatchObject({ requests: 5, answered: 1 });
    expect(Object.keys(stats!).sort()).toEqual(["answered", "medianHoursToAnswer", "requests"]);
  });
});
