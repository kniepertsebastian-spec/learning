# CertStudy AI — Weiterentwicklungs-Roadmap

Stand: 3. September 2026

Diese Roadmap setzt auf dem in `roadmap2.md` beschriebenen MVP auf. Sie konzentriert
sich auf die noch fehlenden Funktionen, die aus dem vorhandenen Content-Generator
eine verlässliche und regelmäßig genutzte Lernplattform machen.

## Zielbild

Ein Administrator kann eine Zertifizierung anhand ihrer offiziellen Unterlagen
importieren, prüfen und veröffentlichen. Lernende erhalten daraus einen täglichen,
adaptiven Lernplan, können ihren Fortschritt über mehrere Prüfungsversuche verfolgen
und ausgewählte Kurse auch offline verwenden.

Der gewünschte Ablauf ist:

1. Offizielle Prüfungsbeschreibung als PDF oder URL hinzufügen.
2. Metadaten, Domains, Gewichtungen und Objectives automatisch extrahieren.
3. Import-Vorschlag im Adminbereich prüfen und freigeben.
4. Quellengebundene Lessons und Fragen im Hintergrund generieren.
5. Inhalte validieren und als veröffentlichte Kursversion markieren.
6. Lernenden täglich die sinnvollsten nächsten Aufgaben anbieten.
7. Lern- und Prüfungsverlauf geräteübergreifend und später auch offline fortsetzen.

## Leitplanken

- Offizielle Prüfungsunterlagen sind die Quelle der Wahrheit.
- KI-generierte Inhalte werden niemals ungeprüft als offiziell dargestellt.
- Jede administrative Mutation wird serverseitig autorisiert.
- Bestehende Quiz-, Progress-, Remediation- und Exam-Daten werden weiterverwendet.
- Neue Funktionen bleiben zweisprachig (Deutsch/Englisch).
- Hintergrundjobs müssen wiederaufnehmbar und gegen Doppelausführung geschützt sein.
- „Readiness“ bleibt eine Lernindikator-Aussage und keine Bestehensgarantie.
- Offline-Daten werden bei Abmeldung sicher vom Gerät entfernt.

## Prioritäten und Releases

| Release | Schwerpunkt | Ergebnis | Aufwand |
|---|---|---|---|
| R0 | Stabilität und Adminschutz | Nur berechtigte Personen können Inhalte und Kosten auslösen | S–M |
| R1 | Blueprint-Import und Source Grounding | Verifizierbare Kursstruktur aus offiziellen Quellen | L |
| R2 | Adaptiver Tagesplan | Täglicher Lernkreislauf mit Spaced Repetition | L |
| R3 | Prüfungshistorie und Lernanalyse | Fortschritt und Prüfungsreife werden nachvollziehbar | M |
| R4 | Offline-Kurse und Synchronisation | Lernen ohne Netz mit späterem sicheren Sync | L |
| R5 | Suche, Lesezeichen und Notizen | Schnelleres Arbeiten mit umfangreichen Kursen | M |
| R6 | Betrieb und Observability | Fehler, Kosten und Qualität sind messbar | M |

`S`, `M` und `L` sind relative Größen und keine festen Zeitversprechen.

---

## R0 — Stabilität und Adminschutz

### Ziel

Die vorhandene Anwendung wird vor der Erweiterung abgesichert. Aktuell genügt eine
beliebige Anmeldung, um den Adminbereich zu verwenden. Damit könnten normale Nutzer
Kurse verändern oder kostenpflichtige KI-Jobs starten.

### Arbeitspakete

#### R0.1 Generator stabilisieren

- [x] Offenen Fix für normalisierte Schwierigkeitswerte integrieren und
      testen. (`ObjectiveProgressService.calculateDifficultyWeight` prüfte
      vorher "hard"/"medium"/"easy", was nie zu den echten Werten
      beginner/intermediate/advanced passte - Fix war schon im Code, jetzt
      mit Unit-Tests in `lib/server/progress/service.test.ts` abgesichert.
      Erstes Test-Setup dafür neu: `vitest`, `npm test`.)
- [x] Einen abgebrochenen Generierungslauf ab dem nächsten fehlenden Objective
      fortsetzen können. War durch die bestehende Idempotenz der Skripte
      (`scripts/generate-curriculum-draft.ts`,
      `scripts/generate-lessons-and-questions.ts` - überspringen bereits
      vorhandene Domains/Objectives, ergänzen fehlende Sections/Fragen eines
      teilweise fertigen Objectives) schon gegeben; R0.3 hat das nutzbar
      gemacht, indem ein nach App-Neustart unterbrochener Job automatisch als
      "failed/interrupted" markiert wird und "Erneut versuchen" denselben
      idempotenten Lauf neu startet.
- [x] Pro Zertifizierung höchstens einen aktiven Generierungsjob erlauben.
      (Bereits in R0.3 umgesetzt: Unique Partial Index
      `content_generation_jobs_active_per_cert`.)
- [x] Fehlerklassen im UI unterscheiden: Schemafehler, Rate Limit, Kontingent,
      Provider-Ausfall und interner Fehler. (`errorClass`-Spalte +
      `classifyGenerationError()` in `lib/server/admin/content-generation.ts`,
      mit Tests; `ContentGenerationControl` zeigt Ursache + nächsten Schritt,
      rohen Output nur noch eingeklappt.)
