# Entwicklungs-Roadmap: Fachliche Prüfer und Freigabe

Technischer Umsetzungsplan für sichtbare, nachvollziehbare Expertenfreigaben von Kursen. Das Dokument ist für die Umsetzung durch einen Coding-Agenten geschrieben und setzt kein Vorwissen aus anderen Dokumenten voraus. Stand: 23.10.2026.

---

## Kontext

Kurse entstehen per KI aus offiziellen Quellen. Fachexperten sollen sie prüfen und freigeben; die Freigabe ist das Qualitätssiegel der Plattform („geprüft von …, Stand …“). Das wichtigste Verkaufsargument gegenüber Käufern ist die Antwort auf die Frage: „Wer garantiert, dass das stimmt?“

Heute vorhanden:

- `certifications.approvedByName` (Freitext, auch ohne Konto) und `certifications.approvedAt`; gesetzt beim Freigeben in `lib/server/admin/course-requests.ts` (Admin) bzw. `lib/server/internal-courses/service.ts` (interne Lernpfade, Name des Firmen-Prüfers). Angezeigt nur im Firmenbereich (`components/InternalCoursesPanel.tsx`).
- `certifications.catalogStatus`: `draft` → `in_review` → `approved`.
- Rollen: `users.role` = `learner` | `admin`; eine Prüfer-Rolle gibt es nicht.
- Kurs-Werkstatt (`lib/server/course-editor/`) mit Snapshots und `fingerprint()` je Abschnitt und Frage. Änderungen nach einer Freigabe werden nicht erkannt; der Name des Prüfers bleibt stehen.
- Meldungen von Lernenden (`content_reports`, `ContentReportQueue`) und auffällige Varianten (`lib/server/variants/outliers.ts`).
- Offener Punkt in `docs/ROADMAP-TECHNISCH.md`: „Freigabe-Metadaten pro Inhalt: Name, Datum, Version“, „Versionierung von Kursen“, „Rolle Externer Prüfer“. Diese Roadmap setzt sie um.

**Hinweis:** Vor Änderungen an Next.js-Routen die passende Anleitung in `node_modules/next/dist/docs/` lesen (siehe `AGENTS.md`).

## Architektur-Regeln (verbindlich)

1. **Eine Freigabe gilt für einen Inhaltsstand, nicht für einen Kurs auf Dauer.** Ändert sich der Inhalt nach der Freigabe, ist das sichtbar, bis erneut freigegeben wurde.
2. **KI gibt nie frei.** Freigeben kann nur ein Mensch mit Prüfer-Rolle oder ein Admin (Letzteres nur für Altbestände und Notfälle, protokolliert).
3. **Öffentlich nur bei allgemeinen Kursen.** Prüfer interner Lernpfade (Mentoren der Firma) erscheinen nur innerhalb der Firma, nie öffentlich, und brauchen kein Profil.
4. **Nachweise verlinken, nicht hochladen.** Zertifikate werden über die offizielle Prüfseite des Herstellers belegt, keine Scans oder PDFs.
5. **Einwilligung je Feld.** Jedes öffentliche Profilfeld braucht die Einwilligung der Person; sie kann ihr Profil selbst pflegen und jederzeit zurückziehen.
6. **Qualitätskennzahlen je Prüfer sind intern.** Sie sind nur für Admins sichtbar, nie öffentlich und nie für andere Prüfer.
7. **Zweisprachig (de/en)** wie der Rest der Plattform.

## Platzhalter-Entscheidungen

| Punkt | Standardwert |
|---|---|
| Profil-URL | `/experts/<slug>` (öffentlich, ohne Anmeldung) |
| Pflichtfelder Profil | Vorname, Name, Land, mind. 1 Zertifikat oder Berufserfahrung |
| Optionale Felder | Region (z. B. Bundesland), Foto, Kurzvorstellung, LinkedIn |
| Darstellung der Region | „Bayern, Deutschland“ (international lesbar) |
| Erinnerung vor Ablauf eines Zertifikats | 60 Tage vorher |
| Änderungen nach Freigabe | Kurs bleibt sichtbar, Hinweis „X Änderungen seit Prüfung“; Neufreigabe nötig für das Siegel |
| Kleinänderungen ohne Neufreigabe | Tippfehler/Formatierung, vom Admin als „redaktionell“ markiert, im Protokoll sichtbar |
| Probe-Review: Umfang | 15–20 Fragen, davon 4–5 mit eingebauten Fehlern |
| Probe-Review: bestanden | ≥ 4 von 5 Fehlern gefunden **und** ≤ 2 Fehlalarme |
| Zweitprüfung (Stichprobe) | 5 % der Fragen je Freigabe, mind. 10 Fragen |
| Angezeigter Text nach Rückzug des Profils | „Fachlich geprüft von einem externen Experten · Stand …“ |

