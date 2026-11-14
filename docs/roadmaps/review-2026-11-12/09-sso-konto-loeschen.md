# Aufgabe 09: Kontolöschung für SSO-Konten

**Herkunft:** Befund 6 (Niedrig, Datenschutz/Nutzbarkeit) aus dem Review vom 12.11.2026 · Phase 3
**Priorität:** vor dem Pilot mit Firmenkonten
**Ort:** `lib/server/sso/service.ts:114`, `:155` (zufälliges, unbekanntes Passwort), `lib/server/account/delete.ts:45`, `lib/server/account/password.ts:27`

## Problem
Löschen und Passwortwechsel verlangen das aktuelle Passwort. Wer nur über das Firmenkonto angemeldet ist, kennt keines. Die Person kann ihr Konto nicht selbst löschen.

## Auslöser
Eine per SSO angelegte Person will ihr Konto löschen und scheitert an der Passwortabfrage. Der Umweg über „Passwort vergessen“ ist nicht ersichtlich.

## Aufgaben
- [ ] Für Konten mit SSO-Identität die Löschung ohne Passwort ermöglichen.
- [ ] Bestätigung durch Eintippen der eigenen E-Mail-Adresse, bei frischer Sitzung (letzte Anmeldung nicht älter als wenige Minuten).
- [ ] Passwortabfrage ausblenden, wenn kein lokales Passwort gesetzt ist.
- [ ] Hinweis in der Oberfläche auf den Weg „Passwort vergessen“, falls ein lokales Passwort gewünscht ist.
- [ ] Tests: SSO-Konto löschbar, Konto mit Passwort weiter nur mit Passwort.

## Akzeptanzkriterium
Eine per SSO angelegte Person kann ihr Konto in der App löschen, ohne ein Passwort zu kennen. Die Löschung entfernt dieselben Daten wie beim Konto mit Passwort.