- [x] Vom Provider geliefertes `retryDelay` bei HTTP 429 berücksichtigen.
      (`parseProviderRetryDelayMs()` in `lib/ai/generate.ts` liest Googles
      RetryInfo aus der 429-Fehlerantwort und nutzt sie statt der reinen
      Schätzung per exponentiellem Backoff, mit Tests.)
- [x] Teilweise erzeugte Inhalte als Teilerfolg anzeigen und nicht verwerfen.
      War durch die Persistenz pro Objective schon gegeben (bereits fertige
      Objectives bleiben in der DB und für Lernende nutzbar, auch wenn ein
      späteres Objective den Job scheitern lässt); die R0.3-Schätzung
      (`estimateGenerationWork`) macht den Fortschritt jetzt auch nach einem
      Fehlschlag sichtbar (verbleibende Domains/Objectives statt nur
      "fehlgeschlagen").

#### R0.2 Rollenmodell

- [x] Benutzerrolle einführen: `learner` oder `admin`. (`users.role`,
      Migration `drizzle/0003_charming_sentry.sql`)
- [ ] Bestehenden Betreiber kontrolliert zum ersten Administrator machen.
      Werkzeug dafür steht bereit (`npm run user:set-role`, siehe
      DOCKER_DEPLOYMENT.md), muss aber noch einmal gegen die echte
      Produktions-DB ausgeführt werden.
- [x] Gemeinsamen serverseitigen Guard `requireAdmin()` bereitstellen.
      (`lib/server/auth-guards.ts`: `requireAdminPage()` für Server
      Components/Actions, `requireAdminApi()` für Route Handler; Rolle wird
      bei jedem Aufruf frisch aus der DB gelesen statt aus dem JWT.)
- [x] `/admin`, alle Admin-API-Routen und Server Actions damit schützen.
- [x] Admin-Link im Header nur für Administratoren anzeigen.
- [x] Nicht berechtigte Zugriffe mit 403 beantworten; nicht nur die UI
      ausblenden. (Next.js `forbidden()`/`app/forbidden.tsx`,
      `experimental.authInterrupts` in next.config.ts; API-Routen liefern
      401/403 als JSON.)
- [x] Einen dokumentierten Weg zur Vergabe und zum Entzug einer Adminrolle
      anbieten. (`scripts/set-user-role.ts`, `npm run user:set-role -- <email>
      <admin|learner>`.)

#### R0.3 Schutz kostenpflichtiger Aktionen

- [x] Start eines Generierungsjobs mit Benutzer-ID protokollieren.
      (`content_generation_jobs.started_by_user_id` + Log-Zeile beim Start.)
- [x] Doppelklicks und parallele Starts idempotent behandeln. (Unique
      Partial Index `content_generation_jobs_active_per_cert` erzwingt
      höchstens einen aktiven Job pro Zertifizierung DB-seitig; die
      Anwendungsprüfung bleibt nur als schneller Vorab-Check.)
- [x] Einfaches serverseitiges Rate Limit für Generierungsaktionen
      einführen. (`lib/server/admin/rate-limit.ts`, in-process, 5 Starts/h
      pro Nutzer - siehe Kommentar dort zu den Grenzen bei Multi-Instanz-
      Deployments.)
- [x] Vor dem Start anzeigen, welche Objectives fehlen und ungefähr wie viele
      KI-Aufrufe notwendig sind. (`estimateGenerationWork()`, angezeigt in
      `ContentGenerationControl`.)

### Datenmodell

- `users.role`: `learner | admin`, Standard `learner`
- Optional `admin_audit_events`: Akteur, Aktion, Ziel, Zeitpunkt, Ergebnis, Metadaten
- Unique/partial constraint oder Transaktionssperre für einen aktiven Job je Kurs

### Tests

- Nicht angemeldete Nutzer erhalten bei Adminseiten und -APIs 401.
- Angemeldete Lernende erhalten 403.
- Administratoren können anzeigen, validieren und generieren.
- Zwei fast gleichzeitige Startanfragen erzeugen nur einen Job.
- Ein nach Objective 3 abgebrochener Lauf überspringt beim Neustart Objectives 1–3.

### Abnahmekriterien

- Kein Admin-Endpunkt verlässt sich ausschließlich auf die Sichtbarkeit eines Buttons.
- Ein Generierungsfehler nennt Ursache und sinnvollen nächsten Schritt.
- Bereits gespeicherte valide Inhalte bleiben nach einem Teilfehler verwendbar.

---

## R1 — Offizieller Blueprint-Import und Source Grounding

### Ziel

Ein neuer Kurs wird nicht mehr durch manuelles Raten von Slug, Prüfungsversion,
Domains und Gewichtungen angelegt. Der Administrator liefert eine offizielle Quelle;
die Anwendung erstellt daraus einen überprüfbaren Importvorschlag.

### Nutzerablauf

1. Im Adminbereich „Kurs aus Quelle importieren“ öffnen.
2. Offizielle URL angeben oder PDF hochladen.
3. Provider und Dokumenttyp bestätigen.
4. Extraktion als Hintergrundjob starten.
5. Erkannte Metadaten und Objectives in einer Diff-/Vorschau prüfen.
6. Fehler korrigieren und Import freigeben.
7. Erst danach Curriculum und Lerninhalte generieren.

