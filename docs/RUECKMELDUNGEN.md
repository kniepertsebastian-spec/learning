# Rückmeldungen ohne Schuldzuweisung

Leitfaden für alle Texte, die Lernende nach einem Fehler sehen (UI, Auswertungen, Simulationen) und für die Prompts der Inhaltsgenerierung (Erklärungen, Begründungen der Optionen, Alternativerklärungen, Varianten). Grundlage: `roadmap_motivation.md`, Phase 8.

## Grundsatz

Ein Fehler ist ein **fehlender Schritt**, nie eine Eigenschaft der Person.

| Statt | Besser |
|---|---|
| „Falsch.“ / „Leider falsch.“ | „Hier fehlt noch ein Zwischenschritt.“ / „Nicht ganz“ |
| „Du hast das falsch verstanden.“ | „Schauen wir es einmal anders an.“ |
| „3 falsch“ | „3 noch offen“ |
| „Falsche Antworten durchgehen“ | „Offene Stellen durchgehen“ |
| „Du scheiterst immer wieder hieran.“ | „Das hakt gerade, wir gehen es anders an.“ |

## Regeln

1. **Beschreiben, was fehlt oder woher die Auswahl kommt.** „Das passt zu …, gilt aber nicht, wenn …“ statt Wertung. Die Begründung einer falschen Option (`rationale`) benennt die Fehlannahme, nicht die Person.
2. **Keine wertenden Wörter** über Person oder Antwort: „falsch gemacht“, „leider“, „versagt“, „unfähig“, „schlecht“. Zustandsbezeichnungen in Übersichten sind neutral („noch nicht“, „offen“).
3. **Keine Zahl ohne Datenbasis.** Statistiken nur aus echten Plattformdaten: „4 von 10 Lernenden lösen das nicht gleich beim ersten Mal“ erst ab **50 Antworten** auf die Frage und ihre Varianten (`PLATFORM_STAT_MIN_ANSWERS` in `lib/feedback/platform-stat.ts`). Darunter gibt es keinen Satz und keine Zahl. Texte enthalten Zahlen nur als Platzhalter, die zur Laufzeit aus echten Werten gefüllt werden.
4. **Nie eine Prognose über eine Person im Firmenbereich.** Der Arbeitgeber sieht nur Status, Datum und Frist.
5. **Zweisprachig** (de/en), gleiche Haltung in beiden Sprachen.
6. **Ein nächster Schritt statt einer Bewertung:** Lektion nachlesen, andere Erklärung, eine neue Aufgabe, „Heute reicht's“.

## Wo das gilt

- **UI-Texte:** `lib/i18n-strings.ts`. Ein Test (`lib/feedback/guideline.test.ts`) prüft eine feste Liste von Rückmeldungs-Texten auf wertende Wörter und auf Zahlen ohne Platzhalter. Wer einen neuen Rückmeldungs-Text anlegt, nimmt ihn in die Liste auf.
- **Prompts:** Der Baustein `FEEDBACK_TONE_PROMPT` (`lib/server/ai/feedback-tone.ts`) steht in den Prompts für Begründungen der Optionen, Fragen und Erklärungen bei der Kurserzeugung, der KI-Nachbesserung in der Werkstatt, Varianten und Alternativerklärungen.
- **Plattformstatistik:** `platformStatText` (`lib/feedback/platform-stat.ts`) mit den echten Zahlen aus `lib/server/stats/first-try.ts`; angezeigt in der Antwort-Auswertung der Übungssession.

## Bewusst nicht geändert

Begriffe in Betreiber- und Admin-Oberflächen (z. B. „Falsch“ als Meldegrund einer Frage) und technische Fehlermeldungen („Das Passwort ist falsch.“): Sie beschreiben Inhalte oder Eingaben, nicht die Leistung einer lernenden Person.