---

## Phase 1 – Prüfer-Konto und Rolle (Priorität: hoch)

- [x] Rolle `reviewer` in `UserRole` ergänzen (Migration, Typen, Guards in `lib/server/auth-guards.ts`).
- [x] Einladung durch Admin per E-Mail (vorhandene Einladungs- und Verifizierungslogik wiederverwenden).
- [x] Zuweisung je Kurs: Tabelle `course_reviewers` (certification_id, user_id, assigned_at, assigned_by). Nur **allgemeine** Kurse zuweisbar, nie interne Lernpfade einer Firma.
- [x] Prüfer sieht in der Werkstatt nur zugewiesene Kurse: lesen, kommentieren, Fragen als fehlerhaft markieren, freigeben. Keine Kursgenerierung, keine KI-Kosten, kein Zugriff auf Lernende oder Firmen. (eigene, rein lesende Prüfer-Ansicht unter `/reviewer`; die Admin-Werkstatt bleibt Admins vorbehalten)
- [x] Prüfer-Kommentare je Abschnitt/Frage (vorhandene `content_reports` mit Quelle `reviewer` erweitern oder eigene Tabelle), damit Admins sie abarbeiten können. (eigene Tabelle `reviewer_comments`)

**Akzeptanzkriterium:** Ein eingeladener Prüfer sieht genau seine zugewiesenen allgemeinen Kurse; Tests belegen, dass er weder interne Lernpfade noch fremde Kurse noch Lerndaten abrufen kann.

---

## Phase 2 – Freigabe an den Inhaltsstand binden (Priorität: hoch)

- [x] Tabelle `course_approvals` (append-only): id, certification_id, reviewer_user_id (oder `null` für Altbestand), reviewer_display_name (Kopie zum Zeitpunkt), content_hash, version_label (z. B. „2.1“), scope (`course` | Liste von Domains), approved_at, note.
- [x] `content_hash`: deterministischer Hash über alle Abschnitts- und Frage-Fingerprints des Kurses (`fingerprint()` aus `lib/server/course-editor/snapshots.ts`), inkl. aktiver Varianten (`item_variant`).
- [x] Freigabe-Ablauf: Prüfer bzw. Admin klickt „Freigeben“ → Hash wird berechnet und gespeichert, `catalogStatus = approved`. Die Freigabe enthält eine Bestätigung: „Ich habe die Inhalte dieser Version fachlich geprüft.“
- [x] Änderungserkennung: Weicht der aktuelle Hash von der letzten Freigabe ab, Status „geändert seit Prüfung“ mit Liste der geänderten Abschnitte/Fragen (Diff über Fingerprints). Neue Varianten aus der Generierung zählen als Änderung.
- [x] Redaktionelle Änderungen: Admin kann eine Änderung als „redaktionell“ markieren (protokolliert in `admin_audit` o. ä.); sie lösen keinen Hinweis aus, erscheinen aber im Protokoll.
- [x] Neufreigabe zeigt dem Prüfer nur den Diff seit seiner letzten Freigabe.
- [x] Migration Altbestand: vorhandene `approvedByName`/`approvedAt` als `course_approvals`-Eintrag ohne Konto übernehmen (Hash zum Migrationszeitpunkt). Die Felder in `certifications` bleiben vorerst als Lesezugriff erhalten und werden später entfernt.

**Akzeptanzkriterium:** Nach einer Freigabe und anschließender Änderung einer Frage in der Werkstatt zeigt der Kurs „1 Änderung seit Prüfung“; nach Neufreigabe verschwindet der Hinweis. Ein Test belegt, dass derselbe Inhalt immer denselben Hash ergibt.

