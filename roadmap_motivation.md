# Entwicklungs-Roadmap: Motivation und Schutz vor Abbruch

Technischer Umsetzungsplan gegen plötzliche Demotivation und stille Lernabbrüche, dazu eine Vergleichsgrafik, die den Human Layer in Demos sichtbar macht. Das Dokument ist für die Umsetzung durch einen Coding-Agenten geschrieben und setzt kein Vorwissen aus anderen Dokumenten voraus. Grundlage ist das Papier „ProofPath: Leitfaden & Systemkonzept gegen plötzliche Demotivation“ in einer geprüften, an die Produktgrundsätze angepassten Fassung. Stand: 23.10.2026.

---

## Kontext

### Lernpsychologische Grundlage

Lernabbrüche sind selten fehlende Disziplin, sondern Schutzreaktionen gegen Überlastung, Kontrollverlust oder Hilflosigkeit. Drei Modelle leiten diese Roadmap:

| Modell | Kernaussage | Antwort der Plattform |
|---|---|---|
| Selbstbestimmungstheorie (Deci & Ryan) | Motivation braucht Autonomie, Kompetenzerleben und soziale Eingebundenheit | Wahl der Aufgabenart (Phase 4), Notausstieg mit Erfolg (Phase 3), Mentor-Brücke (Phase 9) |
| Erwartung × Wert (Eccles & Wigfield) | Fällt Erfolgserwartung oder wahrgenommener Wert gegen null, stoppt das Lernen | Deeskalation (Phase 2), Fortschritt sichtbar (Phase 7), Praxisbezug und „Warum“ (Phase 5) |
| Attributionstheorie (Weiner) | „Ich bin zu dumm“ führt zum Abbruch, „mir fehlt ein Schritt“ zum Weitermachen | Rückmeldungen ohne Schuldzuweisung (Phase 8), Verstehens-Modus (`roadmap_didaktik.md`, Phase 9) |

### Was es schon gibt

- **Human Layer (PSRP-HR)** in `lib/server/psrp/`: Tageslimit aus Zeitbudget, Tagesform Φ aus Check-in, Rückstau-Abbau mit Pause neuer Karten, leichte Tage, Prüfungsmodus; Evaluationsgruppen `vanilla` / `planning` / `planning_state`; Flag für monotone Check-ins (`lib/server/psrp/config.ts`).
- **Simulator** `lib/server/psrp/simulator.ts` (`npm run psrp:simulate`): spielt einen synthetischen Lernenden durch, unterstützt bereits Pausentage (`pauseDays`), wendet aber **immer** das Tageslimit an. Einen Vergleich „ohne Planungsschicht“ gibt es nicht.
- **Sessions** mit Status `planned` / `in_progress` / `completed` / `skipped` / `abandoned` (`study_sessions`).
- **Praxisaufgaben** mit optionalem Lernziel (`practice_tasks.objective_id`), Mentor-Bestätigung.
- **E-Mail-Versand** und Prüfungserinnerungen (`npm run exams:remind`); Web Push ist geplant (`roadmap_pwa.md`, Phase 6).
- **Geplant in `roadmap_didaktik.md`:** Wochenziel statt Tagesserie und sanfter Wiedereinstieg (Phase 5), Verstehens-Modus inkl. „Mentor fragen“ (Phase 9). Diese Roadmap ergänzt sie, ohne sie zu wiederholen.

**Hinweis:** Vor Änderungen an Next.js-Routen die passende Anleitung in `node_modules/next/dist/docs/` lesen (siehe `AGENTS.md`).

## Architektur-Regeln (verbindlich)

