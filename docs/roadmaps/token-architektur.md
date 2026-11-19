<!-- Vorgabe des Betreibers vom 19.11.2026 (token_architektur_roadmap.md). Der Abschnitt „Umsetzungsstand“ ist ergänzt, der Rest unverändert bis auf die abgehakte Checkliste in Abschnitt 7. -->

# Token- & Architektur-Roadmap: Halluzinationsarme Kursgenerierung

**Ziel:** Lernkurse aus 30+ (teils großen) Quellen mit maximaler Quellentreue, minimalen Halluzinationen und optimaler Token-Effizienz generieren – inkl. effizienter Übersetzungs-Pipeline.

**Zielmodell:** `gemini-4-hydrogen` (\$1,50 / 1M Input | \$7,50 / 1M Output | 1M Kontextfenster)

## Umsetzungsstand (19.11.2026)

Umgesetzt im PR „Kursgenerierung als Pipeline nach Token-Roadmap“. Die bestehende Kursgenerierung (`lib/server/course-generation/`) war schon zweistufig (Blueprint, dann je Lernziel ein Aufruf); die Roadmap wurde deshalb in diese Pipeline eingebaut, nicht daneben neu gebaut.

| Roadmap | Umsetzung | Wo |
| :--- | :--- | :--- |
| Modell `gemini-4-hydrogen` | Standard für Curriculum, Lektionen, Tagging und Übersetzung; Preis 1,50 / 7,50 und Cache-Faktor 5 % eingebaut | `lib/gemini.ts`, `lib/server/admin/ai-cost.ts`, `.env.example`, `docker-compose.yml` |
| Stufe 0: Ballast entfernen | HTML ohne Navigation, Fußbereich, Seitenleisten, Formulare, Kommentare; wiederkehrende Kopf-/Fußzeilen über Seiten hinweg werden entfernt | `sources.ts::stripHtml`, `source-pack.ts::cleanSources` |
| Stufe 0: Source-IDs | Jede Quelle als `<source id="SRC_NN" title="…">`; die Nummer folgt der Stelle in der Eingabe und bleibt bei Wiederholungen stabil | `source-pack.ts` |
| Context Cache | **Abweichung:** Gemini 4 Hydrogen unterstützt laut Google keine expliziten Caches (`caches.create`), nur implizites Caching (ab 4.096 Token, TTL-Steuerung erst ab 12.01.2027). Umgesetzt über einen für alle Lernziele identischen Anfang der Anfrage (Systemprompt, Quellenpaket, Curriculum). Das Canary-Lernziel läuft allein vorweg und füllt den Cache. Ab einer Paketgröße von 400.000 Zeichen (einstellbar) bekommt jedes Lernziel nur die gemappten Ausschnitte, weil ein Cache-Fehltreffer sonst teuer würde. | `worker.ts::buildSharedSourceContext`, `COURSE_GEN_CONTEXT_MODE` |
| Stufe 1: JSON-Curriculum mit `source_ids` | Blueprint-Antwort hat je Lernziel Pflichtfeld `sourceIds` (z. B. `["SRC_04","SRC_12"]`), Denkstufe `high` (per Env `xhigh`) | `schemas.ts`, `providers.ts` |
| Stufe 2: parallele Lektionen | Lernziele eines Batches laufen parallel (Standard 5 gleichzeitig); jeder Aufruf bekommt Quellenpaket, komplettes Curriculum und „Schreibe ausschließlich Lernziel X, primär Quellen [SRC_…]“ | `worker.ts`, `providers.ts::objectiveUserPrompt` |
| Stufe 3: Audit (optional) | `COURSE_GEN_AUDIT=1`: je Lernziel ein Prüfaufruf gegen die Quellen; Befunde stehen beim Lernziel und in der Abschlussmeldung, der Inhalt bleibt unverändert | `providers.ts::auditObjective` |
| Anti-Halluzinations-Regeln | Closed Book, `[QUELLE FEHLT: …]`, `[SRC_XX]`-Belege, Widersprüche mit beiden IDs; in allen Prompts mit Quellen. Bei Stichwortlisten (Outline) bleibt Fachwissen für Erklärungen erlaubt. Belege auf nicht vorhandene Quellen werden ohne neuen Aufruf zu `[QUELLE FEHLT]`. | `providers.ts::sourceRulesPrompt`, `validation.ts` |
| Belege anzeigen | `[SRC_07]` erscheint als hochgestellte Nummer mit Tooltip, `[QUELLE FEHLT: …]` als gelber Hinweis; gespeichert bleiben die Tags | `lib/markdown/citations.ts`, `components/RichText.tsx` |
| Thinking-Level je Schritt | Curriculum/Lektionen/Audit `high`, Übersetzung/Tagging `low`, je Schritt per `GEMINI_THINKING_*` änderbar. `minimal` und `thinkingBudget` lehnt Hydrogen ab und wird nie gesendet. | `lib/gemini.ts::thinkingLevelFor`, `lib/ai/generate.ts` |
| Längenvorgabe | 400–600 Wörter Fließtext je Section (`COURSE_GEN_SECTION_WORDS`) | `providers.ts` |
| Übersetzung | Hydrogen mit `low`, Do-Not-Translate-Liste (erweiterbar per `COURSE_TRANSLATION_DO_NOT_TRANSLATE`), `[SRC_XX]`/`[QUELLE FEHLT]` müssen erhalten bleiben (sonst zweiter Versuch) | `lib/server/course-translation/translate.ts` |

