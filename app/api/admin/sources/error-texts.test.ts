/**
 * Aufgabe 11 (Review 12.11.2026): Die Routen zum Extrahieren einer Quelle und zum Blueprint geben unerwartete Fehler nicht
 * mit ihrem Text an den Client. Der Text steht im Server-Log; gewollte Meldungen (z. B. „kein Text in der PDF-Datei“) bleiben.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  extract: vi.fn(),
  getSource: vi.fn(),
  generate: vi.fn(),
}));
vi.mock("@/lib/server/auth-guards", () => ({ requireAdminApi: mocks.guard }));
vi.mock("@/lib/server/admin/sources", () => ({ getCertificationSource: mocks.getSource }));
vi.mock("@/lib/server/admin/source-extraction", async (original) => ({ ...(await original<typeof import("@/lib/server/admin/source-extraction")>()), extractSourceContent: mocks.extract }));
vi.mock("@/lib/server/admin/blueprint", async (original) => ({ ...(await original<typeof import("@/lib/server/admin/blueprint")>()), generateAndStoreBlueprintDraft: mocks.generate }));
vi.mock("@/lib/server/audit/service", () => ({ recordAuditEvent: async () => undefined }));

import { SourceExtractionError } from "@/lib/server/admin/source-extraction";
import { POST as blueprintPost } from "./[id]/blueprint/route";
import { POST as parsePost } from "./[id]/parse/route";

const ctx = { params: Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" }) };
const request = () => new Request("http://x/api/admin/sources/x", { method: "POST" });
// So sieht ein Datenbank-Verbindungsfehler aus: Host, Port und Benutzer stehen im Text.
const DB_ERROR = "connect ECONNREFUSED 10.20.30.40:5432 (user certstudy, database certstudy, password authentication failed)";

let seq = 0;
beforeEach(() => {
  seq += 1;
  mocks.guard.mockResolvedValue({ ok: true, user: { id: `admin-${seq}` } });
  mocks.getSource.mockResolvedValue({ id: "s", status: "failed" });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("/api/admin/sources/:id/parse", () => {
  it("ein unerwarteter Fehler erscheint beim Client nur generisch, der Text steht im Server-Log", async () => {
    mocks.extract.mockRejectedValue(new Error(DB_ERROR));
    const res = await parsePost(request(), ctx);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|10\.20\.30\.40|password|certstudy/);
    expect(body.error).toMatch(/Server-Log/);
  });

  it("eine gewollte Meldung der Extraktion bleibt erhalten", async () => {
    mocks.extract.mockRejectedValue(new SourceExtractionError("Die Markdown-Datei enthält keinen Text."));
    const res = await parsePost(request(), ctx);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe("Die Markdown-Datei enthält keinen Text.");
  });
});

describe("/api/admin/sources/:id/blueprint", () => {
  it("ein unerwarteter Fehler erscheint beim Client nur generisch und steht im Server-Log", async () => {
    mocks.generate.mockRejectedValue(new Error(DB_ERROR));
    const res = await blueprintPost(request(), ctx);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/ECONNREFUSED|10\.20\.30\.40|password|certstudy/);
    expect(body.error).toMatch(/Server-Log/);
    expect(console.error).toHaveBeenCalledWith("Blueprint extraction failed:", expect.objectContaining({ message: DB_ERROR }));
  });
});