### Arbeitspakete

#### R1.1 Quellenverwaltung

- [x] Quelle per PDF-Upload unterstützen. (`POST /api/admin/sources`,
      multipart/form-data; Admin-UI unter
      `/admin/certifications/[slug]/sources`.)
- [ ] Quelle per URL unterstützen, sofern Abruf und Nutzungsbedingungen dies
      erlauben. Bewusst zurückgestellt, bis geklärt ist, von welchen
      Anbietern automatisiert abgerufen werden darf - `sourceType` im
      Datenmodell erlaubt `url` bereits, damit dafür keine weitere Migration
      nötig wird.
- [x] Dateigröße, MIME-Type und PDF-Signatur validieren.
      (`validatePdfUpload()` in `lib/server/admin/sources.ts`, mit Tests -
      prüft alle drei, weil ein clientseitig gesetzter MIME-Type allein
      fälschbar ist.)
- [x] SHA-256-Prüfsumme speichern, um Duplikate zu erkennen.
      (`certification_sources.checksum` + Unique Index auf
      `(certification_id, checksum)`; Storage ist zusätzlich
      inhaltsadressiert, siehe `lib/server/storage/local-disk.ts`.)
- [x] Titel, Provider, Veröffentlichungsdatum, Abrufdatum, URL und lokale
      Version erfassen. (`certification_sources`: title, provider,
      publishedAt, retrievedAt, sourceUrl, versionLabel - `sourceUrl`/
      `versionLabel` bleiben leer, bis URL-Import bzw. der Freigabe-Workflow
      aus R1.3 sie befüllen.)
- [x] Text seitenweise extrahieren und Seitenbezug erhalten.
      (`POST /api/admin/sources/:id/parse`, `extractSourceContent()` in
      `lib/server/admin/source-extraction.ts` - Text pro Seite in
      `source_chunks` mit `pageNumber`; Test mit echtem, per `pdf-lib`
      erzeugtem PDF als Roundtrip statt nur gemockt.)
- [x] Quelle als `uploaded`, `parsed`, `reviewed`, `approved`, `superseded`
      oder `failed` kennzeichnen. (`certification_sources.status` mit
      Check-Constraint; R1.1 nutzt `uploaded`/`parsed`/`failed`, der Rest
      gehört zum Review-Workflow aus R1.3.)

**Speicher-Entscheidung:** hochgeladene PDFs liegen in einem lokalen,
benannten Docker-Volume (`source_uploads_data`, siehe docker-compose.yml und
`lib/server/storage/local-disk.ts`), nicht in einem externen Objektspeicher -
passend zum aktuellen Single-Instance-Deployment. Bei Bedarf für
Mehrinstanz-Betrieb später auf S3-kompatiblen Speicher migrierbar, ohne das
Datenmodell zu ändern (`storageKey` bleibt ein opaker String).

#### R1.2 Strukturierte Blueprint-Extraktion

- [x] Striktes Schema für Zertifizierungsmetadaten definieren.
      (`blueprintExtractionSchema`/`blueprintDomainSchema`/
      `blueprintObjectiveSchema` in `lib/server/ai/schemas.ts`.)
- [x] Domains, Gewichtungen, Objective-Codes, Titel und Beschreibungen
      extrahieren. (`generateBlueprintDraft()` in `lib/server/ai/service.ts` -
      EIN Gemini-Aufruf über den seitenmarkierten Quelltext aus R1.1;
      Ergebnis in `blueprint_drafts.content`.)
- [x] Prozentwerte auf Plausibilität prüfen; Summe sollte typischerweise 100
      ergeben. (`validateBlueprintDraft()` in `lib/server/admin/blueprint.ts`,
      Toleranz ±2 Prozentpunkte, mit Tests.)
- [x] Doppelte Objective-Codes, Lücken und ungewöhnliche Reihenfolgen
      markieren. (Dieselbe Funktion; Lücken-Erkennung ist ein
      Best-Effort-Heuristik auf `<Domain>.<Laufnummer>`-Codes.)
- [x] Für jedes Feld Seiten- oder Abschnittsreferenz speichern.
      (`locator` pro Objective, muss laut Prompt auf eine tatsächliche
      `== Seite N ==`-Markierung im Quelltext verweisen statt erfunden zu sein.)
- [ ] Niedrige Extraktionssicherheit sichtbar machen und manuelle Bestätigung
      verlangen. Sichtbarkeit ist da (Confidence-Badge pro Objective in der
      Admin-UI, Sammelwarnung bei < 50 %) - eine harte Bestätigungspflicht vor
      der Übernahme gibt es noch nicht, weil der Freigabe-Schritt selbst erst
      mit R1.3 entsteht; dort ist der naheliegende Ort, sie technisch zu
      erzwingen (z. B. Freigabe blockieren, solange niedrig-konfidente
      Objectives nicht einzeln bestätigt wurden).
- [x] Slug aus Name und Prüfungscode vorschlagen, aber editierbar lassen.
      (`suggestSlug()`, editierbares Feld in der Admin-UI, gespeichert über
      `PATCH /api/admin/sources/:id/blueprint`.)

