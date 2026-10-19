import { z } from "zod";

/**
 * Interaktive Simulationen in Lektionen: ein Codeblock mit Sprache `simulation`, dessen Inhalt JSON ist. Der Lerner löst
 * die Aufgabe selbst, statt nur ein Beispiel zu lesen. Drei Arten:
 *
 *  - `terminal`: Befehle Schritt für Schritt eintippen; jeder Schritt nennt ein Ziel, die akzeptierten Befehle und die
 *    Ausgabe, die das simulierte System danach zeigt.
 *  - `decision`: Entscheidungsszenario (Störung, Incident, Beratung) als Graph von Situationen mit Auswahlmöglichkeiten;
 *    Situationen ohne Auswahl sind ein Ende (`outcome`: success | failure).
 *  - `config`: eine Konfiguration mit Lücken `{{id}}`, für die der Lerner Werte auswählt und „anwendet“.
 *
 * JSON statt Markdown-Syntax, weil Graphen und Lücken sich nicht robust in Überschriften ausdrücken lassen; zod prüft die
 * Struktur und die Querverweise (Ziele von `next`, Lücken im Template). Ungültige Simulationen werden bei der Erzeugung
 * entfernt (repairLearningBlocks) und beim Anzeigen als normaler Codeblock gezeigt, nie halb interaktiv.
 */

export const SIMULATION_LANG = "simulation";

const line = (max: number) => z.string().trim().min(1).max(max);
const id = z.string().trim().regex(/^[A-Za-z0-9_-]{1,40}$/, "IDs nur aus Buchstaben, Ziffern, _ und -");

const terminalSchema = z.object({
  type: z.literal("terminal"),
  title: line(120),
  scenario: line(2000),
  prompt: z.string().trim().max(60).optional(),
  steps: z
    .array(
      z.object({
        goal: line(500),
        accept: z.array(line(300)).min(1).max(6),
        output: z.string().max(4000).default(""),
        hint: line(500),
      }),
    )
    .min(1)
    .max(8),
  success: line(2000),
});

const decisionSchema = z
  .object({
    type: z.literal("decision"),
    title: line(120),
    scenario: line(2000),
    start: id,
    nodes: z
      .array(
        z.object({
          id,
          text: line(2000),
          status: z
            .array(z.object({ label: line(60), value: line(120), tone: z.enum(["ok", "warn", "bad"]).optional() }))
            .max(6)
            .optional(),
          choices: z
            .array(z.object({ label: line(300), next: id, feedback: line(1000) }))
            .max(4)
            .optional(),
          outcome: z.enum(["success", "failure"]).optional(),
        }),
      )
      .min(2)
      .max(15),
  })
  .superRefine((sim, ctx) => {
    const ids = new Set<string>();
    for (const node of sim.nodes) {
      if (ids.has(node.id)) ctx.addIssue({ code: "custom", message: `Knoten "${node.id}" ist doppelt.` });
      ids.add(node.id);
    }
    if (!ids.has(sim.start)) ctx.addIssue({ code: "custom", message: `Startknoten "${sim.start}" fehlt.` });
    for (const node of sim.nodes) {
      const hasChoices = (node.choices?.length ?? 0) > 0;
      if (hasChoices && node.choices!.length < 2) ctx.addIssue({ code: "custom", message: `Knoten "${node.id}": mindestens zwei Auswahlmöglichkeiten.` });
      if (hasChoices === Boolean(node.outcome)) ctx.addIssue({ code: "custom", message: `Knoten "${node.id}": entweder Auswahlmöglichkeiten oder ein outcome.` });
      for (const c of node.choices ?? []) if (!ids.has(c.next)) ctx.addIssue({ code: "custom", message: `Knoten "${node.id}": Ziel "${c.next}" fehlt.` });
    }
    // Vom Start aus muss ein erfolgreiches Ende erreichbar sein, sonst ist die Simulation nicht lösbar.
    const byId = new Map(sim.nodes.map((n) => [n.id, n]));
    const seen = new Set<string>();
    const queue = [sim.start];
    let solvable = false;
    while (queue.length) {
      const cur = byId.get(queue.shift()!);
      if (!cur || seen.has(cur.id)) continue;
      seen.add(cur.id);
      if (cur.outcome === "success") solvable = true;
      for (const c of cur.choices ?? []) queue.push(c.next);
    }
    if (!solvable) ctx.addIssue({ code: "custom", message: "Kein erfolgreiches Ende vom Start aus erreichbar." });
  });

const PLACEHOLDER = /\{\{\s*([A-Za-z0-9_-]{1,40})\s*\}\}/g;

