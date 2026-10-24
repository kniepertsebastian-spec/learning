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

## Werkstatt und KI
- **Anlegen und Bearbeiten:** In der Kurs-Werkstatt (Fragen eines Lernziels) wählt man beim Anlegen das Antwortformat. Schritte, Paare und akzeptierte Antworten werden direkt bearbeitet, eine Vorschau zeigt die Aufgabe wie für Lernende. Das Format einer vorhandenen Frage lässt sich nicht ändern. Versionen, Konflikterkennung und Zurücksetzen funktionieren wie bei Auswahlfragen; Auswahlfragen behalten ihren bisherigen Fingerabdruck.
- **KI-Vorschlag:** Aktion „Formatfragen ergänzen“ (bis zu 10 je Lauf): Die KI schlägt Fragen vor, unbrauchbare Lösungsdaten werden verworfen, die Redaktion wählt aus und legt an. „Frage verbessern“ per KI gibt es für Formatfragen nicht.
- **Übersetzung:** Fragetext, Erklärung und die Texte der Schritte/Begriffe/Aussagen werden mit übersetzt; akzeptierte Kurzantworten bleiben unverändert.
- **Freigabe:** Format und Lösungsdaten gehen in den Fingerabdruck ein; Änderungen zeigen „Änderung seit Prüfung“. Die Prüfer-Ansicht zeigt die Lösung.
- **Nicht abgedeckt:** Die vollautomatische Kursgenerierung (Worker) erzeugt weiterhin nur Auswahlfragen.

## Session-Mix
Höchstens 20 % der Fragen einer Session haben ein neues Format (abgerundet, bei unter 5 Fragen also keine), bevorzugt zu Lernzielen, bei denen die Person zuletzt „sicher“ (Rating 4) war. Gibt es nicht genug Auswahlfragen, rücken Formatfragen nach, damit ein Kurs nur mit Formatfragen nicht leer bleibt (`pickWithFormatCap` in `lib/server/study/session-builder.ts`).

Folgepaket: „Antwort zuerst überlegen“ und Selbsterklärung (4.5c).
