import { getDb } from "@/lib/server/db/client";
import { auditEvents, type AuditActorType } from "@/lib/server/db/schema";

export interface AuditEventInput {
  actorUserId?: string | null;
  actorType?: AuditActorType;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * R0 (roadmap.md, neue Fassung): "Änderungen an Inhalten und Rollen
 * auditierbar machen" + "kostenpflichtige Aktionen ... protokollieren".
 * Bewusst fire-and-forget aus Sicht der Aufrufer (siehe Call-Sites) - ein
 * Audit-Log-Fehler darf die eigentliche Aktion nicht blockieren, wird aber
 * geloggt, um eine stille Lücke im Trail sichtbar zu machen.
 */
export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  await getDb().insert(auditEvents).values({
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorType ?? "user",
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    metadata: input.metadata ?? null,
  });
}
