import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "../lib/server/db/client";
import { certifications, courseReviewers, reviewerQualifications, domains, itemVariants, lessonCompletions, lessons, objectives, questionOptions, questions, sections, studySessions, users } from "../lib/server/db/schema";

export const PASSWORD = "E2e-Passw0rd!";
export const USERS = {
  learnerA: { email: "e2e-learner-a@test.example", role: "learner" },
  learnerB: { email: "e2e-learner-b@test.example", role: "learner" },
  admin: { email: "e2e-admin@test.example", role: "admin" },
  reviewer: { email: "e2e-reviewer@test.example", role: "reviewer" },
  /** Prüfer ohne Freischaltung: durchläuft das Probe-Review. */
  reviewerNew: { email: "e2e-reviewer-new@test.example", role: "reviewer" },
  placement: { email: "e2e-placement@test.example", role: "learner" },
  recallAnswer: { email: "e2e-recall-answer@test.example", role: "learner" },
  recallSkip: { email: "e2e-recall-skip@test.example", role: "learner" },
  formats: { email: "e2e-formats@test.example", role: "learner" },
  formatsSession: { email: "e2e-formats-session@test.example", role: "learner" },
  /** Pausiert die Tages-Session und macht später weiter. */
  pauser: { email: "e2e-pauser@test.example", role: "learner" },
} as const;
export const COURSE_SLUG = "e2e-demo";
export const COURSE_NAME = "E2E Demo Course";
/** Kleiner Kurs nur mit den neuen Antwortformaten (Reihenfolge, Kurzantwort, Zuordnung). */
export const FORMATS_SLUG = "e2e-formats";

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
  await ensureVariants(objectiveId);
  await ensureFormatsCourse();
  await resetFormatsSessionUser(passwordHash);
  await resetPauseUser(passwordHash);

  // Prüfer-Nutzer: genau dem E2E-Kurs zugewiesen.
  const [reviewer] = await db.select({ id: users.id }).from(users).where(eq(users.email, USERS.reviewer.email)).limit(1);
  const [reviewCourse] = await db.select({ id: certifications.id }).from(certifications).where(eq(certifications.slug, COURSE_SLUG)).limit(1);
  await db.insert(courseReviewers).values({ certificationId: reviewCourse.id, userId: reviewer.id }).onConflictDoNothing();
  // Freigabe- und Veröffentlichungsrechte (Probe-Review): der Test-Prüfer ist freigeschaltet, `reviewerNew` bewusst nicht.
  await db.insert(reviewerQualifications).values({ userId: reviewer.id, source: "admin" }).onConflictDoNothing();

  // Rückblick-Nutzer starten jeden Lauf neu (Nutzer löschen entfernt auch das unveränderliche review_log): Lektion vor 2 Tagen abgeschlossen.
  const [section] = await db.select({ id: sections.id }).from(sections).where(eq(sections.objectiveId, objectiveId)).limit(1);
  const [course] = await db.select({ id: certifications.id }).from(certifications).where(eq(certifications.slug, COURSE_SLUG)).limit(1);
  for (const { email } of [USERS.recallAnswer, USERS.recallSkip]) {
    await db.delete(users).where(eq(users.email, email));
    const [user] = await db.insert(users).values({ email, passwordHash, role: "learner", emailVerifiedAt: new Date() }).returning({ id: users.id });
    await db.insert(lessonCompletions).values({ userId: user.id, sectionId: section.id, completedAt: new Date(Date.now() - 48 * 3_600_000) });
    // Zwei abgeschlossene Sessions: erst ab der 3. Session fragt die Plattform „Wie sicher bist du?“ (Paket 4.1a), der Rückblick-Test klickt darauf.
    for (const daysAgo of [4, 3]) {
      const at = new Date(Date.now() - daysAgo * 86_400_000);
      await db.insert(studySessions).values({ userId: user.id, certificationId: course.id, status: "completed", goalType: "minutes", goalValue: 10, plannedAt: at, completedAt: at });
    }
  }
}

/** Frisch angelegt, Lektion gelesen, noch keine Antworten: die Tages-Session bietet die Formatfragen als neue Aufgaben an. */
async function resetFormatsSessionUser(passwordHash: string) {
  const db = getDb();
  const email = USERS.formatsSession.email;
  await db.delete(users).where(eq(users.email, email));
  const [user] = await db.insert(users).values({ email, passwordHash, role: "learner", emailVerifiedAt: new Date() }).returning({ id: users.id });
  const [cert] = await db.select({ id: certifications.id }).from(certifications).where(eq(certifications.slug, FORMATS_SLUG)).limit(1);
  const [section] = await db
    .select({ id: sections.id })
    .from(sections)
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(eq(domains.certificationId, cert.id))
    .limit(1);
  await db.insert(lessonCompletions).values({ userId: user.id, sectionId: section.id, completedAt: new Date(Date.now() - 3_600_000) });
}

