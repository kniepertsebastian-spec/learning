import { createHash, randomBytes } from "node:crypto";
import { and, asc, eq, gt, isNull } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { getDb } from "@/lib/server/db/client";
import {
  companyInvitations,
  organizationMemberships,
  organizations,
  users,
  type CompanyRole,
} from "@/lib/server/db/schema";
import { normalizeEmail } from "@/lib/server/email";

/** Einladungen sind 7 Tage gültig. */
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const INVITABLE_ROLES: readonly CompanyRole[] = ["company_admin", "mentor", "learner"];

/** Das ist alles, was die Firma über offene Einladungen sieht - nie Token oder Hash. */
export const INVITATION_LIST_FIELDS = ["id", "email", "role", "expiresAt", "createdAt"] as const;

export type PendingInvitation = {
  id: string;
  email: string;
  role: CompanyRole;
  expiresAt: Date;
  createdAt: Date;
};

export type AcceptResult =
  | { ok: true; organizationId: string; organizationName: string; role: CompanyRole }
  | { ok: false; reason: "invalid" | "email_mismatch" | "already_member" };

export class AlreadyInOrganizationError extends Error {}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function logAuditFailure(err: unknown) {
  console.error("Audit-Log fehlgeschlagen:", err);
}

/**
 * Legt eine Einladung an und gibt das Token EINMALIG zurück; gespeichert wird nur
 * der Hash. Eine noch offene Einladung für dieselbe E-Mail in derselben Organisation
 * wird dabei widerrufen (alter Link wird ungültig).
 */
export async function createInvitation(input: {
  organizationId: string;
  createdByUserId: string;
  email: string;
  role: CompanyRole;
  now?: Date;
}): Promise<{ invitation: PendingInvitation; token: string }> {
  const now = input.now ?? new Date();
  const email = normalizeEmail(input.email);
  const token = randomBytes(32).toString("base64url");
  const db = getDb();

  const invitation = await db.transaction(async (tx) => {
    // Ist die Person schon Mitglied DIESER Organisation? (Mitgliedschaft in einer anderen
    // wird bewusst nicht verraten, sie scheitert erst beim Annehmen.)
    const [existingMember] = await tx
      .select({ id: organizationMemberships.id })
      .from(organizationMemberships)
      .innerJoin(users, eq(users.id, organizationMemberships.userId))
      .where(
        and(eq(organizationMemberships.organizationId, input.organizationId), eq(users.email, email)),
      )
      .limit(1);
    if (existingMember) throw new AlreadyInOrganizationError();

    await tx
      .update(companyInvitations)
      .set({ revokedAt: now })
      .where(
        and(
          eq(companyInvitations.organizationId, input.organizationId),
          eq(companyInvitations.email, email),
          isNull(companyInvitations.acceptedAt),
          isNull(companyInvitations.revokedAt),
        ),
      );

    const [row] = await tx
      .insert(companyInvitations)
      .values({
        organizationId: input.organizationId,
        email,
        role: input.role,
        tokenHash: hashInvitationToken(token),
        expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
        createdByUserId: input.createdByUserId,
      })
      .returning({
        id: companyInvitations.id,
        email: companyInvitations.email,
        role: companyInvitations.role,
        expiresAt: companyInvitations.expiresAt,
        createdAt: companyInvitations.createdAt,
      });
    return row;
  });

  await recordAuditEvent({
    actorUserId: input.createdByUserId,
    action: "invitation.created",
    targetType: "invitation",
    targetId: invitation.id,
    metadata: { organizationId: input.organizationId, role: input.role },
  }).catch(logAuditFailure);

  return { invitation, token };
}

export async function listPendingInvitations(
  organizationId: string,
  now: Date = new Date(),
): Promise<PendingInvitation[]> {
  return getDb()
    .select({
      id: companyInvitations.id,
      email: companyInvitations.email,
      role: companyInvitations.role,
      expiresAt: companyInvitations.expiresAt,
      createdAt: companyInvitations.createdAt,
    })
    .from(companyInvitations)
    .where(
      and(
        eq(companyInvitations.organizationId, organizationId),
        isNull(companyInvitations.acceptedAt),
        isNull(companyInvitations.revokedAt),
        gt(companyInvitations.expiresAt, now),
      ),
    )
    .orderBy(asc(companyInvitations.createdAt));
}

/** Widerruft eine offene Einladung der EIGENEN Organisation. false = nicht gefunden/nicht mehr offen. */
export async function revokeInvitation(
  organizationId: string,
  invitationId: string,
  actorUserId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const [row] = await getDb()
    .update(companyInvitations)
    .set({ revokedAt: now })
    .where(
      and(
        eq(companyInvitations.id, invitationId),
        eq(companyInvitations.organizationId, organizationId),
        isNull(companyInvitations.acceptedAt),
        isNull(companyInvitations.revokedAt),
      ),
    )
    .returning({ id: companyInvitations.id });
  if (!row) return false;

  await recordAuditEvent({
    actorUserId,
    action: "invitation.revoked",
    targetType: "invitation",
    targetId: row.id,
    metadata: { organizationId },
  }).catch(logAuditFailure);
  return true;
}

