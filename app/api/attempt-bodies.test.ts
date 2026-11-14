/**
 * Aufgabe 04a (Review 12.11.2026): Die Abgabe-Routen lesen ihren Body mit Obergrenze und prüfen ihn gegen ein Schema.
 * Ungültiges JSON und falsche Typen sind ein 400, ein zu großer Body ein 413 (auch in Stücken ohne Content-Length).
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn() }));
vi.mock("@/lib/server/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/server/locale", () => ({ getServerLocale: async () => "de" }));
vi.mock("@/lib/server/feature-flags", () => ({ isFeatureEnabled: () => true }));
vi.mock("@/lib/server/catalog/access", () => ({
  isStudySessionHidden: async () => false,
  isSectionHidden: async () => false,
  isDomainHidden: async () => false,
  isObjectiveHidden: async () => false,
  isCertificationHidden: async () => false,
  isExamHidden: async () => false,
  featuresOfSection: async () => null,
  featuresOfDomain: async () => null,
  featuresOfObjective: async () => null,
}));

import {
  MAX_ATTEMPT_BODY_BYTES,
  remediationAttemptBody,
  sectionAttemptBody,
  studySessionAttemptBody,
  studySessionExitBody,
} from "@/lib/server/http/attempt-body";
import { POST as sessionAttempt } from "./study-sessions/[sessionId]/attempt/route";
import { POST as sessionExit } from "./study-sessions/[sessionId]/exit/route";
import { POST as sectionAttempt } from "./sections/[id]/attempt/route";
import { POST as sectionExit } from "./sections/[id]/exit/route";
import { POST as chapterAttempt } from "./chapters/[id]/attempt/route";
import { POST as remediationAttempt } from "./remediation/[objectiveId]/attempt/route";
import { POST as examAttempt } from "./exams/[certId]/[examId]/attempt/route";

const ID = "11111111-1111-4111-8111-111111111111";
const KB = 1024;
const MB = 1024 * KB;
const JSON_HEADERS = { "content-type": "application/json" };

beforeEach(() => {
  mocks.auth.mockResolvedValue({ user: { id: "user-1" } });
});

/** Alle sieben Routen mit ihren Parametern. */
const routes = [
  { name: "/api/study-sessions/:id/attempt", call: (req: NextRequest) => sessionAttempt(req, { params: Promise.resolve({ sessionId: ID }) }) },
  { name: "/api/study-sessions/:id/exit", call: (req: NextRequest) => sessionExit(req, { params: Promise.resolve({ sessionId: ID }) }) },
  { name: "/api/sections/:id/attempt", call: (req: NextRequest) => sectionAttempt(req, { params: Promise.resolve({ id: ID }) }) },
  { name: "/api/sections/:id/exit", call: (req: NextRequest) => sectionExit(req, { params: Promise.resolve({ id: ID }) }) },
  { name: "/api/chapters/:id/attempt", call: (req: NextRequest) => chapterAttempt(req, { params: Promise.resolve({ id: ID }) }) },
  { name: "/api/remediation/:id/attempt", call: (req: NextRequest) => remediationAttempt(req, { params: Promise.resolve({ objectiveId: ID }) }) },
  { name: "/api/exams/:cert/:exam/attempt", call: (req: NextRequest) => examAttempt(req, { params: Promise.resolve({ certId: ID, examId: ID }) }) },
];

const request = (init: RequestInit) => new NextRequest("http://x/api", { method: "POST", ...init } as never);

/** Ein Body in 1-MB-Stücken ohne Content-Length; `sent()` sagt, wie viel davon gelesen wurde. */
function chunked(totalBytes: number) {
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
  return { init: { body, headers: JSON_HEADERS, duplex: "half" } as RequestInit, sent: () => sent };
}

describe.each(routes)("$name", ({ call }) => {
  it("ungültiges JSON ist ein 400", async () => {
    const res = await call(request({ body: "{kein json", headers: JSON_HEADERS }));
    expect(res.status).toBe(400);
  });

  it("ein leerer Body ist ein 400", async () => {
    const res = await call(request({ headers: JSON_HEADERS }));
    expect(res.status).toBe(400);
  });

  it("zu großer Body in Stücken ist ein 413 und wird nicht ganz gelesen", async () => {
    const { init, sent } = chunked(MAX_ATTEMPT_BODY_BYTES + 20 * MB);
    const res = await call(request(init));
    expect(res.status).toBe(413);
    expect(sent()).toBeLessThanOrEqual(2 * MB);
  });

  it("angegebene Größe über der Grenze ist ein 413, ohne zu lesen", async () => {
    const { init, sent } = chunked(5 * MB);
    const res = await call(request({ ...init, headers: { ...JSON_HEADERS, "content-length": String(MAX_ATTEMPT_BODY_BYTES + 1) } }));
    expect(res.status).toBe(413);
    expect(sent()).toBeLessThanOrEqual(MB);
  });
});