**Bewusste Vereinfachungen für R1.2:** Extraktion läuft synchron in einem
Request (ein einzelner Gemini-Aufruf, ratenbegrenzt wie R0.3, aber kein
Hintergrundjob) und der an die KI übergebene Quelltext ist auf ~60.000
Zeichen gedeckelt (`buildSourceText`, `truncatedSource`-Flag statt stiller
Kürzung) - für sehr lange Dokumente reicht das ggf. nicht für das gesamte
Dokument; eine Chunking-/Retrieval-Strategie über mehrere Aufrufe ist erst
nötig, sobald das in der Praxis zum Problem wird.

#### R1.3 Review- und Freigabeoberfläche

- [x] Originalquelle und extrahierte Struktur nebeneinander anzeigen.
      (`/admin/certifications/[slug]/sources/[sourceId]/review`,
      `BlueprintReview`: linke Spalte der seitenweise extrahierte Originaltext
      aus `GET /api/admin/sources/:id/text`, rechte Spalte die editierbare
      Struktur.)
- [x] Felder inline korrigierbar machen. (Zertifizierungsname/Anbieter/
      Exam-Code, Domain-Name/-Gewichtung, Objective-Code/-Titel/-Beschreibung
      direkt im Formular; Locator/Confidence bleiben absichtlich read-only als
      KI-Attribution. Hinzufügen/Entfernen von Domains/Objectives ist bewusst
      nicht Teil dieses Arbeitspakets - nur Feldkorrektur, keine
      Strukturänderung.)
- [x] Validierungsfehler von Hinweisen unterscheiden.
      (`validateBlueprintDraft()` liefert jetzt `{ errors, warnings }` statt
      einer flachen Liste; nur doppelte Objective-Codes INNERHALB derselben
      Domain sind ein Error, der die Freigabe blockiert - alles andere bleibt
      ein übergehbarer Hinweis. In der UI rot/blockierend vs. gelb/informativ
      getrennt dargestellt.)
- [x] „Entwurf speichern“ und „Blueprint freigeben“ getrennt anbieten.
      (`PATCH /api/admin/sources/:id/blueprint` für Korrekturen,
      `POST /api/admin/sources/:id/approve` für die Freigabe - Freigabe
      speichert zuerst den aktuellen Stand, damit nie ein von der Anzeige
      abweichender Entwurf freigegeben wird.)
- [x] Freigabe mit Admin-ID und Zeitpunkt protokollieren.
      (`certification_sources.approvedBy`/`approvedAt`, seit R1.1 im Schema
      vorhanden, jetzt erstmals tatsächlich befüllt.)
- [x] Nach Freigabe versehentliche Änderungen verhindern oder versionieren.
      Für "verhindern" entschieden (Versionierung ist explizit R1.5):
      `BlueprintLockedError`, sobald `certification_sources.status` auf
      `approved`/`superseded` steht - blockiert erneute Extraktion und
      PATCH-Korrekturen serverseitig (nicht nur UI-seitig deaktiviert).

**Was die Freigabe konkret tut:** `approveBlueprintDraft()`
(`lib/server/admin/blueprint-approval.ts`) übernimmt die Domains/Objectives
des Drafts in die echten `domains`/`objectives`-Tabellen (Match per Name
bzw. Code, Update bei Treffer, sonst Insert - löscht nie etwas), blockt bei
verbleibenden Errors, und setzt erst danach `status = approved`. Das macht
"freigegebene Objectives" für R1.4 (quellengebundene Generierung) zum ersten
Mal zu echten, abfragbaren Datensätzen statt nur zu KI-Entwurfstext.

**Bekannte Lücke:** "Niedrige Extraktionssicherheit ... manuelle Bestätigung
verlangen" (R1.2) ist weiterhin nur sichtbar (Confidence-Badges, Warnung ab
< 50 %), nicht einzeln erzwungen - die Freigabe verlangt lediglich, dass
keine Errors mehr offen sind. Eine echte Pro-Objective-Bestätigung für
niedrige Confidence ist ein sinnvoller Nachtrag, sobald sich in der Praxis
zeigt, dass die aktuelle Sichtbarkeit nicht reicht.

**Nicht abgedeckt (bewusst außerhalb des Merge-Umfangs):** `applyBlueprintDraft()`
läuft gegen eine echte Postgres-Transaktion und ist in dieser Sandbox mangels
laufender DB nicht End-to-End getestet - nur die vorgelagerte
Validierungslogik (`validateBlueprintDraft`) hat Unit-Tests. Vor dem ersten
produktiven Freigabe-Lauf einmal manuell gegen eine echte DB verifizieren.

#### R1.4 Quellengebundene Generierung

- [ ] Generierungs-Prompts nur mit freigegebenen Objectives und relevanten
      Quellenausschnitten aufrufen.
- [ ] Jede Lesson mit Blueprint-Version, Modell- und Prompt-Version verknüpfen.
- [ ] Jede Frage mit einer konkreten Quellenreferenz versehen.
- [ ] Aussagen ohne ausreichende Grundlage verwerfen oder als Review-Fall markieren.
- [ ] Quellenabdeckung validieren: Jedes Objective benötigt mindestens eine Referenz.
- [ ] Quellenangaben in der Lernansicht knapp, im Adminbereich vollständig anzeigen.

