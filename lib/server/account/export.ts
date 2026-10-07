import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/server/db/client";
import {
  auditEvents,
  companyAssignments,
  companyInvitations,
  contentReports,
  examAnswers,
  examAttempts,
  objectiveProgress,
  lessonCompletions,
  organizationMemberships,
  organizations,
  practiceTaskSubmissions,
  practiceTasks,
  quizAnswers,
  quizAttempts,
  remediationSessions,
  reviewItems,
  sessionRecommendationFeedback,
  studyProfiles,
  studySessionItems,
  studySessions,
  syncEvents,
  users,
} from "@/lib/server/db/schema";

/**
 * Datenexport (Auskunft/Portabilität). Welche Spalten mit Fremdschlüssel auf users im Export
 * stehen, ist HIER festgehalten; ein Test gleicht das mit dem Schema ab: eine neue Tabelle mit
 * Verweis auf users zwingt zu der Entscheidung „exportieren oder begründet ausnehmen“.
 * Schlüssel: "<tabelle>.<spalte>".
 */
export const EXPORTED_USER_REFERENCES: readonly string[] = [
  "organization_memberships.user_id",
  "lesson_completions.user_id",
  "quiz_attempts.user_id",
  "objective_progress.user_id",
  "remediation_sessions.user_id",
  "review_items.user_id",
  "study_profiles.user_id",
  "study_sessions.user_id",
  "exam_attempts.user_id",
  "sync_events.user_id",
  "session_recommendation_feedback.user_id",
  "audit_events.actor_user_id",
  "content_reports.reporter_user_id",
  "company_invitations.accepted_by_user_id",
];

const OPERATIONAL_REASON =
  "Betriebsdaten der Plattform (Verwaltungsvorgang), kein persönliches Lernprofil; bei Kontolöschung anonymisiert (SET NULL)";

export const EXCLUDED_USER_REFERENCES: Readonly<Record<string, string>> = {
  "account_tokens.user_id":
    "Sicherheits-Token (nur Hash, kein Inhalt) für Bestätigung und Reset; wird mit dem Konto gelöscht (CASCADE)",
  "company_claims.user_id":
    "Offene Firmen-Anfrage (Name, Firmen-E-Mail, nur Token-Hash); befristet, wird mit dem Konto gelöscht (CASCADE)",
  "blueprint_drafts.generated_by_user_id": OPERATIONAL_REASON,
  "blueprint_drafts.edited_by_user_id": OPERATIONAL_REASON,
  "certification_sources.approved_by": OPERATIONAL_REASON,
  "company_modules.responsible_user_id": "Zuordnung der Firma (wer ein Modul betreut), nicht persönliche Lerndaten; der Verweis wird bei Löschung anonymisiert (SET NULL)",
  "company_modules.created_by_user_id": "Das Modul gehört der Firma, nicht der Person; der Verweis wird bei Löschung anonymisiert (SET NULL)",
  "onboarding_plans.mentor_user_id": "Zuordnung der Firma (wer einen Plan begleitet), nicht persönliche Lerndaten; bei Löschung anonymisiert (SET NULL)",
  "onboarding_plans.created_by_user_id": "Der Plan gehört der Firma, nicht der Person; der Verweis wird bei Löschung anonymisiert (SET NULL)",
  "onboardings.status_by_user_id": "Betrifft die onboardete Person; der Verweis auf die setzende Person wird bei Löschung anonymisiert (SET NULL)",
  "practice_tasks.created_by_user_id": "Die Aufgabe gehört der Firma, nicht der Person; der Verweis wird bei Löschung anonymisiert (SET NULL)",
  "practice_task_submissions.reviewed_by_user_id": "Bestätigung betrifft die abgebende Person (steht in deren Export); der Verweis auf die prüfende Person wird bei Löschung anonymisiert (SET NULL)",
  "company_assignments.assigned_by_user_id": "Zuweisung betrifft die zugewiesene Person, nicht die zuweisende; bei Löschung anonymisiert",
  "company_course_entitlements.released_by_user_id": OPERATIONAL_REASON,
  "course_request_events.actor_user_id": "Verlauf einer Firmenanfrage (Bearbeiter oder Anfragender); gehört der Firma, bei Löschung anonymisiert (SET NULL)",
  "course_requests.requested_by_user_id": "Die Anfrage gehört der Firma, nicht der Person; der Verweis wird bei Löschung anonymisiert (SET NULL)",
  "organization_ai_settings.updated_by_user_id": "Einstellung der Firma; der Verweis auf die änderende Person wird bei Löschung anonymisiert (SET NULL)",
  "company_documents.scanner_suppressed_by_user_id": "Das Dokument gehört der Firma; der Verweis auf den bestätigenden Firmen-Admin wird bei Löschung anonymisiert (SET NULL)",
  "company_documents.uploaded_by_user_id": "Das Dokument gehört der Firma, nicht der Person; der Uploader-Verweis wird bei Löschung anonymisiert (SET NULL)",
  "company_document_images.attested_by_user_id": "Das Bild gehört der Firma, nicht der Person; der Verweis auf die bestätigende Person wird bei Löschung anonymisiert (SET NULL)",
  "company_invitations.created_by_user_id": "Einladung betrifft die eingeladene Person; bei Löschung anonymisiert",
  "content_generation_jobs.started_by_user_id": OPERATIONAL_REASON,
  "content_reports.resolved_by_user_id": OPERATIONAL_REASON,
  "course_generation_jobs.requested_by_user_id": OPERATIONAL_REASON,
};

