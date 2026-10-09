import { describe, expect, it } from "vitest";
import { validateLearningBlocks } from "./validate";

const ok = ":::practice\n### Szenario\na\n### Aufgabe\nb\n### Lösung\nc\n### Warum\nd\n:::";

describe("validateLearningBlocks", () => {
  it("gültige Blöcke und normaler Text geben keine Fehler", () => {
    expect(validateLearningBlocks("Text\n\n> [!EXAM]\n> x\n\n" + ok + "\n\n:::tabs\n::tab[A]\nx\n::tab[B]\ny\n:::\n\n:::steps\n- a | b\n- c | d\n:::")).toEqual([]);
  });
  it("nicht geschlossene Direktive", () => {
    expect(validateLearningBlocks(":::tabs\n::tab[A]\nx")[0]).toMatch(/nicht geschlossen/);
  });
  it("practice braucht alle vier Teile", () => {
    expect(validateLearningBlocks(":::practice\n### Szenario\na\n:::").join(" ")).toMatch(/fehlen Teile \(task, solution, why\)/);
  });
  it("tabs braucht zwei Tabs, steps zwei Schritte", () => {
    expect(validateLearningBlocks(":::tabs\n::tab[A]\nx\n:::").join()).toMatch(/mindestens zwei ::tab/);
    expect(validateLearningBlocks(":::steps\n- a | b\n:::").join()).toMatch(/mindestens zwei Schritte/);
  });
  it("unbekannter Block und unbekannter Hinweis", () => {
    expect(validateLearningBlocks(":::foo\nx\n:::").join()).toMatch(/unbekannter Block/);
    expect(validateLearningBlocks("> [!TIP]\n> x").join()).toMatch(/unbekannter Hinweis/);
  });
  it("Direktiven in Codeblöcken zählen nicht, offener Codeblock ist ein Fehler", () => {
    expect(validateLearningBlocks("```md\n:::tabs\n```")).toEqual([]);
    expect(validateLearningBlocks("```bash\nls")[0]).toMatch(/Codeblock/);
  });
  it("überzähliges Schließen", () => {
    expect(validateLearningBlocks(":::")[0]).toMatch(/ohne öffnenden/);
  });
});