1. **Es gelten alle Regeln aus `docs/roadmap_psrp_hr.md`:** FSRS bekommt das rohe Rating; jede Deeskalation sitzt ausschließlich in der Planungsschicht; `review_log` ist unveränderlich.
2. **Der Arbeitgeber sieht nur Status, Datum und Frist.** Keine Abbruch-Signale, keine Risikowerte, keine Prognosen über eine Person im Firmenbereich. Prognosen wie „es wird knapp“ sieht nur der Lernende selbst; mehr gibt es nur, wenn der Lernende es ausdrücklich freigibt.
3. **Keine erfundenen Zahlen in Rückmeldungen.** Statistiken nur aus echten Plattformdaten mit Mindestanzahl; sonst allgemeine Formulierung ohne Zahl.
4. **Signale wirken erst als Muster.** Einzelne Ereignisse (ein übersprungener Check-in, eine abgebrochene Session) lösen nichts aus.
5. **Alles abschaltbar und messbar.** Jede Mechanik hat ein Feature-Flag und erscheint im Metrik-Export; Nutzer können Erinnerungen abbestellen.
6. **Zweisprachig (de/en).**

## Platzhalter-Entscheidungen

| Punkt | Standardwert |
|---|---|
| Szenario Vergleichsgrafik | 1.000 Karten, 10 neue pro Tag, 15 min Zeitbudget, 15 s je Karte, 60 Tage Vorlauf, 7 Tage Pause, 30 Tage danach, r_ziel 0,90 |
| Frühwarnung: Beobachtungsfenster | 7 Tage |
| Frühwarnung: Auslösung | mind. 2 verschiedene Signale im Fenster |
| Frühwarnung: Dauer der Deeskalation | 3 Sessions oder bis zu einer abgeschlossenen Session ohne Signal |
| Deeskalation: Tageslimit-Faktor | 0,5 |
| Notausstieg: Erfolgsaufgaben | 2–3, Abrufwahrscheinlichkeit ≥ 0,90 und fällig innerhalb der nächsten 3 Tage |
| Reaktivierung: erste Nachricht | nach 5 Tagen ohne Session |
| Reaktivierung: weitere Nachrichten | nach 12 und 26 Tagen, danach keine mehr |
| Plattformstatistik in Rückmeldungen | erst ab 50 Antworten auf die Frage bzw. ihre Varianten |

---

## Phase 1 – Vergleichsgrafik „Eine Woche Pause“ (Priorität: hoch, vor den Gesprächen mit Entscheidern)

Ziel: Den Human Layer in zehn Sekunden zeigen: Nach einer Pause wartet kein Berg, sondern höchstens das gewohnte Zeitbudget.

- [x] Simulator um einen Modus erweitern: `mode: "vanilla" | "planning"`. `vanilla` = reines FSRS wie eine klassische Lernkarten-App: alle fälligen Karten werden am selben Tag bearbeitet, neue Karten fix pro Tag, kein Tageslimit, kein Rückstau-Abbau. `planning` = bisheriges Verhalten.
- [x] Ergebnis je Tag zusätzlich: fällige Karten (auch nicht bearbeitete), bearbeitete Karten, Minuten (bearbeitete × Sekunden je Karte).
- [x] Szenario-Funktion `simulatePause(params)`: beide Modi mit identischem Seed und Parametern (siehe Platzhalter); Ausgabe als JSON mit Annahmen.
- [x] Kennzahlen: Spitzenlast am ersten Tag nach der Pause (Karten und Minuten) je Modus; Tage bis der Rückstand abgebaut ist (Planungsmodus); Behaltensquote 30 Tage nach der Pause je Modus.
- [x] Skript `npm run psrp:pause-demo` schreibt die JSON-Datei und eine statische Grafik (SVG): Minuten pro Tag als zwei Linien, Zeitbudget als waagerechte Linie, Pause als hinterlegter Bereich, Annahmen als Fußzeile.
- [ ] Optional: dieselbe Grafik als Seite im Admin-Bereich bzw. als öffentliche Demo-Seite mit Schiebereglern für Pausenlänge und Zeitbudget (berechnet im Browser, keine Nutzerdaten). _(optional, noch nicht umgesetzt)_
- [x] Unit-Tests: Planungsmodus überschreitet an keinem Tag das Zeitbudget; Vanilla-Modus hat am ersten Tag nach der Pause mehr fällige Karten als vor der Pause; gleiche Parameter ergeben gleiche Ergebnisse.

