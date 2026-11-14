# Aufgabe 07b: Inhalt der Datenschutzerklärung

**Herkunft:** Befund 4 (Teil) aus dem Review vom 12.11.2026 · Phase 3
**Voraussetzung:** Aufgabe 07a
**Priorität:** vor den ersten Personen außerhalb des eigenen Tests

## Problem
Die App erhebt Angaben zur Person: Tagesform, Zeitbudget, Arbeitstag (`session_checkin`), Altersspanne (`users.age_range`), Tageszeit-Profil, Selbsteinschätzung, Berufsprofil und Skills. Profil und Skills gehen für Karrierepfade an Gemini (`lib/server/career/service.ts:66`, Hinweis in `components/career/CareerPaths.tsx:46`).

## Aufgaben
- [ ] Jede Angabe einzeln nennen, mit Zweck, Speicherdauer und Empfänger.
- [ ] Empfänger KI-Dienst bei Karrierepfaden nennen.
- [ ] Datenexport (`lib/server/account/export.ts`) als Abgleich nutzen.
- [ ] Rechtlich prüfen lassen.

## Akzeptanzkriterium
Jede Angabe zur Person steht mit Zweck in der Erklärung und im Datenexport.
