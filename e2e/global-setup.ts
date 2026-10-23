import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "../lib/server/db/client";
import { certifications, domains, lessons, objectives, questionOptions, questions, sections, users } from "../lib/server/db/schema";

export const PASSWORD = "E2e-Passw0rd!";
export const USERS = {
  learnerA: { email: "e2e-learner-a@test.example", role: "learner" },
  learnerB: { email: "e2e-learner-b@test.example", role: "learner" },
  admin: { email: "e2e-admin@test.example", role: "admin" },
} as const;
export const COURSE_SLUG = "e2e-demo";
export const COURSE_NAME = "E2E Demo Course";

/** Legt Testnutzer und einen kleinen, freigegebenen Kurs an (idempotent: ein vorhandener Kurs bleibt unverändert). */
export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("E2E_DATABASE_URL oder DATABASE_URL fehlt (migrierte Postgres-Datenbank).");
  process.env.DATABASE_URL = url;
  const db = getDb();

  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  for (const { email, role } of Object.values(USERS)) {
    await db
      .insert(users)
      .values({ email, passwordHash, role, emailVerifiedAt: new Date() })
      .onConflictDoUpdate({ target: users.email, set: { passwordHash, role, emailVerifiedAt: new Date() } });
  }

  // Nicht löschen und neu anlegen: review_log ist unveränderlich, ein Kurs mit Lernfortschritt lässt sich nicht entfernen.
  const [existing] = await db.select({ id: certifications.id }).from(certifications).where(eq(certifications.slug, COURSE_SLUG)).limit(1);
  let objectiveId: string;
  if (existing) {
    const [row] = await db
      .select({ id: objectives.id })
      .from(objectives)
      .innerJoin(domains, eq(domains.id, objectives.domainId))
      .where(eq(domains.certificationId, existing.id))
      .limit(1);
    objectiveId = row.id;
  } else {
    objectiveId = await createCourse();
  }
  await ensureQuestions(objectiveId);
}

async function createCourse(): Promise<string> {
  const db = getDb();
  const [cert] = await db
    .insert(certifications)
    .values({ slug: COURSE_SLUG, name: COURSE_NAME, provider: "E2E", examName: "E2E", examVersion: "1", catalogStatus: "approved", includeSectionQuizzes: true })
    .returning();
  const [domain] = await db.insert(domains).values({ certificationId: cert.id, orderNum: 1, name: "Domain 1", weightPercent: "100" }).returning();
  const [objective] = await db.insert(objectives).values({ domainId: domain.id, code: "1.1", title: "Basics" }).returning();
  const [section] = await db
    .insert(sections)
    .values({ objectiveId: objective.id, orderNum: 1, title: { de: "Erste Lektion", en: "First lesson" }, estimatedMinutes: 5, difficulty: "beginner" })
    .returning();
  await db.insert(lessons).values({
    sectionId: section.id,
    content: { de: "# Hallo Offline\n\nDies ist der Lektionstext.", en: "# Hello offline\n\nThis is the lesson text." },
    keyTakeaways: { de: ["a"], en: ["a"] },
    examFocusPoints: { de: ["b"], en: ["b"] },
    modelVersion: "e2e",
  });
  return objective.id;
}

/** Mindestens drei Fragen: Vorabfragen brauchen zwei plus mindestens eine weitere für den Lektionstest. */
async function ensureQuestions(objectiveId: string) {
  const db = getDb();
  for (const n of [1, 2, 3]) {
    const humanId = `E2E-1.1-Q00${n}`;
    const [have] = await db.select({ id: questions.id }).from(questions).where(eq(questions.humanId, humanId)).limit(1);
    if (have) continue;
    const [question] = await db
      .insert(questions)
      .values({ humanId, objectiveId, difficulty: "beginner", type: "knowledge", question: { de: `Frage ${n}?`, en: `Question ${n}?` }, explanation: { de: "Weil.", en: "Because." } })
      .returning();
    await db.insert(questionOptions).values([
      { questionId: question.id, orderNum: 1, text: { de: "Richtig", en: "Right" }, isCorrect: true },
      { questionId: question.id, orderNum: 2, text: { de: "Falsch", en: "Wrong" }, isCorrect: false },
      { questionId: question.id, orderNum: 3, text: { de: "Auch falsch", en: "Also wrong" }, isCorrect: false },
    ]);
  }
}
