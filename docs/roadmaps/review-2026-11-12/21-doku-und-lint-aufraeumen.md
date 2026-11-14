# Aufgabe 21: Dokumentation und Lint-Warnungen aufräumen

**Herkunft:** Befund 9 (Hinweis, Doku) aus dem Review vom 12.11.2026 · Phase 7
**Priorität:** nach Bedarf
**Ort:** `docs/roadmaps/roadmap_sammel.md`, `docs/PWA.md` (Abschnitt „Web Push“)

## Aufgaben
- [ ] `roadmap_sammel.md` aktualisieren: Web Push ist umgesetzt (`app/sw.ts`, `app/api/push/*`, `docs/PWA.md`). Offen ist nur der Versuch auf einem echten Gerät.
- [ ] Die 22 Lint-Warnungen entfernen (ungenutzte Importe und Variablen). Stand: `npm run lint`, 0 Fehler.
- [ ] Prüfung auf echten Geräten (iOS Safari, Android Chromium) und externer Penetrationstest bleiben wie in `roadmap_sammel.md` offen. Sie gehören nicht zu dieser Aufgabe.

## Akzeptanzkriterium
`roadmap_sammel.md` stimmt mit dem Code überein. `npm run lint` meldet keine Warnungen mehr.