Geprüft gegen die Google-Cloud-Modellseite zu Gemini 4 Hydrogen (Modell-ID `gemini-4-hydrogen`, 1M Kontext, Denkstufen `LOW`/`MEDIUM`/`HIGH` (Standard)/`XHIGH`, `thinking_budget` und `MINIMAL` ergeben HTTP 400, Temperatur wird ignoriert, nur implizites Caching). Die Preise stammen aus dieser Roadmap und decken sich mit mehreren Preisübersichten; nach der ersten Rechnung abgleichen.

Offen: der Benchmark an einem realen 30-Quellen-Testkurs (braucht den echten API-Schlüssel, siehe Checkliste unten). Explizites Caching mit TTL nachrüsten, sobald Google es für Hydrogen anbietet (angekündigt ab 12.01.2027).

## 1. Das Kernproblem beim „In-einem-Rutsch“-Ansatz

Wenn 30 Quellen in einem einzigen API-Call verarbeitet und direkt in einen kompletten Kurs verwandelt werden, entstehen drei typische Schwachstellen:

1. **Aufmerksamkeitsabfall (Lost in the Middle):** Details aus mittleren und hinteren Quellen werden übersehen.
2. **Qualitätsverlust nach hinten:** Spätere Module werden kürzer, generischer und weichen stärker auf allgemeines Trainingswissen aus (= Halluzinationen).
3. **Teure Fehlerbehebung:** Passt ein Modul nicht oder bricht der Stream ab, müssen alle Output- und Thinking-Tokens neu bezahlt werden.

## 2. Die Ziel-Architektur (3-Stufen-Pipeline mit Cache)

Statt eines riesigen Calls wird der Prozess in **einen einmaligen Cache** und **fokussierte Teilschritte** aufgeteilt.

```text
[30 Quellen] ──► (0) Pre-Processing & Source-IDs ([SRC_01] ... [SRC_30])
                       │
                       ▼
                 (1) Context Cache anlegen (TTL: z. B. 15–30 Min.)
                       │
                       ├──► (2) Stufe 1: Curriculum & Quellen-Mapping (1 Call, JSON)
                       │          └─ Thinking: high (oder xhigh bei komplexen Themen)
                       │
                       ├──► (3) Stufe 2: Lektionen parallel generieren (N Calls gegen Cache)
                       │          └─ Thinking: high
                       │
                       ├──► (4) Optional: Fakten- & Quellen-Audit (1 Call oder pro Modul)
                       │          └─ Thinking: high / medium
                       │
                       └──► (5) Optional: Übersetzung der fertigen Lektionen
                                  └─ Thinking: low (mit festem Glossar)
```

### Stufe 0: Quellen-Vorbereitung (Größter Hebel für Input-Tokens)

* **Müll entfernen:** HTML-Tags, Navigationsleisten, Boilerplate und doppelte Fußzeilen vorab strippen (reines Markdown oder Plaintext spart oft 30–50 % Input-Tokens).
* **Eindeutige IDs vergeben:** Jede Quelle klar im Kontext rahmen:

```xml
<source id="SRC_01" title="Dateiname oder Titel">
...Inhalt...
</source>
```

### Stufe 1: Curriculum & Quellen-Mapping (1 Call)

* Das Modell schreibt noch **keinen** Fließtext, sondern erstellt nur die Kursstruktur als strenges **JSON**.
* **Entscheidend:** Für jede Lektion muss das Modell explizit die relevanten `source_ids` zuordnen (z. B. `["SRC_04", "SRC_12", "SRC_19"]`).
* *Vorteil:* Das Modell prüft einmal gründlich alle 30 Quellen und erstellt eine verbindliche Landkarte.

### Stufe 2: Parallele Lektions-Generierung (N Calls)

