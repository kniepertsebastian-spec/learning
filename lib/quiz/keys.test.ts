import { describe, expect, it } from "vitest";
import { fmt, letterOf, quizKeyAction } from "./keys";

const key = (k: string, extra: Record<string, unknown> = {}) => ({ key: k, target: { tagName: "BODY" }, ...extra });

describe("quizKeyAction", () => {
  it("wählt per Buchstabe und Ziffer", () => {
    expect(quizKeyAction(key("a"), 4)).toEqual({ type: "pick", index: 0 });
    expect(quizKeyAction(key("D"), 4)).toEqual({ type: "pick", index: 3 });
    expect(quizKeyAction(key("3"), 4)).toEqual({ type: "pick", index: 2 });
  });
  it("ignoriert Optionen außerhalb der Anzahl", () => {
    expect(quizKeyAction(key("e"), 4)).toBeNull();
    expect(quizKeyAction(key("5"), 4)).toBeNull();
  });
  it("kennt Enter, F und Esc", () => {
    expect(quizKeyAction(key("Enter"), 4)).toEqual({ type: "enter" });
    expect(quizKeyAction(key("f"), 4)).toEqual({ type: "flag" });
    expect(quizKeyAction(key("Escape"), 4)).toEqual({ type: "escape" });
  });
  it("ist inaktiv in Eingabefeldern und mit Modifikatoren", () => {
    expect(quizKeyAction({ key: "a", target: { tagName: "INPUT" } }, 4)).toBeNull();
    expect(quizKeyAction({ key: "a", target: { tagName: "TEXTAREA" } }, 4)).toBeNull();
    expect(quizKeyAction({ key: "a", target: { tagName: "DIV", isContentEditable: true } }, 4)).toBeNull();
    expect(quizKeyAction(key("a", { ctrlKey: true }), 4)).toBeNull();
    expect(quizKeyAction(key("f", { metaKey: true }), 4)).toBeNull();
  });
});

describe("Hilfen", () => {
  it("Buchstaben und Platzhalter", () => {
    expect(letterOf(0)).toBe("A");
    expect(fmt("Frage {x} von {y}", { x: 2, y: 5 })).toBe("Frage 2 von 5");
  });
});
