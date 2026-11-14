# Aufgabe 17: Grundlage für freiwillige Selbstauskünfte

**Herkunft:** Phase 5 „Menschliche Faktoren, Stufe 2“ der Review-Roadmap (Infrastruktur, Schalter, Fragemüdigkeit)
**Voraussetzung:** Aufgabe 06 und Phase 4 ausgewertet (siehe Reihenfolge der Roadmap)
**Priorität:** erst, wenn Phase 4 zeigt, welche Fragen das Verhalten nicht beantwortet

## Problem
Die App hat noch keinen Ort für freiwillige Selbstauskünfte. Ohne ihn lassen sich die Fragen aus Aufgabe 18 nicht speichern.

## Aufgaben
- [x] Tabelle `self_reports` anlegen: Person, Art, Wert, Bezug, Zeitpunkt.
- [x] Schnittstelle für Speichern und Lesen.
- [x] Schalter je Art (einzeln abschaltbar), unter „Wie ich lerne“.
- [x] Regel gegen Fragemüdigkeit: Wird eine Frage dreimal in Folge übersprungen, pausiert sie 30 Tage. Muster wie `user_checkin_flags`.
- [x] Höchstens eine Frage je Session.
- [x] Datenexport und Datenschutzerklärung um `self_reports` ergänzen.

## Akzeptanzkriterium
Eine Selbstauskunft lässt sich speichern, abschalten und exportieren. Nach dreimaligem Überspringen erscheint die Frage 30 Tage nicht.

## Bewusst nicht aufgenommen (aus der Roadmap)
Lerntypen (visuell, auditiv), weil die Wirkung nicht belegt ist. Kamera, Mikrofon, Blickverfolgung und Tippverhalten zur Erkennung von Personen. Schlafdauer, Stress und Stimmung als eigene Angaben.

## Umsetzung (14.11.2026)
- **Tabellen** (Migration `0122_self_reports`): `self_reports` (Person, Art, Wert, Bezug `ref_type`/`ref_id`, Sitzung, Zeitpunkt; Wert null = übersprungen) und `self_report_settings` (je Person und Art: `enabled`, `skip_streak`, `paused_until`), Muster wie `user_checkin_flags`. Arten (5.1 bis 5.6) und erlaubte Werte stehen in `lib/self-reports.ts`.
- **Schnittstelle:** `GET /api/self-reports` (Einstellungen und letzte Antworten), `POST /api/self-reports` (Antwort oder Überspringen), `PUT /api/self-reports/settings` (Art an/aus). Logik in `lib/server/self-reports/service.ts`; Aufgabe 18 prüft vor jeder Frage `canAskSelfReport`.
- **Schalter:** „Kurze Fragen an dich“ unter „Wie ich lerne“ (`components/SelfReportSettings.tsx`), eine Checkbox je Art, mit Hinweis bei Pause. Sichtbar, wenn das Flag `self_reports` an ist (standardmäßig an; ohne Fragen aus Aufgabe 18 wird noch nichts gefragt).
- **Fragemüdigkeit:** dreimal in Folge übersprungen → 30 Tage Pause, danach beginnt die Zählung neu; eine Antwort setzt den Zähler zurück. Höchstens eine Frage je Sitzung, auch wenn übersprungen (eindeutiger Index auf `session_id`, schützt auch bei gleichzeitigen Anfragen).
- **Export und Datenschutz:** `learning.selfReports` und `learning.selfReportSettings`, Eintrag „Freiwillige Selbstauskünfte“ in `lib/legal/privacy.ts`. `docs/MESSEN.md` beschreibt die Grundlage.
- **Tests:** `lib/self-reports.test.ts`, `lib/server/self-reports/self-reports.db.test.ts` (Akzeptanz: speichern, abschalten, exportieren, 30 Tage Pause; je Sitzung eine Frage; API).
