# Entwicklungs-Roadmap: Datenintegrität über Zeit

> **Stand 24.10.2026:** Phasen 1–5 umgesetzt und geprüft (Unit-, DB- und E2E-Tests, Beschreibung in `docs/PWA.md`, Abschnitt „Datenintegrität über Zeit“). Phase 6 ist Betrieb auf dem Server; der Betreiber hat Backup-Prüfung und Monitoring-Alarm am 05.11.2026 als erledigt gemeldet (vom Agenten nicht geprüft). Der Restore-Test bleibt offen, bis sein Datum im Protokoll in `docs/BACKUP.md` steht. Die Checkliste steht ebenfalls dort.

Technischer Umsetzungsplan, damit offline erbrachte Lernleistung auch nach Tagen oder Wochen vollständig, mit dem richtigen Zeitpunkt und nur bei Berechtigten ankommt. Das Dokument ist für die Umsetzung durch einen Coding-Agenten geschrieben und setzt kein Vorwissen aus anderen Dokumenten voraus. Grundlage ist ein PWA-Review vom 24.10.2026 (`main` nach PR #156).

---

## Kontext

Die PWA-Roadmap (`roadmap_pwa.md`, Phasen 1–5 und 7) ist umgesetzt: Warteschlange in IndexedDB, die nie still gelöscht wird, Background Sync auf Chromium, Offline-Navigation, Cache-Datenschutz, Update-Hinweis. Der Server verbucht Ereignisse idempotent (`lib/server/sync/service.ts`, Unique-Index `userId` + `clientEventId` als Sperre). Backups sind verschlüsselt mit Restore-Test dokumentiert (`docs/BACKUP.md`).

Das Review fand vier Lücken, die erst mit zeitlichem Abstand sichtbar werden:

| # | Lücke | Wirkung | Betroffen |
|---|---|---|---|
| 1 | Der Server verbucht Offline-Ereignisse mit dem Zeitpunkt der Synchronisation, nicht der Antwort. `clientCreatedAt` wird nur in `sync_events` gespeichert; `applyEvent` → `completeStudySession` / `recordSectionQuizAttempt` / `recordSimulationSolved` → `recordReviewOutcomes` laufen mit `new Date()`. | Gedächtnismodell rechnet mit zu langen Abständen (zu lange Intervalle); Tageszeit-Profil, Tagesform beim Lernen (Rückblick), Lernserie, Wochenziel und Lernstatistik zählen den falschen Tag. Nichts geht verloren, aber die Daten des Human Layer werden still verfälscht. | alle Plattformen |
| 2 | Safari löscht IndexedDB einer nicht installierten Website nach etwa 7 Tagen ohne Nutzung; `persist()` wird dort meist ignoriert, Background Sync fehlt. | Noch nicht übertragene Ergebnisse und Pakete können verloren gehen. | iOS/Safari ohne Installation |
| 3 | Wurde eine Session inzwischen anderswo abgeschlossen oder übersprungen, endet das Ereignis als `conflict` und wird nie verbucht. | Echte Wiederholungen fehlen im Gedächtnismodell. | alle |
| 4 | Bei entzogenem Zugriff (z. B. aus der Firma entfernt) antwortet der Server mit 404, das lokale Paket eines internen Kurses bleibt aber bis zum Logout in IndexedDB. | Vertrauliches Firmenwissen bleibt auf dem Gerät. | Firmenbereich |

Dazu kleinere Punkte: endgültig abgelehnte Ereignisse bleiben für immer als „fehlgeschlagen“ stehen und werden bei jedem Sync erneut gesendet; unklar ist das Verhalten, wenn eine Frage aus einem heruntergeladenen Paket inzwischen gelöscht wurde.

**Hinweis:** Vor Änderungen an Next.js-Routen die passende Anleitung in `node_modules/next/dist/docs/` lesen (siehe `AGENTS.md`).

## Architektur-Regeln (verbindlich)

1. **Lernleistung geht nie verloren.** Kein Ereignis wird ohne ausdrückliche Entscheidung des Nutzers gelöscht, solange es nicht verbucht ist.
2. **Der Zeitpunkt der Antwort ist die Wahrheit,** begrenzt auf plausible Werte. Alle abgeleiteten Daten (FSRS-Zustand, `review_log.timestamp_utc` und `local_hour`, Lernserie, Lernzeit) nutzen ihn.
3. **Es gelten alle Regeln aus `roadmap_psrp_hr.md`:** rohes Rating, `review_log` unveränderlich; ein verspätetes Ereignis ändert nie rückwirkend einen bereits neueren Zustand.
4. **Wer keinen Zugriff mehr hat, hat auch lokal keine Inhalte mehr,** sobald das Gerät online ist.
5. **Jede Änderung ist mit Tests belegt**, die den zeitlichen Abstand simulieren (Uhr im Test vorstellen).

## Platzhalter-Entscheidungen

| Punkt | Standardwert |
|---|---|
| Maximales Alter eines Ereignisses für zeitgenaue Verbuchung | 30 Tage (älter: Verbuchung mit Zeitpunkt „jetzt − 30 Tage“ nicht sinnvoll → als Protokolleintrag ohne Zustandsänderung) |
| Toleranz für Uhrabweichung des Geräts (Zukunft) | 5 Minuten; spätere Zeitpunkte werden auf Serverzeit gesetzt |
| Untergrenze des Zeitpunkts | nicht vor Erstellung der Session bzw. dem Download des Pakets (`downloadedAt`) |
| Warnung bei unübertragenen Ergebnissen (iOS ohne Installation) | ab 24 Stunden Alter des ältesten Ereignisses |
| Endgültig abgelehnte Ereignisse | nach 3 gleichlautenden Antworten des Servers als `rejected` markiert, nicht mehr gesendet; Nutzer kann sie ansehen und verwerfen |

---

## Phase 1 – Zeitpunkt der Antwort verbuchen (Priorität: hoch)

- [x] Client: Zeitpunkt der Antwort je Ereignis ist bereits `createdAt`; zusätzlich je Antwort innerhalb einer Session den Zeitpunkt mitschicken (`answeredAt`), damit lange Offline-Sessions nicht auf einen Zeitpunkt zusammenfallen. Für ältere Ereignisse ohne `answeredAt` gilt `createdAt`.
- [x] Server: Funktion `effectiveTime(clientTime, bounds, now)` mit den Grenzen aus den Platzhaltern (Zukunft → Serverzeit, zu alt → Kennzeichnung, vor Session/Download → Untergrenze). Reine Funktion, eigene Unit-Tests.
- [x] `applyEvent` reicht die Zeit durch: `completeStudySession`, `recordSectionQuizAttempt`, `recordSimulationSolved` bekommen einen Parameter `at`; `recordReviewOutcomes` bzw. `recordRatedReviews` nutzen ihn als `now` (Option existiert in `RecordOptions`).
- [x] Reihenfolge: Hat das Item im FSRS-Zustand bereits ein späteres `last_review` als der Antwortzeitpunkt (z. B. weil auf einem anderen Gerät inzwischen gelernt wurde), wird die Antwort mit ihrem Zeitpunkt in `review_log` geschrieben, der Zustand aber **nicht** verändert. Neu: Spalte `review_log.state_applied` (bool) bzw. ein `review_type`-Zusatz, damit Auswertungen das unterscheiden können.
- [x] `local_hour` und Wochentag im `review_log` aus dem Antwortzeitpunkt und der Zeitzone des Nutzers berechnen, nicht aus der Serverzeit.
- [x] Abgeleitete Werte mit dem Antwortzeitpunkt: `study_sessions.completedAt` (Lernserie, Wochenziel), `section_quiz_attempts.completedAt`, Lernzeit-Statistik, Rückblick (Tagesform beim Lernen), Frühwarnung (Signale im richtigen Zeitfenster).
- [x] Der Load-Balancer für neue Intervalle rechnet vom Antwortzeitpunkt aus; ein daraus resultierender Fälligkeitstermin in der Vergangenheit ist erlaubt (Karte ist dann sofort fällig).
- [x] Tests: Antwort am Tag 0 offline, Sync am Tag 7 → `review_log.timestamp_utc` = Tag 0, Intervall wie bei Online-Antwort am Tag 0; Antwort aus der Zukunft wird auf Serverzeit begrenzt; spätere Online-Wiederholung desselben Items bleibt maßgeblich.

**Akzeptanzkriterium:** Eine offline am Montag beantwortete Session, die am Sonntag synchronisiert wird, erzeugt denselben FSRS-Zustand, dieselbe Lernserie und dieselben `review_log`-Zeiten wie dieselbe Session online am Montag.

---

## Phase 2 – iOS: Ergebnisse vor der Löschung retten (Priorität: hoch)

- [x] Beim Verlassen der Seite (`visibilitychange` → `hidden`, `pagehide`) die Warteschlange übertragen, wenn das Gerät online ist: `fetch` mit `keepalive: true` (Größe beachten, max. 64 KB je Anfrage; größere Warteschlangen in Teilen oder beim nächsten Start). Gleiche Idempotenz wie bisher, kein Risiko doppelter Verbuchung.
- [x] Beim App-Start, bei `online` und bei `visibilitychange` → `visible` sofort synchronisieren (vorhandene Auslöser prüfen und vereinheitlichen).
- [x] Hinweis bei unübertragenen Ergebnissen: Ist das älteste Ereignis älter als die Schwelle (Platzhalter) und läuft die App nicht installiert (iOS/Safari, nicht `display-mode: standalone`), deutlicher Hinweis im Kopf und auf `/offline`: „3 Ergebnisse sind noch nicht übertragen. Öffne die App, sobald du Netz hast. Safari kann nicht installierte Web-Apps nach einer Woche löschen.“
- [x] Beim ersten Offline-Download auf iOS ohne Installation: Installationsanleitung als Schritt vor dem Download (überspringbar, aber nicht nur als Randhinweis).
- [x] Speicherstatus auf `/offline` um „ältestes unübertragenes Ergebnis: vor X Tagen“ ergänzen.
- [x] E2E-Test (Chromium, simuliert): Ergebnis offline, Seite in den Hintergrund, Netz an → Ereignis ist ohne erneutes Öffnen auf dem Server (über `keepalive`).

**Akzeptanzkriterium:** Ein Ergebnis, das offline entsteht, wird beim nächsten Wechsel in den Hintergrund mit Netz übertragen; auf iOS ohne Installation erscheint nach 24 Stunden ein deutlicher Hinweis.

---

## Phase 3 – Konflikte ohne Datenverlust (Priorität: mittel)

- [x] Session bereits `completed` oder `skipped`: die Session nicht erneut abschließen, aber die einzelnen Antworten als Wiederholungen verbuchen (mit Antwortzeitpunkt, Reihenfolge-Regel aus Phase 1). Ergebnis-Status neu: `applied_partial` mit Hinweis „Session war schon abgeschlossen, deine Antworten wurden trotzdem gezählt“.
- [x] Gleiches für Lektionstests, die inzwischen online bestanden wurden: Versuch protokollieren, Wiederholungen verbuchen, Lernzielstand nur verbessern, nie verschlechtern.
- [x] Bestehende Ereignisse mit Status `conflict` (Server und Client) per einmaligem Skript erneut verarbeiten (`npm run sync:reprocess-conflicts`, idempotent, mit Trockenlauf). _Umsetzung:_ Der Server speichert die Nutzdaten nicht; das Skript gibt die Sperre der alten Konflikte frei, die Geräte senden sie erneut (die Seite reiht lokale Konflikte einmalig wieder ein). Der Server verarbeitet einen erneut gesendeten Konflikt auch ohne Skript.

**Akzeptanzkriterium:** Eine offline beantwortete Session, die online parallel abgeschlossen wurde, erzeugt trotzdem `review_log`-Einträge für alle Antworten; kein Ereignis endet mehr als `conflict` ohne verbuchte Wiederholungen.

---

## Phase 4 – Entzogenen Zugriff lokal durchsetzen (Priorität: mittel)

- [x] Beim App-Start mit Netz und auf `/offline`: für jedes lokale Paket die Version abfragen (`/api/cert/<id>/offline-package/version`). Antwort 404 oder 403 → Paket lokal löschen und kurz anzeigen: „Ein Kurs ist nicht mehr für dich freigegeben und wurde vom Gerät entfernt.“ Netzfehler → nichts löschen.
- [x] Die Sync-Warteschlange bleibt davon unberührt (Regel 1); der Server lehnt deren Ereignisse wie bisher ab (Phase 5 regelt die Anzeige).
- [x] Optional für Firmen (`npm run company:offline-expiry`): Ablaufdatum für Pakete interner Lernpfade (z. B. 30 Tage ohne Online-Prüfung → Paket gesperrt, bis wieder online geprüft wurde). Einstellbar je Firma, Standard aus.
- [x] E2E-Test: Nutzer lädt internen Kurs, wird aus der Firma entfernt, startet die App online → Paket ist gelöscht.

**Akzeptanzkriterium:** Nach Entzug des Zugriffs ist das Paket spätestens beim nächsten Online-Start vom Gerät entfernt; offline bleibt es nutzbar, bis wieder Netz da ist (bewusster Kompromiss, in `docs/PWA.md` dokumentiert).

---

## Phase 5 – Aufräumen und Grenzfälle (Priorität: niedrig)

- [x] Endgültig abgelehnte Ereignisse (`SectionNotFound`, `StudySessionNotFound`, `SimulationNotFound`, versteckte Inhalte) nach der Regel aus den Platzhaltern als `rejected` markieren und nicht mehr senden. Der Sync-Knopf zeigt sie getrennt („2 Ergebnisse konnten nicht zugeordnet werden“) mit „Ansehen“ und „Verwerfen“.
- [x] Gelöschte oder ersetzte Fragen: Antwort auf eine Frage, die es nicht mehr gibt, wird übersprungen und im Ergebnis gemeldet, statt die ganze Verbuchung scheitern zu lassen. Test mit einem Paket, dessen Frage nach dem Download in der Werkstatt gelöscht wurde.
- [x] Antworten auf Varianten, die inzwischen deaktiviert wurden, weiter dem Original-Item zuordnen (`item_variant` auch bei `active = false` auflösen).
- [x] `docs/PWA.md` um einen Abschnitt „Datenintegrität über Zeit“ ergänzen: Zeitpunkt der Antwort, iOS-Löschung, Konflikte, Entzug.

**Akzeptanzkriterium:** Keine Warteschlange enthält dauerhaft Ereignisse, die bei jedem Sync erneut gesendet und abgelehnt werden.

---

## Phase 6 – Betrieb prüfen (begleitend, kein Code)

- [x] Auf dem Server prüfen, dass das automatische Backup tatsächlich per Cron läuft, `BACKUP_REMOTE` gesetzt ist und der private Schlüssel getrennt vom Server liegt (`docs/BACKUP.md`).
  - _Am 05.11.2026 auf Anweisung des Betreibers abgehakt, nur auf dem Server prüfbar._
- [ ] Restore-Test einmal im Quartal durchführen und Datum notieren.
  - _Vom Betreiber am 05.11.2026 als erledigt gemeldet, hier aber offen gelassen: Es ist kein Datum notiert, das Restore-Test-Protokoll in `docs/BACKUP.md` ist leer. Der Haken kommt mit dem Datum des letzten Tests; danach alle drei Monate wiederholen._
- [x] Monitoring-Alarm, wenn das letzte Backup älter als 36 Stunden ist.
  - _Am 05.11.2026 auf Anweisung des Betreibers abgehakt. `scripts/monitor.sh` alarmiert schon ab 26 Stunden (`MONITOR_BACKUP_MAX_HOURS`), also früher als gefordert._

---

## Reihenfolge

1. Phase 1: betrifft alle Plattformen und verfälscht still die Daten des Human Layer; vor dem Pilot.
2. Phase 2: iOS-Nutzer ohne Installation; zusammen mit oder direkt nach Phase 1.
3. Phase 4: vor dem ersten Firmenkunden mit vertraulichen internen Lernpfaden.
4. Phase 3 und 5 danach.
5. Phase 6 sofort und dann regelmäßig.
