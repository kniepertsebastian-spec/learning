# Neue Antwortformate

Neben Auswahlfragen (`choice`) gibt es drei regelbasiert auswertbare Formate. Das Rating bleibt binär (richtig/falsch); der Anteil richtiger Teile wird nur angezeigt.

| Format | Aufgabe | Richtig, wenn | Lösungsdaten (`questions.answer_data`) |
| --- | --- | --- | --- |
| `ordering` | Schritte per Hoch/Runter-Knöpfen in die richtige Reihenfolge bringen | Reihenfolge stimmt exakt | `{ steps: [{ id, text }] }` in richtiger Reihenfolge |
| `short_answer` | Kurze Eingabe (Befehl, Port, Begriff) | nach Normalisierung gleich einer akzeptierten Antwort | `{ accepted: [...], caseSensitive? }` |
| `matching` | Jedem Begriff die passende Aussage zuordnen | alle Paare stimmen | `{ pairs: [{ id, left, right }] }` |

Normalisierung der Kurzantwort: Unicode vereinheitlicht, Ränder und umgebende Anführungszeichen/Backticks entfernt, Leerraum zusammengezogen, Groß/Klein ignoriert (außer `caseSensitive`). Synonyme sind weitere Einträge in `accepted`.

## Wo sie vorkommen
- **Tages-Session:** Der Server liefert nur die Aufgabe (Schritte gemischt, bei Zuordnung die rechte Seite gemischt), nie die Lösung. Beim Prüfen holt der Client die Auswertung über `/api/study-sessions/<id>/reveal`; die Wertung fürs Rating passiert beim Einreichen. Formatfragen werden immer sofort aufgedeckt, auch im Modus „Feedback am Ende“.
- **Lektionstest:** wird wie bisher im Browser ausgewertet, die Lösung steht in `answerData`; der Server wertet beim Speichern erneut.
- **Offline-Leser:** Das Kurspaket enthält `format` und `answerData`; die Auswertung läuft lokal, das Ergebnis geht per Sync-Warteschlange (`answer` neben `selectedOptionId`).
- **Nicht** in Prüfungssimulation, Einstiegstest, Variantengenerierung, Vorabfragen und Einweben: dort gibt es nur Auswahlfragen.

## Speicherung
`quiz_answers.answer` und `study_session_items.answer` (jsonb) halten die Antwort; `selected_option_id` bleibt leer. Unbekannte Eingaben (API, Sync-Warteschlange) werden mit `sanitizeAnswer` bereinigt und zählen sonst als falsch.

## Prüfung der Lösungsdaten
`validateAnswerData` (`lib/questions/answer-formats.ts`) prüft Grenzen (max. 8 Schritte/Paare, 10 akzeptierte Antworten, 200 Zeichen) und beide Sprachen; die Kursprüfung meldet Verstöße als `invalid_answer_data`.

Folgepakete: Generierung und Werkstatt (4.5b), Session-Mix und „Antwort zuerst überlegen“ (4.5c).
