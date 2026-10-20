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

## Schritt 2: Abdeckungs- und Qualitätsbericht

- Offizielle Lernziel-Nummern aus dem Prüfungsleitfaden („1.1“, „Task Statement 2.3“) gegen den Kurs abgleichen;
  fehlende anzeigen und vor der Veröffentlichung bestätigen lassen.
- Prüfungsleitfaden als Hauptquelle nie kürzen; gekürzte andere Quellen sichtbar melden (heute still, `truncated`).
- Qualitätsbericht je Kurs: Lernziele offiziell/im Kurs, Lektionen, Fragen, Simulationen je Domain, Quellenstand.
- Liste „Verbesserungspotenzial“ in der Werkstatt: Meldungen, oft falsch beantwortete Fragen, Lücken, Lektionen ohne
  Simulation oder Praxisbeispiel.

## Schritt 3: Mit KI nachbessern

- Aktionen je Lektion/Lernziel: lebendiger schreiben, Simulation ergänzen, Praxisbeispiel ergänzen, Fragen ergänzen
  oder verbessern, gemeldeten Fehler beheben, fehlendes Lernziel ergänzen; freie Anweisung.
- Immer als Vorschlag mit Vergleich: übernehmen, anpassen oder verwerfen. Vorher automatischer gemerkter Stand,
  Kostenschätzung, Revisionen mit Herkunft „KI“.
- Andere Sprache nach einer Änderung als veraltet markieren und über den Übersetzungslauf nachziehen.

## Schritt 4: Kursbeschreibung

Vor dem Start: Worum es geht, was man danach kann, was es bringt, wo der Kurs unverzichtbar ist (mit Begründung),
Voraussetzungen und Aufwand, wie man hier lernt. Generiert aus Blueprint und Quellen, in der Werkstatt bearbeitbar,
übersetzt, Backfill für bestehende Kurse.

## Schritt 5: Lernablauf Lesen → Simulation → Auswertung

Schrittleiste je Lektion (Verstehen, Anwenden, Auswerten); während der Simulation bleibt der Text erreichbar
(Desktop daneben, mobil als Seitenblatt); Auswertung mit Hinweis auf die passenden Textstellen; Fortschritt der
Simulationen speichern und in die Wiederholung aufnehmen.

## Schritt 6: Lebendigere Texte bei neuen Kursen

Prompt-Regeln (du-Form, erst Problem dann Lösung, jedes Konzept mit Praxisbeispiel), Block „Was damit möglich ist“,
durchgehende Geschichte je Kurs (fiktive Firma), „Was passiert, wenn…“-Experimente in Simulationen.

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

**Offen:** Die erste echte BA-Tabelle prüfen (Spaltenstruktur); Pfade mit echter KI ausprobieren (hier kein Zugang).