* Für jedes Modul (oder jede Lektion) wird ein eigener API-Call **parallel** gegen denselben Context Cache gefeuert.
* **Kontext pro Call:**
  * Referenz auf den Context Cache (alle 30 Quellen)
  * Das komplette JSON-Curriculum aus Stufe 1 (verhindert inhaltliche Überschneidungen zwischen Lektionen)
  * Der konkrete Auftrag: *„Schreibe ausschließlich Lektion X. Nutze primär die gemappten Quellen `[SRC_04, SRC_12]` und ergänze nur, falls andere Cache-Quellen direkte Fakten liefern.“*

### Stufe 3 (Optional): Automatisierter Halluzinations-Check

* Ein leichter Audit-Call prüft die generierte Lektion gegen den Cache und listet Aussagen auf, die **nicht** durch eine Quelle belegt sind. Besonders sinnvoll für regulierte oder technische Fachkurse.

## 3. Thinking-Level-Strategie (Kosten- & Qualitätskontrolle)

Da Thinking-Tokens bei `gemini-4-hydrogen` als **Output (\$7,50 / 1M)** abgerechnet werden, ist der gezielte Einsatz der Stufen der wichtigste Kostenhebel:

| Schritt | Empfohlenes Level | Begründung |
| :--- | :--- | :--- |
| **Stufe 1: Curriculum & Mapping** | **`high`** *(oder `xhigh`)* | Wichtigster Schritt. Fehler hier ziehen sich durch den ganzen Kurs. Da der Output nur ein kurzes JSON ist, bleibt selbst `xhigh` extrem günstig. |
| **Stufe 2: Lektionen schreiben** | **`high`** *(Default)* | Der Sweet Spot: Genug Denkraum für hohe Quellentreue bei 30 Dokumenten, ohne exzessiven Token-Verbrauch. |
| **Stufe 3: Formatierung / Metadaten** | **`low` / `medium`** | Für Quiz-Formatierung, Zusammenfassungen, Meta-Descriptions oder JSON-Umwandlungen reicht wenig Denkaufwand völlig aus. |
| **Übersetzung (Translation)** | **`low`** | Reine Sprachübertragung benötigt kein tiefes Reasoning – `low` spart massiv Output-Tokens und liefert schnelle, präzise Ergebnisse. |
| **Kritische Fachprüfung (Audit)** | **`high`** *(oder `xhigh`)* | Nur für hochsensible Inhalte (Recht, Medizin, komplexe Zertifizierungen), bei denen sich Quellen widersprechen können. |

> **Faustregel:** Vermeide `low` und `medium` bei der eigentlichen Inhaltserstellung aus 30 Quellen – die eingesparten Output-Tokens bezahlst du sonst mit deutlich höherer Halluzinationsgefahr. Bei der Übersetzung hingegen ist `low` ausdrücklich die beste Wahl.

## 4. Anti-Halluzinations-Regeln für den System-Prompt

Diese vier Bausteine sollten fest im System-Prompt (am besten direkt im Cache) verankert sein:

1. **Harte Quellenbindung (Closed-Book-Prinzip):**
   > „Nutze ausschließlich Informationen aus den bereitgestellten `<source>`-Blöcken. Verwende kein externes Weltwissen, um Lücken zu füllen.“

2. **Erzwungener Fallback statt Raten:**
   > „Wenn ein im Lehrplan vorgesehener Aspekt in den Quellen nicht ausreichend belegt ist, erfinde keine Inhalte, sondern markiere die Stelle exakt mit `[QUELLE FEHLT: kurze Beschreibung]`.“

3. **Inline-Zitate erzwingen:**
   > „Belege jede faktische Aussage, Zahl oder Definition direkt im Text mit der Quellen-ID, z. B. `[SRC_07]`.“ *(Hinweis: Die Tags kannst du im Post-Processing vor der Anzeige beim Nutzer einfach per Regex entfernen – oder als Quellen-Tooltip anzeigen!)*

4. **Widersprüche transparent machen:**
   > „Widersprechen sich zwei Quellen, entscheide dich nicht willkürlich, sondern kennzeichne den Unterschied mit beiden IDs.“

## 5. Token- & Kosten-Optimierung auf einen Blick

