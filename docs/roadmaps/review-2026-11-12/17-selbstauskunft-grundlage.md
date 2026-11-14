# Aufgabe 17: Grundlage für freiwillige Selbstauskünfte

**Herkunft:** Phase 5 „Menschliche Faktoren, Stufe 2“ der Review-Roadmap (Infrastruktur, Schalter, Fragemüdigkeit)
**Voraussetzung:** Aufgabe 06 und Phase 4 ausgewertet (siehe Reihenfolge der Roadmap)
**Priorität:** erst, wenn Phase 4 zeigt, welche Fragen das Verhalten nicht beantwortet

## Problem
Die App hat noch keinen Ort für freiwillige Selbstauskünfte. Ohne ihn lassen sich die Fragen aus Aufgabe 18 nicht speichern.

## Aufgaben
- [ ] Tabelle `self_reports` anlegen: Person, Art, Wert, Bezug, Zeitpunkt.
- [ ] Schnittstelle für Speichern und Lesen.
- [ ] Schalter je Art (einzeln abschaltbar), unter „Wie ich lerne“.
- [ ] Regel gegen Fragemüdigkeit: Wird eine Frage dreimal in Folge übersprungen, pausiert sie 30 Tage. Muster wie `user_checkin_flags`.
- [ ] Höchstens eine Frage je Session.
- [ ] Datenexport und Datenschutzerklärung um `self_reports` ergänzen.

## Akzeptanzkriterium
Eine Selbstauskunft lässt sich speichern, abschalten und exportieren. Nach dreimaligem Überspringen erscheint die Frage 30 Tage nicht.

## Bewusst nicht aufgenommen (aus der Roadmap)
Lerntypen (visuell, auditiv), weil die Wirkung nicht belegt ist. Kamera, Mikrofon, Blickverfolgung und Tippverhalten zur Erkennung von Personen. Schlafdauer, Stress und Stimmung als eigene Angaben.