#### R1.5 Versionen und Aktualisierungen

- [ ] Neue Ausgabe eines Blueprints als neue Version importieren.
- [ ] Added/changed/removed Domains und Objectives als Diff darstellen.
- [ ] Betroffene Lessons und Fragen als `stale` markieren.
- [ ] Gezielte Neugenerierung nur der betroffenen Inhalte ermöglichen.
- [ ] Alte Kursversionen für vorhandene Lernverläufe lesbar halten.

### Datenmodell

Empfohlene neue Tabellen beziehungsweise Felder:

- `certification_sources`
  - `id`, `certificationId`, `sourceType`, `title`, `provider`
  - `sourceUrl`, `storageKey`, `checksum`, `publishedAt`, `retrievedAt`
  - `status`, `versionLabel`, `approvedBy`, `approvedAt`
- `source_chunks`
  - `sourceId`, `pageNumber`, `sectionPath`, `content`, `contentHash`
- `objective_source_refs`
  - `objectiveId`, `sourceChunkId`, `locator`, `confidence`
- `lessons.sourceVersionId` und `lessons.reviewStatus`
- `questions.sourceReference` zu einer echten Relation weiterentwickeln
- `certifications.contentStatus`: `draft | review | published | stale`

### APIs und Hintergrundjobs

- `POST /api/admin/sources` — Upload oder URL registrieren
- `POST /api/admin/sources/:id/parse` — Extraktion starten
- `GET /api/admin/sources/:id/status` — Jobstatus abrufen
- `GET /api/admin/sources/:id/blueprint` — Importvorschlag anzeigen
- `PATCH /api/admin/sources/:id/blueprint` — Korrekturen speichern
- `POST /api/admin/sources/:id/approve` — Version freigeben
- Generierungsjob um Phasen `source`, `extract`, `review`, `curriculum`, `lessons`,
  `questions`, `validate` und `complete` erweitern

### Tests

- PDF mit PCA-Blueprint liefert erwartete Metadaten, Domains und Objectives.
- Wiederholter Upload derselben Datei erzeugt keinen unbemerkten Doppelimport.
- Manipulierte oder übergroße Datei wird abgewiesen.
- Ohne freigegebene Quelle kann kein Kurs als „verifiziert“ veröffentlicht werden.
- Eine neue Quellenversion markiert nur tatsächlich betroffene Inhalte als veraltet.
- Quellenreferenzen bleiben nach Neugenerierung nachvollziehbar.

### Abnahmekriterien

- Für PCA ist kein manuelles Abschreiben der Domains erforderlich.
- Jeder veröffentlichte Objective-Datensatz verweist auf die offizielle Quelle.
- Admins können sehen, wann und anhand welcher Version ein Inhalt geprüft wurde.
- Der Lernende kann offizielle Struktur und KI-Erklärung klar unterscheiden.

---

## R2 — Adaptiver Tagesplan und Spaced Repetition

### Ziel

Die Startseite beantwortet jeden Tag eine klare Frage: „Was soll ich jetzt lernen?“
Statt nur den zuletzt geöffneten Kurs zu zeigen, erstellt die App eine kurze Session
aus fälligen Wiederholungen, schwachen Objectives und neuem Stoff.

### Nutzerablauf

1. Lernziel festlegen: Prüfungstermin, Lerntage und Minuten pro Tag.
2. Dashboard zeigt „Heute lernen“, Anzahl fälliger Wiederholungen und Zeitbedarf.
3. Session startet mit einer Mischung aus Wiederholung und neuem Inhalt.
4. Nach jeder Frage werden Korrektheit, Schwierigkeit und Aktualität berücksichtigt.
5. Am Ende sieht der Nutzer Fortschritt, nächste Fälligkeit und Schwachstellen.

### Arbeitspakete

#### R2.1 Lernprofil und Ziele

- [ ] Prüfungstermin optional speichern.
- [ ] Tägliches Zeit- oder Fragenziel festlegen.
- [ ] Aktive Lerntage und bevorzugte Sprache speichern.
- [ ] Ziel jederzeit änderbar machen, ohne bisherigen Fortschritt zu verlieren.

#### R2.2 Review-Scheduler

- [ ] Für beantwortete Fragen beziehungsweise Objectives einen Review-Zustand führen.
- [ ] Zunächst einen nachvollziehbaren Leitner-/SM-2-ähnlichen Algorithmus verwenden.
- [ ] Falsche Antwort kurzfristig erneut einplanen.
- [ ] Richtige Antworten mit wachsendem Abstand einplanen.
- [ ] Schwierigkeit, letzte Versuche und Objective-Gewichtung berücksichtigen.
- [ ] Fragenrotation sicherstellen, damit nicht nur dieselbe Frage auswendig gelernt wird.
- [ ] Neue Inhalte begrenzen, wenn viele Wiederholungen überfällig sind.

#### R2.3 Session Builder

- [ ] Session anhand des Zeitbudgets erstellen.
- [ ] Empfohlener Startmix: 60 % fällige Wiederholungen, 25 % schwache Bereiche,
      15 % neuer Stoff.