**Akzeptanzkriterium:** `npm run psrp:pause-demo` erzeugt reproduzierbar eine Grafik und eine JSON-Datei mit allen Annahmen; die Kennzahlen stehen in der Ausgabe.

---

## Phase 2 – Frühwarnung für stille Abbrüche (Priorität: hoch)

Ziel: Abbrüche kündigen sich an. Der Human Layer liest die Tagesform nicht nur aus dem Check-in, sondern auch aus dem Verhalten, und nimmt Druck heraus, bevor jemand aufgibt.

- [x] Signale je Nutzer im Beobachtungsfenster:
  - mehrere Sessions mit Status `abandoned` oder unter 2 Minuten
  - Fehlerquote deutlich über dem persönlichen Durchschnitt
  - Antwortzeiten deutlich über dem persönlichen Median (Ausreißerregel aus PSRP-HR beachten)
  - Check-ins werden plötzlich übersprungen, nachdem sie vorher regelmäßig ausgefüllt wurden
  - Notausstieg (Phase 3) genutzt
- [x] Auslösung nur bei Muster (siehe Platzhalter); Zustand in eigener Tabelle `engagement_state` (user_id, signals jsonb, status `normal` / `deescalated`, since, until), getrennt von Rohdaten.
- [x] Deeskalation in der Planungsschicht: Tageslimit-Faktor (Platzhalter), keine neuen Karten, schwierige Items nach hinten, Session mit 1–2 leichten Erfolgen beginnen. FSRS-Zustand und Ratings bleiben unverändert.
- [x] Sichtbar, aber freundlich: „Wir machen es heute etwas leichter.“ Mit Möglichkeit „Nein danke, normal weiter“.
- [x] Rückkehr zum Normalzustand automatisch (Platzhalter).
- [x] Nie im Firmenbereich sichtbar, nie in Exporten für Firmen (Regel 2). Im anonymen Metrik-Export als Kennzahl.
- [x] Feature-Flag `dropout_guard`; Auswertung: Abbruchquote und Lernfortschritt mit vs. ohne.

**Akzeptanzkriterium:** Ein synthetischer Nutzer mit drei abgebrochenen Kurz-Sessions und erhöhter Fehlerquote in 7 Tagen wird deeskaliert; ein Nutzer mit einem einzelnen übersprungenen Check-in nicht. Ein Test belegt, dass FSRS-Zustände dabei unverändert bleiben.

---

## Phase 3 – Notausstieg mit Erfolgserlebnis (Priorität: hoch)

- [x] Button „Heute reicht's“ in jeder Übungssession und jedem Lektionstest (nicht in der Prüfungssimulation).
- [x] Danach 2–3 Aufgaben, die der Nutzer sehr wahrscheinlich kann und die ohnehin bald fällig wären (Platzhalter). So entstehen keine unnötig frühen Wiederholungen, die das Gedächtnismodell verzerren.
- [x] Die Session endet mit einer positiven Zusammenfassung („3 von 3 sicher, morgen geht es leichter weiter“).
- [x] Die abgebrochene Aufgabe wird nicht als falsch gewertet, wenn noch keine Antwort gegeben wurde; sie bleibt fällig.
- [x] Der Notausstieg zählt als Signal für die Frühwarnung (Phase 2) und, wenn er mehrfach beim selben Konzept passiert, für den Verstehens-Modus (`roadmap_didaktik.md`, Phase 9).
- [x] Feature-Flag `exit_with_win`.

**Akzeptanzkriterium:** Nach „Heute reicht's“ folgen höchstens 3 Aufgaben mit hoher Abrufwahrscheinlichkeit; die abgebrochene Aufgabe hat kein Rating 1 erhalten.

---

## Phase 4 – Aufgabenart nach Energie (Priorität: mittel)

Ziel: Bei wenig Energie nicht nur weniger, sondern anders lernen. Das stärkt das Gefühl, selbst zu entscheiden.

