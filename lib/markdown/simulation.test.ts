import { describe, expect, it } from "vitest";
import { commandMatches, extractSimulationSources, normalizeCommand, parseSimulation, simulationSkeleton, splitTemplate } from "./simulation";

export const terminalSim = {
  type: "terminal",
  title: "Pod neu starten",
  scenario: "Der Pod `web` hängt.",
  prompt: "admin@k8s:~$",
  steps: [
    { goal: "Zeige alle Pods.", accept: ["kubectl get pods", "kubectl get po"], output: "NAME  READY\nweb   0/1", hint: "kubectl get …" },
    { goal: "Lösche den Pod web.", accept: ["kubectl delete pod web"], output: 'pod "web" deleted', hint: "delete" },
  ],
  success: "Das Deployment erzeugt den Pod neu.",
};

export const decisionSim = {
  type: "decision",
  title: "Webserver down",
  scenario: "Der Shop ist nicht erreichbar.",
  start: "a",
  nodes: [
    { id: "a", text: "Was prüfst du zuerst?", status: [{ label: "HTTP", value: "503", tone: "bad" }], choices: [{ label: "Logs", next: "ok", feedback: "Gut." }, { label: "Server neu installieren", next: "bad", feedback: "Zu früh." }] },
    { id: "ok", text: "Ursache gefunden.", outcome: "success" },
    { id: "bad", text: "Daten weg.", outcome: "failure" },
  ],
};

export const configSim = {
  type: "config",
  title: "Service freigeben",
  scenario: "Mach den Dienst im Cluster erreichbar.",
  file: "service.yaml",
  template: "kind: Service\nspec:\n  type: {{type}}\n  port: {{port}}",
  blanks: [
    { id: "type", options: ["ClusterIP", "NodePort"], answer: "ClusterIP", explanation: "Nur intern." },
    { id: "port", options: ["80", "8080"], answer: "80", explanation: "HTTP." },
  ],
  successOutput: "service/web created",
  failureOutput: "error: port invalid",
  success: "Fertig.",
};

const parse = (o: unknown) => parseSimulation(JSON.stringify(o));

describe("parseSimulation", () => {
  it.each([["terminal", terminalSim], ["decision", decisionSim], ["config", configSim]])("gültige %s-Simulation", (_, sim) => {
    expect(parse(sim)).toMatchObject({ ok: true });
  });
  it("kein JSON / unbekannter Typ", () => {
    expect(parseSimulation("{type: terminal")).toEqual({ ok: false, errors: ["kein gültiges JSON"] });
    expect(parse({ ...terminalSim, type: "quiz" }).ok).toBe(false);
  });
  it("Entscheidung: fehlendes Ziel, fehlender Start, Knoten mit Auswahl UND Ende, kein erreichbarer Erfolg", () => {
    const nodes = decisionSim.nodes;
    expect(parse({ ...decisionSim, start: "x" }).ok).toBe(false);
    expect(parse({ ...decisionSim, nodes: [{ ...nodes[0], choices: [{ label: "x", next: "nirgends", feedback: "f" }, nodes[0].choices![1]] }, nodes[1], nodes[2]] }).ok).toBe(false);
    expect(parse({ ...decisionSim, nodes: [{ ...nodes[0], outcome: "success" }, nodes[1], nodes[2]] }).ok).toBe(false);
    const r = parse({ ...decisionSim, nodes: [nodes[0], { ...nodes[1], outcome: "failure" }, nodes[2]] });
    expect(r.ok === false && r.errors.join()).toMatch(/erfolgreiches Ende/);
  });
  it("Konfiguration: Antwort nicht in Optionen, Platzhalter ohne Lücke, Lücke ohne Platzhalter", () => {
    expect(parse({ ...configSim, blanks: [{ ...configSim.blanks[0], answer: "LoadBalancer" }, configSim.blanks[1]] }).ok).toBe(false);
    expect(parse({ ...configSim, template: configSim.template + "\n{{extra}}" }).ok).toBe(false);
    expect(parse({ ...configSim, template: "kind: Service\n  type: {{type}}" }).ok).toBe(false);
  });
});

describe("Befehle vergleichen", () => {
  it("Leerraum, Prompt und abschließendes ; sind egal, Groß/Klein nicht", () => {
    expect(normalizeCommand("  $ kubectl   get  pods ; ")).toBe("kubectl get pods");
    expect(commandMatches("kubectl get po", terminalSim.steps[0].accept)).toBe(true);
    expect(commandMatches("Kubectl get pods", terminalSim.steps[0].accept)).toBe(false);
    expect(commandMatches("   ", ["ls"])).toBe(false);
  });
});

describe("Hilfsfunktionen", () => {
  it("Template in Text und Lücken zerlegen", () => {
    expect(splitTemplate("a {{x}} b{{ y }}")).toEqual([{ text: "a " }, { blank: "x" }, { text: " b" }, { blank: "y" }]);
  });
  it("Skelett ändert sich nicht durch übersetzte Texte, aber durch andere Befehle", () => {
    const a = parse(terminalSim);
    const b = parse({ ...terminalSim, title: "Restart pod", steps: terminalSim.steps.map((s) => ({ ...s, goal: "Goal", hint: "Hint" })) });
    const c = parse({ ...terminalSim, steps: [terminalSim.steps[0], { ...terminalSim.steps[1], accept: ["kubectl delete po web"] }] });
    if (!a.ok || !b.ok || !c.ok) throw new Error("ungültig");
    expect(simulationSkeleton(b.simulation)).toBe(simulationSkeleton(a.simulation));
    expect(simulationSkeleton(c.simulation)).not.toBe(simulationSkeleton(a.simulation));
  });
  it("Simulationen aus Markdown lesen, andere Codeblöcke nicht", () => {
    const md = ["Text", "```bash", "ls", "```", "````simulation", '{"a":1}', "````", "~~~simulation", "{}", "~~~"].join("\n");
    expect(extractSimulationSources(md)).toEqual(['{"a":1}', "{}"]);
  });
});