describe("falsche Typen sind ein 400", () => {
  const wrong = [
    { name: "/api/study-sessions/:id/attempt: answers ist kein Array", route: routes[0], body: { answers: "x" } },
    { name: "/api/study-sessions/:id/attempt: itemId ist keine Zeichenkette", route: routes[0], body: { answers: [{ itemId: 5, selectedOptionId: "a" }] } },
    { name: "/api/study-sessions/:id/exit: unbekannte Sicherheit", route: routes[1], body: { answers: [{ itemId: "i", selectedOptionId: "a", confidence: "egal" }] } },
    { name: "/api/study-sessions/:id/attempt: unbekannte Größenklasse", route: routes[0], body: { answers: [], deviceClass: "tablet" } },
    { name: "/api/study-sessions/:id/exit: Größenklasse ist kein Text", route: routes[1], body: { answers: [], deviceClass: 5 } },
    { name: "/api/sections/:id/attempt: answers fehlt", route: routes[2], body: {} },
    { name: "/api/sections/:id/attempt: questionId fehlt", route: routes[2], body: { answers: [{ selectedOptionId: "a" }] } },
    { name: "/api/sections/:id/exit: Antwortformat unbekannt", route: routes[3], body: { answers: [{ questionId: "q", answer: { kind: "magie" } }] } },
    { name: "/api/chapters/:id/attempt: answers ist kein Array", route: routes[4], body: { answers: {} } },
    { name: "/api/remediation/:id/attempt: sessionId keine UUID", route: routes[5], body: { sessionId: "1; drop table", answers: [] } },
    { name: "/api/remediation/:id/attempt: Index keine Zahl", route: routes[5], body: { sessionId: ID, answers: [{ questionIndex: "0", selectedOptionIndex: 1 }] } },
    { name: "/api/exams/:cert/:exam/attempt: answers fehlt", route: routes[6], body: { durationSeconds: 5 } },
    { name: "/api/exams/:cert/:exam/attempt: questionId ist keine Zeichenkette", route: routes[6], body: { answers: [{ questionId: 1 }] } },
  ];

  it.each(wrong)("$name", async ({ route, body }) => {
    const res = await route.call(request({ body: JSON.stringify(body), headers: JSON_HEADERS }));
    expect(res.status).toBe(400);
  });

  it("zu viele Antworten sind ein 400", () => {
    const answers = Array.from({ length: 501 }, (_, i) => ({ questionId: `q${i}`, selectedOptionId: "a" }));
    expect(sectionAttemptBody.safeParse({ answers }).success).toBe(false);
  });
});

describe("Schemas nehmen an, was die Clients senden", () => {
  it("Sitzung: Auswahl, neue Formate, Sicherheit und Denkmodus", () => {
    const body = {
      answers: [
        { itemId: "a", selectedOptionId: "o1", confidence: "sure", thinkFirst: true },
        { itemId: "b", selectedOptionId: "", answer: { kind: "ordering", order: ["1", "2", "3"] } },
        { itemId: "c", selectedOptionId: "", answer: { kind: "short_answer", text: "ls -la" } },
        { itemId: "d", selectedOptionId: "", answer: { kind: "matching", matches: { x: "x", y: "y" } }, answeredAt: "2026-11-14T05:03:11.123Z" },
      ],
    };
    expect(studySessionAttemptBody.parse(body).answers).toHaveLength(4);
    expect(studySessionExitBody.parse({ ...body, openItemId: "e" }).openItemId).toBe("e");
  });

  it("Sitzung: ohne answers gilt eine leere Liste, wie bisher", () => {
    expect(studySessionAttemptBody.parse({}).answers).toEqual([]);
    expect(studySessionExitBody.parse({}).answers).toEqual([]);
  });

  it("Lektionstest: eingewobene Antwort und fehlende optionale Felder", () => {
    const parsed = sectionAttemptBody.parse({ answers: [{ questionId: "q", selectedOptionId: "o", woven: true, answeredAt: "2026-11-14T05:03:11Z" }, { questionId: "r", answer: { kind: "short_answer", text: "x" } }] });
    expect(parsed.answers[1].selectedOptionId).toBe("");
  });

  it("Wiederholung: nicht beantwortet wird als -1 gesendet", () => {
    expect(remediationAttemptBody.parse({ sessionId: ID, answers: [{ questionIndex: 0, selectedOptionIndex: -1 }] }).answers).toHaveLength(1);
  });
});
