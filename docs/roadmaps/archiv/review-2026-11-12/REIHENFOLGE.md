# Reihenfolge der Aufgaben

Die Blöcke sind nacheinander gedacht. Innerhalb eines Blocks gilt die angegebene Reihenfolge, Ausnahmen stehen bei der Aufgabe.

**Schwierigkeit:** hoch = Datenintegrität, Sicherheit oder eine Entscheidung mit Folgen. mittel = klar umrissene Änderung mit Tests. niedrig = Text, Doku oder mechanische Änderung.

## Block 1: sofort
| Aufgabe | Schwierigkeit | Hinweis |
|---|---|---|
| 01 `node_modules` aus dem Index | niedrig | Keine Abhängigkeiten. Erster Schritt, damit Diffs lesbar werden. |

## Block 2: Datenintegrität und Sicherheit (vor dem Pilot)
| Aufgabe | Schwierigkeit | Hinweis |
|---|---|---|
| 05a Prüfungsabgabe serverseitig prüfen | hoch | Zuerst, weil sie ein bestandenes Ergebnis fälschbar macht. |
| 05b Bestehende Prüfungsversuche prüfen | hoch | Nach 05a. Die Entscheidung trifft der Betreiber. |
| 02a Verwaiste Claims erkennen | hoch | Idempotenz vorher prüfen. |
| 02b Bereinigungsskript | mittel | Nach 02a. |
| 03a Session-Abschluss in einer Transaktion | hoch | Zusammen mit der Idempotenzprüfung. |
| 03b Lektionstest und Simulation | mittel | Nach 03a. |
| 04b Check-Constraint `confidence` | mittel | Unabhängig, kann parallel laufen. |
| 04a Zod-Schema und Größenlimit | mittel | Unabhängig, kann parallel laufen. |

## Block 3: Antwortzeit (vor dem Pilot)
Die Messungen in Block 6 brauchen diese Daten.
| Aufgabe | Schwierigkeit | Hinweis |
|---|---|---|
| 06a Antwortzeit im Client | mittel | Zeit im Hintergrund darf nicht zählen. |
| 06b Server und Verbraucher | hoch | Nach 06a. Drei Verbraucher prüfen. |
| 06c Offline-Pakete | mittel | Nach 06b. |

## Block 4: Recht (vor den ersten Personen außerhalb des Tests)
| Aufgabe | Schwierigkeit | Hinweis |
|---|---|---|
| 07a Seiten Datenschutz und Impressum | niedrig | Ohne Inhalt nicht veröffentlichen. |
| 07b Inhalt der Datenschutzerklärung | niedrig | Nach 07a. Rechtliche Prüfung nötig. |
| 10 KI-Zugang ohne Training | niedrig | Vertragliche Prüfung, Ergebnis in 07b. |
| 08 AGB vervollständigen | niedrig | Rechtliche Prüfung nötig. |
| 09 Kontolöschung für SSO-Konten | mittel | Vor Firmenkonten. Tests für beide Kontoarten. |

## Block 5: Entscheidungen und Aufräumen
| Aufgabe | Schwierigkeit | Hinweis |
|---|---|---|
| 20 Logout und Token | hoch | Entscheidung zuerst, dann Umsetzung. |
| 11 Admin-Fehlertexte | niedrig | Unabhängig. |
| 21a Web-Push-Doku | niedrig | Unabhängig. |
| 21b Lint-Warnungen | niedrig | Unabhängig. |

## Block 6: Messung (ab den ersten Echtdaten)
Die Aufgaben 12 bis 16 sind unabhängig voneinander und können parallel laufen. Jede braucht zuerst eine Hypothese in `docs/MESSEN.md`.
| Aufgabe | Schwierigkeit | Hinweis |
|---|---|---|
| 12 Ermüdung und Unterbrechungen | hoch | Braucht 06. Schwellen sind Vorschläge. |
| 13 Raten und Unsicherheit | hoch | Gewichtung erst nach stabiler Basiszeit. |
| 14 Aufschieben, Regelmäßigkeit, Schlaf | mittel | Nur Auswertung. |
| 15 Hilfe-Verhalten und Fehlerart | hoch | Heuristik zuerst in `docs/MESSEN.md`. |
| 16 Lesetiefe, Durchhalten, Gerät | mittel | Gerätetyp nur grob speichern. |
| 19 Auswertung und Planung | hoch | Begleitend, ab 20 Personen im Nenner. |

## Block 7: Selbstauskunft (erst, wenn Block 6 zeigt, was fehlt)
| Aufgabe | Schwierigkeit | Hinweis |
|---|---|---|
| 17 Grundlage für Selbstauskünfte | hoch | Neue Tabelle, Schalter, Fragemüdigkeit. |
| 18 Die Fragen 5.1 bis 5.6 | mittel | 5.1 und 5.2 zuerst, hinter Flag. |
