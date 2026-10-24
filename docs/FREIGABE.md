# Freigabe je Inhaltsstand

Eine fachliche Freigabe gilt für den **Stand eines allgemeinen Kurses zum Zeitpunkt der Freigabe**, nicht für den Kurs auf Dauer (`roadmap_pruefer.md`, Phase 2).

## Wie es funktioniert

- **Freigeben** (Admin, im Namen der prüfenden Person; später die Prüfer-Rolle): Kursverwaltung → Werkstatt → „Fachliche Freigabe“ oder Anfragen und Freigaben → Katalog. Pflicht sind der Name und die Bestätigung „Ich habe die Inhalte dieser Version fachlich geprüft.“ KI gibt nie frei.
- Dabei wird je Abschnitt, Frage und **aktiver Variante** der Fingerabdruck (`fingerprint()` aus der Werkstatt) festgehalten und daraus der `content_hash` gebildet. Gleicher Inhalt ergibt immer denselben Hash. Die Tabelle `course_approvals` ist **append-only** (Trigger verbietet UPDATE und DELETE; nur das Löschen des Kurses räumt sie auf).
- **Version:** Freigabe zählt die Hauptnummer hoch („1.0“, „2.0“), eine redaktionelle Übernahme die Nebennummer („2.1“).
- **Änderungserkennung:** Weicht der aktuelle Stand vom letzten Bezugsstand ab, zeigt der Kurs „X Änderungen seit Prüfung“ mit Liste der Lektionen und Fragen (geändert, neu, entfernt). Der Kurs bleibt sichtbar. Neue Varianten aus der Generierung zählen als Änderung, deaktivierte nicht.
- **Neu freigeben** setzt einen neuen Bezugsstand. **Als redaktionell übernehmen** (Tippfehler, Formatierung; Notiz Pflicht) beseitigt den Hinweis, ohne Prüfer und Freigabedatum zu ändern; der Eintrag steht im Protokoll und im Audit-Log.
- **Entzug** (Status zurück auf „in Prüfung“ oder „Entwurf“) beendet die Freigabe; das Protokoll bleibt.

## Altbestand

Kurse, die früher nur mit Name und Datum freigegeben wurden (`certifications.approvedByName`/`approvedAt`), bekommen beim ersten Lesen des Status automatisch einen Eintrag der Art `legacy` (Version 1.0, Hash zum Zeitpunkt der Übernahme). Wer alle auf einmal übernehmen will: `npm run approvals:backfill` (idempotent). Die alten Felder werden weiter mitgeführt und später entfernt.

## Grenzen

Interne Lernpfade einer Firma sind nicht betroffen (die Werkstatt fasst sie nicht an, die Freigabe bleibt Name und Datum der Firma). Geltungsbereich „einzelne Domains“, Prüfer-Konten und Siegel am Kurs folgen mit den Paketen 4.6b und 4.7.
