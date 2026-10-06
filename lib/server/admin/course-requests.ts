import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { getDb } from "@/lib/server/db/client";
import {
  certifications,
  companyCourseEntitlements,
  courseRequestEvents,
  courseRequests,
  organizations,
  users,
  type CatalogStatus,
  type CourseKind,
  type CourseRequestStatus,
} from "@/lib/server/db/schema";
import { SETTABLE_REQUEST_STATUSES } from "@/lib/course-requests";

/**
 * Betreiberseite der Kundenanfragen (nur Plattform-Admins, siehe requireAdminApi): Anfragen aller Firmen
 * sehen, Stand und Hinweis setzen, vorhandene Lernpfade freigeben und den Prüfstatus der Lernpfade pflegen.
 * „Freigegeben“ gibt es nur über releaseRequest(), und nur für einen Lernpfad, den eine Person fachlich
 * geprüft hat (catalog_status = approved, mit Name und Datum).
 */

export class RequestNotFoundError extends Error {}
export class CourseNotFoundError extends Error {}
export class InvalidStatusChangeError extends Error {}
export class NoCourseError extends Error {}
export class CourseNotReleasableError extends Error {}
export class InvalidApprovalError extends Error {}

function logAuditFailure(err: unknown) {
  console.error("Audit-Log fehlgeschlagen:", err);
}

const OPEN_STATUSES: CourseRequestStatus[] = ["submitted", "on_hold", "in_creation", "in_review"];
const MAX_NOTE = 500;

