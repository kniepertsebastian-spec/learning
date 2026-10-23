import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LessonSimulationsProvider } from "@/components/lesson/LessonSimulations";
import { RichText } from "@/components/RichText";
import { parseCodeMeta, parseLineRanges, terminalCommands } from "@/lib/markdown/blocks";

const html = (text: string) => renderToStaticMarkup(<RichText text={text} />);

describe("Hinweisblöcke", () => {
  it.each([
    ["EXAM", "exam", "Prüfungsrelevant"],
    ["MISTAKE", "mistake", "Häufiger Fehler"],
    ["MEMO", "memo", "Merksatz"],
    ["NOTE", "info", "Hinweis"],
  ])("> [!%s] wird zum Callout %s", (marker, tone, title) => {
    const out = html(`> [!${marker}]\n> Der Text des Hinweises.`);
    expect(out).toContain(`data-callout="${tone}"`);
    expect(out).toContain(title);
    expect(out).toContain("Der Text des Hinweises.");
    expect(out).not.toContain(`[!${marker}]`);
  });
  it("normale Zitate bleiben Zitate", () => {
    const out = html("> Nur ein Zitat");
    expect(out).toContain("<blockquote");
    expect(out).not.toContain("data-callout");
  });
});

describe("Terminal-Block", () => {
  const src = "```console {3}\n$ kubectl get pods\nNAME   READY\n$ kubectl delete pod web\nError from server\n```";
  it("Befehle mit Prompt, Ausgabe grau, Fehlerzeile markiert", () => {
    const out = html(src);
    expect(out).toContain('data-testid="terminal-block"');
    expect(out).toContain('data-row="command"');
    expect(out).toContain('data-row="output"');
    expect(out).toContain("data-error");
  });
  it("Kopieren liefert nur die Befehle, ohne $ und ohne Ausgabe", () => {
    expect(terminalCommands("$ kubectl get pods\nNAME READY\n$ kubectl delete pod web\nError")).toBe("kubectl get pods\nkubectl delete pod web");
    expect(terminalCommands("nur Ausgabe")).toBe("");
  });
  it("ohne Befehle gibt es keinen Kopieren-Knopf", () => {
    expect(html("```console\nnur Ausgabe\n```")).not.toContain("copy-button");
    expect(html("```console\n$ ls\n```")).toContain("copy-button");
  });
});

describe("Codeblock mit Titel und Zeilenmarkierung", () => {
  it("Kopfzeile, Dateiname und markierte Zeilen", () => {
    const out = html('```yaml title="deployment.yaml" {2-3}\na: 1\nb: 2\nc: 3\n```');
    expect(out).toContain("deployment.yaml");
    expect((out.match(/data-highlighted/g) ?? []).length).toBe(2);
    expect(out).toContain('data-line="3"');
  });
  it("Metaangaben werden robust gelesen", () => {
    expect(parseCodeMeta('title="a b.yaml" {7-8,12}')).toEqual({ title: "a b.yaml", lines: [7, 8, 12] });
    expect(parseCodeMeta(null)).toEqual({ title: null, lines: [] });
    expect(parseLineRanges("3-1, x, 5")).toEqual([5]);
  });
});

describe("Tabs, Schritte, Praxisbeispiel", () => {
  it("Tabs mit Auswahl, erster Tab sichtbar", () => {
    const out = html(":::tabs\n::tab[Imperativ (kubectl)]\n\nA-Inhalt\n\n::tab[Deklarativ]\n\nB-Inhalt\n:::");
    expect(out).toContain('data-testid="tabs-block"');
    expect(out).toContain("Imperativ (kubectl)");
    expect(out).toContain("A-Inhalt");
    expect(out).not.toContain("B-Inhalt");
  });
  it("Schritte als Kästen mit Befehl", () => {
    const out = html(":::steps\n- Image bauen | docker build -t app .\n- Pushen | docker push app\n:::");
    expect(out).toContain('data-testid="steps-block"');
    expect(out).toContain("Image bauen");
    expect(out).toContain("docker push app");
  });
  const practice = ":::practice\n### Szenario\nEin Pod startet nicht.\n### Aufgabe\nFinde die Ursache.\n### Lösung\n`kubectl describe pod`\n### Warum\nWeil Events die Ursache zeigen.\n:::";
  it("Praxiskarte: Szenario und Aufgabe sichtbar, Lösung eingeklappt", () => {
    const out = html(practice);
    expect(out).toContain('data-testid="practice-block"');
    expect(out).toContain("Ein Pod startet nicht.");
    expect(out).toContain("Finde die Ursache.");
    expect(out).toContain('aria-expanded="false"');
    expect(out).not.toContain("kubectl describe pod");
    expect(out).not.toContain("Weil Events");
  });
  it("Praxiskarte ohne alle vier Teile wird als Text gezeigt, nicht als Karte", () => {
    const out = html(":::practice\n### Szenario\nNur ein Teil.\n:::");
    expect(out).not.toContain("practice-block");
    expect(out).toContain("Nur ein Teil.");
  });
});

