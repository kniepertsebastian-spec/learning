import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isBatchEnabled,
  MAX_REQUESTS_PER_BATCH,
  pollBatch,
  responseText,
  responseUsage,
  splitIntoBatches,
  submitBatch,
  type BatchClient,
  type BatchRequest,
} from "./batch";

const request = (key: string, extra: Partial<BatchRequest> = {}): BatchRequest => ({ key, system: "System", user: `Anfrage ${key}`, ...extra });

/** Ein Client, der nur die zwei Aufrufe kennt, die die Hülle braucht. */
function fakeClient(job: Record<string, unknown>) {
  const create = vi.fn(async () => ({ name: "batches/abc123" }));
  const get = vi.fn(async () => job);
  return { client: { batches: { create, get } } as unknown as BatchClient, create, get };
}

const answer = (text: string, usage: Record<string, number> = { promptTokenCount: 100, candidatesTokenCount: 50 }) => ({
  candidates: [{ content: { parts: [{ text }] } }],
  usageMetadata: usage,
});

afterEach(() => vi.unstubAllEnvs());

describe("isBatchEnabled", () => {
  it("braucht GEMINI_BATCH=1 und einen Schlüssel", () => {
    vi.stubEnv("GEMINI_API_KEY", "k");
    vi.stubEnv("GEMINI_BATCH", "");
    expect(isBatchEnabled()).toBe(false);
    vi.stubEnv("GEMINI_BATCH", "1");
    expect(isBatchEnabled()).toBe(true);
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(isBatchEnabled()).toBe(false);
  });
});

describe("splitIntoBatches", () => {
  it("teilt nach Anzahl", () => {
    const requests = Array.from({ length: MAX_REQUESTS_PER_BATCH * 2 + 1 }, (_, i) => request(`k${i}`));
    expect(splitIntoBatches(requests).map((b) => b.length)).toEqual([MAX_REQUESTS_PER_BATCH, MAX_REQUESTS_PER_BATCH, 1]);
  });

  it("teilt nach Größe; eine einzelne zu große Anfrage bekommt einen eigenen Auftrag", () => {
    const big = (key: string) => request(key, { user: "x".repeat(3_000_000) });
    const batches = splitIntoBatches([big("a"), big("b"), request("c")]);
    expect(batches.map((b) => b.map((r) => r.key))).toEqual([["a"], ["b", "c"]]);
    expect(splitIntoBatches([])).toEqual([]);
  });
});

describe("submitBatch", () => {
  it("reicht die Anfragen mit Schlüssel in den Metadaten und denselben Einstellungen wie der Live-Aufruf ein", async () => {
    const { client, create } = fakeClient({});
    const schema = { type: "object", properties: { a: { type: "string" } } };
    const name = await submitBatch(client, "gemini-3.8-flash", [request("eins", { jsonSchema: schema }), request("zwei")], "tagging-abc");
    expect(name).toBe("batches/abc123");
    expect(create).toHaveBeenCalledTimes(1);
    type Sent = { contents: string; metadata: { key: string }; config: Record<string, unknown> };
    const params = (create.mock.calls[0] as unknown as [{ model: string; src: Sent[]; config: { displayName: string } }])[0];
    expect(params.model).toBe("gemini-3.8-flash");
    expect(params.config.displayName).toBe("tagging-abc");
    expect(params.src).toHaveLength(2);
    expect(params.src[0]).toMatchObject({ contents: "Anfrage eins", metadata: { key: "eins" } });
    expect(params.src[0].config).toMatchObject({
      systemInstruction: "System",
      temperature: 0.1,
      responseMimeType: "application/json",
      responseJsonSchema: schema,
      maxOutputTokens: 65536,
      thinkingConfig: { thinkingBudget: 0 },
    });
    expect(params.src[1].config.responseJsonSchema).toBeUndefined();
  });

  it("lehnt leere Aufträge und doppelte Schlüssel ab", async () => {
    const { client, create } = fakeClient({});
    await expect(submitBatch(client, "m", [], "x")).rejects.toThrow(/mindestens eine/);
    await expect(submitBatch(client, "m", [request("a"), request("a")], "x")).rejects.toThrow(/eindeutig/);
    expect(create).not.toHaveBeenCalled();
  });

  it("meldet, wenn Google keinen Namen vergibt", async () => {
    const client = { batches: { create: vi.fn(async () => ({})) } } as unknown as BatchClient;
    await expect(submitBatch(client, "m", [request("a")], "x")).rejects.toThrow(/keinen Namen/);
  });
});

