import { describe, expect, it } from "vitest";
import { buildSourceReport, compareCoverage, extractOfficialObjectives } from "./coverage";
import { cleanSources, dropStructuralPages, isStructuralPage } from "./source-pack";
import {
  fetchSourcesTolerant,
  fitSourceBudget,
  FULL_CONTEXT_MAX_CHARS,
  mainContentHtml,
  MAX_EXCERPT_CHARS_PER_SOURCE,
  MIN_EXCERPT_CHARS_PER_SOURCE,
  primarySourceIndex,
  PRIMARY_SOURCE_MAX_CHARS,
  stripHtml,
  type FetchedSource,
} from "./sources";

/** Quellen-Roadmap (28.11.2026): Blueprint-Trennung, NaN-freier Parser, Budget und HTML-Hauptinhalt. */

const source = (id: string, text: string, extra: Partial<FetchedSource> = {}): FetchedSource => ({
  id,
  title: id,
  url: `https://example.org/${id}`,
  retrievedAt: "",
  excerpts: [{ locator: "S. 1", text }],
  truncated: false,
  ...extra,
});

// Offizieller Blueprint im Stil von Anlage 2 PflAPrV: römische Kompetenzbereiche, darunter arabisch nummerierte Kompetenzen.
const BLUEPRINT = [
  "Anlage 2 (zu § 9 Absatz 1 Satz 2)",
  "I. Pflegeprozesse und Pflegediagnostik in akuten und dauerhaften Pflegesituationen verantwortlich planen",
  "1. Die Pflege von Menschen aller Altersstufen verantwortlich planen, organisieren und bewerten",
  "2. Pflegeprozesse und Pflegediagnostik bei Menschen mit gesundheitlichen Problemen durchführen",
  "a) erheben und beurteilen den Pflegebedarf",
  "II. Kommunikation und Beratung personen- und situationsorientiert gestalten",
  "1. Kommunikation und Interaktion mit Menschen und ihren Bezugspersonen gestalten",
  "2. Information, Schulung und Beratung bei Menschen aller Altersstufen verantwortlich organisieren",
  "III. Intra- und interprofessionelles Handeln in unterschiedlichen Kontexten verantwortlich gestalten",
  "1. Verantwortung in der Organisation des qualifikationsheterogenen Pflegeteams übernehmen",
].join("\n");
// Qualitätsprüfungsrichtlinie (QPR): tiefe Kriteriennummern, keine Lernziele der Prüfung.
const QPR = ["3.1.21 Ist die Dokumentation vollständig?", "2.10 Wird die Mobilität gefördert?", "2.11 Werden Risiken erfasst?", "2.12 Wird die Ernährung gesichert?"].join("\n");
// Begutachtungs-Richtlinie (BRi): Bereiche und Buchstaben-Präfixe.
const BRI = ["5.1–5.7 Module der Begutachtung im Überblick", "KF 4.4.0 Selbstversorgung im Überblick", "F 4.1.B Mobilität (Beispiel)", "S1a Sonderfall Kinder", "4.4 Bewertung der Selbstständigkeit"].join("\n");
// Prüfer-Handreichung: Didaktik, keine Prüfungsinhalte.
const HANDOUT = ["7.3–7.9 Ablauf der praktischen Prüfung", "7.3 Feedback geben im Gespräch", "7.4 Bewertungsbogen ausfüllen", "7.5 Protokoll führen"].join("\n");

describe("römische Hauptkapitel (AP-2.2, Punkt 3)", () => {
  it("macht aus „I.“ und den Punkten darunter 1.1, 1.2, …; Buchstaben-Unterpunkte zählen nicht", () => {
    const codes = extractOfficialObjectives([{ text: BLUEPRINT }]).map((o) => o.code);
    expect(codes).toEqual(["1.1", "1.2", "2.1", "2.2", "3.1"]);
  });

  it("zählt „1. …“-Listen ohne römisches Kapitel davor nicht, und „I think …“ ist kein Kapitel", () => {
    expect(extractOfficialObjectives([{ text: "1. Erster Schritt im Ablauf\n2. Zweiter Schritt im Ablauf" }])).toEqual([]);
    expect(extractOfficialObjectives([{ text: "I think this works fine\n1. Erster Schritt im Ablauf" }])).toEqual([]);
  });

  it("erkennt römisch-arabische Codes in einer Zeile („II.3 …“)", () => {
    expect(extractOfficialObjectives([{ text: "II.3 Beratung planen und durchführen" }])).toEqual([{ code: "2.3", title: "Beratung planen und durchführen" }]);
  });
});

