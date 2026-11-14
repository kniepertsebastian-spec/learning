# Aufgaben aus dem PWA-Review vom 12.11.2026 und der Messung menschlicher Faktoren

Jede Datei in diesem Ordner ist eine Aufgabe oder ein Thema aus `../roadmap_review_messung.md`. Der Ordner ersetzt die Sammelliste nicht. Er teilt sie auf, damit jede Aufgabe einzeln geplant, umgesetzt und abgehakt werden kann.

Grundlage ist `../../PWA-REVIEW-2026-11-12.md`, ergänzt um eine Nachprüfung der Prüfungsabgabe (Aufgabe 05).

## Regeln für alle Messwerte (aus der Sammelroadmap, gelten für 12 bis 19)
1. Nur messen, was eine Entscheidung ändert. Jeder Messwert nennt vorab, was die App damit tut.
2. Erst Verhalten, dann Fragen. Selbstauskünfte sind freiwillig und einzeln abschaltbar.
3. Die Person sieht ihre Werte unter „Wie ich lerne“ und bekommt sie im Datenexport.
4. Firmen sehen keine Einzelwerte, nur aggregiert ab Mindestgröße.
5. Rohwerte bleiben roh. Ausreißer werden in der Auswertung behandelt.
6. Keine Gesundheitsdaten als eigene Angaben.
7. Jede Mechanik hinter einem Feature-Flag, mit Ausgangswert vor dem Einschalten (`docs/MESSEN.md`).

## Aufgaben

