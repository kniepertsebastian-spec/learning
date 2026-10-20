import { describe, expect, it } from "vitest";
import { CONTENT_SYSTEM_PROMPT_TEMPLATE, courseStory } from "./providers";

const base = { courseTitle: "Brandschutz Grundlagen", withQuestions: true, language: "de" as const };

describe("Lebendige Texte im Inhaltsprompt", () => {
  it("enthält Stilregeln, den Block POSSIBLE und die Geschichte des Kurses", () => {
    const prompt = CONTENT_SYSTEM_PROMPT_TEMPLATE(base);
    expect(prompt).toContain("du-Form");
    expect(prompt).toContain("[!POSSIBLE]");
    expect(prompt).toContain("Was passiert, wenn");
    expect(prompt).toContain(courseStory(base.courseTitle));
  });

  it("die Geschichte hängt nur vom Kurstitel ab (Prompt bleibt für alle Lernziele gleich, Cache) und ist branchenneutral", () => {
    expect(courseStory("A")).toBe(courseStory("A"));
    expect(courseStory("Brandschutz Grundlagen")).toMatch(/passend zum Kursthema/);
    expect(courseStory("Brandschutz Grundlagen")).not.toMatch(/IT|Server|Netzwerk/);
  });

  it("Firmenkurse (praktisch) und Stichwortlisten bekommen keine erfundene Firma", () => {
    expect(CONTENT_SYSTEM_PROMPT_TEMPLATE({ ...base, practical: true })).not.toContain("Durchgehende Geschichte");
    expect(CONTENT_SYSTEM_PROMPT_TEMPLATE({ ...base, outline: true })).not.toContain("Durchgehende Geschichte");
  });
});