- [x] Bei niedriger Energie im Check-in (oder in der Deeskalation) bietet der Session-Start Alternativen an: kurze Simulation (5 Minuten), Spickzettel durchgehen, nur Wiederholungen, „nur eine Aufgabe“.
- [x] Die Wahl ist eine Option, kein Zwang; „normale Session“ bleibt immer wählbar.
- [x] Gelöste Simulationen zählen über die vorhandenen impliziten Reviews (`review_type = interleaved`); Spickzettel-Lesen zählt nicht als Review, wird aber als Aktivität gezählt (wichtig für das Wochenziel).
- [x] Feature-Flag `energy_modes`; Auswertung: Anteil gewählter Alternativen, Rückkehr am Folgetag.

**Akzeptanzkriterium:** Bei Energie 1–2 sieht der Nutzer mindestens drei Alternativen; jede führt zu einer abgeschlossenen Session.

---

## Phase 5 – Praxisbezug und „Warum lerne ich das?“ (Priorität: mittel)

- [x] Firmenbereich: Praxisaufgaben können an das Abschließen einer Lektion oder eines Lernziels geknüpft werden („Wer die Lektion zu Partitionierung abschließt, bekommt die Aufgabe ‚VM nach Firmenstandard partitionieren‘“). Freischaltung automatisch, Benachrichtigung an den Lernenden.
- [ ] (teilweise: Prüfungsgewicht und freigeschaltete Praxisaufgabe sind da; Ausbildungsrahmenplan/Firmenrolle und Karrierepfad fehlen) Jede Lektion zeigt kurz, wofür sie zählt: Gewicht in der Prüfung (aus dem Blueprint), zugehöriges Lernziel aus dem Ausbildungsrahmenplan oder der Firmenrolle, verknüpfte Praxisaufgabe, passender Karrierepfad. Vorhandene Bausteine nutzen (`[!POSSIBLE]`-Block, Karrierepfade, Blueprint-Gewichte).

**Akzeptanzkriterium:** Eine an ein Lernziel geknüpfte Praxisaufgabe erscheint automatisch nach Abschluss der Lektion; jede Lektion zeigt mindestens eine Begründung ihrer Relevanz.

---

## Phase 6 – Reaktivierung ohne Beschämung (Priorität: mittel)

- [x] Nach längerer Pause (Platzhalter) eine E-Mail, später zusätzlich Push: „Schön, dass du da bist, wenn du Zeit hast. 3 Minuten reichen heute.“ Kein Zähler, keine Rückstandszahl, keine roten Warnungen. (E-Mail; Push folgt mit Web Push)
- [x] Link öffnet direkt eine 3-Minuten-Session; der Rückstand wird wie bisher über die Planungsschicht verteilt.
- [x] Höchstens drei Nachrichten, dann Ruhe; jederzeit abbestellbar; respektiert die Erinnerungseinstellungen und Ruhezeiten.
- [x] Niemals an Arbeitgeber oder Mentor; bei Pflichtschulungen gelten ausschließlich die vorhandenen Fristerinnerungen.
- [x] Feature-Flag `reactivation`; Auswertung: Rückkehrquote innerhalb von 7 Tagen nach Nachricht.

**Akzeptanzkriterium:** Ein Nutzer ohne Session seit 5 Tagen erhält genau eine Nachricht; nach Abbestellen keine weitere.

---

## Phase 7 – Fortschritt sichtbar machen (Priorität: mittel)

- [ ] Rückblick im Profil und im Dashboard: „Vor 3 Wochen: 2 von 12 Lernzielen sicher. Heute: 9.“ Nur echte Werte aus Lernzielstand und Behaltensquote, keine geschätzten Prozentangaben.
- [x] Verlauf je Kurs als kleine Grafik (Lernziele sicher über die Zeit).
- [x] Persönliche Planbarkeit: Bei aktivem Prüfungstermin sieht **nur der Lernende** eine Einschätzung („bei deinem Tempo wird es knapp, sollen wir den Plan anpassen?“) mit Vorschlag (Wochenziel erhöhen, Termin verschieben). Im Firmenbereich erscheint davon nichts (Regel 2).
- [x] Kein Vergleich mit anderen Personen.

**Akzeptanzkriterium:** Ein Nutzer mit mindestens 3 Wochen Verlauf sieht seinen Zuwachs mit echten Zahlen; die Einschätzung zum Prüfungstermin ist im Firmenbereich nicht abrufbar (Test).