---

## Phase 3 – Expertenprofil (Priorität: hoch)

- [x] Tabelle `reviewer_profiles`: user_id, slug, first_name, last_name, country, region (optional), photo (optional), bio (de/en, optional), linkedin_url (optional), published (bool), consent je Feld (jsonb mit Zeitstempel), updated_at.
- [x] Tabelle `reviewer_experience`: Einträge mit Typ (`job` | `project` | `teaching`), Titel, Organisation (optional), Zeitraum, Kurzbeschreibung.
- [x] Tabelle `reviewer_certifications`: Hersteller, Zertifikatsname, erworben am, gültig bis (optional), verification_url, verified_at, verified_by (Admin). _(Foto fehlt noch: braucht Dateispeicher.)_
- [x] Nachweis: nur Links auf offizielle Prüfseiten bzw. digitale Abzeichen des Herstellers. Admin prüft den Link und setzt `verified_at`; erst dann erscheint „Nachweis geprüft am …“. Keine Datei-Uploads.
- [x] Self-Service für Prüfer: Profil bearbeiten, Felder einzeln veröffentlichen, Vorschau, Profil zurückziehen. Rückzug entfernt das Profil sofort öffentlich; Kurse zeigen dann den neutralen Text (siehe Platzhalter), die interne Freigabe bleibt gültig.
- [x] Öffentliche Seite `/experts/<slug>`: Name, Foto, Region/Land, Kurzvorstellung, Berufserfahrung, Zertifikate mit Gültigkeit und Nachweis-Link, Liste der freigegebenen Kurse (mit Version und Datum). Ohne Anmeldung erreichbar, mit sauberen Metadaten (Titel, Beschreibung), indexierbar nur bei Einwilligung.
- [x] Zertifikats-Ablauf: abgelaufene Zertifikate werden als „abgelaufen“ markiert statt versteckt; Erinnerung an Prüfer und Admin 60 Tage vorher (vorhandene E-Mail-Logik).
- [x] Datenexport und Kontolöschung des Prüfers umfassen Profil, Erfahrung und Zertifikate. Nach Löschung oder Rückzug bleibt am Kurs der neutrale Text.

**Akzeptanzkriterium:** Ein Prüfer legt sein Profil an, veröffentlicht nur ausgewählte Felder, und die öffentliche Seite zeigt genau diese; nach Rückzug ist die Seite nicht mehr erreichbar und die Kurse zeigen den neutralen Text.

---

## Phase 4 – Siegel am Kurs (Priorität: hoch)

- [x] Anzeige auf Kursseite, Kursübersicht und im Katalog _(Kursseite und Katalog; Dashboard-Kachel offen. Der Katalog zeigt den Stand der Prüfung ohne Änderungszähler.)_: „✓ Fachlich geprüft von **Vorname Name** · Version 2.1 · Stand 14.10.2026 → Profil“.
- [x] Bei mehreren Prüfern _(alle Prüfer desselben Inhaltsstands; ein Geltungsbereich je Domain fehlt, weil Freigaben bisher den ganzen Kurs betreffen)_ (z. B. je Domain) alle nennen, mit Geltungsbereich.
- [x] Bei „geändert seit Prüfung“: Siegel mit Zusatz „X Änderungen seit der Prüfung“, Details per Klick. Kein Siegel ohne Freigabe.
- [x] Interne Lernpfade: „Freigegeben von <Name>, <Datum>“ nur innerhalb der Firma (wie heute), kein Profil-Link.
- [x] Siegel auch im Offline-Paket. _(Auf Abschlussbescheinigungen noch nicht: es gibt noch keine Bescheinigung über den Kursabschluss.)_

**Akzeptanzkriterium:** Jeder freigegebene allgemeine Kurs zeigt Prüfer, Version und Datum; ein Kurs ohne Freigabe zeigt kein Siegel.

---

## Phase 5 – Probe-Review für neue Prüfer (Priorität: mittel)

Ziel: Prüfen, ob jemand gut **prüfen** kann, nicht nur Fragen beantworten. Kein generiertes Abschlussquiz: Fehlerhafte KI-Fragen würden echte Experten benachteiligen.

