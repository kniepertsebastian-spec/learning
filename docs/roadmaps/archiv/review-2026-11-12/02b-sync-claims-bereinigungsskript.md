# Aufgabe 02b: Einmaliges Bereinigungsskript für verwaiste Claims

**Herkunft:** Befund 1 (Teil) aus dem Review vom 12.11.2026 · Phase 1
**Voraussetzung:** Aufgabe 02a
**Priorität:** vor dem Pilot, sobald 02a gilt
**Ort:** `sync:reprocess-conflicts` als Vorlage

## Problem
Schon vorhandene verwaiste Zeilen bleiben nach dem Umbau von 02a nicht von selbst liegen, sie müssen einmal freigegeben werden.

## Aufgaben
- [x] Skript nach dem Muster von `sync:reprocess-conflicts` schreiben.
- [x] Trockenlauf als Standard: zeigt Anzahl und Konten, ändert nichts.
- [x] Ausführung nur mit ausdrücklichem Flag.

## Akzeptanzkriterium
Der Trockenlauf zeigt die Zeilen, ohne etwas zu ändern. Nach der Ausführung ist kein Claim älter als die Schwelle aus 02a übrig.

## Umsetzung (14.11.2026)
- `releaseStaleClaims()` in `lib/server/sync/reprocess.ts`, Skript `scripts/sync-release-stale-claims.ts`, `npm run sync:release-stale-claims`.
- Bedingung wie bei der Übernahme in 02a: Status `error`, Text „wird verarbeitet“ (`PROCESSING_MESSAGE`, jetzt exportiert), älter als `STALE_CLAIM_MS`. Die Schwelle wird nicht dupliziert.
- **Trockenlauf ist der Standard** (zeigt Anzahl und Konten). Geändert wird nur mit `--execute`. Das weicht bewusst von `sync:reprocess-conflicts` ab, das den Trockenlauf mit `--dry-run` einschaltet.
- Eine noch laufende Verbuchung hält ihre Zeile gesperrt; das DELETE wartet und prüft danach erneut. Es löscht also nichts Abgeschlossenes. Verbucht wurde bei einer verwaisten Zeile nie etwas (Transaktion aus 02a), die Freigabe kann deshalb nichts doppelt verbuchen.
- Test: `lib/server/sync/release-stale-claims.db.test.ts` (Trockenlauf ändert nichts, Ausführung lässt junge und abgeschlossene Zeilen stehen, laufende Verbuchung bleibt). Dokumentiert in `docs/PWA.md`.
- **Betreiber:** nach dem Deploy einmal `npm run sync:release-stale-claims` ansehen, dann mit `-- --execute` ausführen.
