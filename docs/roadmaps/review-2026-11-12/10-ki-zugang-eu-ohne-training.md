# Aufgabe 10: KI-Zugang ohne Training auf Kundendaten

**Herkunft:** Phase 3 der Review-Roadmap (`../roadmap_review_messung.md`), dort schon in `ROADMAP-TECHNISCH.md`, Phase 3 geführt
**Priorität:** vor dem Pilot mit Firmenkonten
**Ort:** `lib/server/career/service.ts:66` (Profil und Skills an Gemini), `lib/server/` KI-Aufrufe allgemein

## Problem
Profil und Skills gehen für die Karrierepfade an den KI-Dienst. Ob Kundendaten dort zum Training genutzt werden und wo sie verarbeitet werden, ist im Code nicht festgelegt. Es hängt an den Vertragsbedingungen des Anbieters und an der Konfiguration.

## Aufgaben
- [ ] Vertragsbedingungen des Anbieters prüfen: kein Training auf Kundendaten.
- [ ] Möglichkeit prüfen, die Verarbeitung in der EU zu halten.
- [ ] Ergebnis in der Datenschutzerklärung (Aufgabe 07) festhalten.
- [ ] Nur die für die Karrierepfade nötigen Felder senden (Datenminimierung), Umfang im Code prüfen.

## Akzeptanzkriterium
Die Datenschutzerklärung nennt Anbieter, Verarbeitungsort und Trainingsausschluss. Der Code sendet nur die in der Erklärung genannten Felder.

## Hinweis
Diese Aufgabe ist eine rechtliche und vertragliche Prüfung. Ich habe sie nicht am Code bewertet.