- [x] Probe-Sets je Themengebiet (Admin-Bereich) _(Fragen schreibt der Admin selbst; KI-Vorschläge dafür fehlen noch.)_: 15–20 Fragen, davon 4–5 mit **von Menschen festgelegten** Fehlern. Fehlertypen: falscher Lösungsschlüssel, zwei vertretbare Antworten, veralteter Prüfungsstand, irreführende Formulierung, Erklärung widerspricht der Lösung. Fragen dürfen per KI vorgeschlagen werden, die Fehler und der Lösungsschlüssel werden von einem Admin festgelegt und geprüft.
- [x] Kandidat prüft im normalen Prüfer-Werkzeug _(eigene Seite `/reviewer/probe` im Prüfer-Bereich)_ (gleiche Oberfläche wie Phase 1) und markiert Fragen als fehlerhaft mit Begründung.
- [x] Auswertung regelbasiert _(zusätzliche Meldungen stehen in der Ergebnisansicht des Admins statt in der Werkstatt-Prüfliste)_: gefundene eingebaute Fehler, Fehlalarme; Bestehensregel siehe Platzhalter. Zusätzliche, nicht eingebaute Fehlermeldungen gehen in die Werkstatt-Prüfliste.
- [x] Ergebnis nur intern (Admin). Bestanden schaltet Freigaberechte und die Veröffentlichung des Profils frei.
- [x] Wiederholung frühestens nach 30 Tagen mit einem anderen Set.

**Akzeptanzkriterium:** Ein Kandidat, der 4 von 5 eingebauten Fehlern findet und höchstens 2 Fehlalarme hat, erhält Freigaberechte; einer mit 2 von 5 nicht.

---

## Phase 6 – Qualität im Betrieb (Priorität: mittel)

- [ ] Kennzahlen je Prüfer und Freigabe (nur Admin): Meldungen von Lernenden je 100 Fragen nach Freigabe, auffällige Varianten, Konzepte mit Häufung im Verstehens-Modus (`roadmap_didaktik.md`, Phase 9), jeweils im Vergleich zum Durchschnitt.
- [ ] Zweitprüfung als Stichprobe: Bei jeder Freigabe wird ein Anteil der Fragen (siehe Platzhalter) einem zweiten Prüfer vorgelegt; Abweichungen landen beim Admin.
- [ ] Hinweis an Admin, wenn ein Prüfer deutlich über dem Durchschnitt liegt (Schwelle konfigurierbar); keine automatische Sanktion.
- [ ] Wiedervorlage: Bei neuer Prüfungsversion bzw. neuer Quellenausgabe (`supersedesSourceId`) werden betroffene Freigaben als „Prüfung empfohlen“ markiert.

**Akzeptanzkriterium:** Admins sehen je Prüfer die Kennzahlen seit der jeweiligen Freigabe; Prüfer und Öffentlichkeit sehen sie nicht.

---

## Phase 7 – Rechtliches und Organisation (begleitend, kein Code)

- [ ] Expertenvertrag: Nutzungsrechte, Verschwiegenheit, Haftung für fachliche Fehler, Einwilligung zur Veröffentlichung des Profils (je Feld), Widerruf.
- [ ] Datenschutzerklärung um öffentliche Prüferprofile ergänzen.
- [ ] Hinweistext am Siegel: „Geprüft“ bezieht sich auf die fachliche Richtigkeit zum angegebenen Stand, keine Garantie für das Bestehen der Prüfung.
- [ ] Marken: Herstellerlogos nur gemäß deren Richtlinien verwenden; im Zweifel nur Text.

---

## Reihenfolge

1. Phase 2 (Versionsbindung) und Phase 1 (Rolle): Fundament, bevor der erste externe Experte freigibt.
2. Phase 3 und 4 (Profil und Siegel): das sichtbare Verkaufsargument.
3. Phase 5 (Probe-Review), sobald mehr als ein, zwei Experten gewonnen werden.
4. Phase 6 nach den ersten freigegebenen Kursen mit Nutzern.
5. Phase 7 parallel, spätestens vor der ersten Veröffentlichung eines Profils.
