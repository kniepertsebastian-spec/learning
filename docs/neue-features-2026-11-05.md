# Neue Funktionen vom 5. November 2026

Alles, was in den Sitzungen dieses Tages dazugekommen ist, nach Projekt und nach Stand. **„In `main`“** heißt: der Pull Request ist gemerged. **„Offen“** heißt: Draft-PR, noch nicht in `main`, nicht live. Zahlen und Aussagen stammen aus den Beschreibungen der Pull Requests; was dort „nicht geprüft“ steht, steht auch hier.

Eine echte Zustellung über Push-Dienste, die echte Gemini-Batch-API und die Oberfläche im Firmenbereich sind bisher nur mit Fakes oder gar nicht ausprobiert (siehe Abschnitt „Noch nicht ausprobiert“).

---

## Knowvia (`learning`)

### Neue Funktionen, in `main`

1. **KI-Kostenbuch und Seite „KI-Kosten“** (`/admin/ai-costs`, #167). Jeder Gemini-Aufruf ist eine Zeile (Kurs, Funktion, Schritt, Token, Preis). Die Seite zeigt Gesamtkosten, den teuersten Kurs, den Budgetstand, Kosten und Anteil je Kurs und die Kosten nach Herkunft. Gelöschte Kurse behalten ihre Kosten („Ohne Kurs“). Aufrufe mit dem eigenen Schlüssel einer Firma zählen nicht ins Plattform-Budget. Ein Modell ohne eingestellten Preis zählt als 0 und wird als Anzahl der Aufrufe gemeldet, nicht mit einem erfundenen Preis. Die früheren Summen wurden als Altbestand übernommen (Migration 0112). `GEMINI_BUDGET_USD` zählt jetzt das ganze Buch, ohne Zeitfenster.
2. **KI-Lauf „Veraltete und fehlende Inhalte neu erzeugen“** (Art `stale`, #167, Migration 0111). Er ersetzt den alten Knopf „Inhalte generieren“ und beide Skripte. Mit Kostenschätzung, Sicherung des Kursstands, Abbruch und Budgetprüfung. Eine Lektion wird an Ort und Stelle ersetzt (die alte bleibt als Revision), Fragen brauchen einen Quellenbeleg. Ziele ohne Quelle werden übersprungen und gezählt.
3. **Kosten nach Schritt** (Tabelle in `/admin/ai-costs`, #174): Blueprint, Lernziele, Reparatur, Fragen auffüllen, Konzepte, Voraussetzungen und weitere Schritte mit Aufrufen, Durchschnitt, Token und Anteil.
4. **Schlankeres Konzept-Tagging** (#174): Eine Frage geht nur einmal raus, wenn Deutsch und Englisch gleich sind; höchstens 2 bis 3 Varianten je Konzept; kurze Erklärungen.
5. **Gemini-Batch für das Konzept-Tagging** (`GEMINI_BATCH=1`, standardmäßig aus, #177, Migration 0113). Alle ungetaggten Lernziele eines Kurses gehen als ein Auftrag raus (laut Preisfaktor etwa die Hälfte), ein Hintergrundlauf holt die Antworten alle 5 Minuten ab. Fehlende oder ungültige Antworten laufen je Lernziel einzeln, ein gescheiterter Auftrag über den bisherigen Weg; dieselben Lernziele werden nie doppelt eingereicht. Im Kostenbuch als „Konzepte und Abfragevarianten (Batch)“, geschätzt mit `GEMINI_BATCH_PRICE_FACTOR` (Standard 0,5).
6. **Eigenes Modell für die Folgeschritte** (`GEMINI_TAGGING_MODEL`, #177) für Tagging, Abfragevarianten und Voraussetzungen, mit eigenen Preisvariablen. Ohne Angabe ändert sich nichts.
7. **Durchgereichte Einstellungen im Docker-Betrieb** (#177): `GEMINI_TRANSLATION_MODEL`, die Übersetzungspreise, `GEMINI_CACHED_PROMPT_PRICE_FACTOR` und `COURSE_AUTO_TRANSLATE` kamen bisher nie im Container an. Eine leer durchgereichte Cache-Preisformel zählt nicht mehr als „0“.

### Sicherheit und Betrieb, in `main`

- **Passwortregel** (#167): mindestens 8 Zeichen mit Groß- und Kleinbuchstabe, Ziffer und Sonderzeichen für neue Passwörter (Registrierung, Änderung, Zurücksetzen); die Meldung nennt jeden fehlenden Teil.
- **SSRF-Schutz** (#167): Die Adressprüfung läuft in der Verbindung selbst (kein „DNS-Rebinding“), Antworten werden streamend begrenzt (auch nach dem Entpacken), Gesamtfrist, mehr gesperrte IPv6-Bereiche.
- **`/api/sync`** (#167): Ereignisse werden einzeln geprüft (ein falsches kippt nicht den ganzen Stapel), Obergrenzen für Größe und Anzahl.
- **Dependabot** (#167 und folgende): wöchentliche Vorschläge für npm, Actions, Dockerfile und Compose; Gruppen für Next und React; gesperrt sind Postgres-Major, Node-Major, TypeScript-Major (#178), das FSRS-Binding ab 0.6 und `@types/node`-Major (#182, #185).
- **Blockierender Audit in der CI** ab „hoch“ (#167).
- **Schlankeres Produktionsabbild** (#167): die Test- und Build-Werkzeuge bleiben draußen (`node_modules` von 886 auf 695 MB).
- **Genau eine App-Instanz** ist jetzt dokumentiert und im Code begründet (#167).
- **Abhängigkeiten:** `ts-fsrs` 6 mit weiterhin FSRS-6 (1599 Referenzwerte unverändert; Gewichtsvektoren mit falscher Länge fallen wie bisher auf die Standardwerte zurück statt zu werfen, #182), **Node 26 (LTS)** in CI, Dockerfile und README (#185), `postgres` 4, `vitest` 5, `eslint` 10, `dotenv` 18, `@types/node` 26 (Dependabot, vom Betreiber gemerged).

### Neue Funktionen, **offen** (Draft-PRs, noch nicht in `main`)

| PR | Funktion | Stand |
|---|---|---|
| [#186](https://github.com/kniepertsebastian-spec/learning/pull/186) | **Command-Palette** (⌘K bzw. Strg+K): Suche über Kurse, Abschnitte und Befehle aus Merkzetteln, dazu die Seiten der Navigation; nur Sichtbares. **„Meine Schwachstellen“** (`/cert/[id]/weaknesses`): alle Themen mit zuletzt falscher Quiz-Antwort, je mit „Gezielt üben“. | Tests, E2E 4/4 |
| [#187](https://github.com/kniepertsebastian-spec/learning/pull/187) | **Web Push** (VAPID): Opt-in unter `/account`, drei Arten einzeln abschaltbar, Testnachricht, höchstens eine Nachricht am Tag zur üblichen Lernzeit, Prüfungstermine tagsüber; Adress-Allowlist gegen SSRF; Migration 0114. | Tests, E2E 5/5, nur mit Fake-Sender |
| [#188](https://github.com/kniepertsebastian-spec/learning/pull/188) | **Prüfer-Qualität** (nur Admin): Kennzahlen je Prüfer und Freigabe im Vergleich zum Durchschnitt mit Hinweis ab dem 2-Fachen; **Zweitprüfung als Stichprobe** (10 %, mindestens 3, höchstens 25 Fragen, ein anderer Prüfer des Kurses, Abweichungen beim Admin); **Wiedervorlage** („Prüfung empfohlen“ nach neuer Quellenausgabe); Siegel-Hinweis „keine Garantie fürs Bestehen“. Migration 0115, enthält die Commits von #187. | Tests, E2E 4/4 |
| [#189](https://github.com/kniepertsebastian-spec/learning/pull/189) | **Wirkungsbericht** (`/admin/impact`, nur Admin, beschreibend): Bereitschaftswert gegen das echte Prüfungsergebnis, Rückblick (Abstand, Tagesform, Tageszeit gegen die Standard-Vorhersage), Behaltensquote je Feature-Flag, Verstehens-Modus. | Tests, E2E 1/1 |
| [#190](https://github.com/kniepertsebastian-spec/learning/pull/190) | **Firmen:** Katalog-Gruppen als Vorlage für Kursgruppen; **Skill-Abdeckung je Team** („x von y“, nur freigegebene gültige Zertifikate der eigenen Firma, Teams ab 3 Mitgliedern, keine Namen, keine Rangfolge). | Tests, Oberfläche nicht angesehen |

Die Ergebnisseite nach Prüfung und Simulation (Ring, Bestehensmarke, Balken je Domain, „Falsche Antworten durchgehen“, „Gezielt üben“) war schon da; sie ist nur in der Roadmap abgehakt (#186). Konfetti gibt es bewusst nicht.

---

## Fitnesstracker (`fitnesstracker`, #82, gemerged)

**Keine neuen Funktionen**, nur Sicherheit und Betrieb: gepatchte Abhängigkeiten (Audit 64 → 3 Funde, 0 kritisch), die echte Client-Adresse hinter Caddy und dem Cloudflare-Tunnel (`TRUST_PROXY`, damit die Ratenbegrenzung je Besucher statt global zählt), Limits je Adresse für KI-Aufrufe, Uploads und Export, sichere Standardwerte (Start mit Platzhalter-Geheimnissen wird in Produktion verweigert, 5xx-Fehler nennen keine Interna), Entwicklungs-Compose nur auf 127.0.0.1.

## Equalizer (`equalizer`, #61, gemerged)

**Keine neuen Funktionen**, nur Absicherung: Anmelde-Tokens (SoundCloud, Spotify) sind vom Android-Backup ausgenommen, der Start des Vordergrunddienstes ist abgesichert, die Spike-Oberfläche gibt es nur im Debug-Build, der Release-Ablauf führt vor dem Signieren die Tests aus. Die Android-Teile wurden dort nicht gebaut (kein SDK); die CI ist maßgeblich.

---

## Noch nicht ausprobiert

- **Echte Gemini-Batch-API:** nur gegen einen Fake-Client geprüft. Offen: ob der Faktor 0,5 auch für den Cache-Anteil gilt, das Größenlimit für Inline-Anfragen (hier 5 MB je Auftrag angenommen), ob das Modell den Batch-Weg mit Antwortschema und Denkbudget 0 annimmt.
- **Web Push über echte Dienste** (Chrome/FCM, Firefox, Safari): nur mit Fake-Sender und E2E ohne echte Zustellung.
- **Firmenbereich (#190):** keine E2E-Daten für Firmen im Repository; Dialog und Karte sind nicht im Browser angesehen.
- **Docker-Abbild mit `node:26-alpine`:** nicht gebaut (kein Docker-Dienst in der Entwicklungsumgebung).
- **Screenreader, 390 px und Dunkel/Hell** per Screenshot für die neuen Seiten.

## Bewusst nicht umgesetzt

- **Automatisches Onboarding** („Person kommt in Team X, bekommt Kursgruppe X“): braucht eine neue Regel-Tabelle, einen Eingriff in die Teamzuordnung und die Abstimmung mit Pflichtregeln und Onboarding-Plänen.
- **Didaktik „Später“** (Phase 11): Planung auf Konzept-Ebene, Interleaving über Domains erzwingen, Hilfe-Leiter für Szenario-Fragen, Brückenpfade: verändert die Wiederholungsplanung und braucht eigene Entscheidungen.
- **Rechtstexte:** Expertenvertrag, Datenschutzerklärung zu Prüferprofilen.
- **Nicht im Repository machbar:** Praxis-Labs (Kosten und Betrieb ungeklärt), Open Badges (Signierschlüssel, Aussteller), Einträge in Google Play und Microsoft Store, Gerätetest auf echtem iOS und Android, Penetrationstest, Backup- und Restore-Test auf dem Server, Firewall und Branch Protection.
- **Übersetzung im Batch** und **Konzepte je Lernziel begrenzen**: erst nach den ersten echten Kostenzahlen.
- **FSRS-7 und Binding 0.6:** anderes Gedächtnismodell mit 34 Gewichten, bräuchte neue Gewichte und einen Neuaufbau des Lernstands aus dem Review-Log; die Umstellung ist eine eigene Entscheidung.

## Noch zu erledigen nach dem Merge

- Roadmap-Tabelle (`docs/roadmaps/README.md`) und einige Häkchen, die zwischen den PRs sonst Konflikte gäben: `ROADMAP-UI.md` (Web-Push-Zeile), `umsetzungsplan.md` (Web Push, Prüfer-Qualität, Wirkung messen), Zähler der Roadmap-Dateien.
- Migrationen **0114** (Push) und **0115** (Zweitprüfung) laufen beim Start; **0111 bis 0113** sind schon in `main`.
- Einstellungen: `VAPID_*` (Schlüssel mit `npm run push:keys`), stündlicher Cron für `npm run push:remind`; optional `GEMINI_BATCH=1`, `GEMINI_TAGGING_MODEL`, `REVIEWER_QUALITY_FACTOR`, `SECOND_REVIEW_SHARE`.
- Der Commit `a3c94a80` („fix pr“) hat `node_modules` (über 41.000 Dateien) sowie `next-env.d.ts` und `public/sw.js` in `main` gebracht. Ein PR, der sie aus dem Index nimmt, ist nicht angelegt.