const configSchema = z
  .object({
    type: z.literal("config"),
    title: line(120),
    scenario: line(2000),
    file: z.string().trim().max(120).optional(),
    template: line(4000),
    blanks: z
      .array(z.object({ id, options: z.array(line(200)).min(2).max(6), answer: line(200), explanation: line(1000) }))
      .min(1)
      .max(8),
    successOutput: z.string().max(4000).default(""),
    failureOutput: z.string().max(4000).default(""),
    success: line(2000),
  })
  .superRefine((sim, ctx) => {
    const used = new Set([...sim.template.matchAll(PLACEHOLDER)].map((m) => m[1]));
    const ids = new Set<string>();
    for (const b of sim.blanks) {
      if (ids.has(b.id)) ctx.addIssue({ code: "custom", message: `Lücke "${b.id}" ist doppelt.` });
      ids.add(b.id);
      if (!b.options.includes(b.answer)) ctx.addIssue({ code: "custom", message: `Lücke "${b.id}": die Antwort steht nicht in den Optionen.` });
      if (new Set(b.options).size !== b.options.length) ctx.addIssue({ code: "custom", message: `Lücke "${b.id}": doppelte Optionen.` });
      if (!used.has(b.id)) ctx.addIssue({ code: "custom", message: `Lücke "${b.id}" kommt im Template nicht vor.` });
    }
    for (const u of used) if (!ids.has(u)) ctx.addIssue({ code: "custom", message: `Platzhalter "{{${u}}}" hat keine Lücke.` });
  });

export const simulationSchema = z.discriminatedUnion("type", [terminalSchema, decisionSchema, configSchema]);
export type Simulation = z.infer<typeof simulationSchema>;
export type TerminalSimulation = z.infer<typeof terminalSchema>;
export type DecisionSimulation = z.infer<typeof decisionSchema>;
export type ConfigSimulation = z.infer<typeof configSchema>;

export type SimulationParse = { ok: true; simulation: Simulation } | { ok: false; errors: string[] };

export function parseSimulation(source: string): SimulationParse {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    return { ok: false, errors: ["kein gültiges JSON"] };
  }
  const r = simulationSchema.safeParse(raw);
  if (r.success) return { ok: true, simulation: r.data };
  return { ok: false, errors: r.error.issues.slice(0, 5).map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)) };
}

/** Template einer Konfig-Simulation in Text- und Lückenteile zerlegen. */
export function splitTemplate(template: string): Array<{ text: string } | { blank: string }> {
  const parts: Array<{ text: string } | { blank: string }> = [];
  let last = 0;
  for (const m of template.matchAll(PLACEHOLDER)) {
    if (m.index! > last) parts.push({ text: template.slice(last, m.index) });
    parts.push({ blank: m[1] });
    last = m.index! + m[0].length;
  }
  if (last < template.length) parts.push({ text: template.slice(last) });
  return parts;
}

/** Befehl vergleichbar machen: Prompt `$ ` und Leerraum am Rand weg, mehrfache Leerzeichen zu einem, abschließendes `;` weg. */
export function normalizeCommand(cmd: string): string {
  return cmd
    .trim()
    .replace(/^\$\s+/, "")
    .replace(/\s+/g, " ")
    .replace(/\s*;$/, "");
}

export function commandMatches(input: string, accept: string[]): boolean {
  const n = normalizeCommand(input);
  return n.length > 0 && accept.some((a) => normalizeCommand(a) === n);
}

/**
 * Was eine Übersetzung nicht ändern darf: Art, IDs, Verweise, Befehle, Ausgaben, Template und Optionen. Gleiches
 * Skelett heißt, die übersetzte Simulation verhält sich genau wie das Original.
 */
export function simulationSkeleton(sim: Simulation): string {
  switch (sim.type) {
    case "terminal":
      return JSON.stringify([sim.type, sim.prompt ?? null, sim.steps.map((s) => [s.accept, s.output])]);
    case "decision":
      return JSON.stringify([sim.type, sim.start, sim.nodes.map((n) => [n.id, n.outcome ?? null, (n.choices ?? []).map((c) => c.next)])]);
    case "config":
      return JSON.stringify([sim.type, sim.template, sim.successOutput, sim.failureOutput, sim.blanks.map((b) => [b.id, b.options, b.answer])]);
  }
}

/** Inhalte aller ```simulation-Blöcke eines Markdown-Texts in Dokumentreihenfolge (Fences in anderer Länge eingeschlossen). */
export function extractSimulationSources(markdown: string): string[] {
  const out: string[] = [];
  let fence: { char: string; len: number; sim: boolean; body: string[] } | null = null;
  for (const line of markdown.split("\n")) {
    const f = /^\s*(`{3,}|~{3,})\s*([\w-]*)/.exec(line);
    if (!fence && f) {
      fence = { char: f[1][0], len: f[1].length, sim: f[2].toLowerCase() === SIMULATION_LANG, body: [] };
      continue;
    }
    if (fence && f && f[1][0] === fence.char && f[1].length >= fence.len && /^\s*(`{3,}|~{3,})\s*$/.test(line)) {
      if (fence.sim) out.push(fence.body.join("\n"));
      fence = null;
      continue;
    }
    fence?.body.push(line);
  }
  return out;
}
