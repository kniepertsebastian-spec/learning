# Entwicklungs-Roadmap: PSRP-HR

Technischer Umsetzungsplan für einen Spaced-Repetition-Scheduler auf Basis von FSRS mit einer Planungsschicht zum Burnout-Schutz. Dieses Dokument ist für die Umsetzung durch einen Coding-Agenten geschrieben und setzt kein Vorwissen aus anderen Dokumenten voraus.

---

## Kontext

Die Lernplattform soll Wiederholungen planen wie FSRS, aber den Nutzer vor Überlastung schützen (z. B. hundert fällige Karten nach ein paar Tagen Pause). Dazu kommen ein kurzer Check-in zur Tagesform und Verhaltensdaten aus den Sessions.

## Architektur-Regeln (verbindlich)

1. **Das Gedächtnismodell wird nicht verfälscht.** FSRS bekommt immer das rohe Rating (1–4) des Nutzers. Keine Abzüge, keine Umrechnung.
2. **Burnout-Schutz sitzt ausschließlich in der Planungsschicht.** Sie entscheidet, welche fälligen Karten heute gezeigt werden und mit welcher Ziel-Retention neue Intervalle geplant werden.
3. **Rohdaten sind unveränderlich.** Jedes Review wird als eigener Log-Eintrag gespeichert und nie überschrieben. Abgeleitete Werte (Φ, Prioritäten) liegen getrennt.
4. **Alle Gewichte und Schwellen sind Konfiguration**, nicht hart im Code.

```
[Check-in + Telemetrie] ──► [Human State Engine: Φ]
                                      │
[Review-Log (roh)] ──► [FSRS-Kern: D, S, R] ──► [Planungsschicht] ──► Tages-Queue
```

## Platzhalter-Entscheidungen

Folgende Punkte sind noch nicht final entschieden. Implementiere sie mit dem angegebenen Standardwert und halte sie konfigurierbar:

| Punkt | Standardwert |
|---|---|
| FSRS-Version | aktuelle Version der genutzten Bibliothek |
| Korridor r_ziel | 0.75 – 0.90 |
| Mindestanzahl Reviews für persönlichen Parameter-Fit | 400 |
| Altersangabe | Altersspanne (Enum), optional |
| Nutzer darf Tageslimit überschreiben | ja |
| Anteil versteckter Abfragen pro Lektion | max. 10 % |
| Mindestanzahl Abfragen für belastbaren Kalibrierungswert | 30 |
| Kalibrierungswert für Nutzer sichtbar | ja (als „Selbsteinschätzung“) |

---

## Phase 1 – Datenmodell & Logging

- [x] Tabellen/Entitäten anlegen:
  - `user`: id, age_range (Enum, optional), timezone, created_at
  - `course_enrollment`: user_id, course_id, exam_date (optional)
  - `item_state`: user_id, item_id, stability, difficulty, reps, lapses, last_review, due
  - `review_log` (append-only): id, user_id, item_id, session_id, timestamp_utc, local_hour, weekday, raw_rating (1–4), response_time_ms, review_type (`card` | `interleaved` | `probe`), probe_variant_id (optional), predicted_r (Abrufwahrscheinlichkeit laut FSRS zum Zeitpunkt des Reviews)
  - `concept`: id, course_id, topic_area (z. B. „Netzwerke“, „Security“), name
  - `item_concept`: item_id, concept_id (welche Konzepte ein Item bzw. eine Aufgabe prüft)
  - `probe_variant`: id, concept_id, format (`embedded_step` | `distractor` | `error_spotting` | `transfer`), content, is_bottleneck (bool: Konzept ist eindeutig der entscheidende Schritt)
  - `session_checkin`: session_id, user_id, energy_level (1–5), time_budget_min, had_workday (bool), timestamp
  - `session_derived`: session_id, phi, r_target, daily_limit (getrennt von Rohdaten)
- [x] `review_log` technisch gegen Update/Delete absichern (außer DSGVO-Löschung des gesamten Nutzers)
- [x] Basiszeit pro Item berechnen: Median der Antwortzeiten aller Nutzer für dieses Item, Fallback auf Kursdurchschnitt
- [x] Löschfunktion: Nutzer löschen entfernt alle zugehörigen Daten inkl. Check-ins und abgeleiteter Werte

**Akzeptanzkriterium:** Ein Review erzeugt genau einen Log-Eintrag; Tests belegen, dass Logs nicht verändert werden können.

---

## Phase 2 – FSRS-Kern

