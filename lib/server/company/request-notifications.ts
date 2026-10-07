import { and, eq, isNotNull } from "drizzle-orm";
import { REQUEST_STATUS_LABELS } from "@/lib/course-requests";
import { getDb } from "@/lib/server/db/client";
import { certifications, courseRequests, organizationMemberships, organizations, users } from "@/lib/server/db/schema";
import { appUrl, getMailConfig } from "@/lib/server/mail/config";
import { sendMail } from "@/lib/server/mail/mailer";
import { courseRequestStatusMessage, newCourseRequestMessage } from "@/lib/server/mail/templates";

/**
 * E-Mail-Benachrichtigungen zu Kundenanfragen: der Betreiber bei einer neuen Anfrage, die Firma bei jeder
 * Statusänderung (Freigabe, Ablehnung, Rückfrage, entzogene Freigabe). Die Mails sind ein Hinweis, nie die einzige
 * Quelle: Ohne eingerichteten Versand oder bei einem Fehler passiert nichts weiter, die Aktion selbst ist immer
 * schon gespeichert. Aufrufer starten sie nach dem Speichern und warten nicht darauf (`void …`).
 */

function logFailure(err: unknown) {
  console.error("Benachrichtigung zu Anfrage fehlgeschlagen:", err);
}

async function requestRow(requestId: string) {
  const [row] = await getDb()
    .select({
      organizationId: courseRequests.organizationId,
      organizationName: organizations.name,
      requestedByUserId: courseRequests.requestedByUserId,
      requesterName: users.name,
      requesterEmail: users.email,
      status: courseRequests.status,
      statusNote: courseRequests.statusNote,
      wishTitle: courseRequests.wishTitle,
      courseName: certifications.name,
    })
    .from(courseRequests)
    .innerJoin(organizations, eq(organizations.id, courseRequests.organizationId))
    .leftJoin(users, eq(users.id, courseRequests.requestedByUserId))
    .leftJoin(certifications, eq(certifications.id, courseRequests.certificationId))
    .where(eq(courseRequests.id, requestId))
    .limit(1);
  return row ?? null;
}

/** Betreiber (Plattform-Admins) erfahren von einer neuen Anfrage. */
export async function notifyOperatorsNewRequest(requestId: string): Promise<void> {
  try {
    const config = getMailConfig();
    if (!config) return;
    const row = await requestRow(requestId);
    if (!row) return;
    const operators = await getDb().select({ email: users.email }).from(users).where(and(eq(users.role, "admin"), isNotNull(users.emailVerifiedAt)));
    const link = appUrl("/admin/requests", config);
    await Promise.all(
      operators.map((op) =>
        sendMail(
          newCourseRequestMessage(op.email, {
            organizationName: row.organizationName,
            requester: row.requesterName ?? row.requesterEmail ?? "unbekannt",
            title: row.courseName ?? row.wishTitle ?? "(ohne Titel)",
            wish: row.courseName === null,
            link,
          }),
        ),
      ),
    );
  } catch (err) {
    logFailure(err);
  }
}

/** Empfänger in der Firma: wer angefragt hat, und alle Firmen-Admins (ohne Dubletten). */
async function companyRecipients(organizationId: string, requestedByUserId: string | null): Promise<string[]> {
  const admins = await getDb()
    .select({ email: users.email })
    .from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .where(and(eq(organizationMemberships.organizationId, organizationId), eq(organizationMemberships.role, "company_admin")));
  const emails = new Set(admins.map((a) => a.email));
  if (requestedByUserId) {
    const [requester] = await getDb()
      .select({ email: users.email })
      .from(organizationMemberships)
      .innerJoin(users, eq(users.id, organizationMemberships.userId))
      // nur, wenn die Person noch zur Firma gehört
      .where(and(eq(organizationMemberships.organizationId, organizationId), eq(organizationMemberships.userId, requestedByUserId)))
      .limit(1);
    if (requester) emails.add(requester.email);
  }
  return [...emails];
}

/** Die Firma erfährt vom aktuellen Stand ihrer Anfrage (nach Stand setzen, Freigabe, Ablehnung, Entzug). */
export async function notifyCompanyRequestStatus(requestId: string): Promise<void> {
  try {
    const config = getMailConfig();
    if (!config) return;
    const row = await requestRow(requestId);
    if (!row) return;
    const link = appUrl("/company", config);
    const recipients = await companyRecipients(row.organizationId, row.requestedByUserId);
    await Promise.all(
      recipients.map((to) =>
        sendMail(
          courseRequestStatusMessage(to, {
            title: row.courseName ?? row.wishTitle ?? "Anfrage",
            statusLabel: REQUEST_STATUS_LABELS[row.status].de,
            note: row.statusNote,
            link,
          }),
        ),
      ),
    );
  } catch (err) {
    logFailure(err);
  }
}

/** Die Firma erfährt, dass eine Freigabe entzogen wurde (auch wenn keine Anfrage mehr dazu offen steht). */
export async function notifyCompanyEntitlementRevoked(organizationId: string, courseName: string, note: string | null): Promise<void> {
  try {
    const config = getMailConfig();
    if (!config) return;
    const link = appUrl("/company", config);
    const recipients = await companyRecipients(organizationId, null);
    await Promise.all(
      recipients.map((to) =>
        sendMail(courseRequestStatusMessage(to, { title: courseName, statusLabel: REQUEST_STATUS_LABELS.revoked.de, note, link })),
      ),
    );
  } catch (err) {
    logFailure(err);
  }
}
