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
- [ ] Entscheidung treffen und in dieser Datei festhalten.
- [ ] Umsetzung nach Entscheidung.
- [ ] Test: nach dem Abmelden ist das alte Token abgelehnt.

## Akzeptanzkriterium
Ein Token, das vor dem Abmelden gültig war, wird nach dem gewählten Weg abgelehnt.

## Hinweis (eigene Einschätzung)
Weg 1 ist kleiner, bedeutet aber, dass Abmelden auf einem Gerät auch alle anderen abmeldet. Das sollte die Person in der Oberfläche wissen.
