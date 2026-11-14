# Aufgabe 21a: Sammelroadmap an den Stand von Web Push anpassen

**Herkunft:** Befund 9 (Hinweis, Doku) aus dem Review vom 12.11.2026 · Phase 7
**Priorität:** nach Bedarf
**Ort:** `docs/roadmaps/roadmap_sammel.md`, `docs/PWA.md` (Abschnitt „Web Push“)

## Aufgaben
- [x] `roadmap_sammel.md`: Web Push als umgesetzt markieren (`app/sw.ts`, `app/api/push/*`, `docs/PWA.md`).
- [x] Offen lassen: Versuch auf einem echten Gerät.

## Akzeptanzkriterium
`roadmap_sammel.md` stimmt mit dem Code überein.

## Umsetzung (14.11.2026)
- `roadmap_sammel.md`: Die vier Unterpunkte zu Web Push sind abgehakt, jeweils mit den Dateien, an denen ich sie geprüft habe (`app/sw.ts`, `app/api/push/*`, `push_subscriptions`, `lib/server/push/service.ts`, `components/PushSettings.tsx`, `lib/client/use-sign-out.ts`, `lib/server/csp.ts`). Der Hauptpunkt „Web Push“ bleibt offen und nennt als Rest den Versuch auf einem echten Gerät (neuer Unterpunkt).
- **Nicht abgehakt:** „Reaktivierung zusätzlich per Push“ in Phase 10 der Motivation. Web Push selbst gibt es, die Reaktivierung (`lib/server/reactivation`) nutzt es nicht; das steht jetzt dort. `docs/MESSEN.md` sagt dasselbe.
- `docs/PWA.md`, Abschnitt „Web Push“, stimmte schon mit dem Code überein und ist unverändert.
- Auch in `roadmap_review_messung.md` ist der Punkt abgehakt.