/**
 * Öffentliche Vorschau für die Einladungsseite. Unbekannt, benutzt, widerrufen und
 * abgelaufen sehen von außen gleich aus (null) - kein Rückschluss auf den Zustand.
 */
export async function getInvitationPreview(
  token: string,
  now: Date = new Date(),
): Promise<{ organizationName: string; role: CompanyRole; email: string } | null> {
  const [row] = await getDb()
    .select({
      organizationName: organizations.name,
      role: companyInvitations.role,
      email: companyInvitations.email,
    })
    .from(companyInvitations)
    .innerJoin(organizations, eq(organizations.id, companyInvitations.organizationId))
    .where(
      and(
        eq(companyInvitations.tokenHash, hashInvitationToken(token)),
        isNull(companyInvitations.acceptedAt),
        isNull(companyInvitations.revokedAt),
        gt(companyInvitations.expiresAt, now),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Nimmt eine Einladung an: nur mit genau der eingeladenen E-Mail, nur einmal, nur
 * solange sie offen und nicht abgelaufen ist. Verbrauch der Einladung und Anlegen der
 * Mitgliedschaft passieren in EINER Transaktion; bei parallelen Versuchen gewinnt genau einer.
 */
export async function acceptInvitation(input: {
  userId: string;
  userEmail: string;
  token: string;
  now?: Date;
}): Promise<AcceptResult> {
  const now = input.now ?? new Date();
  const tokenHash = hashInvitationToken(input.token);
  const email = normalizeEmail(input.userEmail);

  let result: AcceptResult;
  try {
    result = await getDb().transaction(async (tx) => {
      const [member] = await tx
        .select({ id: organizationMemberships.id })
        .from(organizationMemberships)
        .where(eq(organizationMemberships.userId, input.userId))
        .limit(1);
      if (member) return { ok: false, reason: "already_member" } as const;

      const [claimed] = await tx
        .update(companyInvitations)
        .set({ acceptedAt: now, acceptedByUserId: input.userId })
        .where(
          and(
            eq(companyInvitations.tokenHash, tokenHash),
            eq(companyInvitations.email, email),
            isNull(companyInvitations.acceptedAt),
            isNull(companyInvitations.revokedAt),
            gt(companyInvitations.expiresAt, now),
          ),
        )
        .returning({
          organizationId: companyInvitations.organizationId,
          role: companyInvitations.role,
        });

      if (!claimed) {
        // Nur dem Token-Inhaber (angemeldet) sagen wir, ob es an der E-Mail liegt.
        const [other] = await tx
          .select({ id: companyInvitations.id })
          .from(companyInvitations)
          .where(
            and(
              eq(companyInvitations.tokenHash, tokenHash),
              isNull(companyInvitations.acceptedAt),
              isNull(companyInvitations.revokedAt),
              gt(companyInvitations.expiresAt, now),
            ),
          )
          .limit(1);
        return { ok: false, reason: other ? "email_mismatch" : "invalid" } as const;
      }

      await tx.insert(organizationMemberships).values({
        organizationId: claimed.organizationId,
        userId: input.userId,
        role: claimed.role,
      });
      const [org] = await tx
        .select({ name: organizations.name })
        .from(organizations)
        .where(eq(organizations.id, claimed.organizationId))
        .limit(1);
      return {
        ok: true,
        organizationId: claimed.organizationId,
        organizationName: org?.name ?? "",
        role: claimed.role,
      } as const;
    });
  } catch (err) {
    // Unique-Verstoß auf user_id: parallel zur Annahme wurde die Person Mitglied.
    // Die Transaktion ist zurückgerollt, die Einladung bleibt offen.
    if (isUniqueViolation(err)) return { ok: false, reason: "already_member" };
    throw err;
  }

  if (result.ok) {
    await recordAuditEvent({
      actorUserId: input.userId,
      action: "invitation.accepted",
      targetType: "organization",
      targetId: result.organizationId,
      metadata: { role: result.role },
    }).catch(logAuditFailure);
  }
  return result;
}

/** Hat diese E-Mail eine offene, nicht abgelaufene Einladung? (Lässt die Registrierung zu.) */
export async function hasPendingInvitationForEmail(
  email: string,
  now: Date = new Date(),
): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: companyInvitations.id })
    .from(companyInvitations)
    .where(
      and(
        eq(companyInvitations.email, normalizeEmail(email)),
        isNull(companyInvitations.acceptedAt),
        isNull(companyInvitations.revokedAt),
        gt(companyInvitations.expiresAt, now),
      ),
    )
    .limit(1);
  return Boolean(row);
}

function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 4 && current; depth++) {
    if (typeof current === "object" && (current as { code?: string }).code === "23505") return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}
