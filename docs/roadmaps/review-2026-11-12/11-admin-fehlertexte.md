# Aufgabe 11: Rohe Fehlertexte in zwei Admin-Routen

**Herkunft:** Befund 8 (Niedrig, Informationsleck) aus dem Review vom 12.11.2026 · Phase 3
**Priorität:** nach Bedarf (nur für Admins erreichbar)
**Ort:** `app/api/admin/sources/[id]/parse/route.ts:32-34`, `app/api/admin/sources/[id]/blueprint/route.ts:70-72`

## Problem
`error.message` beliebiger Fehler geht mit Status 502 an den Client. Der Punkt steht schon in `roadmap_sammel.md` als offen.

## Aufgaben
- [ ] In beiden Routen eine generische Meldung an den Client geben.
- [ ] Die Einzelheiten ins Server-Log schreiben.
- [ ] Prüfen, ob die Oberfläche auf die Meldung angewiesen ist, und sie gegebenenfalls anpassen.

## Akzeptanzkriterium
Eine künstlich ausgelöste Fehlermeldung (z. B. mit einer Datenbank-Verbindungsfehlermeldung) erscheint im Client nur generisch. Der Text steht im Server-Log.