describe("gemischtes Quellenset: Blueprint, QPR, BRi, Handreichung (AP-2.3)", () => {
  const all = () => [source("qpr", QPR), source("bri", BRI), source("handreichung", HANDOUT), source("blueprint", BLUEPRINT)];

  it("ohne Markierung gewinnt der Blueprint mit den meisten Lernzielen; der Bericht enthält nur seine Codes", () => {
    const sources = all();
    const primary = primarySourceIndex(sources);
    expect(sources[primary].id).toBe("blueprint");
    const report = buildSourceReport(sources.map((s, i) => (i === primary ? { ...s, primary: true } : s)));
    const codes = report.officialObjectives.map((o) => o.code);
    expect(codes).toEqual(["1.1", "1.2", "2.1", "2.2", "3.1"]);
    expect(codes.join(" ")).not.toMatch(/NaN|3\.1\.21|2\.10|7\.3|4\.4/);
  });

  it("die markierte Quelle hat Vorrang vor der Trefferzählung, auch wenn eine andere mehr Nummern hat", () => {
    const sources = [source("qpr", QPR), source("blueprint", BLUEPRINT)];
    expect(primarySourceIndex(sources, "https://example.org/qpr")).toBe(0);
    // Markierte Quelle fehlt (z. B. nicht abrufbar): Rückfall auf die Erkennung.
    expect(primarySourceIndex(sources, "https://example.org/gibt-es-nicht")).toBe(1);
  });

  it("nie NaN im Abgleich: Kurs-Codes mit Bereichen und Präfixen, alte Berichte mit kaputten Codes", () => {
    const official = [
      { code: "5.1", title: "a" }, { code: "5.2", title: "b" }, { code: "5.3", title: "c" },
      { code: "5.NaN.7", title: "alt" }, { code: "NaN.4.0", title: "alt" },
    ];
    const result = compareCoverage(official, ["5.1–5.7", "KF 4.4.0", "F 4.1.B", "S1a"]);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.recognised).toBe(3);
    expect(result.covered).toEqual(["5.1", "5.2", "5.3"]);
    expect(JSON.stringify(result)).not.toContain("NaN");
  });
});

describe("markierter Blueprint im Abruf (AP-2.1)", () => {
  it("fetchSourcesTolerant markiert die gewünschte Quelle als Leitfaden und kürzt sie nicht", async () => {
    const big = "x".repeat(200_000);
    const fake = async (id: string, url: string) => source(id, url.endsWith("/blueprint") ? `${big}\n${BLUEPRINT}` : QPR, { url });
    const { sources } = await fetchSourcesTolerant(["https://example.org/qpr", "https://example.org/blueprint"], fake, "https://example.org/blueprint");
    const blueprint = sources.find((s) => s.url.endsWith("/blueprint"))!;
    expect(blueprint).toMatchObject({ primary: true, primaryMarked: true, truncated: false });
    expect(sources.find((s) => s.url.endsWith("/qpr"))!.primary).toBeUndefined();
    expect(buildSourceReport(sources).primary).toEqual({ title: blueprint.title, url: blueprint.url, marked: true });
  });

  it("ohne Markierung bleibt `marked` weg", async () => {
    const fake = async (id: string, url: string) => source(id, BLUEPRINT, { url });
    const { sources } = await fetchSourcesTolerant(["https://example.org/a"], fake);
    expect(buildSourceReport(sources).primary).toEqual({ title: "src-1", url: "https://example.org/a" });
  });
});

describe("Budget je Quelle (AP-3.2)", () => {
  it("Gesamtbudget bleibt bei 400.000 Zeichen", () => {
    expect(FULL_CONTEXT_MAX_CHARS).toBe(400_000);
    expect(MAX_EXCERPT_CHARS_PER_SOURCE).toBe(120_000);
  });

  it("5 bis 8 kompakte Fachquellen werden nicht bei 60.000 Zeichen abgeschnitten", () => {
    const sizes = [90_000, 80_000, 45_000, 30_000, 70_000];
    const plan = fitSourceBudget(sizes, -1);
    expect(plan.limits.every((l) => l >= 90_000)).toBe(true);
    expect(plan.totalChars).toBe(315_000);
    expect(plan.totalChars).toBeLessThanOrEqual(FULL_CONTEXT_MAX_CHARS);
  });

  it("große Fachquellen teilen sich fair, was der Leitfaden übrig lässt; das Paket bleibt im Budget", () => {
    // Leitfaden 100k, eine kleine Quelle 20k, drei große je 200k: 300k Rest, die kleine bleibt ganz -> 280k / 3 = 93.333 je große.
    const plan = fitSourceBudget([100_000, 20_000, 200_000, 200_000, 200_000], 0);
    expect(plan.limits[0]).toBe(PRIMARY_SOURCE_MAX_CHARS);
    expect(plan.limits[2]).toBe(93_333);
    expect(plan.totalChars).toBeLessThanOrEqual(FULL_CONTEXT_MAX_CHARS);
  });

  it("nie unter den Mindestanteil, auch wenn das Budget dann überschritten wird (der Worker nimmt dann Ausschnitte)", () => {
    const plan = fitSourceBudget([380_000, 200_000, 200_000], 0);
    expect(plan.limits[1]).toBe(MIN_EXCERPT_CHARS_PER_SOURCE);
    expect(plan.totalChars).toBe(500_000);
  });
});

