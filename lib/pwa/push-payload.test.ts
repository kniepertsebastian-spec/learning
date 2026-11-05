import { describe, expect, it } from "vitest";
import { parsePush, safeAppPath } from "./push-payload";

describe("Service Worker: Push-Nachricht lesen", () => {
  it("übernimmt Titel, Text, Pfad und Tag des Servers", () => {
    expect(parsePush(JSON.stringify({ title: "Wiederholungen warten", body: "4 Fragen", url: "/exams", tag: "daily" }))).toEqual({ title: "Wiederholungen warten", body: "4 Fragen", url: "/exams", tag: "daily" });
  });

  it("kaputte oder fehlende Daten ergeben trotzdem eine neutrale Nachricht", () => {
    for (const raw of [null, undefined, "", "kein json", "123", "null", "[]"]) {
      expect(parsePush(raw as string | null | undefined), String(raw)).toMatchObject({ title: "Knowvia", url: "/" });
    }
  });

  it("nur Pfade der eigenen App sind Ziele", () => {
    for (const bad of ["https://evil.example", "//evil.example/x", "/\\evil.example", "javascript:alert(1)", "evil", "", null, 5, "/ok\nlinebreak"]) {
      expect(safeAppPath(bad), String(bad)).toBe("/");
    }
    expect(safeAppPath("/cert/az-900?tab=x")).toBe("/cert/az-900?tab=x");
  });

  it("begrenzt Längen und ignoriert fremde Typen", () => {
    const shown = parsePush(JSON.stringify({ title: "t".repeat(500), body: { x: 1 }, url: 7, tag: ["a"] }));
    expect(shown.title).toHaveLength(120);
    expect(shown).toMatchObject({ body: "", url: "/", tag: "default" });
  });
});
