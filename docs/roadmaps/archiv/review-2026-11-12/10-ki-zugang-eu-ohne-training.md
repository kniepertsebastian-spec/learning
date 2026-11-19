# Aufgabe 10: KI-Zugang ohne Training auf Kundendaten

**Herkunft:** Phase 3 der Review-Roadmap (`../roadmap_review_messung.md`), dort schon in `ROADMAP-TECHNISCH.md`, Phase 3 geführt
**Priorität:** vor dem Pilot mit Firmenkonten
**Ort:** `lib/server/career/service.ts:66` (Profil und Skills an Gemini), `lib/server/` KI-Aufrufe allgemein

## Problem
Profil und Skills gehen für die Karrierepfade an den KI-Dienst. Ob Kundendaten dort zum Training genutzt werden und wo sie verarbeitet werden, ist im Code nicht festgelegt. Es hängt an den Vertragsbedingungen des Anbieters und an der Konfiguration.

## Aufgaben
- [ ] Vertragsbedingungen des Anbieters prüfen: kein Training auf Kundendaten.
- [ ] Möglichkeit prüfen, die Verarbeitung in der EU zu halten.
- [x] Ergebnis (soweit es im Code liegt, siehe unten) in der Datenschutzerklärung (Aufgabe 07) festhalten.
- [x] Nur die für die Karrierepfade nötigen Felder senden (Datenminimierung), Umfang im Code prüfen.

## Akzeptanzkriterium
Die Datenschutzerklärung nennt Anbieter, Verarbeitungsort und Trainingsausschluss. Der Code sendet nur die in der Erklärung genannten Felder.

## Hinweis
Diese Aufgabe ist eine rechtliche und vertragliche Prüfung. Ich habe sie nicht am Code bewertet.

## Umsetzung (14.11.2026)
**Was im Code lag, ist erledigt. Die beiden Vertragsfragen (Training, EU) kann ich nicht beantworten und habe sie bewusst nicht beantwortet.**

- **Datenminimierung (erledigt):** Bisher ging die ganze Eingabe der Karrierepfade als JSON an Gemini, auch das Bundesland (`profile.state`). Der Prompt braucht es nicht, es dient nur der lokalen Anzeige der Gehaltsregion. `careerModelInput()` (`lib/server/career/service.ts`) entfernt es jetzt vor dem Aufruf; der Fingerabdruck der Eingabe (`inputHash`) bleibt gleich, bestehende Pfade gelten also weiter als aktuell. An die KI gehen: Berufsbezeichnung, Beschreibung, Schwerpunkte, Zielrolle, Skills (Art, Name, Stufe, Aktualität), abgeschlossene Kurse (nur IDs), Zertifikatstitel, die Sprache, der Katalog der freigegebenen Kurse und öffentliche Berufshinweise. Name, E-Mail und Kennungen der Person gehen nicht mit. Tests in `lib/server/career/service.test.ts` legen die Feldliste fest.
- **Andere KI-Aufrufe:** Ich habe alle Module mit Gemini-Aufrufen (`lib/ai`, Kurserstellung und -übersetzung, Lektionen, Varianten, Voraussetzungen, Begründungen, Merkzettel, Bildbeschreibung, Konzept-Tagging, Kurs-Editor) auf Zugriffe auf Profil-, Konto- und Lerntabellen durchsucht: keines schickt Angaben zu einer lernenden Person. Der einzige Treffer ist eine Zählung richtiger Antworten je Frage im Kurs-Editor (keine Personenangabe). Das ist eine Stichwortsuche, kein Beweis. Firmendokumente und Screenshots, die Firmen hochladen, gehen an Gemini; sie gehören der Firma.
- **Datenschutzerklärung (erledigt):** Die Seite nennt Anbieter und gesendete Felder (Eintrag „Berufsprofil“) und hat den Abschnitt „KI-Dienst“. **Verarbeitungsort und Trainingsausschluss** stehen dort nur, wenn der Betreiber sie über `LEGAL_AI_STATEMENT` einträgt. Ohne den Wert zeigt die Seite einen sichtbaren Hinweis „noch nicht bestätigt“. Ich habe mir den Wortlaut nicht ausgedacht, weil er eine Vertragstatsache ist.
- **Offen (Betreiber, vertraglich):**
  1. Gelten für den verwendeten Zugang (`GEMINI_API_KEY`, Gemini API) Bedingungen, die ein Training auf Kundendaten ausschließen? Meine Annahme, die zu prüfen ist: Das hängt am Tarif des Kontos (bezahlt oder kostenlos) und an den aktuellen Bedingungen von Google. Bitte die Bedingungen des Kontos lesen, nicht mich.
  2. Verarbeitung in der EU: Der Code ruft die Gemini API mit einem API-Schlüssel auf (`lib/gemini.ts`), ohne Region. Eine feste Region würde in der Regel einen anderen Zugang erfordern (zum Beispiel Vertex AI mit europäischer Region und Dienstkonto statt API-Schlüssel). Das ist eine Änderung an Betrieb und Zugangsdaten und eine Entscheidung des Betreibers, die ich nicht nebenbei im Code treffe. Wenn gewünscht, als eigene Aufgabe aufnehmen.
  3. Ergebnis in `LEGAL_AI_STATEMENT` eintragen.