export type AccountExport = Awaited<ReturnType<typeof exportAccountData>>;

/** Alle persönlichen Daten eines Nutzers als JSON-fähiges Objekt. Nie das Passwort-Hash. */
export async function exportAccountData(userId: string) {
  const db = getDb();

  const [account] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      emailVerifiedAt: users.emailVerifiedAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!account) return null;

  const [membership] = await db
    .select({
      organization: organizations.name,
      role: organizationMemberships.role,
      since: organizationMemberships.createdAt,
    })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(eq(organizationMemberships.userId, userId))
    .limit(1);

  const assignments = await db
    .select({
      learningPathId: companyAssignments.certificationId,
      status: companyAssignments.status,
      assignedAt: companyAssignments.assignedAt,
      dueAt: companyAssignments.dueAt,
      completedAt: companyAssignments.completedAt,
    })
    .from(companyAssignments)
    .where(eq(companyAssignments.userId, userId));

  // Eigene Abgaben zu Praxisaufgaben samt Bestätigung (Nachweise gehören der Person).
  const practiceSubmissions = await db
    .select({
      task: practiceTasks.title,
      status: practiceTaskSubmissions.status,
      note: practiceTaskSubmissions.learnerNote,
      submittedAt: practiceTaskSubmissions.submittedAt,
      reviewedAt: practiceTaskSubmissions.reviewedAt,
      reviewerNote: practiceTaskSubmissions.reviewerNote,
    })
    .from(practiceTaskSubmissions)
    .innerJoin(practiceTasks, eq(practiceTasks.id, practiceTaskSubmissions.taskId))
    .where(eq(practiceTaskSubmissions.userId, userId));

  const acceptedInvitations = await db
    .select({
      role: companyInvitations.role,
      createdAt: companyInvitations.createdAt,
      acceptedAt: companyInvitations.acceptedAt,
    })
    .from(companyInvitations)
    .where(eq(companyInvitations.acceptedByUserId, userId));

  const quizAttemptRows = await db.select().from(quizAttempts).where(eq(quizAttempts.userId, userId));
  const quizAnswerRows = quizAttemptRows.length
    ? await db
        .select()
        .from(quizAnswers)
        .where(inArray(quizAnswers.quizAttemptId, quizAttemptRows.map((r) => r.id)))
    : [];

  const examAttemptRows = await db.select().from(examAttempts).where(eq(examAttempts.userId, userId));
  const examAnswerRows = examAttemptRows.length
    ? await db
        .select()
        .from(examAnswers)
        .where(inArray(examAnswers.examAttemptId, examAttemptRows.map((r) => r.id)))
    : [];

  const studySessionRows = await db.select().from(studySessions).where(eq(studySessions.userId, userId));
  const studyItemRows = studySessionRows.length
    ? await db
        .select()
        .from(studySessionItems)
        .where(inArray(studySessionItems.sessionId, studySessionRows.map((r) => r.id)))
    : [];

  return {
    format: "learning-export-v1",
    exportedAt: new Date().toISOString(),
    account,
    company: { membership: membership ?? null, assignments, practiceSubmissions, acceptedInvitations },
    learning: {
      quizAttempts: quizAttemptRows.map((attempt) => ({
        ...attempt,
        answers: quizAnswerRows.filter((a) => a.quizAttemptId === attempt.id),
      })),
      examAttempts: examAttemptRows.map((attempt) => ({
        ...attempt,
        answers: examAnswerRows.filter((a) => a.examAttemptId === attempt.id),
      })),
      lessonCompletions: await db.select().from(lessonCompletions).where(eq(lessonCompletions.userId, userId)),
      objectiveProgress: await db.select().from(objectiveProgress).where(eq(objectiveProgress.userId, userId)),
      remediationSessions: await db.select().from(remediationSessions).where(eq(remediationSessions.userId, userId)),
      reviewItems: await db.select().from(reviewItems).where(eq(reviewItems.userId, userId)),
      studyProfiles: await db.select().from(studyProfiles).where(eq(studyProfiles.userId, userId)),
      studySessions: studySessionRows.map((session) => ({
        ...session,
        items: studyItemRows.filter((i) => i.sessionId === session.id),
      })),
      sessionRecommendationFeedback: await db
        .select()
        .from(sessionRecommendationFeedback)
        .where(eq(sessionRecommendationFeedback.userId, userId)),
    },
    activity: {
      syncEvents: await db.select().from(syncEvents).where(eq(syncEvents.userId, userId)),
      auditEventsAsActor: await db.select().from(auditEvents).where(eq(auditEvents.actorUserId, userId)),
      contentReports: await db.select().from(contentReports).where(eq(contentReports.reporterUserId, userId)),
    },
  };
}
