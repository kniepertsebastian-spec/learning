# Roadmap 3: Learning by Doing und Kurs-Werkstatt

Ziel: Lernen in den Kursen so weit wie möglich praktisch machen (Text lesen → selbst lösen → Auswertung) und Kurse im
Admin-Panel dauerhaft verbessern können, manuell oder mit KI, ohne dass dabei etwas verloren geht.

Grundlage: interaktive Simulationen in Lektionen (```simulation, Terminal/Entscheidung/Konfiguration, PR #105).

## Schritt 1: Kurs-Werkstatt, Grundgerüst ✅

Lektionen und Fragen eines allgemeinen Kurses im Admin-Panel bearbeiten, mit Versionsgeschichte.

- Seite `/admin/certifications/[slug]/workshop` (Knopf „Kurs bearbeiten“ in der Kursverwaltung).
- Gliederung Domain → Lernziel → Lektionen und Fragen mit Hinweisen: offene Meldungen von Lernenden, Lektion mit
  Simulation, schon bearbeitet. Lektionen lassen sich verschieben und neu anlegen (erst mit fertigem Inhalt, Lernende
  sehen nie eine leere Lektion).
- Lektions-Editor: Markdown mit Live-Vorschau, die genau der Lerneransicht entspricht (inklusive Simulationen); die
  Lernblöcke werden laufend geprüft, kaputte Blöcke verhindern das Speichern (dieselbe Prüfung wie bei der Generierung).
  Merkzettel, Kernaussagen, Prüfungsschwerpunkte. Einsprachige Kurse (beide Sprachfelder gleich) werden in beiden
  Feldern zugleich bearbeitet, übersetzte getrennt.
- Fragen-Editor: Frage, Optionen (genau eine richtig), Begründungen, Erklärung, Schwierigkeit, Typ; neue Fragen.
  Optionen behalten ihre IDs, damit Antworten der Lernenden gültig bleiben.
- Versionen (`content_revisions`): jede Änderung legt den Stand davor ab, mit Herkunft (manuell, KI, Skript,
  Übersetzung, Zurücksetzen), Autor und Notiz. Vergleich alt/neu je Sprache, Wiederherstellen; Wiederherstellen legt
  den aktuellen Stand selbst als Version ab.
- Gemerkte Stände (`course_checkpoints`): ganzen Kurs unter einem Namen sichern und zurücksetzen.
- Gleichzeitiges Bearbeiten: gespeichert wird nur auf dem aktuellen Stand (Fingerabdruck), sonst Hinweis mit
  „Neu laden“ oder „trotzdem speichern“.
- Auch die Backfill-Skripte (`lessons:blocks`, `lessons:simulations`) und der Übersetzungslauf legen vorher eine
  Version ab.

Bewusst noch nicht: Lektionen, Fragen oder Lernziele löschen (Lernfortschritt und Antworten hängen daran) und
Lernziele anlegen; das Zurücksetzen eines gemerkten Stands stellt keine Strukturänderungen zurück (neu angelegte
Inhalte bleiben). Änderungen sind sofort live, es gibt keinen Entwurfsmodus. Die andere Sprache eines übersetzten
Kurses wird nicht automatisch nachgezogen.

## Schritt 2: Abdeckungs- und Qualitätsbericht ✅

„Qualitätsbericht“ in der Kurs-Werkstatt (ohne KI, aus vorhandenen Daten):

- **Abdeckung der offiziellen Lernziele:** erkennt in der Quelle nummerierte Lernziele („1.1 …“, „Objective 2.3 …“,
  „Task Statement 3.2 …“, „101.1 …“) und vergleicht sie mit den Lernzielen des Kurses; fehlende werden genannt.
  Gibt es weniger als drei erkannte Nummern (Gliederung ohne Nummern), gibt es keine Aussage statt einer falschen.
  Beim Erzeugen eines Kurses hält der Auftrag fest, was die Quellen hergeben (`course_generation_jobs.source_report`);
  für ältere Kurse ruft „Quelle prüfen“ die Quell-URLs des Auftrags neu ab. Individuelle Trainings und Kurse ohne Auftrag
  haben keine Abdeckungsprüfung.
- **Gekürzte Quellen** (für die KI auf 60.000 Zeichen begrenzt) werden jetzt sichtbar gemeldet.
- **Je Domain:** Lernziele, Lektionen, Fragen, Simulationen, Praxisbeispiele.
- **Verbesserungspotenzial** nach Wichtigkeit (wichtig/mittel/gering), Klick springt zur Lektion bzw. zu den Fragen:
  fehlende offizielle Lernziele, offene Meldungen von Lernenden, Fragen mit hoher Fehlerquote (unter 40 % richtig bei
  mindestens 10 Antworten, aggregiert), weniger Fragen als empfohlen (Blueprint, sonst 4), praxisnahe Lektion ohne
  Simulation, Lektion ohne „Prüfungsrelevant“-Hinweis, sehr kurze Lektion.

**Noch offen:** Die Erkennung der Nummern an echten Prüfungsleitfäden prüfen (hier kein Netz). Der Prüfungsleitfaden
als Hauptquelle wird nicht mehr gekürzt; die übrigen Quellen werden bei 60.000 Zeichen gekappt und das wird gemeldet.

## Schritt 3: Mit KI nachbessern ✅

In der Werkstatt gibt es bei jeder Lektion und jeder Frage „Mit KI nachbessern“, bei den Fragen eines Lernziels „Fragen
ergänzen“ und im Qualitätsbericht bei passenden Punkten einen KI-Knopf (öffnet die Lektion mit vorgewählter Aktion).

- **Aktionen je Lektion:** lebendiger schreiben, ausführlicher erklären, Praxisbeispiel ergänzen, Simulation ergänzen (mit
  Textverweisen), „Was damit möglich ist“ ergänzen, Prüfungshinweis ergänzen, gemeldeten Fehler beheben (nur bei offenen
  Meldungen), eigene Anweisung. Zu jeder Aktion kann eine zusätzliche Anweisung mitgegeben werden.
- **Je Frage:** verbessern, gemeldeten Fehler beheben, eigene Anweisung (Optionen behalten IDs und Plätze, die KI darf
  die richtige Antwort ändern). **Je Lernziel:** 1–10 neue Fragen, einzeln an- oder abwählbar.
- **Fehlendes Lernziel** (aus der Abdeckungsprüfung): Domain wählen (vorgeschlagen nach der ersten Stelle der Nummer),
  die KI entwirft Titel, Beschreibung, 1–3 Lektionen und Fragen; Titel und Beschreibung sind anpassbar.
- **Immer als Vorschlag:** Vergleich (Unterschied und Vorschau), dann übernehmen, anpassen (Vorschlag ins Formular,
  speichern wie gewohnt) oder verwerfen. Fehlerhafte Lernblöcke: ein Korrekturversuch, sonst repariert und gekennzeichnet.
- **Vorher:** Kostenschätzung je Aktion (ohne KI-Aufruf), danach die tatsächlichen Kosten und die Summe am Kurs
  (`certifications.ai_edit_cost_usd`, auch verworfene Vorschläge). Das KI-Budget (`GEMINI_BUDGET_USD`) gilt auch hier.
- **Sicherheit:** vor der ersten übernommenen KI-Änderung ein automatisch gemerkter Kursstand („Automatisch vor
  KI-Überarbeitung …“, höchstens einer je 6 Stunden); Revisionen mit Herkunft „KI“ und der Aktion; gemeldete Fehler
  lassen sich beim Übernehmen als erledigt schließen.
- **Andere Sprache:** die KI schreibt in der Kurssprache. Ist der Inhalt schon übersetzt, wird die andere Sprache als
  veraltet markiert (`translation_outdated` an Lektion bzw. Frage) und der Übersetzungslauf startet (bei
  `COURSE_AUTO_TRANSLATE=0` nicht); bis dahin sehen Lernende die bisherige Übersetzung. Läuft schon eine Übersetzung,
  folgt ihr ein zweiter Lauf.

Offen: mit echter KI ausprobieren (hier kein Zugang); Prompts liegen in `lib/server/course-editor/ai-prompt.ts`.

## Schritt 4: Kursbeschreibung ✅

Auf `/cert/[slug]` steht oben „Über diesen Kurs“ (ausgeklappt, solange noch nichts gelernt wurde, sonst eingeklappt):
worum es geht, das kannst du danach, das bringt dir das, wo das Wissen unverzichtbar ist (Situationen mit Begründung), für
wen, Vorkenntnisse, so lernst du hier. Umfang (Lektionen, Simulationen, Fragen, Lernzeit) wird live gezählt, nicht
gespeichert. Katalogkacheln zeigen die Kurzfassung.

- `certifications.overview` (zweisprachig, zod-geprüft in `lib/course-overview.ts`).
- Neue Kurse: nach der Veröffentlichung erzeugt die KI die Beschreibung aus Themenbereichen und Lernzielen (ohne erfundene
  Zahlen, ohne Bestehens- oder Gehaltsversprechen); Fehler lassen den Kurs unberührt. Der Übersetzungslauf übersetzt sie mit.
- Werkstatt → „Kursbeschreibung“: manuell bearbeiten, „Mit KI erzeugen“ liefert nur einen Entwurf im Formular (gespeichert
  wird erst mit „Speichern“), Vorschau wie bei Lernenden.
- Bestehende Kurse: `npm run courses:overviews -- <slug|--all>` (nur Kurse ohne Beschreibung).

## Schritt 5: Lernablauf Lesen → Simulation → Auswertung ✅

- **Schrittleiste** über jeder Lektion mit Simulation und Auswertung: Verstehen, Anwenden („x von y gelöst“), Auswerten;
  jeder Schritt springt an die Stelle, der Stand kommt aus den gelösten Simulationen und dem Lektionsfortschritt.
- **Text während der Simulation:** Knopf „Zum Text“ in jeder Simulation öffnet den Lektionstext (ohne die Simulationen) in
  einem Seitenblatt, auch auf dem Handy; die Simulation behält ihren Stand.
- **Auswertung:** nach dem Lösen verweist die Simulation auf Textstellen („Nochmal nachlesen“, Feld `review` mit 1–3
  Überschriften der Lektion; unbekannte Überschriften werden nicht gezeigt). Ein Klick öffnet den Text an dieser Stelle.
  Neue Kurse bekommen `review` von der KI, ältere Simulationen zeigen die Auswertung ohne Verweise.
- **Gespeichert** (`simulation_results`, im Datenexport, fällt mit dem Konto weg): je Person, Lektion und Simulation
  Bestwert (wenigste Hilfen), Anzahl der Lösungen; die Schrittleiste zeigt den Stand auch nach dem Neuladen.
- **Wiederholung:** wer eine Simulation nur mit mindestens zwei Hilfen (Tipp, Lösung, Fehlversuche) löst, bekommt die
  bestehenden Wiederholungsfragen des Lernziels sofort fällig (es entstehen keine neuen Einträge) und einen Hinweis.

**Übersicht je Kurs** (`/cert/[slug]/simulations`, Link „Simulationen“ auf der Kursseite, wenn es welche gibt): alle
Simulationen nach Domain mit Typ, Lektion und eigenem Stand (offen, mit Mühe gelöst, gelöst), Filter, Fortschrittsbalken
und „Nächste offene“. Ein Klick springt direkt zur Simulation in der Lektion (Sprungmarke `#simulation-n`).

Nachgetragen: Übungssitzungen zeigen nach den Fragen eine Praxisaufgabe (Simulation aus denselben Lernzielen, ungelöst
oder mühsam gelöst); im Offline-Reader gelöste Simulationen gehen über die Sync-Warteschlange.

## Schritt 6: Lebendigere Texte bei neuen Kursen ✅

Gilt für neu erzeugte Kurse (bestehende Lektionen bleiben, die Werkstatt-KI aus Schritt 3 kann sie später umschreiben).

- Stilregeln im Inhaltsprompt (`LIVELY_STYLE_PROMPT`): du-Form, erst Problem dann Lösung, jedes Konzept mit Praxisbeispiel,
  Beispiele passend zum Kursthema (nicht IT-lastig), kein Werbeton.
- Neuer Hinweisblock `> [!POSSIBLE]` („Was damit möglich ist“) je Lektion, ehrlich und ohne Karriere- oder Gehaltsversprechen;
  in Validierung, Darstellung (de/en) und Backfill-Erkennung bekannt.
- Durchgehende Geschichte: je Kurs eine fiktive Firma und Person, abgeleitet aus dem Kurstitel (daher bleibt der Systemprompt
  für alle Lernziele gleich und cache-freundlich); die Branche wählt die KI passend zum Thema. Nicht bei Firmenkursen und
  Stichwortlisten, dort zählen die echten Unterlagen.
- Simulationen enthalten mindestens eine „Was passiert, wenn …?“-Stelle (plausible Fehlentscheidung samt Folge).

## Schritt 7: Anonyme Abschluss-Statistik ✅

Für Präsentationen: wie viele Menschen einen Kurs abgeschlossen haben, in welcher Zeit, je Woche/Monat/Jahr.

- „Abgeschlossen“ = Abschlussprüfung erstmals bestanden (Punkte ≥ Bestehensgrenze des Kurses in Prozent, sonst 70 %;
  `exam_attempts.passed` wird jetzt gesetzt). „Zertifikat ausgestellt“ (Prüfungsplaner „bestanden“ oder eingetragenes
  Zertifikat zu einem Kurs, in dem die Person vorher gelernt hat) wird gesondert gezählt.
- `course_completion_events`: ohne Bezug zur Person, nur Kurs, Tag, Dauer in Kalendertagen und aktive Lernzeit.
- Aktive Lernzeit (`learning_time`, persönlich, im Export): gemessen auf allen Kursseiten, nur bei sichtbarem Tab und
  Aktivität in den letzten 2 Minuten.
- `/admin/stats`: Kennzahlen, Säulendiagramm je Woche/Monat/Jahr, Tabelle je Kurs mit Median, Mitte 50 % und
  Durchschnitt (Dauerwerte erst ab 5 Abschlüssen), CSV-Export. Nachtrag aus vorhandenen Daten:
  `npm run stats:backfill-completions` (ohne aktive Lernzeit).

## Schritt 8: Nutzerprofil und Skills ✅

Auf `/profile` („Beruf und Skills“): aktuelle Stelle, was man dort macht, Bundesland, „Womit hattest du schon viel zu
tun?“, Skills mit Stufe (Grundlagen/sicher/Experte) und Tools zusätzlich mit Aktualität (aktueller Stand, 1–3 Jahre her,
länger her). Einstellung im Konto: bestandene Abschlussprüfungen und Zertifikate kommen automatisch als Skill dazu
(Kursname, Stufe „sicher“, mit Herkunft, löschbar; beim Einschalten werden bisherige Abschlüsse nachgetragen; selbst
eingetragene Skills werden nie überschrieben). Freiwillig, im Datenexport, fällt mit dem Konto weg, für Firmen nicht
sichtbar. Berufscode (KldB) für die Gehaltsdaten folgt mit Schritt 9.

## Schritt 9: Karrierepfade und Gehalt ✅

- **Gehaltsdaten** (`/admin/salary`): CSV der Entgeltstatistik der Bundesagentur für Arbeit hochladen (die BA bietet keine
  offizielle Schnittstelle). Der Browser findet die Kopfzeile, schlägt die Spalten vor und zeigt eine Vorschau
  (importiert/übersprungen mit Gründen, z. B. Stadt, unterdrückter Wert); jede Zuordnung ist änderbar. Je Beruf (KldB 2010),
  Anforderungsniveau und Region: Median und Quartile. Es gilt immer der Datensatz mit dem jüngsten Stichtag; Quelle und
  Stichtag stehen bei jeder Gehaltsangabe. Werte kommen nur aus der Tabelle, nie von der KI.
- **Karrierepfade** (`/career`, „Karriere“ im Menü): auf Abruf 3–5 Stellen aus Profil, Skills, Abschlüssen und dem
  Katalog (KI). „Mehr Informationen“: was die Stelle macht, Aufgaben, was fehlt, Kurse aus dem Katalog in Reihenfolge
  (nur echte Katalogkurse, Abgeschlossenes abgehakt, fehlende Themen als „noch kein Kurs“), Gehalt für Deutschland und das
  Bundesland aus dem Profil (alle Bundesländer auf Klick). Ändern sich Profil, Skills oder Abschlüsse, bietet die Seite
  „Pfade aktualisieren“ an; höchstens 5 Berechnungen pro Person und Tag. Der Kursstand ist immer aktuell.
- Beruf ohne genauen Treffer in der Tabelle: nächst gröbere Berufsgruppe (als „verwandt“ gekennzeichnet).

**Offen:** Pfade mit echter KI ausprobieren (hier kein Zugang). Der Import einer echten BA-Tabelle ist vorerst
zurückgestellt; ohne importierte Daten bleibt das Gehalt ausgeblendet.

## Kleinere offene Punkte (erledigt)

- **Prüfungsleitfaden nie kürzen:** die Quelle mit den meisten nummerierten Lernzielen gilt als Leitfaden und wird bis
  400.000 Zeichen gelesen (`COURSE_GEN_PRIMARY_SOURCE_MAX_CHARS`), die übrigen weiter bis 60.000; der Qualitätsbericht
  nennt sie.
- **Bestehende Lektionen nachrüsten:** `npm run lessons:possible -- <slug|--all> [--dry-run] [--limit N]` ergänzt per KI
  „Was damit möglich ist“ und die Textverweise der Simulationen (gemerkter Stand vorher, Herkunft „KI“, danach Übersetzung).
- **Versionsüberwachung:** „Quelle prüfen“ vergleicht mit dem Stand bei der Kurserstellung (Fingerabdruck, erkannte
  Prüfungsversion wie „SY0-701“, neue und entfallene Lernziele) und setzt `lastVerifiedDate`; der Bericht zeigt die
  Änderung und lässt den neuen Stand bestätigen. Für regelmäßige Läufe: `npm run courses:check-sources -- --all`
  (Exit-Code 2 bei Änderungen, z. B. wöchentlich per Cron).
- **Sehr große Kurse:** mehr als 80 Lernziele werden automatisch in Teile aufgeteilt („… (Teil 1 von 2)“), die
  nacheinander erzeugt werden (Details in `course_generation.md`).
- **Fragenvielfalt:** Antwortoptionen stabil gemischt, umformulierte Dubletten erkannt, Prompt-Regeln für Typen und
  Frageformen, Hinweis im Bericht bei nur einem Fragetyp.
- Die Diagnoseseite `viewport-check.html` ist entfernt.
