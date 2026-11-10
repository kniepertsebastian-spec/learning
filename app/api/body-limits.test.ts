/**
 * Größenlimits der Upload- und Sync-Routen: Der Body wird mit Obergrenze gelesen, auch wenn er in Stücken ohne
 * Content-Length ankommt (sonst puffern request.json() / request.formData() beliebig viel, bevor eine Prüfung greift).
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  requireCompanyApi: vi.fn(),
  requireReviewerUserApi: vi.fn(),
}));
vi.mock("@/lib/server/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/server/company/guard", () => ({ requireCompanyApi: mocks.requireCompanyApi }));
vi.mock("@/lib/server/reviewers/guard", () => ({ requireReviewerUserApi: mocks.requireReviewerUserApi }));

import { MAX_DOCUMENT_BYTES } from "@/lib/server/documents/upload";
import { MAX_IMAGE_BYTES } from "@/lib/server/documents/images";
import { MAX_PHOTO_BYTES } from "@/lib/server/reviewers/photo-service";
import { MAX_SYNC_BODY_BYTES } from "@/lib/server/sync/validate";
import { POST as syncPost } from "./sync/route";
import { POST as documentsPost } from "./company/documents/route";
import { POST as imagesPost } from "./company/documents/[id]/images/route";
import { POST as photoPost } from "./reviewer/profile/photo/route";
import { POST as coursesPost } from "./internal-courses/route";

const MB = 1024 * 1024;
const DOCUMENT_ID = "11111111-1111-4111-8111-111111111111";
let seq = 0;

beforeEach(() => {
  // Neue Nutzer- und Firmenkennung je Test: die Rate-Limits (z. B. 5 Kurse pro Stunde und Firma) sollen nicht dazwischenfunken.
  seq += 1;
  mocks.auth.mockResolvedValue({ user: { id: `user-${seq}` } });
  mocks.requireCompanyApi.mockResolvedValue({
    ok: true,
    membership: { userId: `user-${seq}`, organizationId: `org-${seq}`, role: "company_admin" },
  });
  mocks.requireReviewerUserApi.mockResolvedValue({ ok: true, user: { id: `reviewer-${seq}` } });
});

/** Ein Body in 1-MB-Stücken ohne Content-Length (wie chunked Upload); `sent()` sagt, wie viel davon gelesen wurde. */
function chunked(totalBytes: number, contentType: string) {
  const chunk = new Uint8Array(MB);
  let sent = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent >= totalBytes) return controller.close();
      const size = Math.min(MB, totalBytes - sent);
      sent += size;
      controller.enqueue(size === MB ? chunk : chunk.subarray(0, size));
    },
  });
  const init = { method: "POST", body, headers: { "content-type": contentType }, duplex: "half" } as RequestInit;
  return { init, sent: () => sent };
}

const MULTIPART = "multipart/form-data; boundary=x";
const post = (init: RequestInit) => new Request("http://x/api", init);
function emptyForm(fields: Record<string, string> = { title: "Nur ein Titel" }) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return post({ method: "POST", body: form });
}

