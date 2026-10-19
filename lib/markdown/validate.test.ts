import { describe, expect, it } from "vitest";
import { repairLearningBlocks, validateLearningBlocks } from "./validate";

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

describe("nummerierte Schritte", () => {
  it("`:::steps` mit nummerierter Liste ist gültig (der Renderer nimmt beide Listenarten)", () => {
    expect(validateLearningBlocks(":::steps\n1. a | b\n2. c | d\n:::")).toEqual([]);
  });
});

describe("repairLearningBlocks", () => {
  const repaired = (md: string) => {
    const out = repairLearningBlocks(md);
    expect(validateLearningBlocks(out)).toEqual([]);
    return out;
  };
  it("gültiger Text bleibt unverändert", () => {
    const md = "Text\n\n" + ok + "\n\n:::steps\n- a | b\n- c | d\n:::";
    expect(repaired(md)).toBe(md);
  });
  it("`:::steps` mit nur einem Schritt wird aufgelöst, der Inhalt bleibt", () => {
    expect(repaired("Vorher\n:::steps\n- a | b\n:::\nNachher")).toBe("Vorher\n- a | b\nNachher");
  });
  it("Schritte ohne Listenpunkt: Block aufgelöst, Text bleibt", () => {
    expect(repaired(":::steps\nErst a, dann b\n:::")).toBe("Erst a, dann b");
  });
  it("unvollständiges practice, ein-Tab-tabs und unbekannter Block werden aufgelöst", () => {
    expect(repaired(":::practice\n### Szenario\na\n:::")).toBe("### Szenario\na");
    expect(repaired(":::tabs\n::tab[A]\nx\n:::")).toBe("::tab[A]\nx");
    expect(repaired(":::foo\nx\n:::")).toBe("x");
  });
  it("offener gültiger Block wird geschlossen, offener ungültiger aufgelöst, überzähliges ::: entfernt", () => {
    expect(repaired(":::steps\n- a | b\n- c | d")).toBe(":::steps\n- a | b\n- c | d\n:::");
    expect(repaired("x\n:::steps\n- a | b")).toBe("x\n- a | b");
    expect(repaired("x\n:::")).toBe("x");
  });
  it("verschachtelt: nur der ungültige innere Block wird aufgelöst", () => {
    expect(repaired("::::tabs\n::tab[A]\n:::steps\n- a | b\n:::\n::tab[B]\ny\n::::")).toBe("::::tabs\n::tab[A]\n- a | b\n::tab[B]\ny\n::::");
  });
  it("offener Codeblock wird geschlossen, unbekannter Hinweis wird NOTE", () => {
    expect(repaired("```bash\nls")).toBe("```bash\nls\n```");
    expect(repaired("> [!TIP]\n> x")).toBe("> [!NOTE]\n> x");
  });
});

describe("Simulationen", () => {
  const sim = JSON.stringify({ type: "terminal", title: "T", scenario: "S", steps: [{ goal: "g", accept: ["ls"], output: "", hint: "h" }], success: "ok" });
  it("gültige Simulation ergibt keinen Fehler, ungültige schon", () => {
    expect(validateLearningBlocks("Text\n\n```simulation\n" + sim + "\n```")).toEqual([]);
    expect(validateLearningBlocks("```simulation\n{\"type\":\"terminal\"}\n```")[0]).toMatch(/Simulation ab Zeile 1 ungültig/);
  });
  it("Reparatur entfernt ungültige und nicht geschlossene Simulationen ganz, gültige bleiben", () => {
    expect(repairLearningBlocks("A\n```simulation\n{kaputt}\n```\nB")).toBe("A\nB");
    expect(repairLearningBlocks("A\n```simulation\n{\"type\":")).toBe("A");
    const good = "A\n```simulation\n" + sim + "\n```";
    expect(repairLearningBlocks(good)).toBe(good);
    expect(validateLearningBlocks(repairLearningBlocks("```simulation\n{}\n```\n:::steps\n- a | b\n:::"))).toEqual([]);
  });
});
