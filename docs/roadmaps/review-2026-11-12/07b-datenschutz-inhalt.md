# Aufgabe 07b: Inhalt der Datenschutzerklärung

**Herkunft:** Befund 4 (Teil) aus dem Review vom 12.11.2026 · Phase 3
**Voraussetzung:** Aufgabe 07a
**Priorität:** vor den ersten Personen außerhalb des eigenen Tests

## Problem
Die App erhebt Angaben zur Person: Tagesform, Zeitbudget, Arbeitstag (`session_checkin`), Altersspanne (`users.age_range`), Tageszeit-Profil, Selbsteinschätzung, Berufsprofil und Skills. Profil und Skills gehen für Karrierepfade an Gemini (`lib/server/career/service.ts:66`, Hinweis in `components/career/CareerPaths.tsx:46`).

## Aufgaben
- [x] Jede Angabe einzeln nennen, mit Zweck, Speicherdauer und Empfänger.
- [x] Empfänger KI-Dienst bei Karrierepfaden nennen.
- [x] Datenexport (`lib/server/account/export.ts`) als Abgleich nutzen.
- [ ] Rechtlich prüfen lassen.

## Akzeptanzkriterium
Jede Angabe zur Person steht mit Zweck in der Erklärung und im Datenexport.

## Umsetzung (14.11.2026)
- **Inhalt:** `lib/legal/privacy.ts` führt elf Einträge (Konto, Altersspanne, Firma, Lernverlauf, Wiederholungsplanung, Angaben vor einer Lernsitzung, Lernrhythmus, Berufsprofil, Prüferangaben, Rückmeldungen, technische Protokolle), je mit Angaben, Zweck, Speicherdauer und Empfänger in Deutsch und Englisch. Dazu der Abschnitt „Technisches“ (Cookies, Web-Push-Geräte, Token, Firmen-Login) für Daten, die nicht im Export stehen, und der Hinweis auf die Rechte (Export und Löschung unter „Konto“). Die Seite `/datenschutz` zeigt das.
- **Empfänger KI-Dienst:** Beim Berufsprofil steht, dass für Karrierepfade Berufsbezeichnung, Beschreibung, Schwerpunkte, Bundesland, Zielrolle, Skills, abgeschlossene Kurse und Zertifikatstitel an die Gemini-Schnittstelle von Google gehen, nur auf Auslösen, ohne Name und E-Mail (nach `CareerInput` in `lib/server/career/service.ts`).
- **Abgleich mit dem Export:** `lib/legal/privacy.db.test.ts` erzwingt, dass jeder Teil von `exportAccountData` (`account`, `company.*`, `learning.*`, `activity.*`) von genau einem Eintrag erklärt wird und dass jeder Schlüssel der Erklärung im Export existiert. Wer dem Export etwas hinzufügt, muss die Erklärung ergänzen. Gegenprobe: Entfernt man `learning.careerPaths` aus der Erklärung, schlägt der Test fehl.
- **Aussagen, die ich am Code geprüft habe:** Die Firma sieht nur Status, Datum und Frist, keine Ergebnisse (`lib/server/company/results-privacy.test.ts`). Cookies: nur Anmelde- und Sprach-Cookie (`proxy.ts`, `lib/server/locale.ts`). Prüfernamen stehen bei geprüften Kursen (`lib/reviewers/seal.ts`). Löschung: gelöscht oder anonymisiert (Begründungen in `EXCLUDED_USER_REFERENCES`).
- **Was bewusst offen bleibt (rechtliche Prüfung durch den Betreiber):**
  - **Rechtsgrundlagen** je Verarbeitung (z. B. Vertrag, Einwilligung, berechtigtes Interesse) stehen nicht drin. Das ist eine rechtliche Einordnung, die ich nicht vorwegnehmen will.
  - **Speicherdauer:** Der Code kennt nur „bis zur Löschung des Kontos“. Feste Fristen (z. B. für Protokolle) gibt es im Code nicht. Falls der Betreiber welche will, braucht es zuerst die Umsetzung.
  - **Auftragsverarbeiter:** Hosting, E-Mail-Dienst und Google (Gemini) braucht der Betreiber namentlich und mit Vertrag. Ob weitere KI-Funktionen Angaben zur Person senden, prüft Aufgabe 10.
  - **Beschwerderecht, Angaben zur Aufsichtsbehörde** und ein Datenschutzbeauftragter, falls nötig.
  - Bis der Betreiber `LEGAL_PRIVACY_REVIEWED=true` setzt, trägt die Seite den Hinweis „Entwurf: Die rechtliche Prüfung steht noch aus“.
