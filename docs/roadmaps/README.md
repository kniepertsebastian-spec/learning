# Pläne und Roadmaps

Alle Planungsdokumente liegen hier. Sie standen vorher teils im Wurzelverzeichnis und teils in `docs/`.

Die Dateinamen sind absichtlich gleich geblieben: Rund 250 Kommentare im Code zitieren sie nur mit dem Namen (zum Beispiel „R6 (roadmap.md)“). Eine Ausnahme gab es, weil es zwei Dateien `roadmap.md` gab: Die Produkt-Roadmap aus `docs/` (die der Code meint) behält den Namen `roadmap.md`, die frühere Datei im Wurzelverzeichnis heißt jetzt `pwa-hardening-review.md`.

Der Stand je Datei ist aus den Abhak-Listen (`- [x]` / `- [ ]`) im Dokument gezählt, nicht bewertet. Dateien ohne Abhak-Liste haben ihren Stand im Text.

| Datei | Inhalt | Stand (erledigt/gesamt) |
|---|---|---|
| [ROADMAP-TECHNISCH.md](ROADMAP-TECHNISCH.md) | Technik: Infrastruktur, Sicherheit, Datenmodell, Backend, Frontend, Qualität, Betrieb, mit Prüfnachweis je Punkt. | 70/119, 49 offen |
| [ROADMAP-UI.md](ROADMAP-UI.md) | Oberfläche und Bedienung samt nötiger Daten- und API-Erweiterungen. | 114/126, 12 offen |
| [roadmap_pwa.md](roadmap_pwa.md) | PWA-Härtung (Installierbarkeit, Offline, Update, Sicherheit). | alles erledigt (36/36) |
| [roadmap_didaktik.md](roadmap_didaktik.md) | Didaktik für Endnutzer. | 71/77, 6 offen |
| [roadmap_pruefer.md](roadmap_pruefer.md) | Fachliche Prüfer und Freigabe von Kursen. | 36/38, 2 offen |
| [roadmap_motivation.md](roadmap_motivation.md) | Motivation und Schutz vor Lernabbruch. | 45/46, 1 offen |
| [roadmap_datenintegritaet.md](roadmap_datenintegritaet.md) | Datenintegrität über Zeit: offline erbrachte Lernleistung, richtiger Zeitpunkt, nur bei Berechtigten. | 25/28, 3 offen |
| [roadmap_bugs_features.md](roadmap_bugs_features.md) | Darstellungsfehler, didaktische Umstrukturierung und Prüfer-Governance. | alles erledigt (13/13) |
| [roadmap_psrp_hr.md](roadmap_psrp_hr.md) | PSRP-HR: Wiederholungsplanung auf Basis von FSRS mit Burnout-Schutz. | alles erledigt (52/52) |
| [umsetzungsplan.md](umsetzungsplan.md) | Reihenfolge, in der die fünf Roadmaps PWA, Didaktik, Prüfer, Motivation und Datenintegrität umgesetzt werden. | 51/54, 3 offen |
| [roadmap3.md](roadmap3.md) | Learning by Doing und Kurs-Werkstatt. | ohne Abhak-Liste |
| [roadmap2.md](roadmap2.md) | Tracker der v2-Neuarchitektur (Anmeldung, Postgres, Drizzle). Ursprung: der Stand des ausgelieferten MVP aus roadmap.md. | 29/33, 4 offen |
| [roadmap.md](roadmap.md) | Produkt- und Entwicklungsroadmap (Stand 15.09.2026). Code-Kommentare zitieren sie als „roadmap.md“ mit R-Nummern. | ohne Abhak-Liste |
| [course_generation.md](course_generation.md) | Vollautomatische Kursgenerierung (Stand 17.09.2026). Beschreibt den Anthropic-Stand und ist laut eigenem Hinweis veraltet (Umstellung auf Gemini). | ohne Abhak-Liste |
| [pwa-hardening-review.md](pwa-hardening-review.md) | PWA-Härtung und Senior-Engineering-Review (früher die Datei roadmap.md im Wurzelverzeichnis). | 9/12, 3 offen |

Die Geschichte jeder Datei bleibt erhalten, `git log --follow <Datei>` zeigt sie auch vor dem Verschieben.

Nicht hierher gehören `AGENTS.md`, `CLAUDE.md` und `GEMINI.md` im Wurzelverzeichnis: Das sind Arbeitsanweisungen für Coding-Agenten, keine Pläne.

Für den laufenden Betrieb gibt es die Anleitungen direkt unter `docs/` (zum Beispiel `PWA.md`, `BACKUP.md`, `SSO.md`).
