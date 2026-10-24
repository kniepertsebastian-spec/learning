# Probe-Review für neue Prüfer

Paket 4.8 (`roadmap_pruefer.md` Phase 5). Geprüft wird, ob jemand gut **prüfen** kann, nicht nur Fragen beantworten.

## Ablauf
1. **Betreiber** legt unter `/admin/reviewers/probe` einen Satz an: 15 bis 20 Fragen mit je vier Optionen (eine als richtig markiert) und Erklärung, davon 4 bis 5 mit **eingebautem Fehler**. Fehlertyp (falscher Lösungsschlüssel, zwei vertretbare Antworten, veralteter Prüfungsstand, irreführende Formulierung, Erklärung widerspricht der Lösung) und Notiz legt der Admin selbst fest. Aktiv geht nur mit gültigem Satz. Sobald es Versuche gibt, sind die Fragen gesperrt (neuen Satz anlegen); Titel und „aktiv“ bleiben änderbar.
2. **Kandidat** (Person mit Prüfer-Rolle) sieht auf `/reviewer` den Hinweis, dass Freigeben und Profil-Veröffentlichung erst nach dem Probe-Review möglich sind, und beginnt unter `/reviewer/probe` einen Versuch. Er sieht jede Frage mit markiertem Lösungsschlüssel und Erklärung (keine Angaben zu den eingebauten Fehlern), meldet fehlerhafte Fragen mit Fehlerart und kurzer Begründung (je Frage eine, rücknehmbar) und gibt ab.
3. **Auswertung** regelbasiert, ohne KI: Bestanden ist, wer mindestens 80 % der eingebauten Fehler gefunden hat (4 von 5; bei 4 eingebauten alle vier) und höchstens 2 Fehlalarme hat (Meldungen zu fehlerfreien Fragen).
4. **Ergebnis nur intern:** Der Kandidat erfährt nur „bestanden“ oder „nicht bestanden“. Admins sehen gefundene Fehler, Fehlalarme und die Begründungen zu Fragen ohne eingebauten Fehler (falls der Hinweis doch berechtigt ist).
5. **Bestanden** schaltet Freigaberechte und die Veröffentlichung des Expertenprofils frei (`reviewer_qualifications`, Quelle `probe`). **Nicht bestanden:** Wiederholung frühestens nach 30 Tagen und nur mit einem anderen Satz.

## Freischalten durch den Betreiber
Den ersten Experten wählst du persönlich aus: unter `/admin/reviewers/probe` → „Freigaberechte“ → „Freischalten“ (Quelle `admin`), ohne Probe. Dort lässt sich die Freischaltung auch zurücknehmen. Prüfer, die es schon vor diesem Paket gab, wurden per Migration freigeschaltet.

## Was ohne Freischaltung gesperrt ist
- Kurse freigeben (`/api/reviewer/courses/<id>/approve` antwortet 403, die Schaltfläche ist gesperrt).
- Das öffentliche Expertenprofil veröffentlichen. Lesen, kommentieren und Fragen melden bleiben möglich.

## Daten
Tabellen `probe_sets`, `probe_set_items`, `probe_attempts`, `reviewer_qualifications` (Migration 0095). Der Datenexport der Person enthält ihre Versuche und ihre Freischaltung.

## Noch offen
- KI-Vorschläge für die Fragen eines Satzes (die Fehler und der Schlüssel müssen ohnehin Menschen festlegen).
- Zusätzliche Meldungen landen in der Ergebnisansicht des Admins, nicht in der Werkstatt-Prüfliste (die Fragen eines Satzes gehören zu keinem Kurs).
- Die Prüfer-Oberfläche des Probe-Reviews ist eine eigene Seite, nicht die Kursansicht.