export type AdminRequestRow = {
  id: string;
  organizationId: string;
  organizationName: string;
  requesterName: string | null;
  requesterEmail: string | null;
  status: CourseRequestStatus;
  statusNote: string | null;
  wishTitle: string | null;
  wishDescription: string | null;
  certificationId: string | null;
  courseName: string | null;
  courseCatalogStatus: CatalogStatus | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Alle Anfragen, offene zuerst, dann nach Eingang. */
export async function listAllCourseRequests(): Promise<AdminRequestRow[]> {
  return getDb()
    .select({
      id: courseRequests.id,
      organizationId: courseRequests.organizationId,
      organizationName: organizations.name,
      requesterName: users.name,
      requesterEmail: users.email,
      status: courseRequests.status,
      statusNote: courseRequests.statusNote,
      wishTitle: courseRequests.wishTitle,
      wishDescription: courseRequests.wishDescription,
      certificationId: courseRequests.certificationId,
      courseName: certifications.name,
      courseCatalogStatus: certifications.catalogStatus,
      createdAt: courseRequests.createdAt,
      updatedAt: courseRequests.updatedAt,
    })
    .from(courseRequests)
    .innerJoin(organizations, eq(organizations.id, courseRequests.organizationId))
    .leftJoin(users, eq(users.id, courseRequests.requestedByUserId))
    .leftJoin(certifications, eq(certifications.id, courseRequests.certificationId))
    .orderBy(
      sql`case when ${courseRequests.status} in ('released', 'rejected') then 1 else 0 end`,
      desc(courseRequests.createdAt),
      asc(organizations.name),
    );
}

export type CatalogRow = {
  id: string;
  name: string;
  slug: string;
  kind: CourseKind;
  ownerOrganizationName: string | null;
  catalogStatus: CatalogStatus;
  approvedByName: string | null;
  approvedAt: Date | null;
};

export async function listCatalog(): Promise<CatalogRow[]> {
  return getDb()
    .select({
      id: certifications.id,
      name: certifications.name,
      slug: certifications.slug,
      kind: certifications.kind,
      ownerOrganizationName: organizations.name,
      catalogStatus: certifications.catalogStatus,
      approvedByName: certifications.approvedByName,
      approvedAt: certifications.approvedAt,
    })
    .from(certifications)
    .leftJoin(organizations, eq(organizations.id, certifications.ownerOrganizationId))
    .orderBy(asc(certifications.name));
}

function cleanNote(note: string | null | undefined): string | null {
  const trimmed = note?.trim() ?? "";
  if (trimmed.length > MAX_NOTE) throw new InvalidStatusChangeError();
  return trimmed || null;
}

/** Setzt Stand und Hinweis einer Anfrage. „Freigegeben“ ist hier nicht möglich (siehe releaseRequest). */
export async function setRequestStatus(input: {
  requestId: string;
  status: CourseRequestStatus;
  note: string | null;
  actorUserId: string;
}): Promise<void> {
  if (!SETTABLE_REQUEST_STATUSES.includes(input.status)) throw new InvalidStatusChangeError();
  const note = cleanNote(input.note);
  if (input.status === "rejected" && (note?.length ?? 0) < 3) throw new InvalidStatusChangeError();

  await getDb().transaction(async (tx) => {
    const [current] = await tx
      .select({ status: courseRequests.status })
      .from(courseRequests)
      .where(eq(courseRequests.id, input.requestId))
      .for("update")
      .limit(1);
    if (!current) throw new RequestNotFoundError();
    if (current.status === "released") throw new InvalidStatusChangeError(); // freigegeben ist endgültig
    await tx
      .update(courseRequests)
      .set({ status: input.status, statusNote: note, updatedAt: new Date() })
      .where(eq(courseRequests.id, input.requestId));
    await tx.insert(courseRequestEvents).values({ requestId: input.requestId, status: input.status, note, actorUserId: input.actorUserId });
  });
  await recordAuditEvent({
    actorUserId: input.actorUserId,
    action: "course_request.status_changed",
    targetType: "course_request",
    targetId: input.requestId,
    metadata: { status: input.status },
  }).catch(logAuditFailure);
}

/**
 * Gibt den Lernpfad für die anfragende Firma frei. Der Lernpfad kommt aus der Anfrage oder wird hier
 * angegeben (z. B. nach der Erstellung bei einem freien Wunsch). Er muss allgemein und fachlich freigegeben sein.
 */
export async function releaseRequest(input: {
  requestId: string;
  certificationId?: string | null;
  note?: string | null;
  actorUserId: string;
}): Promise<{ organizationId: string; certificationId: string }> {
  const note = cleanNote(input.note) ?? "Freigegeben";
  const result = await getDb().transaction(async (tx) => {
    const [request] = await tx
      .select({ organizationId: courseRequests.organizationId, certificationId: courseRequests.certificationId, status: courseRequests.status })
      .from(courseRequests)
      .where(eq(courseRequests.id, input.requestId))
      .for("update")
      .limit(1);
    if (!request) throw new RequestNotFoundError();
    if (request.status === "released") throw new InvalidStatusChangeError();

    const certificationId = input.certificationId ?? request.certificationId;
    if (!certificationId) throw new NoCourseError();
    const [course] = await tx
      .select({ id: certifications.id, kind: certifications.kind, catalogStatus: certifications.catalogStatus })
      .from(certifications)
      .where(eq(certifications.id, certificationId))
      .limit(1);
    if (!course) throw new CourseNotFoundError();
    if (course.kind !== "general" || course.catalogStatus !== "approved") throw new CourseNotReleasableError();

    await tx
      .insert(companyCourseEntitlements)
      .values({ organizationId: request.organizationId, certificationId, releasedByUserId: input.actorUserId, requestId: input.requestId })
      .onConflictDoNothing();
    await tx
      .update(courseRequests)
      .set({ status: "released", statusNote: note, certificationId, updatedAt: new Date() })
      .where(eq(courseRequests.id, input.requestId));
    await tx.insert(courseRequestEvents).values({ requestId: input.requestId, status: "released", note, actorUserId: input.actorUserId });
    return { organizationId: request.organizationId, certificationId };
  });
  await recordAuditEvent({
    actorUserId: input.actorUserId,
    action: "course_request.released",
    targetType: "course_request",
    targetId: input.requestId,
    metadata: { organizationId: result.organizationId, certificationId: result.certificationId },
  }).catch(logAuditFailure);
  return result;
}

/**
 * Setzt den Prüfstatus eines Lernpfads. „approved“ verlangt den Namen der prüfenden Person (auch extern, ohne
 * Konto) und speichert das Datum; jede andere Stufe entzieht die Freigabe. Bereits erteilte Firmenfreigaben
 * und Zuweisungen bleiben bestehen, der Lernpfad ist aber nicht mehr zuweisbar, bis er wieder freigegeben ist.
 */
export async function setCatalogStatus(input: {
  certificationId: string;
  status: CatalogStatus;
  approvedByName?: string | null;
  actorUserId: string;
}): Promise<void> {
  const name = input.approvedByName?.trim() ?? "";
  if (input.status === "approved" && (name.length < 2 || name.length > 120)) throw new InvalidApprovalError();

  const [row] = await getDb()
    .update(certifications)
    .set(
      input.status === "approved"
        ? { catalogStatus: "approved", approvedByName: name, approvedAt: new Date() }
        : { catalogStatus: input.status, approvedByName: null, approvedAt: null },
    )
    .where(eq(certifications.id, input.certificationId))
    .returning({ id: certifications.id });
  if (!row) throw new CourseNotFoundError();
  await recordAuditEvent({
    actorUserId: input.actorUserId,
    action: "certification.catalog_status_changed",
    targetType: "certification",
    targetId: input.certificationId,
    metadata: { status: input.status, approvedByName: input.status === "approved" ? name : null },
  }).catch(logAuditFailure);
}

// Für Tests und die Admin-Seite: offene Anfragen zählen.
export async function countOpenCourseRequests(): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(courseRequests)
    .where(inArray(courseRequests.status, OPEN_STATUSES));
  return row?.n ?? 0;
}

