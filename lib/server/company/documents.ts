import { createHash } from "node:crypto";
import { and, asc, desc, eq } from "drizzle-orm";
import { recordAuditEvent } from "@/lib/server/audit/service";
import { getDb } from "@/lib/server/db/client";
import { companyDocumentFiles, companyDocuments, users } from "@/lib/server/db/schema";
import { SUPPRESSIBLE_KINDS, type SecretKind } from "@/lib/server/documents/secret-scanner";
import { cleanFilename, inspectUpload, type UploadRejection } from "@/lib/server/documents/upload";

/**
 * Firmendokumente der EIGENEN Organisation. Jede Funktion bekommt `organizationId` aus der Mitgliedschaft
 * (guard.ts) und filtert immer danach: ein Dokument einer anderen Firma ist hier nicht auffindbar.
 * Gespeichert wird nur, was den Upload-Check inklusive Secret-Scanner besteht.
 */

function logAuditFailure(err: unknown) {
  console.error("Audit-Log fehlgeschlagen:", err);
}

function isUniqueViolation(error: unknown): boolean {
  const code = (e: unknown) => (typeof e === "object" && e !== null && "code" in e ? (e as { code: unknown }).code : undefined);
  const cause = typeof error === "object" && error !== null && "cause" in error ? (error as { cause: unknown }).cause : undefined;
  return code(error) === "23505" || code(cause) === "23505";
}

/** Nur Firmen-Admins dürfen Funde des Secret-Scanners als Fehlalarm bestätigen. */
export class SuppressNotAllowedError extends Error {}

export type CompanyDocumentSummary = {
  id: string;
  title: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  pageCount: number;
  excludeFromAi: boolean;
  /** Anzahl der vom Firmen-Admin bestätigten Scanner-Funde (0 = keine). */
  suppressedFindings: number;
  createdAt: Date;
  uploadedByName: string | null;
};

/** Das ist alles, was die Liste über ein Dokument verrät: nie der Inhalt. */
export const DOCUMENT_LIST_FIELDS = [
  "id", "title", "originalFilename", "mimeType", "sizeBytes", "pageCount", "excludeFromAi", "suppressedFindings", "createdAt", "uploadedByName",
] as const;

export async function listCompanyDocuments(organizationId: string): Promise<CompanyDocumentSummary[]> {
  return getDb()
    .select({
      id: companyDocuments.id,
      title: companyDocuments.title,
      originalFilename: companyDocuments.originalFilename,
      mimeType: companyDocuments.mimeType,
      sizeBytes: companyDocuments.sizeBytes,
      pageCount: companyDocuments.pageCount,
      excludeFromAi: companyDocuments.excludeFromAi,
      suppressed: companyDocuments.scannerSuppressed,
      createdAt: companyDocuments.createdAt,
      uploadedByName: users.name,
    })
    .from(companyDocuments)
    .leftJoin(users, eq(users.id, companyDocuments.uploadedByUserId))
    .where(eq(companyDocuments.organizationId, organizationId))
    .orderBy(desc(companyDocuments.createdAt), asc(companyDocuments.title))
    .then((rows) => rows.map(({ suppressed, ...rest }) => ({ ...rest, suppressedFindings: suppressed?.length ?? 0 })));
}

export type UploadResult =
  | { ok: true; document: { id: string; title: string }; alreadyExisted: boolean }
  | UploadRejection;