- [ ] Prüfungstermin und Domaingewichtung in die Priorisierung einbeziehen.
- [ ] Bei zu kleinem Fragenpool auf Lesson-Wiederholung oder vorhandene Remediation
      zurückfallen.
- [ ] Session deterministisch speichern, damit ein Reload sie nicht verändert.

#### R2.4 Dashboard „Heute lernen“

- [ ] Primäre CTA mit geschätzter Dauer.
- [ ] Fällige Reviews, Lernserie und Tagesziel anzeigen.
- [ ] Drei wichtigste schwache Objectives erklären.
- [ ] „Später“, „Heute aussetzen“ und Zielanpassung ermöglichen.
- [ ] Nach der Session eine kurze, motivierende Zusammenfassung zeigen.

#### R2.5 Readiness weiterentwickeln

- [ ] Readiness nicht nur aus einem einzelnen Exam-Versuch ableiten.
- [ ] Objective-Abdeckung, Aktualität, Anzahl der Versuche und Probeprüfungen
      einbeziehen.
- [ ] Unsicherheit bei zu wenig Daten deutlich anzeigen.
- [ ] Begründung liefern: „Warum ist meine Readiness 68 %?“

### Datenmodell

- `study_profiles`: Nutzer, Kurs, Prüfungstermin, Tagesziel, Lerntage
- `review_items`: Nutzer, Objective/Frage, Fälligkeit, Intervall, Wiederholungen,
  Stabilität/Ease, letzter Ausgang
- `study_sessions`: Nutzer, Kurs, Status, geplant/gestartet/beendet, Zielumfang
- `study_session_items`: Session, Typ, Referenz-ID, Reihenfolge, Ergebnis

### Tests

- Falsche Antworten werden früher fällig als richtige.
- Mehrfach richtige Antworten verlängern das Intervall.
- Sessiongröße hält das gewählte Tagesziel annähernd ein.
- Reload oder Gerätewechsel erzeugt keine zweite parallele Session.
- Kurse und Nutzer beeinflussen einander nicht.
- Zu wenig Daten führen nicht zu einer übertrieben sicheren Readiness-Aussage.

### Abnahmekriterien

- Ein Nutzer kann innerhalb von zwei Klicks eine sinnvolle Tages-Session starten.
- Jede Auswahl ist durch Fälligkeit, Schwäche oder neues Curriculum erklärbar.
- Nach Abschluss sind Fortschritt und nächster Schritt sichtbar.
- Der Scheduler benötigt für normale Sessions keinen KI-Aufruf.

---

## R3 — Prüfungshistorie und Lernanalyse

### Ziel

Bereits gespeicherte Quiz- und Exam-Versuche werden für Lernende sichtbar. Entwicklung,
wiederkehrende Fehler und Readiness-Trends lassen sich nachvollziehen.

### Arbeitspakete

- [ ] Seite „Meine Prüfungen“ mit Datum, Ergebnis, Dauer und Readiness bauen.
- [ ] Detailseite pro Versuch mit Domain- und Objective-Auswertung ergänzen.
- [ ] Vergleich mit dem vorherigen Versuch anzeigen.
- [ ] Wiederholt falsch beantwortete Themen hervorheben.
- [ ] Direkten Einstieg in Remediation oder Tagesplan anbieten.
- [ ] 7-/30-/90-Tage-Trend für Mastery und Übungsaktivität anzeigen.
- [ ] Aktivitätskalender beziehungsweise Lernserie ergänzen.
- [ ] Datenexport als JSON oder CSV optional vorsehen.

### Regeln

- Keine Rangliste ohne echten Mehrwert und ausdrückliches Opt-in.
- Keine Bestehenswahrscheinlichkeit vortäuschen.
- Fragewortlaut nach einer Prüfung nur anzeigen, wenn dies mit der gewünschten
  Wiederverwendungsstrategie der Fragen vereinbar ist.
- Fehlende Daten als fehlende Daten zeigen, nicht als Nullleistung.

### Abnahmekriterien

- Jeder abgeschlossene Exam-Versuch ist wieder auffindbar.
- Der Nutzer erkennt, welche Domains sich verbessert oder verschlechtert haben.
- Aus jedem Schwachpunkt führt eine konkrete Aktion zum nächsten Lernschritt.

---

## R4 — Offline-Kurse und Synchronisation

### Ziel

Ein veröffentlichter Kurs kann bewusst auf ein Gerät geladen werden. Lessons,
Tages-Session und Quizantworten funktionieren ohne Verbindung; Ergebnisse werden
nach Wiederherstellung des Netzes genau einmal synchronisiert.

### Arbeitspakete

#### R4.1 Offline-Paket

- [ ] „Für offline speichern“ pro Kurs anbieten.
- [ ] Versioniertes Manifest mit Lessons, Fragen und benötigten Assets erzeugen.
- [ ] Downloadfortschritt, Größe und Aktualisierungsdatum anzeigen.
- [ ] App-Shell und veröffentlichte Inhalte gezielt cachen.
- [ ] Veraltete Kursversion erst nach erfolgreichem Ersatz löschen.

#### R4.2 Lokale Datenhaltung

- [ ] Vorhandenes IndexedDB/Dexie-Konzept auf Backend-Inhalte abstimmen.
- [ ] Keine Passwort- oder Session-Secrets in der Offline-Datenbank speichern.
- [ ] Inhalte nach Nutzer und Kursversion partitionieren.
- [ ] „Offline-Daten löschen“ in den Einstellungen anbieten.
- [ ] Bei Logout nutzerbezogene lokale Daten entfernen.