describe("HTML-Hauptinhalt (AP-3.1)", () => {
  const filler = "Prüfungsrelevanter Absatz mit Fachinhalt. ".repeat(20);
  const page = (body: string) => `<html><body><div class="cookie">Wir verwenden Cookies. Alle akzeptieren</div><div class="breadcrumb">Start › Themen › Pflege</div>${body}<div class="sidebar">Weitere Artikel: Termine, Presse</div></body></html>`;

  it("liest nur <main>, wenn darin genug Text steht", () => {
    const text = stripHtml(page(`<main><h1>Prüfungsordnung</h1><p>${filler}</p></main>`));
    expect(text).toContain("Prüfungsordnung");
    expect(text).not.toMatch(/Cookies|Start ›|Weitere Artikel/);
  });

  it("nimmt sonst alle <article> zusammen, oder role=main mit verschachtelten divs", () => {
    expect(stripHtml(page(`<article><p>${filler}</p></article><article><p>Zweiter Artikel</p></article>`))).toContain("Zweiter Artikel");
    const roleMain = stripHtml(page(`<div role="main"><div><p>${filler}</p></div><p>Ende des Inhalts</p></div>`));
    expect(roleMain).toContain("Ende des Inhalts");
    expect(roleMain).not.toMatch(/Weitere Artikel|Cookies/);
  });

  it("fällt auf die ganze Seite zurück, wenn <main> fast leer ist (Teaser, Inhalt per JavaScript)", () => {
    expect(mainContentHtml(page(`<main><p>Kurz</p></main><div>${filler}</div>`))).toBeNull();
    expect(stripHtml(page(`<main><p>Kurz</p></main><div>${filler}</div>`))).toContain("Prüfungsrelevanter Absatz");
  });
});

describe("Verzeichnis- und Formularseiten (AP-4.1)", () => {
  const toc = ["Inhaltsverzeichnis", "1 Einleitung ........................ 3", "1.1 Ziele der Prüfung ............... 4", "1.2 Aufbau . . . . . . . . . . . . . . 6", "2 Kompetenzbereiche ................. 9", "2.1 Pflegeprozess ……………… 11", "Anhang ______________ 40"].join("\n");
  const figures = ["Abbildungsverzeichnis", "Abb. 1 Aufbau der Prüfung ........ 5", "Abb. 2 Ablauf ..................... 7", "Hinweis zur Nutzung der Abbildungen im Text", "Abb. 3 Bewertung .................. 9", "Quelle: eigene Darstellung"].join("\n");
  const form = ["Antrag auf Zulassung", "Name: ____________________", "Vorname: ____________________", "Geburtsdatum: ______________", "☐ Erstprüfung ☐ Wiederholung", "Unterschrift: ________________"].join("\n");
  const content = ["2.1 Pflegeprozess", "Die Absolventinnen und Absolventen planen die Pflege verantwortlich.", "Sie erheben den Pflegebedarf und beurteilen ihn fachlich.", "Dazu gehören Anamnese, Pflegediagnose und Pflegeplanung.", "Die Evaluation schließt den Kreislauf und führt zur Anpassung.", "Siehe auch Kapitel 3 auf Seite 12."].join("\n");

  it("erkennt Inhalts- und Abbildungsverzeichnisse und leere Formulare, nicht aber Fachtext", () => {
    expect(isStructuralPage(toc)).toBe(true);
    expect(isStructuralPage(figures)).toBe(true);
    expect(isStructuralPage(form)).toBe(true);
    expect(isStructuralPage(content)).toBe(false);
    expect(isStructuralPage("1.1 ......... 3\n1.2 ...... 4")).toBe(false); // zu kurz für ein Urteil
  });

  it("cleanSources lässt solche Seiten weg, behält aber mindestens eine Seite", () => {
    const pages = [toc, figures, content, form].map((text, i) => ({ locator: `S. ${i + 1}`, text }));
    const [cleaned] = cleanSources([{ ...source("pdf", ""), excerpts: pages }]);
    expect(cleaned.excerpts.map((e) => e.locator)).toEqual(["S. 3"]);
    expect(dropStructuralPages([{ locator: "S. 1", text: toc }])).toHaveLength(1);
  });

  it("die Lernziele kommen danach aus dem Fachtext, nicht aus den Verzeichnis-Einträgen mit Füllpunkten", () => {
    const pages = [{ locator: "S. 1", text: toc }, { locator: "S. 2", text: "1.1 Ziele der Prüfung\n1.2 Aufbau der Prüfung\n2.1 Pflegeprozess steuern" }];
    const [cleaned] = cleanSources([{ ...source("pdf", ""), excerpts: pages }]);
    expect(extractOfficialObjectives(cleaned.excerpts).map((o) => o.title)).toEqual(["Ziele der Prüfung", "Aufbau der Prüfung", "Pflegeprozess steuern"]);
  });
});