- [x] Etablierte Bibliothek einbinden (ts-fsrs bzw. py-fsrs, passend zum Stack), **keine Eigenimplementierung** der Formeln
- [x] Wrapper `scheduleReview(itemState, rawRating, now, rTarget) -> newItemState`
- [x] Ziel-Retention pro Aufruf übergebbar (wird von der Planungsschicht gesetzt)
- [x] Altersspanne nur für Kaltstart-Parameter nutzen (Mapping als Konfiguration, initial überall Standardparameter)
- [x] Optimizer-Job: persönliche Parameter fitten, sobald ein Nutzer die Mindestanzahl Reviews erreicht; danach periodisch (z. B. wöchentlich)
- [x] Referenztests:
  - Bei t = S gilt R ≈ 0.90
  - S = 14.2, r_ziel = 0.90 → Intervall ≈ 14 Tage
  - Intervall ist nie kleiner als 1 Tag

**Akzeptanzkriterium:** Alle Referenztests grün; Ergebnisse stimmen mit der Bibliothek ohne Wrapper überein.

---

## Phase 3 – Planungsschicht

- [x] Funktion `buildDailyQueue(user, now, timeBudgetMin, phi) -> Item[]`
- [x] Tageslimit aus Zeitbudget: `limit = floor(timeBudgetMin * 60 / avgSecondsPerReview)`, mit persönlichem Durchschnitt, Fallback 15 s
- [x] Priorisierung fälliger Karten: niedrigste aktuelle Retrievability zuerst; bei aktivem Prüfungsdatum prüfungsrelevante Items höher gewichten (Gewicht konfigurierbar)
- [x] Nicht gezeigte fällige Karten bleiben fällig (kein künstliches Neusetzen von `due`)
- [x] Load Balancing: bei der Intervallberechnung das Intervall innerhalb ±5 % (min. ±1 Tag ab Intervall ≥ 7) auf den Tag mit der geringsten bereits geplanten Last legen
- [x] Leichte Tage: pro Nutzer konfigurierbare Wochentage mit reduziertem Kontingent (Faktor konfigurierbar, Standard 0.5); Load Balancing meidet diese Tage (Spalte `study_profiles.light_weekdays`, Einstellung im Lernziel-Panel)
- [x] Prüfungsmodus: r_ziel steigt linear in den letzten N Tagen vor exam_date bis zur Obergrenze (N konfigurierbar, Standard 21); Intervalle dürfen nicht über das Prüfungsdatum hinausgehen, solange es in der Zukunft liegt
- [x] Rückstau-Abbau: bei Rückstand > Tageslimit wird der Rückstand über mehrere Tage verteilt, neue Karten werden pausiert, bis der Rückstand unter einer Schwelle liegt
- [x] Nutzer kann Tageslimit manuell erhöhen („Mehr lernen“) – Knopf nach abgeschlossener Session, `POST /api/study-sessions/more`

**Akzeptanzkriterium:** Simulationstest: Nutzer mit 500 Karten pausiert 7 Tage; beim Wiedereinstieg überschreitet keine Tages-Queue das Zeitbudget, und der Rückstau ist nach endlicher Zeit abgebaut.

---

## Phase 4 – Human State Engine

- [x] Check-in-UI: drei Eingaben (Energie 1–5, Zeitbudget als Auswahl, „Heute gearbeitet?“ Ja/Nein), überspringbar
- [x] Φ berechnen:
  ```
  Φ = clip( w_E·(5−E)/4 + w_T·T_stress + w_C·C_chrono + w_W·W_arbeit , 0, 1 )
  ```
  Startgewichte: w_E = 0.35, w_T = 0.25, w_C = 0.25, w_W = 0.15 (Konfiguration)
  - T_stress: Zeitbudget ≤ 10 min → 1.0, ≤ 20 min → 0.5, sonst 0
  - W_arbeit: had_workday → 1.0, sonst 0
  - C_chrono: siehe Chronotyp-Profil
- [x] Bei übersprungenem Check-in: letzte Werte bzw. neutrale Standardwerte nutzen, Feld als `imputed` markieren
- [x] Chronotyp-Profil: Erfolgsquote pro Tageszeit-Block (z. B. 4-Stunden-Blöcke) pro Nutzer; C_chrono = normierte Abweichung des aktuellen Blocks unter dem persönlichen Bestwert. Solange zu wenig Daten (< 50 Reviews im Block): Fallback 22–05 Uhr → 0.5, sonst 0
- [x] Φ wirkt **nur** auf die Planungsschicht:
  - `r_target = r_max − (r_max − r_min) · Φ`
  - Tageslimit-Faktor: `1 − 0.3·Φ` (konfigurierbar)
  - Kartenmix: bei hohem Φ Items mit hoher Difficulty nach hinten sortieren
