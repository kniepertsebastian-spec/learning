# Umsetzungsplan: PWA-Härtung, Didaktik, Prüfer und Motivation

Legt fest, in welcher Reihenfolge die Punkte aus `roadmap_pwa.md`, `roadmap_didaktik.md`, `roadmap_pruefer.md` und `roadmap_motivation.md` umgesetzt werden. Die Inhalte, Regeln und Akzeptanzkriterien stehen in den Roadmaps. Dieses Dokument regelt nur Reihenfolge, Zuschnitt in PRs und Abhängigkeiten. Stand: 23.10.2026.

**Voraussetzung:** PR #117 (beide Roadmaps) ist gemergt.

---

## Grundsätze für die Reihenfolge

1. **Erst Schaden verhindern, dann verbessern.** Was heute Lernfortschritt kosten kann, kommt zuerst.
2. **Kleine, sofort spürbare Schritte vor großen Umbauten.** Jedes Paket ist ein eigener PR und einzeln auslieferbar.
3. **Messung früh starten.** Daten, die Wochen brauchen (Prüfungsergebnisse), werden so früh wie möglich erhoben.
4. **Vor den Pilotkunden fertig:** alles, was die Aussage „bestanden heißt beherrscht“ und die Messdaten verfälschen würde.
5. **Vor der Vermarktung von „Offline lernen“ fertig:** die vollständige Offline-Navigation.

Aufwand: **S** = bis 1 Tag, **M** = 2–4 Tage, **L** = 1–2 Wochen (Schätzung für einen Entwickler mit Agent).

---

## Stufe 1 – Sofort (Schaden verhindern, schnelle Wirkung)

### Paket 1.1 – Offline-Datenverlust verhindern · S
Quelle: `roadmap_pwa.md`, Phase 1
- [x] `reloadOnOnline: false`
- [x] `navigator.storage.persist()` beim ersten Offline-Download, Speicherstatus in `OfflinePackageManager`
- [x] Logout mit ausstehenden Sync-Ereignissen: erst synchronisieren, sonst warnen

### Paket 1.2 – Sofortiges Feedback in Übungssessions · S
Quelle: `roadmap_didaktik.md`, Phase 2
- [x] `FeedbackPanel` in `StudySession`, Sicherheitsangabe vor dem Aufdecken
- [x] „Nochmal nachlesen“-Link, Einstellung „Feedback erst am Ende“
- [x] `ExamSession` unverändert

**Zuschnitt:** 1.1 und 1.2 können ein gemeinsamer PR sein (beide klein, keine Überschneidung) oder zwei getrennte.
**Fertig, wenn:** beide Akzeptanzkriterien der Roadmaps erfüllt sind und CI grün ist.

---

## Stufe 2 – Vor den Pilotkunden

### Paket 2.1 – Prüfungsergebnis erfragen · S
Quelle: `roadmap_didaktik.md`, Phase 7 (nur der erste Punkt und der Export des Ergebnisses)
- [x] Nachfrage 1 Tag nach Prüfungstermin, Erinnerung nach 7 Tagen
- [x] `psrp:metrics` um Prüfungsergebnis erweitern

Vorgezogen, weil Ergebnisse erst Wochen nach der Prüfung vorliegen.

### Paket 2.2 – Varianten statt derselben Frage · L
Quelle: `roadmap_didaktik.md`, Phase 1
- [x] 2.2a Datenmodell `item_variant`, Migration, Backfill der Originale, Spalte `review_log.variant_question_id` · M
- [x] 2.2b Varianten-Generierung inkl. Validierung und `npm run variants:backfill` mit Kostenschätzung · M
- [x] 2.2c Variantenauswahl in Session und Offline-Paket, Feature-Flag `variant_rotation`, auffällige Varianten in die Prüfliste · M

**Zuschnitt:** drei PRs in der Reihenfolge a → b → c. Nach 2.2a ändert sich für Nutzer noch nichts.
**Abhängigkeit:** Das Offline-Paket (`lib/server/offline/manifest.ts`) muss in 2.2c die Varianten mitliefern.

### Paket 2.3 – Datenschutz im Cache und Updates · M
Quelle: `roadmap_pwa.md`, Phase 3
- [x] Getrennte Caches mit Ablauf, Admin-/Firmenseiten nicht cachen, Cache bei Nutzerwechsel leeren
- [x] Update-Toast statt `skipWaiting`, `ChunkLoadError` abfangen

Vor den Pilotkunden, weil Firmenkunden geteilte Geräte nutzen können und Updates dann häufig kommen.

---

## Stufe 3 – Offline vollständig, „Handeln vor Lesen“ und Verstehen