---

## Phase 8 – Rückmeldungen ohne Schuldzuweisung (Priorität: mittel)

- [x] Leitfaden für alle Texte nach Fehlern: Fehler als fehlenden Schritt formulieren, nie als Eigenschaft der Person („Hier fehlt noch ein Zwischenschritt“ statt „Falsch“). Gilt für UI-Texte und für Prompts der Inhaltsgenerierung (Erklärungen, Begründungen der Optionen).
- [x] Plattformstatistik nur mit echter Datenbasis (Platzhalter): „4 von 10 Lernenden beantworten das beim ersten Mal falsch.“ Unterhalb der Schwelle keine Zahl.
- [x] Bestehende UI-Texte nach dem Leitfaden überarbeiten (Sessions, Lektionstests, Simulationen, Auswertung).

**Akzeptanzkriterium:** Keine Rückmeldung enthält eine Zahl ohne Datenbasis (Test über die Textbausteine); der Leitfaden liegt als `docs/RUECKMELDUNGEN.md` im Repository.

---

## Phase 9 – Mentor-Brücke „Ich hänge fest“ (Priorität: mittel)

Erweitert „Mentor fragen“ aus `roadmap_didaktik.md`, Phase 9.4.

- [x] Button „Ich hänge fest“ bei Praxisaufgaben und Simulationen im Firmenbereich.
- [x] Das System schlägt eine Zusammenfassung vor: Aufgabe, eigene Beschreibung des Problems, optional Fehlermeldung oder Log-Ausschnitt, den der Lernende selbst einfügt.
- [x] **Der Lernende sieht und bearbeitet die Zusammenfassung vor dem Senden.** Keine automatische Übertragung von Fehlversuchen, Antworten oder Lernzeit.
- [x] Zustellung an den zugewiesenen Mentor (Plattform-Benachrichtigung, optional E-Mail).
- [x] Kennzahl (anonym, aggregiert je Firma, nur ab Mindestgröße): wie oft Hilfe angefragt und wie schnell beantwortet wird.

**Akzeptanzkriterium:** Eine Anfrage erreicht den Mentor nur nach ausdrücklicher Bestätigung; ein Test belegt, dass keine Antwortdaten automatisch mitgesendet werden.

---

## Phase 10 – Messen: Ausgangswerte vor Zielen (begleitend)

- [ ] Kennzahlen in `psrp:metrics` ergänzen: Abbruch nach 7 und 30 Tagen (keine Session mehr), Rückkehrquote nach Pause, Kursabschlussquote, Nutzung von Notausstieg, Deeskalation und Energie-Alternativen.
- [ ] Vor dem Einschalten einer Mechanik den Ausgangswert erfassen; Ziele erst danach festlegen.
- [ ] Hypothesen für den Pilot (Zielwerte sind Annahmen, keine Zusagen): weniger Abbrüche nach 7 Tagen, höhere Rückkehrquote nach Pausen, mehr Hilfeanfragen bei gleichbleibender Mentorenzeit.

**Akzeptanzkriterium:** Für jedes Feature-Flag dieser Roadmap lassen sich Ausgangs- und Vergleichswerte per Skript erzeugen.

---

## Reihenfolge

1. Phase 1 (Vergleichsgrafik): klein und sofort nützlich für Demos und Gespräche mit Entscheidern.
2. Phase 2 und 3 (Frühwarnung, Notausstieg): nach dem ersten Teil des Verstehens-Modus, weil sie dessen Signale teilen.
3. Phase 8 (Rückmeldungen) parallel, reine Text- und Prompt-Arbeit.
4. Phase 4, 5, 7 zusammen mit Wochenziel und einfachem Einstieg (`roadmap_didaktik.md`, Phase 5 und 6).
5. Phase 6 nach Web Push (`roadmap_pwa.md`, Phase 6); die E-Mail-Variante kann vorher kommen.
6. Phase 9 zusammen mit „Mentor fragen“.
7. Phase 10 begleitend ab Phase 2.