- [x] Antwortzeiten: Ausreißer > 3 × persönlicher Median werden für Statistiken ignoriert (bleiben im Rohlog)
- [x] Erkennung monotoner Check-ins (identische Werte über ≥ 10 Sessions) als Flag speichern

**Akzeptanzkriterium:** Φ wird pro Session berechnet und in `session_derived` gespeichert; ein Test belegt, dass FSRS bei gleichem Rohrating unabhängig von Φ dieselbe Stabilität berechnet.

---

## Phase 5 – Evaluation-Infrastruktur

- [x] Feature-Flags pro Nutzer für drei Gruppen: `vanilla`, `planning`, `planning_state`
- [x] Zufällige, stabile Gruppenzuteilung bei Registrierung
- [x] Metrik-Export (anonymisiert): Log-Loss und RMSE der vorhergesagten vs. tatsächlichen Abrufe, Reviews/Tag, tatsächliche Behaltensquote, Tage aktiv, Abbruch (keine Session in 14 Tagen); nach Umsetzung von Phase 7 zusätzlich Verlauf der Kalibrierungswerte
- [x] Offline-Simulator: Workload-Verlauf über 365 Tage für verschiedene r_ziel-Korridore und Parameter
- [x] Skript zum Schätzen der Φ-Gewichte aus Logs (Regression auf Abruferfolg), Ausgabe als Vorschlag, nicht automatisch übernehmen

**Akzeptanzkriterium:** Für jede Gruppe lassen sich alle Metriken per Skript reproduzierbar erzeugen.

---

## Phase 6 – Implizite Wiederholungen

- [x] Interleaving: Aufgaben können Items referenzieren (Tabelle `task_item`, angebunden an Simulationen); eine gelöste Aufgabe erzeugt einen Log-Eintrag mit `review_type = interleaved`
- [x] Rating-Mapping für implizite Reviews konfigurierbar (Standard: gelöst → 3, nicht gelöst → 1)
- [x] Skip-Erkennung: bestandener Einstiegstest eines Kapitels → alle Items des Kapitels starten mit Rating 4 als erstem Review statt als neue Karte (Funktion `applyChapterSkip`; es gibt noch keinen Einstiegstest, der sie aufruft)

**Akzeptanzkriterium:** Implizite Reviews aktualisieren den Item-Zustand und sind im Log von Karten-Reviews unterscheidbar.

---

## Phase 7 – Kalibrierung (Selbsteinschätzung messen)

Ziel: Messen, ob ein Nutzer sein Wissen über- oder unterschätzt – durch unterschwellige Abfragen im normalen Lernfluss, nicht durch zusätzliche Tests. Die Messung verändert **nicht** das FSRS-Rating (Architektur-Regel 1); Abfragen werden als normale Reviews mit `review_type = probe` geloggt.

### 7.1 Konzept-Tagging & Abfragevarianten
- [x] Kursgenerierung erweitern: zu jedem Item die geprüften Konzepte und das Themengebiet ausgeben (als eigener KI-Schritt nach der Veröffentlichung, `tagConceptsAfterGeneration`; nachträglich per `npm run concepts:tag`)
- [x] Pro Konzept mindestens 2 Abfragevarianten erzeugen, deren Oberfläche sich vom Original-Item unterscheidet (anderes Format, anderer Kontext, gleiches Wissen)
- [x] Varianten mit `is_bottleneck = false` werden nicht für die Kalibrierung gewertet (nur als Wiederholung)
- [x] Validierung: Variante darf den Lösungsweg des Original-Items nicht wörtlich enthalten

### 7.2 Abfrage-Scheduler
- [x] Funktion `selectProbes(user, lesson) -> ProbeVariant[]`
- [x] Kandidaten: Konzepte, deren vorhergesagte Abrufwahrscheinlichkeit zwischen 0.80 und 0.90 liegt (Grenzen konfigurierbar)
- [x] Priorität: Konzepte mit vielen „Easy“-Bewertungen und wenigen bisherigen Abfragen zuerst
- [x] Frequenzbudget: höchstens 10 % der Aufgaben einer Lektion; nie zwei Abfragen direkt hintereinander; dieselbe Variante frühestens nach 30 Tagen erneut
- [x] Keine Abfrage innerhalb von 24 h nach einem regulären Review desselben Konzepts
- [x] Abfragen erhalten exakt dasselbe UI und Feedback wie normale Aufgaben (kein Hinweis auf Prüfcharakter)