| Nr. | Datei | Thema | Befund/Phase | Priorität |
|---|---|---|---|---|
| 01 | [01-node-modules-aus-dem-index.md](01-node-modules-aus-dem-index.md) | `node_modules` aus dem Index | Befund 3, Phase 0 | sofort |
| 02a | [02a-sync-claims-erkennen.md](02a-sync-claims-erkennen.md) | Verwaiste Sync-Claims erkennen und neu verarbeiten | Befund 1, Phase 1 | vor dem Pilot |
| 02b | [02b-sync-claims-bereinigungsskript.md](02b-sync-claims-bereinigungsskript.md) | Einmaliges Bereinigungsskript | Befund 1, Phase 1 | vor dem Pilot |
| 03a | [03a-session-abschluss-transaktion.md](03a-session-abschluss-transaktion.md) | `completeStudySession` in einer Transaktion | Befund 5, Phase 1 | vor dem Pilot |
| 03b | [03b-lektionstest-simulation-atomar.md](03b-lektionstest-simulation-atomar.md) | Lektionstest und Simulation prüfen | Befund 5, Phase 1 | vor dem Pilot |
| 04a | [04a-zod-schema-und-groesse.md](04a-zod-schema-und-groesse.md) | Zod-Schema und Größenbegrenzung für Abgaben | Befund 7, Phase 1 | vor dem Pilot |
| 04b | [04b-confidence-check.md](04b-confidence-check.md) | Check-Constraint für `confidence` | Befund 7, Phase 1 | vor dem Pilot |
| 05a | [05a-pruefung-serverseitige-pruefung.md](05a-pruefung-serverseitige-pruefung.md) | Prüfungsabgabe serverseitig prüfen (neuer Befund, Mittel) | Nachprüfung 14.11., Phase 1 | vor dem Pilot, vor Messungen |
| 05b | [05b-pruefung-bestehende-versuche.md](05b-pruefung-bestehende-versuche.md) | Bestehende Prüfungsversuche prüfen | Folge zu 05a | vor dem Pilot |
| 06a | [06a-antwortzeit-client.md](06a-antwortzeit-client.md) | Antwortzeit im Client messen | Befund 2, Phase 2 | vor dem Pilot |
| 06b | [06b-antwortzeit-server-verbraucher.md](06b-antwortzeit-server-verbraucher.md) | Antwortzeit auf dem Server und in den Verbrauchern | Befund 2, Phase 2 | vor dem Pilot |
| 06c | [06c-antwortzeit-offline.md](06c-antwortzeit-offline.md) | Antwortzeit in den Offline-Paketen | Befund 2, Phase 2 | vor dem Pilot |
| 07a | [07a-datenschutz-seiten.md](07a-datenschutz-seiten.md) | Seiten Datenschutz und Impressum | Befund 4, Phase 3 | vor Fremdnutzern |
| 07b | [07b-datenschutz-inhalt.md](07b-datenschutz-inhalt.md) | Inhalt der Datenschutzerklärung | Befund 4, Phase 3 | vor Fremdnutzern |
| 08 | [08-agb-vervollstaendigen.md](08-agb-vervollstaendigen.md) | AGB-Seite vervollständigen | Befund 4, Phase 3 | vor Fremdnutzern |
| 09 | [09-sso-konto-loeschen.md](09-sso-konto-loeschen.md) | Kontolöschung für SSO-Konten | Befund 6, Phase 3 | vor Firmenkonten |
| 10 | [10-ki-zugang-eu-ohne-training.md](10-ki-zugang-eu-ohne-training.md) | KI-Zugang ohne Training, EU | Phase 3 | vor Firmenkonten |
| 11 | [11-admin-fehlertexte.md](11-admin-fehlertexte.md) | Rohe Fehlertexte in Admin-Routen | Befund 8, Phase 3 | nach Bedarf |
| 12 | [12-messung-ermuedung-unterbrechungen.md](12-messung-ermuedung-unterbrechungen.md) | Ermüdung und Unterbrechungen | Phase 4 (4.1, 4.3) | ab Echtdaten |
| 13 | [13-messung-raten-unsicherheit.md](13-messung-raten-unsicherheit.md) | Raten und Unsicherheit | Phase 4 (4.2, 4.6) | ab Echtdaten |
| 14 | [14-messung-aufschieben-regelmaessigkeit.md](14-messung-aufschieben-regelmaessigkeit.md) | Aufschieben, Regelmäßigkeit, Schlaf | Phase 4 (4.4, 4.5, 4.11) | ab Echtdaten |
| 15 | [15-messung-hilfe-fehlerart.md](15-messung-hilfe-fehlerart.md) | Hilfe-Verhalten und Fehlerart | Phase 4 (4.7, 4.8) | ab Echtdaten |
| 16 | [16-messung-lesetiefe-durchhalten-geraet.md](16-messung-lesetiefe-durchhalten-geraet.md) | Lesetiefe, Durchhalten, Gerät | Phase 4 (4.9, 4.10, 4.12) | ab Echtdaten |
| 17 | [17-selbstauskunft-grundlage.md](17-selbstauskunft-grundlage.md) | Grundlage für Selbstauskünfte | Phase 5 | nach Phase 4 |
| 18 | [18-selbstauskunft-fragen.md](18-selbstauskunft-fragen.md) | Die Selbstauskunft-Fragen 5.1 bis 5.6 | Phase 5 | nach Aufgabe 17 |
| 19 | [19-auswertung-und-planung.md](19-auswertung-und-planung.md) | Auswertung und Rückführung in die Planung | Phase 6 | begleitend |
| 20 | [20-logout-sitzungen.md](20-logout-sitzungen.md) | Logout macht das Token nicht ungültig | Befund 10, Phase 7 | Entscheidung vor dem Pilot |
| 21a | [21a-web-push-doku.md](21a-web-push-doku.md) | Sammelroadmap an den Stand von Web Push anpassen | Befund 9, Phase 7 | nach Bedarf |
| 21b | [21b-lint-warnungen.md](21b-lint-warnungen.md) | Lint-Warnungen entfernen | Phase 7 | nach Bedarf |

## Reihenfolge
1. Aufgabe 01 sofort.
2. Aufgaben 02a bis 06c vor dem Pilot. Ohne 06 fehlen der Planung und der Frühwarnung ihre Eingangsdaten. 05a vor allen Messungen.
3. Aufgaben 07a bis 10 vor den ersten Personen außerhalb des eigenen Tests.
4. Aufgaben 12 bis 16 ab den ersten Echtdaten, zuerst die reinen Auswertungen.
5. Aufgaben 17 und 18 erst, wenn Phase 4 zeigt, welche Fragen das Verhalten nicht beantwortet.
6. Aufgabe 19 begleitend, die übrigen nach Bedarf.