export async function uploadCompanyDocument(input: {
  organizationId: string;
  uploadedByUserId: string;
  title: string | null;
  file: { filename: string; mimeType: string; data: Buffer };
  excludeFromAi: boolean;
  /** Fund-Arten, die als Fehlalarm bestätigt werden (nur durch Firmen-Admins, nur Arten aus SUPPRESSIBLE_KINDS). */
  suppressKinds?: SecretKind[];
  canSuppress?: boolean;
}): Promise<UploadResult> {
  const suppressKinds = [...new Set((input.suppressKinds ?? []).filter((k) => SUPPRESSIBLE_KINDS.includes(k)))];
  if (suppressKinds.length > 0 && !input.canSuppress) throw new SuppressNotAllowedError();
  const filename = cleanFilename(input.file.filename);
  const inspection = await inspectUpload({ filename, mimeType: input.file.mimeType, data: input.file.data }, { suppressKinds });

  if (!inspection.ok) {
    if (inspection.code === "secrets_found") {
      // Audit nur mit Art und Anzahl der Funde: nie der Wert, nie der Dateiinhalt.
      await recordAuditEvent({
        actorUserId: input.uploadedByUserId,
        action: "document.rejected",
        targetType: "organization",
        targetId: input.organizationId,
        metadata: {
          reason: "secrets_found",
          kinds: [...new Set(inspection.findings.map((f) => f.kind))],
          findings: inspection.findings.length,
        },
      }).catch(logAuditFailure);
    }
    return inspection;
  }

  const checksum = createHash("sha256").update(input.file.data).digest("hex");
  const title = (input.title?.trim() || filename.replace(/\.[A-Za-z0-9]+$/, "")).slice(0, 200);
  const db = getDb();

  try {
    const document = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(companyDocuments)
        .values({
          organizationId: input.organizationId,
          uploadedByUserId: input.uploadedByUserId,
          title,
          originalFilename: filename,
          mimeType: inspection.mimeType,
          sizeBytes: input.file.data.byteLength,
          checksum,
          pageCount: inspection.pageCount,
          excludeFromAi: input.excludeFromAi,
          ...(inspection.suppressed.length > 0
            ? { scannerSuppressed: inspection.suppressed, scannerSuppressedByUserId: input.uploadedByUserId, scannerSuppressedAt: new Date() }
            : {}),
        })
        .returning({ id: companyDocuments.id, title: companyDocuments.title });
      await tx.insert(companyDocumentFiles).values({ documentId: row.id, data: input.file.data });
      return row;
    });
    await recordAuditEvent({
      actorUserId: input.uploadedByUserId,
      action: "document.uploaded",
      targetType: "company_document",
      targetId: document.id,
      metadata: { organizationId: input.organizationId, sizeBytes: input.file.data.byteLength, excludeFromAi: input.excludeFromAi, suppressedFindings: inspection.suppressed.length },
    }).catch(logAuditFailure);
    if (inspection.suppressed.length > 0) {
      // Nur Arten und Anzahl, nie der Wert.
      await recordAuditEvent({
        actorUserId: input.uploadedByUserId,
        action: "document.scanner_suppressed",
        targetType: "company_document",
        targetId: document.id,
        metadata: {
          organizationId: input.organizationId,
          kinds: [...new Set(inspection.suppressed.map((f) => f.kind))],
          findings: inspection.suppressed.length,
        },
      }).catch(logAuditFailure);
    }
    return { ok: true, document, alreadyExisted: false };
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Dieselbe Datei gibt es in dieser Organisation schon.
    const [existing] = await db
      .select({ id: companyDocuments.id, title: companyDocuments.title })
      .from(companyDocuments)
      .where(and(eq(companyDocuments.organizationId, input.organizationId), eq(companyDocuments.checksum, checksum)))
      .limit(1);
    if (!existing) throw error;
    return { ok: true, document: existing, alreadyExisted: true };
  }
}

export type DownloadableDocument = { filename: string; mimeType: string; data: Buffer };

/** Datei zum Herunterladen, nur aus der eigenen Organisation. */
export async function getCompanyDocumentFile(organizationId: string, documentId: string): Promise<DownloadableDocument | null> {
  const [row] = await getDb()
    .select({ filename: companyDocuments.originalFilename, mimeType: companyDocuments.mimeType, data: companyDocumentFiles.data })
    .from(companyDocuments)
    .innerJoin(companyDocumentFiles, eq(companyDocumentFiles.documentId, companyDocuments.id))
    .where(and(eq(companyDocuments.id, documentId), eq(companyDocuments.organizationId, organizationId)))
    .limit(1);
  return row ? { filename: row.filename, mimeType: row.mimeType, data: Buffer.from(row.data) } : null;
}

export async function deleteCompanyDocument(organizationId: string, documentId: string, actorUserId: string): Promise<boolean> {
  const [row] = await getDb()
    .delete(companyDocuments)
    .where(and(eq(companyDocuments.id, documentId), eq(companyDocuments.organizationId, organizationId)))
    .returning({ id: companyDocuments.id });
  if (!row) return false;
  await recordAuditEvent({
    actorUserId,
    action: "document.deleted",
    targetType: "company_document",
    targetId: row.id,
    metadata: { organizationId },
  }).catch(logAuditFailure);
  return true;
}