### 7.3 Kalibrierungswert
- [x] Pro Abfrage speichern: vorhergesagte Abrufwahrscheinlichkeit, tatsächliches Ergebnis, letztes Selbst-Rating des Konzepts, Populations-Erfolgsquote der Variante
- [x] Kalibrierungswert pro Nutzer und pro Themengebiet:
  ```
  bias = Mittelwert( erwarteter Erfolg − tatsächlicher Erfolg )
  ```
  wobei der erwartete Erfolg aus Selbst-Rating und Populations-Erfolgsquote der Variante kombiniert wird (Gewichtung konfigurierbar). Positiv = Überschätzung, negativ = Unterschätzung
- [x] Bayessche Schrumpfung Richtung Populationsmittel, solange weniger als die Mindestanzahl Abfragen vorliegt; Unsicherheit (Konfidenzintervall) mitspeichern
- [x] Zusätzlich Brier-Score pro Nutzer als Gesamtmaß der Kalibrierung
- [x] Neuberechnung nach jeder gewerteten Abfrage; Speicherung in eigener Tabelle `user_calibration` (user_id, topic_area, bias, ci_low, ci_high, n_probes, updated_at)

### 7.4 Nutzung
- [x] Planungsschicht: Konzepte in Themengebieten mit belastbarer Überschätzung werden bei der Priorisierung früher eingeplant und häufiger für Abfragen ausgewählt
- [x] Nutzeransicht „Selbsteinschätzung“: pro Themengebiet einfache Aussage (gut kalibriert / eher überschätzt / eher unterschätzt), nur bei belastbarer Datenlage; neutral und motivierend formuliert
- [x] Kalibrierungswerte in Löschfunktion und Datenexport des Nutzers aufnehmen

**Akzeptanzkriterium:** Simulationstest mit synthetischem Nutzer, der systematisch „Easy“ wählt, aber nur 60 % der Abfragen besteht: Nach ≥ 30 Abfragen wird eine Überschätzung mit Konfidenzintervall über 0 erkannt. Ein gut kalibrierter synthetischer Nutzer wird nicht als überschätzend eingestuft.

---

## Nicht Teil dieser Roadmap

Änderungen an den FSRS-Formeln (z. B. Φ als Einfluss auf die Retrievability, gedämpfte Lapses) werden erst nach Auswertung der Evaluation entschieden und dann als eigene Aufgabe beauftragt.

---

## Umsetzungsstand

Alle Phasen sind umgesetzt (Code in `lib/server/psrp/`, Migrationen 0067–0069). Abweichungen und offene Punkte:

- **Zuordnung zum bestehenden Modell:** „Item“ = Frage (`questions`), „Kurs“ = Zertifizierung, `course_enrollment` = `study_profiles` (dort liegen Prüfungsdatum und leichte Tage). `review_items` bleibt als Fälligkeits-Sicht erhalten und wird mit jedem Review aus dem FSRS-Zustand (`item_state`) synchronisiert; der alte SM-2-Scheduler ist entfernt.
- **Gruppen:** `vanilla` = FSRS pur, `planning` = Planungsschicht mit Φ = 0, `planning_state` = zusätzlich Φ aus Check-in. Abfragen (Phase 7) laufen in allen Gruppen.
- **Abfragevarianten** sind echte Fragen mit `questions.probe_only = true` (nie in Tests, Prüfungen oder Sessions als normale Frage); Reviews werden dem Original-Item (`probe_variant.source_item_id`) mit `review_type = probe` zugeschrieben.
- **Optimizer:** `npm run fsrs:optimize` (fsrs-rs über `@open-spaced-repetition/binding`); muss periodisch (z. B. wöchentlich per Cron) angestoßen werden.
- **Auswertung:** `npm run psrp:metrics`, `npm run psrp:simulate`, `npm run psrp:fit-weights`.
- **Noch offen:** Aufruf der Skip-Erkennung durch einen Einstiegstest, Anbindung weiterer Aufgabentypen (Praxisaufgaben) an `task_item`. Die Altersspanne lässt sich im Konto setzen; die altersabhängigen Kaltstart-Parameter sind noch leer (überall Standardparameter, wie vorgesehen).
