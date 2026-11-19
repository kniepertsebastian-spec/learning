# Aufgabe 20: Logout macht das Token nicht ungültig

**Herkunft:** Befund 10 (Hinweis, Security) aus dem Review vom 12.11.2026 · Altbefund 7 vom 06.11.2026 · Phase 7
**Priorität:** nach Bedarf, Entscheidung vor dem Pilot
**Ort:** `app/actions/auth.ts:26`, `lib/server/auth.ts:15`

## Problem
`sessionVersion` steigt nur bei Passwortwechsel, Reset und SSO-Verknüpfung. Das JWT bleibt beim Abmelden gültig. Ein „Überall abmelden“ gibt es nicht. Wer ein gestohlenes Token hat, bleibt angemeldet, bis es abläuft.

## Entscheidung nötig
Zwei Wege:
1. `sessionVersion` beim Abmelden erhöhen. Dann ist das Token auf diesem Gerät ungültig, aber auch auf allen anderen.
2. „Überall abmelden“ als eigene Funktion, die `sessionVersion` erhöht und dies ausdrücklich nennt.

## Aufgaben
- [x] Entscheidung treffen und in dieser Datei festhalten.
- [x] Umsetzung nach Entscheidung.
- [x] Test: nach dem Abmelden ist das alte Token abgelehnt.

## Akzeptanzkriterium
Ein Token, das vor dem Abmelden gültig war, wird nach dem gewählten Weg abgelehnt.

## Hinweis (eigene Einschätzung)
Weg 1 ist kleiner, bedeutet aber, dass Abmelden auf einem Gerät auch alle anderen abmeldet. Das sollte die Person in der Oberfläche wissen.

## Entscheidung (19.11.2026)
Weg 1: Abmelden gilt auf allen Geräten. Er schließt die Lücke vor dem Pilot mit wenig Code und nutzt die vorhandene `sessionVersion`. Sitzungen pro Gerät (eigene Tabelle, Abmelden nur hier) lassen sich später nachrüsten, falls das Abmelden aller Geräte im Pilot stört.

## Umsetzung (19.11.2026)
- `endAllSessions()` in `lib/server/account/sessions.ts` erhöht `sessionVersion`.
- `logoutAction` (`app/actions/auth.ts`) ruft es für die angemeldete Person auf, bevor `signOut` das Cookie löscht. Ohne Sitzung wird nur abgemeldet.
- Im Benutzermenü steht unter „Abmelden“ der Hinweis „Gilt für alle deine Geräte“ (`components/shell/UserMenu.tsx`, Text in `lib/i18n-strings.ts`).
- Andere Geräte merken das beim nächsten Lesen der Sitzung und landen auf der Anmeldung. Eine noch nicht übertragene Warteschlange dort bleibt auf dem Gerät und wird nach der neuen Anmeldung übertragen, wie schon nach einem Passwortwechsel.
- **Tests:** `app/actions/auth.test.ts` (Reihenfolge: erst Sitzungen beenden, dann Cookie löschen; ohne Sitzung nur abmelden), `lib/server/account/account.test.ts` „Sitzungen“ (Token von vor dem Abmelden wird abgelehnt, nur eine neue Anmeldung gilt; echte Datenbank).
