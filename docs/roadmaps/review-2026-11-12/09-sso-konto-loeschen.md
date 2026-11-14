# Aufgabe 09: Kontolöschung für SSO-Konten

**Herkunft:** Befund 6 (Niedrig, Datenschutz/Nutzbarkeit) aus dem Review vom 12.11.2026 · Phase 3
**Priorität:** vor dem Pilot mit Firmenkonten
**Ort:** `lib/server/sso/service.ts:114`, `:155` (zufälliges, unbekanntes Passwort), `lib/server/account/delete.ts:45`, `lib/server/account/password.ts:27`

## Problem
Löschen und Passwortwechsel verlangen das aktuelle Passwort. Wer nur über das Firmenkonto angemeldet ist, kennt keines. Die Person kann ihr Konto nicht selbst löschen.

## Auslöser
Eine per SSO angelegte Person will ihr Konto löschen und scheitert an der Passwortabfrage. Der Umweg über „Passwort vergessen“ ist nicht ersichtlich.

## Aufgaben
- [x] Für Konten mit SSO-Identität die Löschung ohne Passwort ermöglichen.
- [x] Bestätigung durch Eintippen der eigenen E-Mail-Adresse, bei frischer Sitzung (letzte Anmeldung nicht älter als wenige Minuten).
- [x] Passwortabfrage ausblenden, wenn kein lokales Passwort gesetzt ist.
- [x] Hinweis in der Oberfläche auf den Weg „Passwort vergessen“, falls ein lokales Passwort gewünscht ist.
- [x] Tests: SSO-Konto löschbar, Konto mit Passwort weiter nur mit Passwort.

## Akzeptanzkriterium
Eine per SSO angelegte Person kann ihr Konto in der App löschen, ohne ein Passwort zu kennen. Die Löschung entfernt dieselben Daten wie beim Konto mit Passwort.

## Umsetzung (14.11.2026)
- **Kennzeichen:** neue Spalte `users.password_set` (Migration `0119_sso_password_set`, Standard `true`). `provisionUser` setzt sie für neue SSO-Konten und für unbestätigte Konten, deren Passwort beim Verknüpfen ersetzt wird, auf `false`. „Passwort vergessen“ (`resetPasswordWithToken`) und `scripts/reset-user-password.ts` setzen sie wieder auf `true`.
- **Bestandskonten:** die Migration setzt `false`, wenn die SSO-Identität innerhalb von 5 Sekunden nach dem Konto oder nach der E-Mail-Bestätigung entstand (beides passiert in derselben Transaktion). Wer danach schon ein Passwort über „Passwort vergessen“ gesetzt hat, sieht das Passwortformular erst nach dem nächsten Reset wieder. Das Löschen per E-Mail-Adresse funktioniert trotzdem.
- **Frische Anmeldung:** der jwt-Callback schreibt beim Anmelden den Zeitpunkt `at` ins Token, die Sitzung reicht ihn als `authenticatedAt` weiter (`lib/server/session-auth-time.ts`). Frisch heißt höchstens 10 Minuten alt (`FRESH_LOGIN_MS`). Tokens aus der Zeit davor haben keinen Zeitpunkt und gelten als nicht frisch.
- **Löschen:** `deleteAccount(userId, confirmation)` nimmt `{ password }` oder `{ email, authenticatedAt }`. Der E-Mail-Weg ist nur für Konten mit SSO-Identität offen (sonst `password_required`). Er verlangt die eigene Adresse (normalisiert) und eine frische Anmeldung (sonst `wrong_email` bzw. `stale_session`). Was gelöscht wird, ist unverändert.
- **Oberfläche:** `deletionConfirmationMode` wählt „email“ nur bei `password_set = false` und vorhandener SSO-Identität. Dann zeigt die Kontoseite statt des Passwortformulars einen Hinweis mit Link auf „Passwort vergessen“, und das Löschformular fragt die E-Mail-Adresse ab.
- **Tests:** `lib/server/account/account.test.ts` (SSO-Konto löschbar mit denselben Daten, Ablehnungen, Passwort-Konto nur mit Passwort, API mit Sitzungszeitpunkt), Kennzeichen in `sso.test.ts` und `recovery.test.ts`.