### Paket 3.1 – Offline-Navigation · M
Quelle: `roadmap_pwa.md`, Phase 2
- [x] `/~offline`-Fallback, Seite `/offline` „Meine Offline-Kurse“, serverunabhängiger Leser, harte Navigation offline

**Abhängigkeit:** nach 2.3 (Cache-Aufteilung), damit Fallback und Precache gleich richtig einsortiert werden.

### Paket 3.2 – Vorabfragen und Einstiegstest · M
Quelle: `roadmap_didaktik.md`, Phase 4
- [ ] 3.2a Vorabfragen vor Lektionen (Flag `pretest_questions`) · S
- [ ] 3.2b Einstiegstest je Kapitel mit `applyChapterSkip`, Regel für Pflichtkurse · M

**Abhängigkeit:** nach 2.2, damit Einstiegstest und spätere Wiederholungen unterschiedliche Varianten zeigen.

### Paket 3.3 – PWA-Tests · M
Quelle: `roadmap_pwa.md`, Phase 7
- [ ] Playwright-E2E für Offline-Fluss, Update-Toast und Cache-Regeln, `docs/PWA.md`

Direkt nach 3.1, damit die Offline-Navigation abgesichert ist.

### Paket 3.4 – Rückblick „Was weißt du noch?“ · M
Quelle: `roadmap_didaktik.md`, Phase 8
- [ ] Auswahl der Lektionen, Rückblick am Session-Anfang mit Varianten, `review_type = recall_check`, Tagesform beim Lernen mitloggen, Flag `recall_check`

**Abhängigkeit:** 2.2 (erledigt). Früh einplanen, weil die Messdaten Zeit brauchen.

### Paket 3.5 – Verstehens-Modus · L
Quelle: `roadmap_didaktik.md`, Phase 9
- [ ] 3.5a Signale erkennen, `concept_struggle`, Wiederholen pausieren, häufige Verwechslung ansprechen · M
- [ ] 3.5b Alternativerklärungen je Lernziel: Generierung, Werkstatt-Freigabe, Backfill · M
- [ ] 3.5c Voraussetzungen im Konzeptmodell (`concept_prerequisite`), Diagnosefragen, Brückenlektion · L
- [ ] 3.5d „Mentor fragen“ (nur durch Lernende ausgelöst), Häufung in die Werkstatt-Prüfliste · S; zusammen mit der Mentor-Brücke „Ich hänge fest“ (`roadmap_motivation.md`, Phase 9): Zusammenfassung wird vom Lernenden geprüft und bestätigt

**Zuschnitt:** vier PRs in der Reihenfolge a → d → b → c. Schon 3.5a allein verhindert, dass Unverstandenes stur wiederholt wird; 3.5d ist klein und verbessert die Inhalte früh.
**Abhängigkeit:** 2.2 (erledigt). Vor 4.5 (neue Antwortformate).

### Paket 3.6 – Vergleichsgrafik „Eine Woche Pause“ · S
Quelle: `roadmap_motivation.md`, Phase 1
- [ ] Simulator-Modus `vanilla` vs. `planning`, Szenario mit 7 Tagen Pause, `npm run psrp:pause-demo` mit SVG-Grafik und Annahmen

**Abhängigkeit:** keine. **Vor den ersten Gesprächen mit Entscheidern**, weil sie den Human Layer ohne Nutzerdaten zeigt.

### Paket 3.7 – Frühwarnung und Notausstieg · M
Quelle: `roadmap_motivation.md`, Phase 2, 3 und 8
- [ ] 3.7a Frühwarnung für stille Abbrüche mit Deeskalation in der Planungsschicht, Flag `dropout_guard` · M
- [ ] 3.7b Notausstieg „Heute reicht's“ mit 2–3 Erfolgsaufgaben, Flag `exit_with_win` · S
- [ ] 3.7c Leitfaden für Rückmeldungen ohne Schuldzuweisung, Texte und Prompts überarbeiten · S

**Abhängigkeit:** nach 3.5a (gemeinsame Signale mit dem Verstehens-Modus). 3.7c ist reine Textarbeit und kann jederzeit parallel laufen.

---

## Stufe 4 – Vor dem Launch

### Paket 4.1 – Einfacher Einstieg und Motivation ohne Strafe · M
Quelle: `roadmap_didaktik.md`, Phase 5 und 6; `roadmap_motivation.md`, Phase 4, 5 und 7
- [ ] Wochenziel statt Tagesserie, Willkommen-zurück-Ablauf
- [ ] Erste Session ohne Zusatz-Eingaben, Sicherheitsangabe ab Session 3, Check-in ab Session 5, Seite „Wie ich lerne“
- [ ] Aufgabenart nach Energie (Simulation, Spickzettel, „nur eine Aufgabe“), Flag `energy_modes`
- [ ] Praxisaufgabe wird durch Lektion freigeschaltet, „Warum lerne ich das?“ je Lektion
- [ ] Fortschritt sichtbar mit echten Zahlen; Einschätzung zum Prüfungstermin nur für den Lernenden

