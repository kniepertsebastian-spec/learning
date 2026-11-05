/**
 * Freigabe je Inhaltsstand (roadmap_pruefer Phase 2). Eine Freigabe gilt für den Stand eines allgemeinen Kurses zum Zeitpunkt der
 * Freigabe (Hash über alle Fingerabdrücke von Abschnitten, Fragen und aktiven Varianten). Ändert sich danach etwas, bleibt der
 * Kurs sichtbar, zeigt aber „X Änderungen seit Prüfung“, bis neu freigegeben oder als redaktionell übernommen wurde.
 * KI gibt nie frei: Freigeben kann nur ein Mensch (Admin im Namen der prüfenden Person, später Prüfer-Rolle).
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import { courseApprovals, domains, itemVariants, lessons, objectives, questionOptions, questions, sections, certifications, type CourseApprovalKind } from "@/lib/server/db/schema";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { createSecondReviewSample } from "@/lib/server/reviewers/second-review";
import { contentHash, countChanges, diffFingerprints, nextVersionLabel, type CourseFingerprints, type FingerprintDiff } from "@/lib/approvals/diff";
import { fingerprint, normalizeSection, type QuestionSnapshot, type SectionSnapshot } from "@/lib/server/course-editor/snapshots";

export class ApprovalNotFoundError extends Error {}
export class ApprovalInvalidError extends Error {}

type Db = ReturnType<typeof getDb>;

/** Fingerabdrücke aller Abschnitte, Fragen und aktiven Varianten (nicht veraltet) eines Kurses, in wenigen Abfragen. */
export async function computeCourseFingerprints(certId: string, db: Db = getDb()): Promise<CourseFingerprints> {
  const sectionRows = await db
    .select({
      id: sections.id,
      title: sections.title,
      estimatedMinutes: sections.estimatedMinutes,
      difficulty: sections.difficulty,
      content: lessons.content,
      keyTakeaways: lessons.keyTakeaways,
      examFocusPoints: lessons.examFocusPoints,
      cheatSheet: lessons.cheatSheet,
    })
    .from(sections)
    .innerJoin(lessons, eq(lessons.sectionId, sections.id))
    .innerJoin(objectives, eq(objectives.id, sections.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(eq(domains.certificationId, certId));

  const questionRows = await db
    .select({ id: questions.id, question: questions.question, explanation: questions.explanation, difficulty: questions.difficulty, type: questions.type, probeOnly: questions.probeOnly, answerFormat: questions.answerFormat, answerData: questions.answerData })
    .from(questions)
    .innerJoin(objectives, eq(objectives.id, questions.objectiveId))
    .innerJoin(domains, eq(domains.id, objectives.domainId))
    .where(and(eq(domains.certificationId, certId), eq(questions.stale, false)));
  const ids = questionRows.map((q) => q.id);
  const [optionRows, variantRows] = ids.length
    ? await Promise.all([
        db.select({ questionId: questionOptions.questionId, id: questionOptions.id, orderNum: questionOptions.orderNum, text: questionOptions.text, isCorrect: questionOptions.isCorrect, rationale: questionOptions.rationale }).from(questionOptions).where(inArray(questionOptions.questionId, ids)).orderBy(asc(questionOptions.orderNum)),
        db.select({ itemId: itemVariants.itemId, questionId: itemVariants.questionId, active: itemVariants.active }).from(itemVariants).where(inArray(itemVariants.questionId, ids)),
      ])
    : [[], []];

  const result: CourseFingerprints = { sections: {}, questions: {} };
  for (const s of sectionRows) {
    const { id, ...snapshot } = s;
    result.sections[id] = fingerprint(normalizeSection(snapshot as SectionSnapshot));
  }
  for (const q of questionRows) {
    // Varianten (probe_only) zählen nur, wenn sie aktiv einem Item zugeordnet sind; ihre Zuordnung steckt im Fingerabdruck.
    const link = variantRows.find((v) => v.questionId === q.id && v.itemId !== q.id);
    if (q.probeOnly && !(link && link.active)) continue;
    const snapshot: QuestionSnapshot = {
      question: q.question,
      explanation: q.explanation,
      difficulty: q.difficulty as QuestionSnapshot["difficulty"],
      type: q.type as QuestionSnapshot["type"],
      options: optionRows.filter((o) => o.questionId === q.id).map((o) => ({ id: o.id, orderNum: o.orderNum, text: o.text, isCorrect: o.isCorrect, rationale: o.rationale })),
      // Wie im Editor: nur die neuen Formate tragen Format und Lösungsdaten (Auswahlfragen behalten ihren Fingerabdruck).
      ...(q.answerFormat !== "choice" ? { format: q.answerFormat, answerData: q.answerData ?? undefined } : {}),
    };
    result.questions[q.id] = fingerprint(link ? ({ ...snapshot, variantOf: link.itemId } as never) : snapshot);
  }
  return result;
}

export interface ApprovalEntry {
  id: string;
  kind: CourseApprovalKind;
  reviewerDisplayName: string;
  reviewerUserId: string | null;
  versionLabel: string;
  approvedAt: Date;
  note: string | null;
}

export type ApprovalState = "none" | "current" | "changed";

export interface ApprovalStatus {
  state: ApprovalState;
  /** Letzte Freigabe bzw. Übernahme eines Altbestands (Name, Version, Datum für das Siegel). */
  approval: ApprovalEntry | null;
  /** Letzter Bezugsstand für die Änderungserkennung (Freigabe oder redaktionelle Übernahme). */
  baselineAt: Date | null;
  changeCount: number;
  diff: FingerprintDiff | null;
}

const toEntry = (r: typeof courseApprovals.$inferSelect): ApprovalEntry => ({
  id: r.id,
  kind: r.kind,
  reviewerDisplayName: r.reviewerDisplayName,
  reviewerUserId: r.reviewerUserId,
  versionLabel: r.versionLabel,
  approvedAt: r.approvedAt,
  note: r.note,
});

async function latestRows(certId: string) {
  return getDb().select().from(courseApprovals).where(eq(courseApprovals.certificationId, certId)).orderBy(desc(courseApprovals.approvedAt), desc(courseApprovals.id));
}

/**
 * Altbestand: Kurse, die vor dieser Funktion mit Name und Datum freigegeben wurden, bekommen einen `legacy`-Eintrag (Hash zum
 * Zeitpunkt der Übernahme). Idempotent; wird beim ersten Lesen des Status und per `npm run approvals:backfill` ausgeführt.
 */
export async function ensureLegacyApproval(certId: string): Promise<boolean> {
  const db = getDb();
  const [cert] = await db
    .select({ kind: certifications.kind, status: certifications.catalogStatus, name: certifications.approvedByName, at: certifications.approvedAt })
    .from(certifications)
    .where(eq(certifications.id, certId))
    .limit(1);
  if (!cert || cert.kind !== "general" || cert.status !== "approved" || !cert.name || !cert.at) return false;
  const existing = await db.select({ id: courseApprovals.id }).from(courseApprovals).where(eq(courseApprovals.certificationId, certId)).limit(1);
  if (existing.length > 0) return false;
  const fingerprints = await computeCourseFingerprints(certId, db);
  const inserted = await db
    .insert(courseApprovals)
    .values({ certificationId: certId, kind: "legacy", reviewerDisplayName: cert.name, contentHash: contentHash(fingerprints), fingerprints, versionLabel: "1.0", approvedAt: cert.at, note: "Übernommen aus der früheren Freigabe (Name und Datum)." })
    .onConflictDoNothing()
    .returning({ id: courseApprovals.id });
  return inserted.length > 0;
}

/** Stand der Freigabe: keine, aktuell oder „geändert seit Prüfung“ mit Diff. Nur allgemeine, derzeit freigegebene Kurse haben einen. */
export async function getApprovalStatus(certId: string): Promise<ApprovalStatus> {
  const none: ApprovalStatus = { state: "none", approval: null, baselineAt: null, changeCount: 0, diff: null };
  const [cert] = await getDb().select({ kind: certifications.kind, status: certifications.catalogStatus }).from(certifications).where(eq(certifications.id, certId)).limit(1);
  if (!cert || cert.kind !== "general" || cert.status !== "approved") return none;
  await ensureLegacyApproval(certId);
  const rows = await latestRows(certId);
  const baseline = rows[0];
  const approval = rows.find((r) => r.kind !== "editorial");
  if (!baseline || !approval) return none;
  const diff = diffFingerprints(baseline.fingerprints, await computeCourseFingerprints(certId));
  const changeCount = countChanges(diff);
  return { state: changeCount > 0 ? "changed" : "current", approval: toEntry(approval), baselineAt: baseline.approvedAt, changeCount, diff: changeCount > 0 ? diff : null };
}

/** Protokoll aller Freigaben und redaktionellen Übernahmen, neueste zuerst. */
export async function listApprovals(certId: string): Promise<ApprovalEntry[]> {
  return (await latestRows(certId)).map(toEntry);
}

async function requireGeneralCourse(certId: string) {
  const [cert] = await getDb().select({ kind: certifications.kind }).from(certifications).where(eq(certifications.id, certId)).limit(1);
  if (!cert || cert.kind !== "general") throw new ApprovalNotFoundError();
}

/**
 * Freigabe durch einen Menschen: speichert Hash und Fingerabdrücke des aktuellen Stands und setzt den Kurs auf „freigegeben“.
 * Ohne ausdrückliche Bestätigung („Ich habe die Inhalte dieser Version fachlich geprüft.“) nicht möglich. Die früheren Felder
 * `approvedByName`/`approvedAt` am Kurs werden mitgeführt (Lesezugriff für Bestandscode).
 */
export async function approveCourse(input: {
  certificationId: string;
  reviewer: { userId: string | null; displayName: string };
  confirmed: boolean;
  recordedByUserId: string | null;
  note?: string | null;
  now?: Date;
}): Promise<ApprovalEntry> {
  const name = input.reviewer.displayName.trim();
  if (!input.confirmed || name.length < 2 || name.length > 120) throw new ApprovalInvalidError();
  await requireGeneralCourse(input.certificationId);
  const db = getDb();
  const now = input.now ?? new Date();
  const fingerprints = await computeCourseFingerprints(input.certificationId, db);
  const rows = await latestRows(input.certificationId);
  const previous = rows.find((r) => r.kind !== "editorial");
  const entry = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(courseApprovals)
      .values({
        certificationId: input.certificationId,
        kind: "approval",
        reviewerUserId: input.reviewer.userId,
        reviewerDisplayName: name,
        recordedByUserId: input.recordedByUserId,
        contentHash: contentHash(fingerprints),
        fingerprints,
        versionLabel: nextVersionLabel(previous?.versionLabel ?? null, "approval"),
        approvedAt: now,
        note: input.note?.trim() || null,
      })
      .returning();
    await tx.update(certifications).set({ catalogStatus: "approved", approvedByName: name, approvedAt: now }).where(eq(certifications.id, input.certificationId));
    return row;
  });
  await recordAuditEvent({
    actorUserId: input.recordedByUserId,
    action: "course.approved",
    targetType: "certification",
    targetId: input.certificationId,
    metadata: { version: entry.versionLabel, reviewer: name, contentHash: entry.contentHash },
  }).catch((error) => console.error("Audit-Log fehlgeschlagen:", error));
  // Zweitprüfung als Stichprobe: ein Fehler hier darf die Freigabe nie rückgängig machen oder aufhalten.
  await createSecondReviewSample(entry.id).catch((error) => console.error("Zweitprüfung konnte nicht angelegt werden:", error));
  return toEntry(entry);
}