describe("responseText und responseUsage", () => {
  it("fügt die Teile zusammen und lässt Gedanken weg", () => {
    expect(responseText({ candidates: [{ content: { parts: [{ text: "geheim", thought: true }, { text: "{\"a\":" }, { text: "1}" }] } }] })).toBe('{"a":1}');
    expect(responseText({ candidates: [] })).toBeNull();
    expect(responseText(undefined)).toBeNull();
  });

  it("zählt Denk-Token zur Ausgabe wie der Live-Aufruf", () => {
    expect(responseUsage({ usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 3, cachedContentTokenCount: 4 } })).toEqual({
      promptTokens: 10,
      completionTokens: 8,
      cachedTokens: 4,
    });
    expect(responseUsage({})).toBeNull();
  });
});

describe("pollBatch", () => {
  it("läuft: pending; wartend und in Arbeit ebenso", async () => {
    for (const state of ["JOB_STATE_PENDING", "JOB_STATE_RUNNING", "JOB_STATE_QUEUED", undefined]) {
      const { client } = fakeClient({ state });
      expect(await pollBatch(client, "batches/x", ["a"])).toEqual({ state: "pending" });
    }
  });

  it("gescheitert, abgebrochen, abgelaufen: failed mit Meldung", async () => {
    for (const state of ["JOB_STATE_FAILED", "JOB_STATE_CANCELLED", "JOB_STATE_EXPIRED"]) {
      const { client } = fakeClient({ state, error: { message: "Kontingent" } });
      const outcome = await pollBatch(client, "batches/x", ["a"]);
      expect(outcome).toMatchObject({ state: "failed" });
      expect((outcome as { message: string }).message).toContain(state);
    }
  });

  it("fertig: ordnet Antworten über den Schlüssel in den Metadaten zu, auch in anderer Reihenfolge", async () => {
    const { client } = fakeClient({
      state: "JOB_STATE_SUCCEEDED",
      dest: { inlinedResponses: [{ metadata: { key: "b" }, response: answer("B") }, { metadata: { key: "a" }, response: answer("A", { promptTokenCount: 7, candidatesTokenCount: 3, cachedContentTokenCount: 2 }) }] },
    });
    const outcome = await pollBatch(client, "batches/x", ["a", "b"]);
    expect(outcome).toEqual({
      state: "done",
      results: [
        { key: "a", text: "A", error: null, usage: { promptTokens: 7, completionTokens: 3, cachedTokens: 2 } },
        { key: "b", text: "B", error: null, usage: { promptTokens: 100, completionTokens: 50, cachedTokens: 0 } },
      ],
    });
  });

  it("fertig: ohne Schlüssel in den Metadaten gilt die Reihenfolge der Anfragen", async () => {
    const { client } = fakeClient({ state: "JOB_STATE_SUCCEEDED", dest: { inlinedResponses: [{ response: answer("erste") }, { response: answer("zweite") }] } });
    const outcome = await pollBatch(client, "batches/x", ["a", "b"]);
    expect(outcome.state === "done" && outcome.results.map((r) => [r.key, r.text])).toEqual([["a", "erste"], ["b", "zweite"]]);
  });

  it("fertig: einzelne Fehler und fehlende Antworten kommen als Fehler je Schlüssel zurück", async () => {
    const { client } = fakeClient({
      state: "JOB_STATE_SUCCEEDED",
      dest: { inlinedResponses: [{ metadata: { key: "a" }, error: { message: "Sicherheitsfilter" } }, { metadata: { key: "b" }, response: { candidates: [] } }] },
    });
    const outcome = await pollBatch(client, "batches/x", ["a", "b", "c"]);
    expect(outcome.state).toBe("done");
    const results = (outcome as { results: Array<{ key: string; text: string | null; error: string | null }> }).results;
    expect(results.map((r) => [r.key, r.text, r.error])).toEqual([
      ["a", null, "Sicherheitsfilter"],
      ["b", null, "Keine Textantwort."],
      ["c", null, "Keine Antwort im Batch."],
    ]);
  });

  it("fertig, aber ohne Inline-Antworten (Datei oder leer): failed", async () => {
    const { client: file } = fakeClient({ state: "JOB_STATE_SUCCEEDED", dest: { fileName: "files/1" } });
    expect(await pollBatch(file, "batches/x", ["a"])).toMatchObject({ state: "failed", message: expect.stringContaining("Datei") });
    const { client: none } = fakeClient({ state: "JOB_STATE_SUCCEEDED" });
    expect(await pollBatch(none, "batches/x", ["a"])).toMatchObject({ state: "failed" });
  });
});