#### R4.3 Sync Queue

- [ ] Offline-Quiz- und Session-Ergebnisse mit clientseitiger Ereignis-ID speichern.
- [ ] Idempotenten Sync-Endpunkt implementieren.
- [ ] Automatisch bei `online`, App-Start und manuellem Sync übertragen.
- [ ] Konflikte nach Ereigniszeit und Serverstatus nachvollziehbar lösen.
- [ ] Fehlgeschlagene Einträge mit Retry und sichtbarem Status behalten.

#### R4.4 UX

- [ ] Online-, Offline- und Sync-Status anzeigen.
- [ ] Funktionen, die online bleiben müssen, verständlich deaktivieren.
- [ ] Generierung und Quellenimport ausdrücklich nicht offline anbieten.
- [ ] Speicherplatz und zuletzt synchronisierten Zeitpunkt anzeigen.

### Tests

- Installierte PWA startet im Flugmodus.
- Heruntergeladene Lesson und Quiz funktionieren offline.
- Derselbe Versuch wird nach mehreren Retries nur einmal gespeichert.
- Logout entfernt lokale nutzerbezogene Daten.
- Wechsel der Kursversion beschädigt keine bereits synchronisierten Versuche.

### Abnahmekriterien

- Eine vollständige Tages-Session lässt sich ohne Netz absolvieren.
- Nach Reconnect stimmen Serverfortschritt und lokaler Status überein.
- Der Nutzer sieht jederzeit, ob Daten noch nicht synchronisiert wurden.

---

## R5 — Suche, Lesezeichen und Notizen

### Ziel

Lernende finden Inhalte schnell wieder und können persönliche Bezüge festhalten.

### Arbeitspakete

- [ ] Volltextsuche über Kurse, Domains, Objectives und Lessons.
- [ ] Filter nach Kurs, Domain, Sprache und Inhaltstyp.
- [ ] Suchtreffer mit Textausschnitt und direktem Sprung zur Fundstelle.
- [ ] Lesezeichen für Lessons, Objectives und Fragen.
- [ ] Private Notizen an Lessons und Objectives.
- [ ] Übersichtsseite „Gespeichert“ mit Suche und Filtern.
- [ ] Notizen in Offline-Paket und Sync Queue integrieren.
- [ ] Export und vollständiges Löschen persönlicher Notizen ermöglichen.

### Datenmodell

- `bookmarks`: Nutzer, Entitätstyp, Entität-ID, erstellt am
- `notes`: Nutzer, Entitätstyp, Entität-ID, Text, erstellt/geändert am
- Eindeutiger Index für ein Lesezeichen je Nutzer und Entität
- PostgreSQL-Volltextindex als Start; externe Suchengine erst bei nachgewiesenem Bedarf

### Abnahmekriterien

- Ein Begriff liefert innerhalb eines Kurses relevante Fundstellen.
- Lesezeichen und Notizen sind ausschließlich für ihren Besitzer sichtbar.
- Offline erstellte Notizen werden konfliktarm synchronisiert.

---

## R6 — Betrieb, Observability und Qualitätssteuerung

### Ziel

Die Anwendung zeigt nicht nur Nutzerfortschritt, sondern auch ihren eigenen Zustand.
Ausfälle, KI-Kosten und problematische Inhalte werden früh erkannt.

### Arbeitspakete

#### R6.1 Technische Telemetrie

- [ ] Strukturierte Logs mit Request-/Job-ID einführen.
- [ ] Metriken für API-Latenz, Fehlerquote, DB-Verbindungen und Authfehler erfassen.
- [ ] Generierungsjobs nach Dauer, Status, Providerfehler und Retry zählen.
- [ ] Health- und Readiness-Endpunkte für App und Datenbank bereitstellen.
- [ ] Keine Prompts, Antworten, Tokens oder personenbezogenen Daten unkontrolliert loggen.

#### R6.2 KI-Kosten und Kontingente

- [ ] Modell, Tokenverbrauch und geschätzte Kosten pro Job speichern.
- [ ] Kosten nach Kurs, Phase und Zeitraum aggregieren.
- [ ] Warnschwellen für Tages-/Monatsbudget konfigurieren.
- [ ] Bei erreichtem Budget neue Jobs sauber blockieren, vorhandene Inhalte aber
      weiter ausliefern.
- [ ] Cache-Treffer und vermiedene Generierungen sichtbar machen.

#### R6.3 Content-Qualität

- [ ] Erfolgsquote und Trennschärfe von Fragen aus echten Antworten berechnen.
- [ ] Zu leichte, zu schwere oder missverständliche Fragen markieren.
- [ ] Meldemöglichkeit „Inhalt ist falsch/unklar/veraltet“ anbieten.
- [ ] Admin-Queue für gemeldete und automatisch auffällige Inhalte bauen.
- [ ] Änderungshistorie und erneute Freigabe nach Bearbeitung verlangen.

#### R6.4 Dashboard und Alerts

