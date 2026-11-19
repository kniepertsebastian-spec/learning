# Aufgabe 11: Rohe Fehlertexte in zwei Admin-Routen

**Herkunft:** Befund 8 (Niedrig, Informationsleck) aus dem Review vom 12.11.2026 · Phase 3
**Priorität:** nach Bedarf (nur für Admins erreichbar)
**Ort:** `app/api/admin/sources/[id]/parse/route.ts:32-34`, `app/api/admin/sources/[id]/blueprint/route.ts:70-72`

## Problem
`error.message` beliebiger Fehler geht mit Status 502 an den Client. Der Punkt steht schon in `roadmap_sammel.md` als offen.

## Aufgaben
- [x] In beiden Routen eine generische Meldung an den Client geben.
- [x] Die Einzelheiten ins Server-Log schreiben.
- [x] Prüfen, ob die Oberfläche auf die Meldung angewiesen ist, und sie gegebenenfalls anpassen.

## Akzeptanzkriterium
Eine künstlich ausgelöste Fehlermeldung (z. B. mit einer Datenbank-Verbindungsfehlermeldung) erscheint im Client nur generisch. Der Text steht im Server-Log.

## Umsetzung (14.11.2026)
- **Beide Routen** (`parse`, `blueprint`) geben bei unerwarteten Fehlern nur noch eine generische Meldung zurück („… fehlgeschlagen. Einzelheiten stehen im Server-Log.“, Status 502). Der Text des Fehlers steht per `console.error` im Server-Log.
- **Gewollte Meldungen bleiben:** `SourceExtractionError` (neu, `lib/server/admin/source-extraction.ts`) kennzeichnet Texte, die für die Oberfläche bestimmt sind, etwa „Aus der PDF-Datei konnte kein Text extrahiert werden“. Die Blueprint-Route behält ihre 409-Meldungen (`SourceNotParsedError`, `BlueprintLockedError`). Das passt zu dem, was die Oberfläche braucht: `SourcesManager`, `BulkSourceImport` und `BlueprintPanel` zeigen nur `data.error` an und verlassen sich auf keinen bestimmten Wortlaut.
- **Zusätzlich:** Die Extraktion speicherte den rohen Fehlertext auch in `certification_sources.parse_error`, und `SourcesManager` zeigt ihn an. Das war derselbe Weg nach außen. Dort steht jetzt ebenfalls nur die freigegebene Meldung (`publicExtractionMessage`). Wer die Einzelheiten braucht, findet sie im Server-Log. Bereits gespeicherte rohe `parse_error`-Texte bleiben in der Datenbank, bis die Quelle erneut extrahiert wird.
- **Tests:** `app/api/admin/sources/error-texts.test.ts` (künstlicher Datenbank-Verbindungsfehler mit Host, Port und Benutzer erscheint nicht in der Antwort, die gewollte Meldung bleibt, der Blueprint-Fehler steht im Log), `lib/server/admin/source-extraction.db.test.ts` (fehlende Datei: gespeicherter Text ohne Pfad, Fehler im Log).