**Zuschnitt:** zwei bis drei PRs (Einstieg und Wochenziel · Energie-Alternativen und Fortschritt · Praxisbezug).

### Paket 4.2 – Manifest, Icons, iOS · M
Quelle: `roadmap_pwa.md`, Phase 4
- [ ] Manifest vollständig, Screenshots, Shortcuts, neue Icons im Branding, iOS-Startbilder und Safe-Areas, `<html lang>`

**Abhängigkeit:** Neuer Produktname und Branding sollten feststehen, sonst entstehen die Icons zweimal.

### Paket 4.3 – Installation und Hintergrund-Sync · M
Quelle: `roadmap_pwa.md`, Phase 5
- [ ] Install-Hinweis (Android/Desktop, iOS-Anleitung), Background Sync

**Abhängigkeit:** nach 4.2 (Screenshots für den Installationsdialog).

### Paket 4.4 – Schwächen in spätere Lektionen einweben · M
Quelle: `roadmap_didaktik.md`, Phase 10
- [ ] Kandidaten über gemeinsame Konzepte bzw. Voraussetzungen, bis zu 2 eingewebte Varianten im Lektionstest, Einbau in Simulationen, zählt nicht fürs Bestehen, Flag `woven_reviews`

**Abhängigkeit:** nach 3.5a (Items im Verstehens-Modus werden nicht eingewebt) und 3.5c (Voraussetzungen als Brücke).

### Paket 4.5 – Neue Antwortformate · L
Quelle: `roadmap_didaktik.md`, Phase 3
- [ ] 4.5a Datenmodell `answer_format`, Formate `ordering`, `short_answer`, `matching` in Session, Lektionstest und Offline-Leser · L
- [ ] 4.5b Generierung und Werkstatt für die neuen Formate · M
- [ ] 4.5c Modus „Antwort zuerst überlegen“ und Selbsterklärung · S

**Abhängigkeit:** nach 2.2 (Varianten-Generierung wird erweitert) und 3.5 (Verstehens-Modus zuerst). Die neuen Formate werten danach auch Rückblick (3.4) und Verstehens-Modus auf.

### Paket 4.6 – Prüfer-Rolle und Freigabe je Inhaltsstand · L
Quelle: `roadmap_pruefer.md`, Phase 1 und 2
- [ ] 4.6a Freigabe an Inhaltsstand binden: `course_approvals`, `content_hash`, Änderungserkennung mit Diff, Migration von `approvedByName` · M
- [ ] 4.6b Rolle `reviewer`, Einladung, Zuweisung je allgemeinem Kurs, eingeschränkte Werkstatt mit Kommentaren und Freigabe · M

**Abhängigkeit:** keine. **Spätestens bevor der erste externe Experte einen Kurs freigibt**, auch wenn das vor dem Launch passiert; sonst steht sein Name unter späteren Änderungen.

### Paket 4.7 – Expertenprofil und Siegel am Kurs · M
Quelle: `roadmap_pruefer.md`, Phase 3 und 4 (rechtliche Punkte aus Phase 7 vorher klären)
- [ ] Profil mit Einwilligung je Feld, Erfahrung, Zertifikate mit Nachweis-Link und Ablaufdatum, öffentliche Seite `/experts/<slug>`, Rückzug
- [ ] Siegel „Fachlich geprüft von …“ auf Kursseite, Katalog, Offline-Paket und Bescheinigung

**Abhängigkeit:** 4.6. Ein fertiges Profil ist zugleich Material für Landingpage und Vertrieb.

### Paket 4.8 – Probe-Review für neue Prüfer · M
Quelle: `roadmap_pruefer.md`, Phase 5
- [ ] Probe-Sets mit von Menschen festgelegten Fehlern, regelbasierte Auswertung, schaltet Freigaberechte frei

**Abhängigkeit:** 4.6b. Erst nötig, wenn mehr als ein, zwei Experten gewonnen werden; den ersten Experten wählst du persönlich aus.

### Paket 4.9 – Reaktivierung ohne Beschämung · S
Quelle: `roadmap_motivation.md`, Phase 6
- [ ] E-Mail nach 5, 12 und 26 Tagen Pause mit Link zu einer 3-Minuten-Session, abbestellbar, nie an Arbeitgeber, Flag `reactivation`

