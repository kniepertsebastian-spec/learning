/** Aufgabe 11 (Review 12.11.2026): ein unerwarteter Fehler bei der Extraktion landet nicht mit seinem Text in der Quelle. Nur mit TEST_DATABASE_URL. */
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

import { getDb } from "@/lib/server/db/client";
import { certifications, certificationSources } from "@/lib/server/db/schema";
import { extractSourceContent, GENERIC_EXTRACTION_ERROR } from "./source-extraction";

const run = TEST_DB ? describe : describe.skip;

let storageDir: string;
let certId: string;

async function addSource(values: { storageKey: string; sourceType: "pdf" | "markdown"; mimeType: string }) {
  const [source] = await getDb()
    .insert(certificationSources)
    .values({ certificationId: certId, title: "T", provider: "T", checksum: randomUUID(), fileSizeBytes: 1, ...values })
    .returning();
  return source;
}

run("Fehlertexte der Extraktion (echte DB)", () => {
  beforeAll(async () => {
    storageDir = await mkdtemp(path.join(tmpdir(), "extract-err-"));
    process.env.SOURCES_STORAGE_DIR = storageDir;
    const tag = randomUUID().slice(0, 8);
    const [cert] = await getDb().insert(certifications).values({ slug: `exe-${tag}`, name: `EXE ${tag}`, provider: "T", examName: "T", examVersion: "1" }).returning();
    certId = cert.id;
  });
  afterAll(async () => {
    if (certId) await getDb().delete(certifications).where(eq(certifications.id, certId));
    await rm(storageDir, { recursive: true, force: true });
  });

  it("eine fehlende Datei: in der Quelle steht die generische Meldung ohne Pfad, der Fehler steht im Server-Log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const source = await addSource({ storageKey: "gibt-es-nicht/geheimer-pfad.pdf", sourceType: "pdf", mimeType: "application/pdf" });
    await expect(extractSourceContent(source.id)).rejects.toThrow();
    const [after] = await getDb().select().from(certificationSources).where(eq(certificationSources.id, source.id));
    expect(after.status).toBe("failed");
    expect(after.parseError).toBe(GENERIC_EXTRACTION_ERROR);
    expect(after.parseError).not.toMatch(/geheimer-pfad|ENOENT/);
    expect(JSON.stringify(log.mock.calls.map((c) => String(c[1])))).toMatch(/ENOENT|geheimer-pfad/);
    log.mockRestore();
  });
});
