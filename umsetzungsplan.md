# Umsetzungsplan: PWA-Härtung und Didaktik

Legt fest, in welcher Reihenfolge die Punkte aus `roadmap_pwa.md` und `roadmap_didaktik.md` umgesetzt werden. Die Inhalte, Regeln und Akzeptanzkriterien stehen in den beiden Roadmaps. Dieses Dokument regelt nur Reihenfolge, Zuschnitt in PRs und Abhängigkeiten. Stand: 22.10.2026.

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
- [ ] 2.2a Datenmodell `item_variant`, Migration, Backfill der Originale, Spalte `review_log.variant_question_id` · M
- [ ] 2.2b Varianten-Generierung inkl. Validierung und `npm run variants:backfill` mit Kostenschätzung · M
- [ ] 2.2c Variantenauswahl in Session und Offline-Paket, Feature-Flag `variant_rotation`, auffällige Varianten in die Prüfliste · M

**Zuschnitt:** drei PRs in der Reihenfolge a → b → c. Nach 2.2a ändert sich für Nutzer noch nichts.
**Abhängigkeit:** Das Offline-Paket (`lib/server/offline/manifest.ts`) muss in 2.2c die Varianten mitliefern.

### Paket 2.3 – Datenschutz im Cache und Updates · M
Quelle: `roadmap_pwa.md`, Phase 3
- [ ] Getrennte Caches mit Ablauf, Admin-/Firmenseiten nicht cachen, Cache bei Nutzerwechsel leeren
- [ ] Update-Toast statt `skipWaiting`, `ChunkLoadError` abfangen

Vor den Pilotkunden, weil Firmenkunden geteilte Geräte nutzen können und Updates dann häufig kommen.

---

## Stufe 3 – Offline vollständig und „Handeln vor Lesen“

### Paket 3.1 – Offline-Navigation · M
Quelle: `roadmap_pwa.md`, Phase 2
- [ ] `/~offline`-Fallback, Seite `/offline` „Meine Offline-Kurse“, serverunabhängiger Leser, harte Navigation offline

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

---

## Stufe 4 – Vor dem Launch

### Paket 4.1 – Einfacher Einstieg und Motivation ohne Strafe · M
Quelle: `roadmap_didaktik.md`, Phase 5 und 6
- [ ] Wochenziel statt Tagesserie, Willkommen-zurück-Ablauf
- [ ] Erste Session ohne Zusatz-Eingaben, Sicherheitsangabe ab Session 3, Check-in ab Session 5, Seite „Wie ich lerne“

### Paket 4.2 – Manifest, Icons, iOS · M
Quelle: `roadmap_pwa.md`, Phase 4
- [ ] Manifest vollständig, Screenshots, Shortcuts, neue Icons im Branding, iOS-Startbilder und Safe-Areas, `<html lang>`

**Abhängigkeit:** Neuer Produktname und Branding sollten feststehen, sonst entstehen die Icons zweimal.

### Paket 4.3 – Installation und Hintergrund-Sync · M
Quelle: `roadmap_pwa.md`, Phase 5
- [ ] Install-Hinweis (Android/Desktop, iOS-Anleitung), Background Sync

**Abhängigkeit:** nach 4.2 (Screenshots für den Installationsdialog).

### Paket 4.4 – Neue Antwortformate · L
Quelle: `roadmap_didaktik.md`, Phase 3
- [ ] 4.4a Datenmodell `answer_format`, Formate `ordering`, `short_answer`, `matching` in Session, Lektionstest und Offline-Leser · L
- [ ] 4.4b Generierung und Werkstatt für die neuen Formate · M
- [ ] 4.4c Modus „Antwort zuerst überlegen“ und Selbsterklärung · S

**Abhängigkeit:** nach 2.2 (Varianten-Generierung wird erweitert).

---

## Stufe 5 – Nach Bedarf

- [ ] Wirkung messen, restliche Punkte (`roadmap_didaktik.md`, Phase 7): Export nach Feature-Flags, Readiness gegen Prüfungsergebnis; sobald genug Prüfungsergebnisse vorliegen
- [ ] Web Push (`roadmap_pwa.md`, Phase 6), sinnvoll zusammen mit PSRP-HR-Erinnerungszeiten
- [ ] Didaktik „Später“ (`roadmap_didaktik.md`, Phase 8)

---

## Übersicht

| # | Paket | Quelle | Aufwand | Stufe | Abhängig von |
|---|---|---|---|---|---|
| 1.1 | Offline-Datenverlust verhindern | PWA 1 | S | Sofort | – |
| 1.2 | Sofortiges Feedback | Didaktik 2 | S | Sofort | – |
| 2.1 | Prüfungsergebnis erfragen | Didaktik 7 (Teil) | S | Vor Pilot | – |
| 2.2 | Varianten statt derselben Frage | Didaktik 1 | L | Vor Pilot | – |
| 2.3 | Cache-Datenschutz & Updates | PWA 3 | M | Vor Pilot | – |
| 3.1 | Offline-Navigation | PWA 2 | M | Offline | 2.3 |
| 3.2 | Vorabfragen & Einstiegstest | Didaktik 4 | M | Offline/Didaktik | 2.2 |
| 3.3 | PWA-Tests | PWA 7 | M | Offline | 3.1 |
| 4.1 | Einstieg & Motivation | Didaktik 5, 6 | M | Vor Launch | – |
| 4.2 | Manifest, Icons, iOS | PWA 4 | M | Vor Launch | Branding |
| 4.3 | Installation & Background Sync | PWA 5 | M | Vor Launch | 4.2 |
| 4.4 | Neue Antwortformate | Didaktik 3 | L | Vor Launch | 2.2 |
| 5 | Messung, Push, Später | Didaktik 7, 8; PWA 6 | – | Nach Bedarf | Daten |

Pakete ohne Abhängigkeit innerhalb einer Stufe können parallel bearbeitet werden.