* **Cache-Lebensdauer (TTL) knapp halten:** Da du Stufe 1 und Stufe 2 (parallel) meist innerhalb von 2–5 Minuten durchläufst, reicht eine kurze Cache-TTL (z. B. 15 Minuten). So zahlst du minimale Storage-Gebühren und nutzt trotzdem bis zu **95 % Rabatt** auf die wiederholten Input-Tokens.
* **Modulweise statt Mini-Häppchen:** Wenn ein Kurs 40 sehr kurze Lektionen hat, bündele sie lieber pro Modul (z. B. 6–8 Calls statt 40). Das spart Overhead bei den Thinking-Tokens pro Call.
* **Output-Struktur vorgeben:** Klare Längenvorgaben (z. B. „400–600 Wörter pro Lektion, prägnante Bulletpoints“) verhindern, dass das Modell ausufert und unnötige Output-Tokens generiert.
* **Wann lohnt sich `gemini-4-neon`?** Erst dann, wenn Hydrogen auf `high`/`xhigh` bei extrem verschachtelten, mehrstufigen Synthesen an Grenzen stößt. Für reine Quellen-zu-Kurs-Pipelines bietet Hydrogen das deutlich bessere Preis-Leistungs-Verhältnis.

## 6. Übersetzungs-Strategie (Translation-Pipeline)

Für das Übersetzen von Lernkursen (inkl. Markdown, Codeblöcken und Fachbegriffen) ist ein zweiter API-Anbieter in der Regel nicht nötig – **`gemini-4-hydrogen` mit `thinking_level: "low"`** deckt den Anwendungsfall im bestehenden Stack sehr effizient ab.

### Marktvergleich: Welches Modell wofür?

| Modell / Anbieter | Größte Stärke beim Übersetzen | Ideal für |
| :--- | :--- | :--- |
| **Gemini 4 Hydrogen** | 1M-Kontextfenster & sehr günstig bei `low` Thinking | **Ganze Kurse/Bücher am Stück**, damit Fachbegriffe über alle Kapitel identisch bleiben |
| **Claude (Sonnet 5 / 5.5)** | Natürlichster Stil, feinste Nuancen & konservative Treue bei Fachtexten | Hochwertige Lernkurse, Marketing, juristische/medizinische Texte (klingt am wenigsten nach „KI-Übersetzung“) |
| **GPT-5.x (OpenAI)** | Extrem zuverlässig bei Formatierung, JSON, Variablen & Code | Technische Doku, UI-Strings, Code-Kommentare |
| **DeepL Pro API** | Sehr stark in europäischen Sprachen + natives **Glossar-Management** | Klassische Business-Übersetzungen mit strikter Firmen-Terminologie |
| **DeepSeek / Qwen** | Extrem günstig (bzw. self-hosted) | Massenübersetzungen mit hohem Volumen (Qwen zusätzlich Top bei asiatischen Sprachen) |

### Best Practices für halluzinationsfreie Kurs-Übersetzungen

* **Thinking auf `low` stellen:** Bei `gemini-4-hydrogen` spart das massiv Output-Tokens und Zeit, ohne dass die Sprachqualität leidet.
* **Glossar & Do-Not-Translate-Liste im System-Prompt:** Gerade bei IT- und Fachkursen explizit angeben, welche Begriffe **nicht** übersetzt werden dürfen (z. B. *Deployment, Pipeline, Prompt, Cloud-Begriffe*), um hölzerne oder wörtliche Übersetzungen zu vermeiden.
* **Struktur-Schutz verankern:** Im Prompt klar anweisen, dass Markdown-Syntax, JSON-Keys, Codeblöcke und `[SRC_XX]`-Tags exakt erhalten bleiben müssen.
* **Konsistenz über den gesamten Kurs:** Entweder den gesamten Kurs im 1M-Kontextfenster als Referenz cachen oder ein zentrales Terminologie-Glossar an jeden parallelen Übersetzungs-Call mitgeben.

## 7. Umsetzungs-Checkliste (Migration von 3.8 Flash)

* [x] Modell-ID im Code von `3.8 Flash` auf `gemini-4-hydrogen` umstellen (gleicher API-Key).
* [x] Pre-Processing einbauen: Quellen bereinigen und mit `<source id="SRC_XX">` taggen.
* [x] Context Caching für das Quellen-Paket aktivieren (implizit, siehe Umsetzungsstand).
* [x] Prompt in **Stufe 1 (JSON-Curriculum + Source-Mapping)** und **Stufe 2 (Parallele Generierung)** trennen.
* [x] System-Prompt um `[QUELLE FEHLT]`-Regel und erzwungene `[SRC_XX]`-Zitate erweitern.
* [ ] Mit `thinking_level: "high"` (Default) an einem realen 30-Quellen-Testkurs benchmarken und Output-Tokens sowie Zitat-Genauigkeit prüfen.
* [x] Optional: Übersetzungs-Schritt mit `gemini-4-hydrogen` (`thinking_level: "low"`) und fester Do-Not-Translate-Liste ergänzen.
