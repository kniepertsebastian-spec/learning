import { and, asc, desc, eq, inArray, notInArray } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  companyCourseEntitlements,
  courseRequestEvents,
  courseRequests,
  type CourseRequestStatus,
} from "@/lib/server/db/schema";

/**
 * Anfragen einer Firma nach allgemeinen Lernpfaden. Die Firma wählt einen vorhandenen Lernpfad aus dem Katalog
 * oder beschreibt frei, was sie braucht; wir geben frei oder erstellen den Lernpfad (siehe
 * lib/server/admin/course-requests.ts). Jede Funktion bekommt `organizationId` aus der Mitgliedschaft und
 * filtert immer danach.
 */

export const MAX_WISH_TITLE = 200;
export const MAX_WISH_DESCRIPTION = 2000;

export class UnknownCourseError extends Error {}
export class AlreadyReleasedError extends Error {}
export class DuplicateRequestError extends Error {}
export class InvalidRequestError extends Error {}

function logAuditFailure(err: unknown) {
  console.error("Audit-Log fehlgeschlagen:", err);
}

/** Stati, in denen die Anfrage noch läuft. */
const OPEN_STATUSES: CourseRequestStatus[] = ["submitted", "on_hold", "in_creation", "in_review"];

/** Katalog für die Anfrage: freigegebene allgemeine Lernpfade, die diese Firma noch nicht nutzen darf und nicht schon angefragt hat. */
export async function listRequestableCourses(organizationId: string): Promise<{ id: string; name: string }[]> {
  const db = getDb();
  const [entitled, open] = await Promise.all([
    db.select({ id: companyCourseEntitlements.certificationId }).from(companyCourseEntitlements).where(eq(companyCourseEntitlements.organizationId, organizationId)),
    db
      .select({ id: courseRequests.certificationId })
      .from(courseRequests)
      .where(and(eq(courseRequests.organizationId, organizationId), inArray(courseRequests.status, OPEN_STATUSES))),
  ]);
  const exclude = [...entitled.map((e) => e.id), ...open.map((o) => o.id).filter((id): id is string => id !== null)];
  return db
    .select({ id: certifications.id, name: certifications.name })
    .from(certifications)
    .where(
      and(
        eq(certifications.kind, "general"),
        eq(certifications.catalogStatus, "approved"),
        exclude.length > 0 ? notInArray(certifications.id, exclude) : undefined,
      ),
    )
    .orderBy(asc(certifications.name));
}

export type CourseRequestView = {
  id: string;
  status: CourseRequestStatus;
  statusNote: string | null;
  wishTitle: string | null;
  wishDescription: string | null;
  courseName: string | null;
  createdAt: Date;
  updatedAt: Date;
  events: { status: CourseRequestStatus; note: string | null; createdAt: Date }[];
};

/** Das ist alles, was die Firma über ihre Anfragen sieht: kein Bearbeiter, keine internen Notizen. */
export const COURSE_REQUEST_VIEW_FIELDS = [
  "id", "status", "statusNote", "wishTitle", "wishDescription", "courseName", "createdAt", "updatedAt", "events",
] as const;

export async function listCourseRequests(organizationId: string): Promise<CourseRequestView[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: courseRequests.id,
      status: courseRequests.status,
      statusNote: courseRequests.statusNote,
      wishTitle: courseRequests.wishTitle,
      wishDescription: courseRequests.wishDescription,
      courseName: certifications.name,
      createdAt: courseRequests.createdAt,
      updatedAt: courseRequests.updatedAt,
    })
    .from(courseRequests)
    .leftJoin(certifications, eq(certifications.id, courseRequests.certificationId))
    .where(eq(courseRequests.organizationId, organizationId))
    .orderBy(desc(courseRequests.createdAt));
  if (rows.length === 0) return [];
  const events = await db
    .select({ requestId: courseRequestEvents.requestId, status: courseRequestEvents.status, note: courseRequestEvents.note, createdAt: courseRequestEvents.createdAt })
    .from(courseRequestEvents)
    .where(inArray(courseRequestEvents.requestId, rows.map((r) => r.id)))
    .orderBy(asc(courseRequestEvents.createdAt));
  return rows.map((r) => ({
    ...r,
    events: events.filter((e) => e.requestId === r.id).map((e) => ({ status: e.status, note: e.note, createdAt: e.createdAt })),
  }));
}

export async function createCourseRequest(input: {
  organizationId: string;
  requestedByUserId: string;
  certificationId?: string | null;
  wishTitle?: string | null;
  wishDescription?: string | null;
}): Promise<{ id: string }> {
  const certificationId = input.certificationId || null;
  const wishTitle = input.wishTitle?.trim() || null;
  const wishDescription = input.wishDescription?.trim() || null;
  // Entweder ein Lernpfad aus dem Katalog ODER ein freier Wunsch.
  if ((certificationId === null) === (wishTitle === null)) throw new InvalidRequestError();
  if (wishTitle !== null && (wishTitle.length < 3 || wishTitle.length > MAX_WISH_TITLE)) throw new InvalidRequestError();
  if (wishDescription !== null && wishDescription.length > MAX_WISH_DESCRIPTION) throw new InvalidRequestError();

  const db = getDb();
  const created = await db.transaction(async (tx) => {
    if (certificationId !== null) {
      const [course] = await tx
        .select({ id: certifications.id })
        .from(certifications)
        .where(and(eq(certifications.id, certificationId), eq(certifications.kind, "general"), eq(certifications.catalogStatus, "approved")))
        .limit(1);
      if (!course) throw new UnknownCourseError();
      const [entitled] = await tx
        .select({ id: companyCourseEntitlements.id })
        .from(companyCourseEntitlements)
        .where(and(eq(companyCourseEntitlements.organizationId, input.organizationId), eq(companyCourseEntitlements.certificationId, certificationId)))
        .limit(1);
      if (entitled) throw new AlreadyReleasedError();
      const [open] = await tx
        .select({ id: courseRequests.id })
        .from(courseRequests)
        .where(
          and(
            eq(courseRequests.organizationId, input.organizationId),
            eq(courseRequests.certificationId, certificationId),
            inArray(courseRequests.status, OPEN_STATUSES),
          ),
        )
        .limit(1);
      if (open) throw new DuplicateRequestError();
    }
    const [row] = await tx
      .insert(courseRequests)
      .values({
        organizationId: input.organizationId,
        requestedByUserId: input.requestedByUserId,
        certificationId,
        wishTitle,
        wishDescription,
      })
      .returning({ id: courseRequests.id });
    await tx.insert(courseRequestEvents).values({
      requestId: row.id,
      status: "submitted",
      note: null,
      actorUserId: input.requestedByUserId,
    });
    return row;
  });
  await recordAuditEvent({
    actorUserId: input.requestedByUserId,
    action: "course_request.created",
    targetType: "course_request",
    targetId: created.id,
    metadata: { organizationId: input.organizationId, catalog: certificationId !== null },
  }).catch(logAuditFailure);
  return created;
}

