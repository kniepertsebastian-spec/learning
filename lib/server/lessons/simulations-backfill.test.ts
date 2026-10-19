import { describe, expect, it } from "vitest";
import { applySimulation, HAS_SIMULATION, insertAfterSection, toSimulationFence } from "./simulations-backfill";
import { validateLearningBlocks } from "@/lib/markdown/validate";

const sim = (lang: "de" | "en") => ({
  type: "terminal",
  title: lang === "de" ? "Dateien zeigen" : "List files",
  scenario: lang === "de" ? "Zeig die Dateien mit `ls`-Varianten:\n```bash\nls\n```" : "List the files:\n```bash\nls\n```",
  steps: [{ goal: lang === "de" ? "Alle Dateien" : "All files", accept: ["ls -la"], output: "total 0", hint: "-a" }],
  success: "ok",
});

describe("simulations-backfill", () => {
  const md = "## Eins\n\nText eins.\n\n```bash\n## kein Kopf\n```\n\n## Zwei\n\nText zwei.";
  it("fügt hinter dem Abschnitt der Überschrift ein, sonst am Ende; Überschriften in Codeblöcken zählen nicht", () => {
    expect(insertAfterSection(md, "Eins", "BLOCK")).toBe("## Eins\n\nText eins.\n\n```bash\n## kein Kopf\n```\n\nBLOCK\n\n## Zwei\n\nText zwei.");
    expect(insertAfterSection(md, "## Zwei", "BLOCK").endsWith("Text zwei.\n\nBLOCK\n")).toBe(true);
    expect(insertAfterSection(md, "gibt es nicht", "BLOCK").endsWith("BLOCK\n")).toBe(true);
  });
  it("Fence ist länger als Backticks im JSON, Ergebnis ist ein gültiger Lernblock", () => {
    const fence = toSimulationFence(JSON.stringify(sim("de")))!;
    expect(fence.startsWith("````simulation")).toBe(true);
    expect(validateLearningBlocks(fence)).toEqual([]);
    expect(HAS_SIMULATION.test(fence)).toBe(true);
    expect(toSimulationFence('{"type":"terminal"}')).toBeNull();
  });
  it("setzt beide Sprachen ein und lehnt ab, wenn sich die Fassungen unterschiedlich verhalten", () => {
    const content = { de: md, en: "## One\n\nText one." };
    const next = applySimulation(content, { afterHeading: "Eins", de: JSON.stringify(sim("de")), en: JSON.stringify(sim("en")) })!;
    expect(next.de).toContain("Dateien zeigen");
    expect(next.en).toContain("List files");
    const other = { ...sim("en"), steps: [{ ...sim("en").steps[0], accept: ["ls -l"] }] };
    expect(applySimulation(content, { afterHeading: "Eins", de: JSON.stringify(sim("de")), en: JSON.stringify(other) })).toBeNull();
  });
  it("einsprachige Lektion (de = en) bekommt in beiden Feldern denselben Text", () => {
    const next = applySimulation({ de: md, en: md }, { afterHeading: "", de: JSON.stringify(sim("de")), en: "egal" })!;
    expect(next.en).toBe(next.de);
  });
});
