# Aufgabe 01: `node_modules` aus dem Repository nehmen

**Herkunft:** Befund 3 (Mittel, Betrieb/Abhängigkeiten) aus dem Review vom 12.11.2026 · Phase 0 der Sammelroadmap
**Priorität:** sofort (Quick Win, keine Abhängigkeiten)
**Ort:** Commit `4cd3a279`, `.gitignore:4` (`/node_modules`), `.gitignore:42` (`*.tsbuildinfo`), `tsconfig.tsbuildinfo`

## Problem
Auf `main` liegen 42.320 Dateien unter `node_modules` im Index, dazu `tsconfig.tsbuildinfo`. Der eingecheckte Stand passt nicht zum Lockfile: `npm ls` meldet fünf direkte Pakete als `invalid`, darunter `@google/genai` 2.32.0 statt `^3.0.0`, `postgres` 4.0.0 statt `^4.1.0` und `vitest` 5.0.5 statt `^5.1.0`. Das Repository ist rund 340 MB groß, Diffs werden unlesbar.

CI und Docker-Image sind nicht betroffen, weil beide `npm ci` ausführen und `.dockerignore` den Ordner ausschließt. Betroffen ist, wer lokal ohne `npm ci` arbeitet.

## Aufgaben
- [x] `git rm -r --cached node_modules tsconfig.tsbuildinfo` ausführen. `.gitignore` bleibt unverändert.
- [x] CI-Schritt ergänzen, der fehlschlägt, wenn `git ls-files node_modules` etwas ausgibt.
- [ ] Image mit der aktuellen `.dockerignore` (Stand `be684769`) neu bauen, alte Images und den Build-Cache entfernen.
- [ ] Wurden alte Images weitergegeben, die `.env` enthalten: Secrets wechseln. (Abschluss von Altbefund 2 vom 06.11.2026.)

## Akzeptanzkriterium
- `git ls-files node_modules` ist leer.
- Im gebauten Image findet `docker run --rm <image> find / -name .env -not -path "*/node_modules/*"` nichts.

## Hinweis (eigene Einschätzung)
Nach dem Entfernen lokal `npm ci` ausführen und Lint und Tests laufen lassen, damit sichtbar ist, ob lokal und CI nun dieselben Versionen nutzen.
