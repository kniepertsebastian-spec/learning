# Lernhilfen: „Antwort zuerst überlegen“ und Selbsterklärung

Zwei freiwillige Lernhilfen aus `roadmap_didaktik.md` Phase 3. Beide ändern weder Rating noch Planung.

## Antwort zuerst überlegen
- **Was:** Bei Auswahlfragen bleiben die Optionen verdeckt. Erst „Optionen zeigen“ blendet sie ein; Tastenkürzel für die Optionen greifen vorher nicht.
- **Wo:** Lektionstest und Tages-Session (nur Auswahlfragen). Nicht in Prüfungssimulation und Einstiegstest, dort gelten Prüfungsbedingungen.
- **Einstellung:** „Wie ich lerne“ → „Antwort zuerst überlegen“. Standard aus. Gilt nur für das Gerät (localStorage, wie „Sofort-Feedback“); sie wird nicht auf dem Server gespeichert.
- **Auswertung:** An jeder so entstandenen Antwort steht `review_log.think_first` (Migration 0093). Der Metrik-Export (`npm run psrp:metrics`) enthält `thinkFirst` mit den Armen `enabled`/`disabled` (Nutzer, Reviews, Behaltensquote). Das Feld erscheint auch im Datenexport der Person.

## Selbsterklärung
- **Wann:** Nach einer **falsch** beantworteten Frage vom Typ `scenario` oder `troubleshooting` (Lektionstest, Tages-Session, auch bei den neuen Antwortformaten) und nach einer gelösten **Simulation**. Immer nur als Angebot: „In einem Satz erklären (freiwillig)“.
- **Ablauf:** „Erkläre in einem Satz, warum …“ → eigenen Text eingeben → „Mit Musterantwort vergleichen“. Musterantwort ist die Erklärung der Frage bzw. der Abschlusstext der Simulation.
- **Nicht bewertet:** Kein Einfluss auf Rating, Planung oder Ergebnis.
- **Datenschutz:** Der Text bleibt auf diesem Gerät (localStorage `proofpath-self-explanations`, höchstens 100 Einträge, je 500 Zeichen). Er wird nie an den Server gesendet, nicht exportiert und ist im Firmenbereich nicht sichtbar.
- **Simulationen:** Alle drei Arten (Entscheidung, Terminal, Konfiguration) bieten sie nach dem Lösen an; die Musterantwort ist der Abschlusstext der Simulation.