/**
 * Admin übernimmt die Änderungen seit der letzten Freigabe als „redaktionell“ (Tippfehler, Formatierung): der Hinweis „geändert seit
 * Prüfung“ verschwindet, Prüfer und Datum der Freigabe bleiben, im Protokoll steht eine Notiz (Pflicht) und die Nebenversion zählt hoch.
 */
export async function markEditorial(input: { certificationId: string; adminUserId: string; note: string; now?: Date }): Promise<ApprovalEntry> {
  const note = input.note.trim();
  if (note.length < 3 || note.length > 500) throw new ApprovalInvalidError();
  await requireGeneralCourse(input.certificationId);
  const rows = await latestRows(input.certificationId);
  const baseline = rows[0];
  const approval = rows.find((r) => r.kind !== "editorial");
  if (!baseline || !approval) throw new ApprovalInvalidError(); // ohne Freigabe gibt es nichts zu übernehmen
  const fingerprints = await computeCourseFingerprints(input.certificationId);
  const changes = countChanges(diffFingerprints(baseline.fingerprints, fingerprints));
  if (changes === 0) throw new ApprovalInvalidError();
  const [row] = await getDb()
    .insert(courseApprovals)
    .values({
      certificationId: input.certificationId,
      kind: "editorial",
      reviewerUserId: approval.reviewerUserId,
      reviewerDisplayName: approval.reviewerDisplayName,
      recordedByUserId: input.adminUserId,
      contentHash: contentHash(fingerprints),
      fingerprints,
      versionLabel: nextVersionLabel(baseline.versionLabel, "editorial"),
      approvedAt: input.now ?? new Date(),
      note: `Redaktionell (${changes} ${changes === 1 ? "Änderung" : "Änderungen"}): ${note}`,
    })
    .returning();
  await recordAuditEvent({
    actorUserId: input.adminUserId,
    action: "course.editorial_change_accepted",
    targetType: "certification",
    targetId: input.certificationId,
    metadata: { changes, note, version: row.versionLabel },
  }).catch((error) => console.error("Audit-Log fehlgeschlagen:", error));
  return toEntry(row);
}