describe("Größenlimits ohne Content-Length", () => {
  const cases = [
    {
      name: "/api/sync",
      limit: MAX_SYNC_BODY_BYTES,
      contentType: "application/json",
      call: (init: RequestInit) => syncPost(new NextRequest("http://x/api/sync", init as never)),
      message: "Anfrage zu groß.",
    },
    {
      name: "/api/company/documents",
      limit: MAX_DOCUMENT_BYTES + MB,
      contentType: MULTIPART,
      call: (init: RequestInit) => documentsPost(post(init)),
      message: "Die Datei ist zu groß.",
    },
    {
      name: "/api/company/documents/:id/images",
      limit: MAX_IMAGE_BYTES + MB,
      contentType: MULTIPART,
      call: (init: RequestInit) => imagesPost(post(init), { params: Promise.resolve({ id: DOCUMENT_ID }) }),
      message: "Das Bild ist zu groß.",
    },
    {
      name: "/api/reviewer/profile/photo",
      limit: MAX_PHOTO_BYTES + MB / 2,
      contentType: MULTIPART,
      call: (init: RequestInit) => photoPost(post(init)),
      message: "Das Foto ist zu groß.",
    },
    {
      name: "/api/internal-courses (Dateien)",
      limit: 105 * MB,
      contentType: MULTIPART,
      call: (init: RequestInit) => coursesPost(post(init)),
      message: "Die Dateien sind zusammen zu groß (höchstens 100 MB).",
    },
  ];

  it.each(cases)("$name: antwortet mit 413 und liest nicht den ganzen Strom", async ({ limit, contentType, call, message }) => {
    const { init, sent } = chunked(limit + 50 * MB, contentType);
    const res = await call(init);
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe(message);
    // Abgebrochen kurz nach der Grenze, nicht erst nach den angebotenen 50 MB mehr.
    expect(sent()).toBeLessThanOrEqual(limit + 2 * MB);
  });

  it.each(cases)("$name: lehnt eine angegebene Größe über dem Limit ab, ohne zu lesen", async ({ limit, contentType, call }) => {
    const { init, sent } = chunked(20 * MB, contentType);
    const res = await call({ ...init, headers: { "content-type": contentType, "content-length": String(limit + 1) } });
    expect(res.status).toBe(413);
    // Ein ReadableStream holt beim Anlegen schon ein Stück vor; mehr darf die Route nicht anfordern.
    expect(sent()).toBeLessThanOrEqual(MB);
  });
});

describe("Anfragen innerhalb der Grenze laufen weiter", () => {
  it("/api/sync: ein Body ohne Ereignisliste ist weiterhin ein 400", async () => {
    const res = await syncPost(new NextRequest("http://x/api/sync", { method: "POST", body: "{}", headers: { "content-type": "application/json" } }));
    expect(res.status).toBe(400);
  });

  it("/api/sync: kein JSON ist ein 400, kein 413", async () => {
    const res = await syncPost(new NextRequest("http://x/api/sync", { method: "POST", body: "kein json", headers: { "content-type": "application/json" } }));
    expect(res.status).toBe(400);
  });

  it("/api/company/documents: ein Formular ohne Datei meldet die fehlende Datei", async () => {
    const res = await documentsPost(emptyForm());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Es fehlt die Datei/);
  });

  it("/api/company/documents: kein multipart-Body ist ein 400", async () => {
    const res = await documentsPost(post({ method: "POST", body: "text", headers: { "content-type": "text/plain" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/multipart/);
  });

  it("/api/company/documents/:id/images: ein Formular ohne Datei meldet die fehlende Datei", async () => {
    const res = await imagesPost(emptyForm(), { params: Promise.resolve({ id: DOCUMENT_ID }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Es fehlt die Datei/);
  });

  it("/api/reviewer/profile/photo: ein Formular ohne Datei meldet die fehlende Datei", async () => {
    const res = await photoPost(emptyForm());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Es fehlt die Datei/);
  });

  it("/api/internal-courses: ein Formular ohne Dateien verlangt mindestens eine", async () => {
    const res = await coursesPost(emptyForm());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Bitte mindestens eine Datei angeben.");
  });

  it("/api/internal-courses: der JSON-Weg ist auf 256 KB begrenzt, auch in Stücken", async () => {
    const { init, sent } = chunked(20 * MB, "application/json");
    const res = await coursesPost(post(init));
    expect(res.status).toBe(413);
    expect(sent()).toBeLessThanOrEqual(2 * MB);
  });

  it("/api/internal-courses: ungültiges JSON ist ein 400", async () => {
    const res = await coursesPost(post({ method: "POST", body: "{", headers: { "content-type": "application/json" } }));
    expect(res.status).toBe(400);
  });
});