**Abhängigkeit:** 4.1 (Willkommen-zurück-Ablauf). Die Push-Variante folgt mit Web Push in Stufe 5.

---

## Stufe 5 – Nach Bedarf

- [ ] Wirkung messen, restliche Punkte (`roadmap_didaktik.md`, Phase 7): Export nach Feature-Flags, Readiness gegen Prüfungsergebnis; sobald genug Prüfungsergebnisse vorliegen
- [ ] Web Push (`roadmap_pwa.md`, Phase 6), sinnvoll zusammen mit PSRP-HR-Erinnerungszeiten
- [ ] Didaktik „Später“ (`roadmap_didaktik.md`, Phase 11)
- [ ] Motivation messen (`roadmap_motivation.md`, Phase 10): Ausgangswerte vor dem Einschalten jeder Mechanik erfassen, dann Ziele festlegen; Reaktivierung zusätzlich per Push
- [ ] Qualität der Prüfer im Betrieb (`roadmap_pruefer.md`, Phase 6): Kennzahlen je Prüfer, Zweitprüfung als Stichprobe, Wiedervorlage bei neuer Prüfungsversion; sobald freigegebene Kurse Nutzer haben

---

## Übersicht

| # | Paket | Quelle | Aufwand | Stufe | Abhängig von |
|---|---|---|---|---|---|
| 1.1 | Offline-Datenverlust verhindern ✅ | PWA 1 | S | Sofort | – |
| 1.2 | Sofortiges Feedback ✅ | Didaktik 2 | S | Sofort | – |
| 2.1 | Prüfungsergebnis erfragen ✅ | Didaktik 7 (Teil) | S | Vor Pilot | – |
| 2.2 | Varianten statt derselben Frage ✅ | Didaktik 1 | L | Vor Pilot | – |
| 2.3 | Cache-Datenschutz & Updates ✅ | PWA 3 | M | Vor Pilot | – |
| 3.1 | Offline-Navigation ✅ | PWA 2 | M | Offline | 2.3 ✅ |
| 3.2 | Vorabfragen & Einstiegstest | Didaktik 4 | M | Didaktik | 2.2 ✅ |
| 3.3 | PWA-Tests | PWA 7 | M | Offline | 3.1 |
| 3.4 | Rückblick „Was weißt du noch?“ | Didaktik 8 | M | Didaktik | 2.2 ✅ |
| 3.5 | Verstehens-Modus | Didaktik 9 | L | Didaktik | 2.2 ✅ |
| 3.6 | Vergleichsgrafik „Eine Woche Pause“ | Motivation 1 | S | Vor Entscheider-Gesprächen | – |
| 3.7 | Frühwarnung, Notausstieg, Rückmeldungen | Motivation 2, 3, 8 | M | Didaktik | 3.5a |
| 4.1 | Einstieg & Motivation | Didaktik 5, 6; Motivation 4, 5, 7 | M | Vor Launch | – |
| 4.2 | Manifest, Icons, iOS | PWA 4 | M | Vor Launch | Branding |
| 4.3 | Installation & Background Sync | PWA 5 | M | Vor Launch | 4.2 |
| 4.4 | Schwächen einweben | Didaktik 10 | M | Vor Launch | 3.5a, 3.5c |
| 4.5 | Neue Antwortformate | Didaktik 3 | L | Vor Launch | 2.2 ✅, 3.5 |
| 4.6 | Prüfer-Rolle & Freigabe je Inhaltsstand | Prüfer 1, 2 | L | Vor Launch / vor 1. Experten | – |
| 4.7 | Expertenprofil & Siegel | Prüfer 3, 4 | M | Vor Launch | 4.6, Recht |
| 4.8 | Probe-Review | Prüfer 5 | M | Vor Launch | 4.6b |
| 4.9 | Reaktivierung per E-Mail | Motivation 6 | S | Vor Launch | 4.1 |
| 5 | Messung, Push, Später, Prüfer-Qualität | Didaktik 7, 11; PWA 6; Prüfer 6; Motivation 10 | – | Nach Bedarf | Daten |

Pakete ohne Abhängigkeit innerhalb einer Stufe können parallel bearbeitet werden.

**Nächste Schritte (Stand 23.10.2026):** Stufe 1 und 2 sowie 3.1 sind erledigt. Zuerst 3.6 (Vergleichsgrafik, klein, für die Gespräche mit Entscheidern). Dann in Stufe 3 die didaktischen Pakete in der Reihenfolge 3.4 → 3.5a → 3.7 → 3.2 → 3.5d → 3.5b → 3.5c, parallel 3.3 (PWA-Tests). Vor der ersten Freigabe durch einen externen Experten zusätzlich 4.6a.
