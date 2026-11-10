/** Markdown-Quellen über die Admin-Routen: Upload per Formular, Text lesen, Titel und Text ändern (echte DB nur mit TEST_DATABASE_URL, Admin-Prüfung ersetzt). */
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (TEST_DB) process.env.DATABASE_URL = TEST_DB;

const guard = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server/auth-guards", () => ({ requireAdminApi: guard }));

import { getDb } from "@/lib/server/db/client";
import { auditEvents, certifications } from "@/lib/server/db/schema";
import { seedUser } from "@/lib/server/psrp/test-db";
import { POST as parse } from "./[id]/parse/route";
import { GET as readOne, PATCH } from "./[id]/route";
import { GET as list, POST as upload } from "./route";

const run = TEST_DB ? describe : describe.skip;

let storageDir: string;
let certId: string;

function uploadRequest(file: File, extra: Record<string, string> = {}) {
  const form = new FormData();
  form.set("certificationId", certId);
  form.set("title", "Leitfaden");
  form.set("provider", "Test");
  form.set("file", file);
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  return new Request("http://x/api/admin/sources", { method: "POST", body: form });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const patch = (id: string, body: unknown) =>
  PATCH(new Request("http://x", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), ctx(id));

run("Markdown-Quellen über die Routen (DB)", () => {
  beforeAll(async () => {
    storageDir = await mkdtemp(path.join(tmpdir(), "md-routes-"));
    process.env.SOURCES_STORAGE_DIR = storageDir;
    const userId = await seedUser();
    guard.mockResolvedValue({ ok: true, user: { id: userId } });
    const tag = randomUUID().slice(0, 8);
    const [cert] = await getDb().insert(certifications).values({ slug: `mdr-${tag}`, name: `MDR ${tag}`, provider: "T", examName: "T", examVersion: "1" }).returning();
    certId = cert.id;
  });

  afterAll(async () => {
    if (certId) await getDb().delete(certifications).where(eq(certifications.id, certId));
    await rm(storageDir, { recursive: true, force: true });
  });

  it("nimmt eine .md-Datei im selben Formular wie PDFs an, auch wenn der Browser keinen Typ meldet", async () => {
    for (const [name, type] of [["a.md", "text/markdown"], ["b.md", ""], ["c.markdown", "text/plain"]] as const) {
      const res = await upload(uploadRequest(new File([`# ${name}\n\nInhalt von ${name}`], name, { type })));
      expect(res.status, name).toBe(201);
      const { source } = await res.json();
      expect(source).toMatchObject({ sourceType: "markdown", mimeType: "text/markdown", status: "uploaded" });
    }
  });

  it("lehnt eine umbenannte Binärdatei und eine leere Datei ab, ohne etwas anzulegen", async () => {
    const binary = await upload(uploadRequest(new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x00, 0x01])], "fake.md", { type: "text/markdown" })));
    expect(binary.status).toBe(400);
    expect((await binary.json()).code).toBe("not_text");
    const empty = await upload(uploadRequest(new File([""], "leer.md", { type: "text/markdown" })));
    expect(empty.status).toBe(400);
  });

  it("liest eine hochgeladene Markdown-Quelle aus, lädt sie in den Editor und speichert Änderungen", async () => {
    const created = await upload(uploadRequest(new File(["# Alt\n\nAlter Text"], "edit.md", { type: "text/markdown" }), { title: "Zum Bearbeiten" }));
    const { source } = await created.json();
    expect((await parse(new Request("http://x", { method: "POST" }), ctx(source.id))).status).toBe(200);

    const opened = await readOne(new Request("http://x"), ctx(source.id));
    expect(await opened.json()).toMatchObject({ content: "# Alt\n\nAlter Text", editable: true, source: { title: "Zum Bearbeiten" } });

    const saved = await patch(source.id, { title: "Neuer Titel", content: "# Neu\n\nNeuer Text" });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ contentChanged: true, extractionError: null, blueprintDraftExists: false, source: { title: "Neuer Titel", status: "parsed" } });

    const listed = (await (await list(Object.assign(new Request(`http://x/api/admin/sources?certificationId=${certId}`), { nextUrl: new URL(`http://x/api/admin/sources?certificationId=${certId}`) }) as never)).json()).sources as Array<{ id: string; chunkCount: number }>;
    expect(listed.find((s) => s.id === source.id)?.chunkCount).toBe(1);

    const [event] = await getDb().select().from(auditEvents).where(eq(auditEvents.targetId, source.id));
    expect(event).toMatchObject({ action: "source.edited", targetType: "certification_source" });
  });

  it("ändert über die Route nur den Titel, ohne die Quelle neu auszulesen", async () => {
    const created = await upload(uploadRequest(new File(["# T\n\nText"], "nur-titel.md", { type: "text/markdown" })));
    const { source } = await created.json();
    const res = await patch(source.id, { title: "Anderer Titel" });
    expect(await res.json()).toMatchObject({ contentChanged: false, extractionError: null, source: { title: "Anderer Titel", status: "uploaded" } });
  });

  it("antwortet mit passenden Statuscodes: 400 ohne Felder, 404 unbekannt, 409 doppelt, 413 zu groß", async () => {
    expect((await patch(randomUUID(), {})).status).toBe(400);
    expect((await patch(randomUUID(), { title: "x" })).status).toBe(404);

    const one = await (await upload(uploadRequest(new File(["# Eins\n\nA"], "eins.md", { type: "text/markdown" })))).json();
    const two = await (await upload(uploadRequest(new File(["# Zwei\n\nB"], "zwei.md", { type: "text/markdown" })))).json();
    const duplicate = await patch(two.source.id, { content: "# Eins\n\nA" });
    expect(duplicate.status).toBe(409);
    expect((await duplicate.json()).code).toBe("duplicate");
    expect(one.source.id).not.toBe(two.source.id);

    // Ohne Content-Length in Stücken gesendet: der Strom wird bei der Grenze abgebrochen.
    const chunk = new TextEncoder().encode("a".repeat(1024 * 1024));
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 12; i++) controller.enqueue(chunk);
        controller.close();
      },
    });
    const tooLarge = await PATCH(new Request("http://x", { method: "PATCH", body: stream, headers: { "content-type": "application/json" }, duplex: "half" } as RequestInit), ctx(two.source.id));
    expect(tooLarge.status).toBe(413);
  });

  it("verweigert den Zugriff ohne Admin-Rechte", async () => {
    const { NextResponse } = await import("next/server");
    guard.mockResolvedValueOnce({ ok: false, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) });
    expect((await patch(randomUUID(), { title: "x" })).status).toBe(403);
  });
});
