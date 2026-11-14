# Aufgabe 07: Datenschutzerklärung und Impressum

**Herkunft:** Befund 4 (Mittel, Datenschutz) aus dem Review vom 12.11.2026 · Phase 3
**Priorität:** vor den ersten Personen außerhalb des eigenen Tests
**Ort:** `app/agb/page.tsx:12` („Der vollständige Vertragstext … ist hier zu ergänzen“). Es gibt keine Route für Datenschutz oder Impressum und keinen Link darauf in Layout, Login oder Registrierung.

## Problem
Die App erhebt neben Konto- und Lerndaten auch Angaben zur Person:
- Tagesform, Zeitbudget, Arbeitstag (`session_checkin`),
- Altersspanne (`users.age_range`),
- Tageszeit-Profil, Selbsteinschätzung,
- Berufsprofil und Skills.

Profil und Skills gehen für die Karrierepfade an Gemini (`lib/server/career/service.ts:66`). Der Hinweis dazu steht in `components/career/CareerPaths.tsx:46`. Eine Stelle, die Zwecke, Rechtsgrundlagen, Empfänger und Speicherdauer nennt, fehlt.

## Auslöser
Sobald Personen außerhalb des eigenen Tests die App nutzen, fehlen die Pflichtangaben nach DSGVO Art. 13 und das Impressum.

## Aufgaben
- [ ] Seiten `/datenschutz` und `/impressum` anlegen.
- [ ] Links im Fuß, auf Login und Registrierung.
- [ ] Texte vom Betreiber verfassen und rechtlich prüfen lassen.
- [ ] Die Erhebungen aus der Liste oben einzeln nennen, mit Zweck, Speicherdauer und Empfänger (KI-Dienst bei Karrierepfaden).
- [ ] Der Datenexport (`lib/server/account/export.ts`) beschreibt die Tabellen bereits und dient als Grundlage.

## Akzeptanzkriterium
Jede Angabe zur Person, die die App erhebt, steht mit Zweck in der Datenschutzerklärung und im Datenexport. Die Seiten sind ohne Anmeldung erreichbar.

## Hinweis
Die Inhalte sind rechtliche Texte. Dieser Plan legt nur fest, was enthalten sein muss, nicht den Wortlaut.