describe("Sicherheit und Fallbacks", () => {
  it("rohes HTML und Skripte kommen nie als HTML durch", () => {
    const out = html("<script>alert(1)</script>\n\n> [!EXAM]\n> <img src=x onerror=alert(2)>\n\n:::practice\n<b onclick=x>y</b>\n:::");
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/<img/i);
    expect(out).not.toMatch(/<b /i);
  });
  it("gewöhnlicher Text mit Doppelpunkt wird nicht zur Direktive", () => {
    const out = html("Port:443 und --image=nginx:latest und 10:30 Uhr, Hinweis:wichtig");
    expect(out).toContain("Port:443");
    expect(out).toContain("nginx:latest");
    expect(out).toContain("10:30");
    expect(out).toContain("Hinweis:wichtig");
  });
  it("unbekannte Direktiven erscheinen als Text", () => {
    const out = html(":::unknown\nInhalt\n:::");
    expect(out).toContain("Inhalt");
    expect(out).not.toContain("data-block");
  });
  it("nicht geschlossene Direktive bricht nichts", () => {
    expect(() => html(":::tabs\n::tab[A]\nText ohne Ende")).not.toThrow();
  });
  it("Links sind keine Links, Bilder entfallen", () => {
    const out = html("[x](http://evil.example) ![i](http://evil.example/a.png)");
    expect(out).not.toContain("<a ");
    expect(out).not.toContain("<img");
  });
});

describe("Simulation", () => {
  const terminal = { type: "terminal", title: "Pod neu starten", scenario: "Der Pod hängt.", steps: [{ goal: "Zeige alle Pods.", accept: ["kubectl get pods"], output: "NAME", hint: "get" }], success: "Gut." };
  const decision = {
    type: "decision",
    title: "Shop down",
    scenario: "Shop weg.",
    start: "a",
    nodes: [
      { id: "a", text: "Was zuerst?", status: [{ label: "HTTP", value: "503", tone: "bad" }], choices: [{ label: "Logs lesen", next: "b", feedback: "f" }, { label: "Neu aufsetzen", next: "c", feedback: "f" }] },
      { id: "b", text: "Gefunden.", outcome: "success" },
      { id: "c", text: "Weg.", outcome: "failure" },
    ],
  };
  const config = { type: "config", title: "Service", scenario: "Freigeben.", file: "svc.yaml", template: "type: {{t}}", blanks: [{ id: "t", options: ["ClusterIP", "NodePort"], answer: "ClusterIP", explanation: "intern" }], success: "ok" };
  const block = (o: unknown) => html("Vorher\n\n```simulation\n" + JSON.stringify(o) + "\n```\n\nNachher");

  it("Terminal: Ziel des ersten Schritts und Eingabe, Befehl und Lösung nicht sichtbar", () => {
    const out = block(terminal);
    expect(out).toContain('data-sim-type="terminal"');
    expect(out).toContain("Zeige alle Pods.");
    expect(out).toContain('data-testid="simulation-input"');
    expect(out).not.toContain("kubectl get pods");
    expect(out).toContain("Nachher");
  });
  it("Entscheidung: Lage, Situation des Starts und Auswahl", () => {
    const out = block(decision);
    expect(out).toContain('data-testid="simulation-status"');
    expect(out).toContain("Was zuerst?");
    expect((out.match(/data-testid="simulation-choice"/g) ?? []).length).toBe(2);
    expect(out).not.toContain("Gefunden.");
  });
  it("Konfiguration: Lücken als Auswahl, Erklärung erst nach dem Lösen", () => {
    const out = block(config);
    expect(out).toContain("svc.yaml");
    expect(out).toContain('data-testid="simulation-select"');
    expect(out).toContain("NodePort");
    expect(out).not.toContain("intern");
  });
  it("ungültige Simulation bleibt ein gewöhnlicher Codeblock", () => {
    const out = html('```simulation\n{"type":"terminal"}\n```');
    expect(out).not.toContain("simulation-block");
    expect(out).toContain('data-testid="code-block"');
  });
});

describe("Simulation: „Ich hänge fest“ im Firmenbereich", () => {
  const sim = {
    type: "decision",
    title: "Shop down",
    scenario: "Shop weg.",
    start: "a",
    nodes: [
      { id: "a", text: "Was zuerst?", choices: [{ label: "Logs lesen", next: "b", feedback: "f" }, { label: "Neu aufsetzen", next: "c", feedback: "f" }] },
      { id: "b", text: "Gefunden.", outcome: "success" },
      { id: "c", text: "Weg.", outcome: "failure" },
    ],
  };
  const text = "Vorher\n\n```simulation\n" + JSON.stringify(sim) + "\n```\n";
  const render = (mentorAsk: { topic: string; certificationId: string } | null) =>
    renderToStaticMarkup(
      <LessonSimulationsProvider text={text} sectionId="s1" persist={false} initialProgress={[]} mentorAsk={mentorAsk}>
        <RichText text={text} />
      </LessonSimulationsProvider>,
    );

  it("mit zugeordnetem Mentor gibt es den Button, nur als Angebot ohne automatische Übertragung", () => {
    const out = render({ topic: "Dienste prüfen", certificationId: "c1" });
    expect(out).toContain('data-testid="mentor-ask-open"');
    expect(out).not.toContain('data-testid="mentor-ask-form"'); // das Formular öffnet erst die Person selbst
    expect(out).not.toContain('data-testid="mentor-ask-send"');
  });

  it("ohne Mentor oder außerhalb des Firmenbereichs gibt es keinen Button", () => {
    expect(render(null)).not.toContain("mentor-ask-open");
    expect(html(text)).not.toContain("mentor-ask-open");
  });
});

