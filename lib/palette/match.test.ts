import { describe, expect, it } from "vitest";
import { escapeLike, extractCommands, fold, normalizeQuery, queryTokens, rankByTitle, scoreTitle } from "./match";

describe("Command-Palette: Such-Hilfen", () => {
  it("fold: Umlaute in deutscher Umschrift, Akzente weg", () => {
    expect(fold("Prüfer")).toBe("pruefer");
    expect(fold("Größe")).toBe("groesse");
    expect(fold("Café")).toBe("cafe");
  });

  it("normalizeQuery: zu kurze Eingaben suchen nicht, lange werden gekürzt", () => {
    expect(normalizeQuery(" a ")).toBeNull();
    expect(normalizeQuery("")).toBeNull();
    expect(normalizeQuery("  kube   ctl ")).toBe("kube ctl");
    expect(normalizeQuery("x".repeat(500))).toHaveLength(80);
  });

  it("queryTokens: Wörter, ohne Doppelte, höchstens 6", () => {
    expect(queryTokens("Kubectl  get Get pods")).toEqual(["kubectl", "get", "pods"]);
    expect(queryTokens("a b c d e f g h")).toHaveLength(6);
  });

  it("escapeLike entschärft Platzhalter", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
  });

  it("scoreTitle: Anfang vor Wortanfang vor Teiltreffer, sonst 0", () => {
    expect(scoreTitle("Kubernetes Basics", "kube")).toBe(3);
    expect(scoreTitle("Intro to Kubernetes", "kube")).toBe(2);
    expect(scoreTitle("Security+ Pods und Netzwerke", "pod")).toBe(2);
    expect(scoreTitle("Grundlagen Netzwerk Pods", "netz pod")).toBe(1);
    expect(scoreTitle("Docker", "kube")).toBe(0);
    expect(scoreTitle("Docker", "")).toBe(0);
  });

  it("rankByTitle: bessere Treffer zuerst, ohne Treffer weg", () => {
    const items = [{ t: "Intro to Kubernetes" }, { t: "Docker" }, { t: "Kubernetes Basics" }, { t: "Kubernetes Advanced" }];
    expect(rankByTitle(items, "kube", (i) => i.t).map((i) => i.t)).toEqual(["Kubernetes Advanced", "Kubernetes Basics", "Intro to Kubernetes"]);
  });

  it("extractCommands: Zeilen aus Codeblöcken und Inline-Code, die alle Begriffe enthalten", () => {
    const md = [
      "# Pods",
      "Mit `kubectl get pods -A` listest du alle Pods; ohne `-A` nur den Namespace.",
      "```bash",
      "$ kubectl describe pod web",
      "kubectl get nodes",
      "```",
      "Kein Code: kubectl get secrets",
    ].join("\n");
    expect(extractCommands(md, "kubectl get")).toEqual(["kubectl get pods -A", "kubectl get nodes"]);
    expect(extractCommands(md, "describe")).toEqual(["kubectl describe pod web"]);
    expect(extractCommands(md, "secrets")).toEqual([]);
    expect(extractCommands(md, "", 3)).toEqual([]);
  });

  it("extractCommands: höchstens `limit`, keine Doppelten, lange Zeilen gekürzt", () => {
    const md = "```\n" + Array.from({ length: 6 }, (_, i) => `ls -l ${i}`).join("\n") + "\nls -l 0\n```";
    expect(extractCommands(md, "ls", 2)).toHaveLength(2);
    const long = extractCommands("```\n" + "ls " + "x".repeat(300) + "\n```", "ls");
    expect(long[0]).toHaveLength(120);
    expect(long[0].endsWith("...")).toBe(true);
  });
});
