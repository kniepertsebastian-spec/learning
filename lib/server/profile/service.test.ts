/** Berufliches Profil und Skills (echte DB nur mit TEST_DATABASE_URL). */
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { certifications, examAttempts, exams, userCertificates, users } from "@/lib/server/db/schema";
import { addSkill, addSkillFromCourse, deleteSkill, getProfile, profileSchema, saveProfile, setAutoSkills, SkillExistsError, skillSchema, SkillNotFoundError, updateSkill } from "./service";

const run = TEST_DB ? describe : describe.skip;
const tag = randomUUID().slice(0, 8);

describe("Eingaben", () => {
  it("leere Texte werden null, Bundesland nur aus der Liste", () => {
    expect(profileSchema.parse({ jobTitle: "  ", jobDescription: "x", focusAreas: "", state: "BY" })).toEqual({ jobTitle: null, jobDescription: "x", focusAreas: null, state: "BY" });
    expect(profileSchema.safeParse({ jobTitle: null, jobDescription: null, focusAreas: null, state: "XX" }).success).toBe(false);
  });
  it("Skills haben keine Aktualität, Tools standardmäßig „aktuell“", () => {
    expect(skillSchema.parse({ kind: "skill", name: "Kubernetes", level: "basic", recency: "older" }).recency).toBeNull();
    expect(skillSchema.parse({ kind: "tool", name: "Terraform", level: "expert" }).recency).toBe("current");
  });
});

run("Profil und Skills (echte DB)", () => {
  const userIds: string[] = [];
  const certIds: string[] = [];
  afterAll(async () => {
    if (userIds.length) await getDb().delete(users).where(inArray(users.id, userIds));
    if (certIds.length) await getDb().delete(certifications).where(inArray(certifications.id, certIds));
  });
  const mkUser = async () => {
    const [u] = await getDb().insert(users).values({ email: `prof-${userIds.length}-${tag}@example.com`, passwordHash: "x" }).returning({ id: users.id });
    userIds.push(u.id);
    return u.id;
  };
  const mkCert = async (name: string) => {
    const [c] = await getDb().insert(certifications).values({ slug: `pf-${certIds.length}-${tag}`, name, provider: "T", examName: "T", examVersion: "1" }).returning({ id: certifications.id });
    certIds.push(c.id);
    return c.id;
  };

  it("speichert das Profil und überschreibt beim zweiten Mal", async () => {
    const u = await mkUser();
    await saveProfile(u, { jobTitle: "Admin", jobDescription: null, focusAreas: "Netzwerke", state: "NW" });
    await saveProfile(u, { jobTitle: "Cloud Engineer", jobDescription: null, focusAreas: null, state: null });
    expect((await getProfile(u)).profile).toEqual({ jobTitle: "Cloud Engineer", jobDescription: null, focusAreas: null, state: null });
  });

  it("Skills: doppelte Namen (Groß/Klein egal) abgelehnt, fremde Einträge nicht änderbar", async () => {
    const u = await mkUser();
    const other = await mkUser();
    const id = await addSkill(u, { kind: "skill", name: "Kubernetes", level: "basic" });
    await expect(addSkill(u, { kind: "skill", name: "kubernetes", level: "expert" })).rejects.toBeInstanceOf(SkillExistsError);
    await addSkill(u, { kind: "tool", name: "kubernetes", level: "expert" }); // als Tool ist das ein anderer Eintrag
    await expect(updateSkill(other, id, { level: "expert" })).rejects.toBeInstanceOf(SkillNotFoundError);
    await expect(deleteSkill(other, id)).rejects.toBeInstanceOf(SkillNotFoundError);
    await updateSkill(u, id, { level: "expert" });
    expect((await getProfile(u)).skills.find((s) => s.id === id)?.level).toBe("expert");
  });

  it("automatische Skills nur mit Einwilligung; Einschalten trägt nach; eigene Einträge bleiben", async () => {
    const u = await mkUser();
    const cka = await mkCert(`CKA ${tag}`);
    const sec = await mkCert(`Security+ ${tag}`);
    expect(await addSkillFromCourse(u, cka, "course")).toBe(false); // nicht eingewilligt
    const [exam] = await getDb().insert(exams).values({ certificationId: cka, blueprint: {} }).returning();
    await getDb().insert(examAttempts).values({ examId: exam.id, userId: u, score: "90", passed: true, completedAt: new Date() });
    await getDb().insert(userCertificates).values({ userId: u, certificationId: sec, title: "Security+", earnedAt: new Date() });
    await addSkill(u, { kind: "skill", name: `security+ ${tag}`, level: "expert" }); // selbst eingetragen, gleicher Name
    expect(await setAutoSkills(u, true)).toEqual({ added: 1 });
    const skills = (await getProfile(u)).skills;
    expect(skills.find((s) => s.name === `CKA ${tag}`)).toMatchObject({ source: "course", level: "confident", sourceCourse: `CKA ${tag}` });
    expect(skills.find((s) => s.name.toLowerCase() === `security+ ${tag}`)).toMatchObject({ source: "manual", level: "expert" });
    // Zertifikat für den Kurs-Skill: Herkunft wird „Zertifikat“
    await addSkillFromCourse(u, cka, "certificate");
    expect((await getProfile(u)).skills.find((s) => s.name === `CKA ${tag}`)?.source).toBe("certificate");
    expect((await setAutoSkills(u, false)).added).toBe(0);
    expect((await getProfile(u)).autoSkills).toBe(false);
  });
});
