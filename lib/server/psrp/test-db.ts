/** Hilfsfunktionen für DB-Tests der PSRP-HR-Module (nur mit TEST_DATABASE_URL). */
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/server/db/client";
import { certifications, domains, objectives, questions, users } from "@/lib/server/db/schema";

export async function seedCourse(questionCount = 3) {
  const db = getDb();
  const tag = randomUUID().slice(0, 8);
  const [cert] = await db
    .insert(certifications)
    .values({ slug: `psrp-${tag}`, name: `PSRP ${tag}`, provider: "T", examName: "T", examVersion: "1" })
    .returning();
  const [domain] = await db
    .insert(domains)
    .values({ certificationId: cert.id, orderNum: 1, name: { de: "D", en: "D" } as never })
    .returning();
  const [objective] = await db
    .insert(objectives)
    .values({ domainId: domain.id, code: `O-${tag}`, title: { de: "O", en: "O" } as never })
    .returning();
  const questionIds: string[] = [];
  for (let i = 0; i < questionCount; i++) {
    const [q] = await db
      .insert(questions)
      .values({
        humanId: `Q-${tag}-${i}`,
        objectiveId: objective.id,
        difficulty: "easy",
        type: "single",
        question: { de: "F", en: "Q" } as never,
        explanation: { de: "E", en: "E" } as never,
      })
      .returning();
    questionIds.push(q.id);
  }
  return { certId: cert.id, objectiveId: objective.id, questionIds, tag };
}

export async function seedUser(timezone = "Europe/Berlin") {
  const [u] = await getDb()
    .insert(users)
    .values({
      email: `psrp-${randomUUID()}@test.example`,
      passwordHash: await bcrypt.hash("x", 4),
      timezone,
    })
    .returning({ id: users.id });
  return u.id;
}

/** Lektionen (Abschnitt + Lektion) zu einem Lernziel anlegen; `content` je Lektion (de = en, einsprachig). */
export async function seedLessons(objectiveId: string, contents: string[]) {
  const { sections, lessons } = await import("@/lib/server/db/schema");
  const db = getDb();
  const sectionIds: string[] = [];
  for (const [i, content] of contents.entries()) {
    const [section] = await db
      .insert(sections)
      .values({ objectiveId, orderNum: i + 1, title: { de: `Lektion ${i + 1}`, en: `Lesson ${i + 1}` }, estimatedMinutes: 10, difficulty: "beginner" })
      .returning();
    await db.insert(lessons).values({ sectionId: section.id, content: { de: content, en: content }, keyTakeaways: { de: ["a"], en: ["a"] }, examFocusPoints: { de: ["b"], en: ["b"] }, modelVersion: "test" });
    sectionIds.push(section.id);
  }
  return sectionIds;
}