/** Bezeichnungen der geänderten Abschnitte und Fragen für die Anzeige (Titel bzw. Anfang der Frage). */
export async function describeChanges(diff: FingerprintDiff): Promise<{ sections: Array<{ id: string; label: string; change: "added" | "removed" | "changed" }>; questions: Array<{ id: string; label: string; change: "added" | "removed" | "changed" }> }> {
  const db = getDb();
  const sectionIds = [...diff.sections.added, ...diff.sections.removed, ...diff.sections.changed];
  const questionIds = [...diff.questions.added, ...diff.questions.removed, ...diff.questions.changed];
  const [s, q] = await Promise.all([
    sectionIds.length ? db.select({ id: sections.id, title: sections.title }).from(sections).where(inArray(sections.id, sectionIds)) : [],
    questionIds.length ? db.select({ id: questions.id, question: questions.question }).from(questions).where(inArray(questions.id, questionIds)) : [],
  ]);
  const label = (list: Array<{ id: string; text: string }>, id: string) => list.find((x) => x.id === id)?.text ?? "(entfernt)";
  const sl = s.map((x) => ({ id: x.id, text: x.title.de }));
  const ql = q.map((x) => ({ id: x.id, text: x.question.de.length > 90 ? `${x.question.de.slice(0, 90)}…` : x.question.de }));
  const tag = (ids: string[], change: "added" | "removed" | "changed", list: typeof sl) => ids.map((id) => ({ id, label: label(list, id), change }));
  return {
    sections: [...tag(diff.sections.changed, "changed", sl), ...tag(diff.sections.added, "added", sl), ...tag(diff.sections.removed, "removed", sl)],
    questions: [...tag(diff.questions.changed, "changed", ql), ...tag(diff.questions.added, "added", ql), ...tag(diff.questions.removed, "removed", ql)],
  };
}


/**
 * Sicht eines Prüfers auf die Freigabe: Stand des Kurses und der Diff seit SEINER letzten Freigabe (bei der ersten Prüfung gibt es keinen,
 * dann ist der ganze Kurs zu prüfen). Neufreigabe zeigt so nur, was seit seiner letzten Prüfung dazugekommen ist.
 */
export async function getReviewerApprovalView(certId: string, reviewerUserId: string): Promise<{ status: ApprovalStatus; ownLastApprovalAt: Date | null; diffSinceOwn: FingerprintDiff | null; changesSinceOwn: number }> {
  const status = await getApprovalStatus(certId);
  const own = (await latestRows(certId)).find((r) => r.kind === "approval" && r.reviewerUserId === reviewerUserId);
  if (!own) return { status, ownLastApprovalAt: null, diffSinceOwn: null, changesSinceOwn: 0 };
  const diff = diffFingerprints(own.fingerprints, await computeCourseFingerprints(certId));
  return { status, ownLastApprovalAt: own.approvedAt, diffSinceOwn: diff, changesSinceOwn: countChanges(diff) };
}
