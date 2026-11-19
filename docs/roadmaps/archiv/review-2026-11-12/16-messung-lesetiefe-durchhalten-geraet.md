# Aufgabe 16: Messung von Lesetiefe, Durchhalten und Gerät

**Herkunft:** Phase 4 „Menschliche Faktoren, Stufe 1“ der Review-Roadmap, Faktoren 4.9, 4.10 und 4.12
**Voraussetzung:** keine für 4.9 (`LearningTimeTracker`), 4.10 und 4.12 nur Auswertung
**Priorität:** ab den ersten Echtdaten

## Faktoren
| Nr. | Faktor | Messung | Was die App damit tut |
|---|---|---|---|
| 4.9 | Lesetiefe | Lesezeit je Lektion im Verhältnis zur Wortzahl, erneutes Öffnen | Hinweis vor dem Lektionstest, wenn kaum gelesen wurde. Auswertung: Lesezeit gegen Testergebnis |
| 4.10 | Durchhalten nach Fehlern | Verhalten nach drei Fehlern in Folge: weiter, Pause, Ausstieg | Leichtere Frage einschieben, bevor der Ausstieg kommt |
| 4.12 | Gerät und Lage | Gerätetyp (schmal, breit), online oder offline, installiert oder Browser | Auswertung je Lage, kurze Formate für das Smartphone bevorzugen |

## Umsetzung
- [x] 4.9: Lesezeit je Lektion aus `LearningTimeTracker` mit der Lektion als Bezug speichern.
- [x] 4.10: nur Auswertung der Antwortfolge. Der Eingriff (leichtere Frage) erst nach Auswertung.
- [x] 4.12: Gerätetyp als grobe Klasse (schmal, breit) an der Session speichern, keine Gerätekennung.

## Akzeptanzkriterium
Lesezeit je Lektion ist gespeichert. Der Gerätetyp ist als grobe Klasse an der Session, nicht als Gerätekennung.

## Hinweis
Der Gerätetyp darf nicht als Kennung gespeichert werden. Die Angabe „schmal oder breit“ genügt für die Auswertung.

## Umsetzung (14.11.2026)
- **4.9 Lesezeit gespeichert:** Tabelle `lesson_reading_time` (Migration `0118`), Route `/api/lesson-time`, Komponente `LessonReadingTracker` in der Lektion (nur online, nur solange der Lektionstext statt des Tests angezeigt ist). Dieselbe Zählweise wie die Lernzeit: nur sichtbar, nur nach Eingaben. Flag `reading_time`.
- **4.12 Gerätetyp als grobe Klasse:** `study_sessions.device_class` (`narrow` oder `wide`, per Check-Constraint), gesetzt beim Abschluss der Sitzung online, über den Notausstieg und über die Sync-Warteschlange (`lib/client/device-class.ts`, Schwelle 640 Pixel). Keine Kennung. Flag `device_class`.
- **Auswertung** (nur Auswertung, kein Eingriff): `lib/server/psrp/session-context.ts` und `-db.ts`, im Export als `sessionContext`: Lesezeit gegen Ergebnis des ersten Lektionstests (4.9), Verhalten nach drei Fehlern in Folge (4.10), Trefferquote je Größenklasse (4.12). Definitionen, Grenzen und die Hypothesen H7 bis H9 in `docs/MESSEN.md`.
- **Datenexport und Datenschutzerklärung:** `learning.lessonReadingTime` im Export; Einträge „Lernverlauf“ und „Wiederholungsplanung“ in `lib/legal/privacy.ts` nennen Lesezeit und Größenklasse (der Abgleichtest erzwingt das).
- **Nicht gebaut, bewusst:** der Hinweis vor dem Lektionstest (4.9) und die leichtere Frage (4.10); beides braucht erst einen belegten Effekt. Die Messung „online oder offline, installiert oder Browser“ aus der Faktorentabelle (4.12) habe ich weggelassen, weil die Umsetzungsliste nur den Gerätetyp nennt und jede weitere Angabe zur Lage zusätzliche Angaben zur Person wären. Falls gewünscht, als eigene Aufgabe.
- **Bekannte Lücke:** Offline gelesene Lektionen haben keine Lesezeit (die Zeit wird nur bei Verbindung gemeldet).
- **Tests:** `lib/server/psrp/session-context.test.ts` (Definitionen und Grenzfälle), `lib/server/psrp/session-context.db.test.ts` (Route, Deckel, Flag aus, Export, Gerätegröße online und per Sync, Constraint, Auswertung), `app/api/attempt-bodies.test.ts` (ungültige Größenklasse: 400), `e2e/session-context.spec.ts` (Smartphone und großer Bildschirm senden `narrow` bzw. `wide` und die Sitzung speichert sie; Lesezeit ohne die Zeit im Hintergrund, Öffnen gezählt).