/** Frisch angelegt, Lektion des Demo-Kurses gelesen, keine Session: die Tages-Session wird im Test gebaut, pausiert und fortgesetzt. */
async function resetPauseUser(passwordHash: string) {
  const db = getDb();
  const email = USERS.pauser.email;
  await db.delete(users).where(eq(users.email, email));
  const [user] = await db.insert(users).values({ email, passwordHash, role: "learner", emailVerifiedAt: new Date() }).returning({ id: users.id });
  const [cert] = await db.select({ id: certifications.id }).from(certifications).where(eq(certifications.slug, COURSE_SLUG)).limit(1);
  const [section] = await db
    .select({ id: sections.id })
    .from(sections)
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(eq(domains.certificationId, cert.id))
    .limit(1);
  await db.insert(lessonCompletions).values({ userId: user.id, sectionId: section.id, completedAt: new Date(Date.now() - 3_600_000) });
}

const bi = (de: string, en = de) => ({ de, en });

async function ensureFormatsCourse() {
  const db = getDb();
  const [have] = await db.select({ id: certifications.id }).from(certifications).where(eq(certifications.slug, FORMATS_SLUG)).limit(1);
  if (have) return;
  const [cert] = await db
    .insert(certifications)
    .values({ slug: FORMATS_SLUG, name: "E2E Formats Course", provider: "E2E", examName: "E2E", examVersion: "1", catalogStatus: "approved", includeSectionQuizzes: true })
    .returning();
  const [domain] = await db.insert(domains).values({ certificationId: cert.id, orderNum: 1, name: "Domain 1", weightPercent: "100" }).returning();
  const [objective] = await db.insert(objectives).values({ domainId: domain.id, code: "1.1", title: "Formats" }).returning();
  const [section] = await db.insert(sections).values({ objectiveId: objective.id, orderNum: 1, title: bi("Formate-Lektion", "Formats lesson"), estimatedMinutes: 5, difficulty: "beginner" }).returning();
  await db.insert(lessons).values({ sectionId: section.id, content: bi("# Formate\n\nText.", "# Formats\n\nText."), keyTakeaways: { de: ["a"], en: ["a"] }, examFocusPoints: { de: ["b"], en: ["b"] }, modelVersion: "e2e" });
  const base = { objectiveId: objective.id, difficulty: "beginner" as const, type: "knowledge" as const, explanation: bi("Weil.", "Because.") };
  await db.insert(questions).values([
    { ...base, humanId: "E2E-FMT-ORD", question: bi("Reihenfolge der Fehlersuche?", "Order of troubleshooting?"), answerFormat: "ordering", answerData: { steps: [{ id: "s1", text: bi("Erkennen", "Identify") }, { id: "s2", text: bi("Eingrenzen", "Narrow down") }, { id: "s3", text: bi("Beheben", "Fix") }] } },
    { ...base, humanId: "E2E-FMT-SHORT", question: bi("Welcher Befehl zeigt alle IP-Einstellungen?", "Which command shows all IP settings?"), answerFormat: "short_answer", answerData: { accepted: ["ipconfig /all"] } },
    { ...base, humanId: "E2E-FMT-MATCH", question: bi("Ordne zu.", "Match them."), answerFormat: "matching", answerData: { pairs: [{ id: "m1", left: bi("DNS"), right: bi("Namen auflösen", "Resolve names") }, { id: "m2", left: bi("DHCP"), right: bi("Adressen vergeben", "Assign addresses") }] } },
  ]);
}

/** Je Frage eine Variante (für den Rückblick und die Variantenrotation). */
async function ensureVariants(objectiveId: string) {
  const db = getDb();
  const originals = await db.select({ id: questions.id, humanId: questions.humanId }).from(questions).where(eq(questions.objectiveId, objectiveId));
  for (const original of originals.filter((q) => !q.humanId.includes("-V"))) {
    const existing = await db.select({ id: itemVariants.id }).from(itemVariants).where(eq(itemVariants.itemId, original.id));
    if (existing.length > 1) continue; // Original + mindestens eine Variante
    const [variant] = await db
      .insert(questions)
      .values({ humanId: `${original.humanId}-V1`, objectiveId, difficulty: "beginner", type: "knowledge", question: { de: "Variante?", en: "Variant?" }, explanation: { de: "Weil.", en: "Because." }, probeOnly: true })
      .returning({ id: questions.id });
    await db.insert(questionOptions).values([
      { questionId: variant.id, orderNum: 1, text: { de: "Richtig", en: "Right" }, isCorrect: true },
      { questionId: variant.id, orderNum: 2, text: { de: "Falsch", en: "Wrong" }, isCorrect: false },
    ]);
    await db.insert(itemVariants).values({ itemId: original.id, questionId: variant.id, source: "generated" });
  }
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