- [ ] Technisches Dashboard für App, Postgres, Tunnel und KI-Jobs erstellen.
- [ ] Alarm bei hoher 5xx-Rate, fehlgeschlagenen Jobs und nicht erreichbarer DB.
- [ ] Inhaltliche Warnungen getrennt von Infrastrukturwarnungen behandeln.
- [ ] Runbook mit Diagnosebefehlen und Wiederanlauf dokumentieren.

### Abnahmekriterien

- Ein fehlgeschlagener Job lässt sich über eine ID vollständig nachvollziehen.
- Betreiber sehen Kosten und Kontingent vor einem überraschenden Provider-Stopp.
- Fehlerhafte Fragen gelangen über einen definierten Weg in die Review-Queue.
- Alarmierung enthält Ursache, betroffenen Dienst und ersten Prüfschritt.

---

## Querschnitt: Datenschutz, Sicherheit und Barrierefreiheit

Diese Punkte gelten für jeden Release:

- [ ] Eingaben mit Zod oder gleichwertig an jeder Servergrenze validieren.
- [ ] Objektzugriffe immer mit Nutzer- beziehungsweise Adminberechtigung prüfen.
- [ ] Uploads isoliert verarbeiten und niemals als ausführbare Dateien bereitstellen.
- [ ] Rate Limits für Auth, Upload, Suche und kostenpflichtige KI-Endpunkte vorsehen.
- [ ] Datenexport und Kontolöschung konzeptionell berücksichtigen.
- [ ] Tastaturbedienung, Fokuszustände, semantische Labels und ausreichende Kontraste testen.
- [ ] Deutsche und englische UI-Texte gemeinsam ausliefern.
- [ ] Mobile Darstellung und installierte PWA für jede neue Kernstrecke prüfen.

## Empfohlene technische Reihenfolge

1. Generatorfix und Adminrollen abschließen.
2. Quellen-, Versions- und Freigabe-Datenmodell migrieren.
3. PDF-Import und deterministische Extraktion bauen.
4. Review-UI und quellengebundene Generierung anschließen.
5. PCA als ersten End-to-End-Referenzkurs importieren und validieren.
6. Review-Scheduler und Tages-Session auf vorhandenen Quizdaten aufbauen.
7. Prüfungshistorie und erklärbare Readiness ergänzen.
8. Erst danach Offline-Sync auf die stabilen Server-APIs setzen.
9. Suche, Notizen und vertiefte Betriebsmetriken hinzufügen.

## Release-Gates

### Gate A — Sicherer Betrieb

- Admin-RBAC aktiv
- Generator wiederaufnehmbar
- keine parallelen Jobs pro Kurs
- verständliche Fehler- und Quotenanzeige

### Gate B — Verifizierter Kurs

- offizielle Quelle gespeichert und freigegeben
- alle Objectives mit Quellenreferenz
- Content-Validierung ohne Fehler
- Kursversion veröffentlicht

### Gate C — Adaptives Lernen

- Tagesziel und fällige Reviews funktionieren
- Scheduler ist durch Tests reproduzierbar
- Nutzer versteht jede Empfehlung
- keine KI-Abhängigkeit für normale Tages-Sessions

### Gate D — Offline-fähig

- Flugmodus-Test auf mindestens einem Smartphone und Laptop bestanden
- idempotenter Sync nach Verbindungsabbruch bestanden
- lokale Daten werden bei Logout entfernt
- Versionsupdate eines Offline-Kurses getestet

## Nicht Teil der nächsten Releases

Folgende Funktionen sollten erst nach belastbaren Nutzungsdaten priorisiert werden:

- soziale Ranglisten und Wettbewerbe
- öffentliche Kurs-Marktplätze
- bezahlte Abonnements
- Live-Unterricht oder Video-Hosting
- komplexe Gamification mit virtueller Währung
- eigenes Foundation Model oder Fine-Tuning
- Microservices-Aufteilung ohne nachgewiesenen Skalierungsbedarf

## Erfolgsmessung

Technische und fachliche Kennzahlen werden pro Release eingeführt:

- Anteil veröffentlichter Objectives mit gültiger Quellenreferenz: Ziel 100 %
- Erfolgreich abgeschlossene Generierungsjobs: Ziel mindestens 95 % ohne manuellen Eingriff
- Anteil begonnener Tages-Sessions, die abgeschlossen werden
- Wiederholungsquote nach 7 und 30 Tagen
- Verbesserung schwacher Objectives nach einer Review-Woche
- Anteil synchronisierter Offline-Ereignisse ohne manuellen Konflikt
- Gemeldete Content-Probleme und mittlere Zeit bis zur Prüfung
- KI-Kosten pro veröffentlichter Lesson und pro akzeptierter Frage

## Definition of Done für jedes Arbeitspaket

Ein Arbeitspaket gilt erst als abgeschlossen, wenn:

- Implementierung und Datenmigration vorhanden sind,
- Berechtigungen und Eingabevalidierung geprüft wurden,
- automatisierte Tests für Kern- und Fehlerfälle bestehen,
- deutsche und englische Oberfläche vollständig sind,
- mobile Darstellung geprüft wurde,
- Betriebs- und Fehlerverhalten dokumentiert ist,
- keine bestehenden Lernverläufe beschädigt werden,
- Roadmap und relevante Projektdokumentation aktualisiert wurden.

