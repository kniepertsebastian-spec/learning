# Roadmap – Learning-Plattform

> **Ziel:** Lernfähigkeit sichtbar machen, Einarbeitung planbar machen – damit Unternehmen nach Potenzial einstellen und entwickeln statt nach Stichworten.
>
> **Einstieg:** IT-Onboarding mit Observability als erstem Lernpfad, für kleine und mittlere Systemhäuser und IT-Abteilungen.
>
> **Regel:** Eine Phase gilt erst als abgeschlossen, wenn ihr **Gate** erfüllt ist. Häkchen nur für Dinge, die gebaut *und* geprüft sind.

Technische Detailsicht mit Ist-Stand und Prüfnachweisen je Punkt: [ROADMAP-TECHNISCH.md](ROADMAP-TECHNISCH.md). Bei Abweichungen gilt der Prüfnachweis dort.

Konzept und Begründungen: Konzeptdokument „Learning-Plattform – Konzept & Vision“.
Gesprächsführung: „Gesprächsleitfaden Problem-Interviews“.

---

## Leitplanken (gelten für jede Phase)

Jede neue Funktion wird gegen diese Punkte geprüft. Was sie verletzt, wird nicht gebaut.

- [ ] **Kein Talent-Score, keine Vergleiche** zwischen Lernenden
- [ ] **Arbeitgeber sieht nur Status:** zugewiesen / in Arbeit / abgeschlossen, Datum, Frist – technisch erzwungen (API liefert nichts anderes)
- [ ] **Bestanden heißt beherrscht:** wechselnde Fragen, jedes Lernziel nachgewiesen
- [ ] **Bewertung regelbasiert, KI nur als Helfer** (Entwürfe, Hinweise) – nie Entscheidung über Menschen
- [ ] **Nachweise gehören dem Lernenden**, Wechselwünsche bleiben privat
- [ ] **Verstehen vor Generieren:** Begründung und Fehlersuche statt reiner Antworten
- [ ] **Inhalte nur mit menschlicher Freigabe** (Experte oder Mentor), mit Name, Datum, Version

---

## Phase 0 – Fundament und Sicherheit

**Ziel:** Der laufende Server ist sicher, Änderungen sind getestet, Daten sind gesichert.
**Zeitrahmen:** ca. 2 Wochen

### Infrastruktur
- [x] Postgres-Port in `docker-compose.yml` nicht mehr veröffentlicht
- [x] Keine Default-Passwörter: Pflichtvariablen mit `${VAR:?}` (`DB_PASSWORD`, `AUTH_SECRET`)
- [x] App-Port nur an `127.0.0.1` gebunden, öffentlich nur über Tunnel/Proxy erreichbar
- [ ] Firewall des Servers prüfen
- [ ] Dockerfile auf `output: "standalone"` umstellen (kleineres Image, keine Dev-Tools)
- [ ] Datenbank-Migrationen beim Deploy automatisch ausführen (in `docker-compose.yml` eingetragen, Lauf gegen echte DB steht aus)

### Sicherheit
- [ ] Rate-Limits für Login (pro Konto und pro IP) und Registrierung (pro IP) (gebaut, Unit-Tests grün; Live-Test nach dem Zusammenführen steht aus)
- [x] Rate-Limits und Tageskontingent für KI-Wege: Remediation 20 Generierungen/Tag je Nutzer, Kursgenerierung 5 Aufträge/h je Admin
- [x] Remediation-Neugenerierung nur per `POST` mit Abklingzeit (10 min je Nutzer und Ziel)
- [x] KI-Budget- und Preisvariablen (`GEMINI_*`) in `docker-compose.yml` durchgereicht und in `.env.example` dokumentiert
- [ ] `GEMINI_BUDGET_USD` und aktuelle Preise in der Server-`.env` setzen
- [x] Security-Header in `next.config.ts` (CSP, HSTS, `frame-ancestors 'none'`, Referrer-Policy, Permissions-Policy)
- [ ] CSP ohne `'unsafe-inline'` für Skripte (Nonces)
- [x] Service Worker: `ui-cache` wird beim Logout geleert
- [ ] Service Worker: angemeldete Seiten gar nicht erst cachen, ohne den Offline-Modus zu brechen
- [ ] API-Fehler nach außen generisch, Details nur ins Log (Lernenden-Routen erledigt; Admin-Routen `blueprint` und `parse` geben bei 502 noch die Roh-Meldung zurück)
- [x] Prüfungs-API liefert keine Lösungen (`isCorrect`, Erklärungen) mehr vor der Abgabe
- [ ] E-Mail-Adressen normalisieren: Registrierung und Login nutzen `normalizeEmail`, Migration `0024` für Bestandskonten geschrieben, Lauf gegen echte DB steht aus

### Qualität und Betrieb
- [x] GitHub Actions: Lint, Typecheck, Tests, Build bei jedem Push
- [ ] Branch Protection auf `main`
- [ ] Nächtliches, verschlüsseltes Offsite-Backup (Postgres und Quell-PDFs)
- [ ] **Restore einmal vollständig getestet**
- [ ] Error-Tracking (z. B. Sentry) und Uptime-Monitoring
- [x] README verweist auf die aktuelle Roadmap
- [ ] Repo aufräumen: Patch-Datei und `QUICK_COMMANDS.sh` entfernen bzw. nach `docs/` verschieben

### Gate 0
- [ ] Keine offenen kritischen Punkte aus dem Review
- [ ] CI grün, Backup-Restore erfolgreich getestet

---

## Phase 1 – Demo und Validierung

**Ziel:** Etwas Greifbares zeigen und herausfinden, ob Firmen das Problem stark genug spüren, um zu zahlen.
**Zeitrahmen:** ca. Woche 2–8, parallel zu Phase 2

### Demo-Inhalt (Observability)
- [ ] Lernpfad Observability: Grundlagen Metriken, Logs, Traces, Alerting
- [ ] Tool-Ebene: Prometheus, Grafana, Loki, Alloy
- [ ] 2–3 Troubleshooting-Szenarien mit Logs und Hilfe-Leiter (Denkanstoß → Eingrenzung → Lektion → Lösung)
- [ ] Inhalte selbst als Experte geprüft und freigegeben (Name, Datum, Version)
- [ ] Demo-Ablauf, der in 5 Minuten den Unterschied zu „Wiki plus Mentor“ zeigt

### Verkaufsunterlagen
- [ ] Kernaussage in einem Satz
- [ ] Einseitige Produktbeschreibung für Pilotkunden
- [ ] Sicherheits- und Datenschutz-Einseiter (wo liegen Daten, was sieht der Arbeitgeber, was nicht)
- [ ] Gründungsgeschichte aufgeschrieben (Telefonat mit dem Freund)

### Gespräche
- [ ] Interview mit dem Freund aus dem SAP-Umfeld (Arbeitnehmersicht)
- [ ] Gespräch mit dem eigenen Chef (Arbeitgebersicht)
- [ ] 15–20 Gespräche mit IT-Leitern, Geschäftsführern von Systemhäusern, Ausbildern
- [ ] Jedes Gespräch im Protokoll erfasst (Problem, Zahlen, Lösungsversuche, nächster Schritt)
- [ ] Wöchentlich ein LinkedIn-Beitrag (Onboarding, Junior-Lücke, Observability-Praxis)
- [ ] Gezielt Menschen ansprechen, die sich öffentlich über das Problem beschweren
- [ ] Mindestens einen Meetup oder eine IHK-Veranstaltung besucht

### Organisation und Recht (Start)
- [ ] Arbeitsvertrag prüfen: Nebentätigkeit, Rechte an selbst geschriebenem Code
- [ ] IHK-Gründungsberatung gebucht
- [ ] Impressum und Datenschutzerklärung online

### Gate 1
- [ ] Mindestens 15 Gespräche geführt und ausgewertet
- [ ] Mindestens 3 Firmen mit klar geäußertem Interesse an einem **bezahlten** Pilot
- [ ] **Abbruchkriterium:** Keine Pilotbereitschaft nach 20 Gesprächen → Zielgruppe oder Angebot überarbeiten, bevor weiter gebaut wird

---

## Phase 2 – Grundgerüst Unternehmensbereich

**Ziel:** Das Minimum, mit dem eine Firma einen Piloten durchführen kann.
**Zeitrahmen:** ca. Woche 3–10

### Datenmodell und Rechte
- [ ] Organisation (Mandant) mit strikter Datentrennung zwischen Firmen
- [ ] Rollen: Firmen-Admin, Mentor, Lernender
- [ ] Trennung privat / betrieblich im Datenmodell (Lerndetails nie im Firmenbereich abfragbar)
- [ ] Tests für Zugriffsrechte: Firma A sieht nie Daten von Firma B, Arbeitgeber sieht nie Lerndetails

### Funktionen
- [ ] Mitarbeiter einladen (E-Mail) und Organisation zuordnen
- [ ] Lernpfade zuweisen (Basiskurs plus Firmenmodule)
- [ ] Firmendokument hochladen → KI-Entwurf → Mentor prüft und gibt frei
- [ ] Passwort- und Schlüssel-Scanner beim Upload
- [ ] Praxisaufgaben mit Bestätigung durch den Mentor
- [ ] Statusansicht für die Firma (nur Status, Datum, Frist)
- [ ] Firmenmodule mit Verantwortlichem und „gültig bis“

### Accounts (nötig für echte Kunden)
- [ ] E-Mail-Versand (EU-Anbieter)
- [ ] E-Mail-Verifizierung und Passwort-Reset
- [ ] Passwort ändern, Konto löschen, Datenexport (Self-Service)
- [ ] Auth-Bibliothek auf stabile Version bringen oder Alternative prüfen

### KI und Datenschutz
- [ ] KI-Tarif ohne Training auf Kundendaten, möglichst EU-Verarbeitung
- [ ] Auftragsverarbeitungsverträge (KI-Anbieter, Hosting, ggf. Cloudflare)
- [ ] Option: Firmendokumente von KI-Verarbeitung ausschließen

### Gate 2
- [ ] Eine Testfirma kann vollständig durchlaufen: einladen → zuweisen → Dokument zu Lernpfad → Praxisaufgabe → Status
- [ ] Rechte-Tests grün

---

## Phase 3 – Pilot

**Ziel:** Beweisen, dass die Plattform messbar Zeit spart.
**Zeitrahmen:** ca. 3 Monate

### Vorbereitung
- [ ] 3–5 Pilotfirmen (Design-Partner) mit schriftlicher Vereinbarung
- [ ] Vergünstigter, aber **bezahlter** Zugang
- [ ] Gegenleistung vereinbart: Feedback, Messung, Referenz bzw. Fallstudie
- [ ] Pilot-AGB und Auftragsverarbeitungsvertrag für Kunden

### Messung
- [ ] Vorher erfasst: Mentorenstunden pro Einarbeitung, Zeit bis zur ersten eigenständigen Aufgabe
- [ ] Nachher erfasst: dieselben Kennzahlen
- [ ] Regelmäßige Feedback-Termine (z. B. alle 2 Wochen)

### Betrieb
- [ ] Support-Kanal für Pilotkunden
- [ ] Fehler und Wünsche gesammelt und priorisiert

### Gate 3
- [ ] Mindestens eine Fallstudie mit echten Zahlen (z. B. „Einarbeitung X % schneller, Y Mentorenstunden gespart“)
- [ ] Mindestens ein Pilotkunde will nach dem Pilot weiterzahlen
- [ ] **Abbruchkriterium:** Keine messbare Zeitersparnis → Produkt überarbeiten, bevor weiter verkauft wird
- [ ] **Abbruchkriterium:** Firmen stellen keine eigenen Inhalte bereit, auch nicht mit KI-Hilfe → Fokus auf fertige Kurse verlagern

---

## Phase 4 – Launch-Reife

**Ziel:** Fremde Kunden können selbstständig kaufen und starten.

### Recht und Organisation
- [ ] AGB, Widerrufsbelehrung, bei Abos Kündigungsbutton
- [ ] Gewerbe angemeldet, Steuerform geklärt
- [ ] Verträge mit externen Experten: ausschließliche Nutzungsrechte, Verschwiegenheit, Haftung
- [ ] Barrierefreiheit geprüft

### Bezahlung
- [ ] Preismodell festgelegt (pro Einarbeitung oder pro Platz und Monat)
- [ ] Checkout und Kundenportal (z. B. Stripe), Rechnungen
- [ ] Zugriff an Abo bzw. Lizenz gekoppelt

### Außenauftritt
- [ ] Landingpage auf Deutsch: Problem, Lösung, Fallstudie, Preis
- [ ] Demo ohne Konto
- [ ] Datensparsame Analytics (z. B. Plausible, Umami)
- [ ] Onboarding für neue Firmen: in unter einer Stunde startklar

### Qualität
- [ ] E2E-Tests der Kernflows (Registrierung → Firma → Zuweisung → Lernpfad → Abschluss → Bezahlung)
- [ ] Anleitung „Zum Home-Bildschirm hinzufügen“ für iOS
- [ ] Lighthouse- und Accessibility-Check

### Gate 4
- [ ] Ein neuer Kunde kann ohne deine Hilfe kaufen, einrichten und starten

---

## Phase 5 – Ausbau der Module

**Ziel:** Mehr Wert pro Kunde, gesteuert durch Pilot-Feedback. Reihenfolge nach Nachfrage anpassen.

### Pflichtschulungen (Security-Awareness)
- [ ] Pflicht-Zuweisungen mit Frist und Wiederholung (z. B. halbjährlich), nach Rolle oder Abteilung
- [ ] Erinnerungen und Eskalation
- [ ] Teilnahmebescheinigung und Audit-Export (Kursversion, Datum)
- [ ] Vorlagen-Kurse: Phishing, Passwörter/MFA, CEO-Fraud, Social Engineering, Datenschutz
- [ ] Laufende Inhaltspflege (Quellen: BSI-Warnungen, Lageberichte)
- [ ] Nutzer-Import per CSV

### Interne Wechsel
- [ ] Rollenprofile als Kompetenzbündel
- [ ] Lückenanalyse zwischen Nachweisen und Zielrolle (nur für die Person sichtbar)
- [ ] Teilen von Nachweisen nur auf Wunsch der Person

### Didaktik
- [ ] Kompetenzmodell mit Konzept- und Tool-Ebene
- [ ] Brückenpfade (z. B. AWS → Azure, Prometheus → Azure Monitor)
- [ ] Modul „KI-Ergebnisse prüfen“ (generierten Code lesen, Fehler finden)
- [ ] Wissenssicherung: KI-gestützte Interviews mit Seniors → Lernpfad, vom Senior freigegeben

### Inhalte und Qualität
- [ ] Review-Oberfläche mit Quellenbeleg pro Frage und Checkliste
- [ ] Automatische Vorprüfung (Dubletten, Mehrdeutigkeit, Abdeckung)
- [ ] Versionierung von Kursen, „gültig bis“, Wiedervorlage auffälliger Fragen
- [ ] Rolle „Externer Prüfer“ mit Zugriff nur auf zugewiesene Kurse
- [ ] Weitere Lernpfade mit externen Experten (Umsatzbeteiligung prüfen)

---

## Phase 6 – Wachstum und Finanzierung

- [ ] 10 zahlende Kunden
- [ ] Förderprogramme geprüft (Landesprogramme, Gründungszentren, ggf. EXIST)
- [ ] Gespräche mit Business Angels, sobald Fallstudie und zahlende Kunden vorliegen
- [ ] Anmeldung über Firmenkonto (SSO, z. B. Microsoft Entra ID) und automatische Nutzerverwaltung
- [ ] Externer Sicherheitstest (Penetrationstest)
- [ ] Entscheidung über Vollzeit-Gründung

---

## Später (bewusst zurückgestellt)

- [ ] Nachweise auf offenen Standards (Open Badges 3.0, European Digital Credentials)
- [ ] Echte Übungsumgebungen (Container) für Troubleshooting
- [ ] Verwandte technische Berufe (Elektronik, Mechatronik)
- [ ] Weitere Branchen mit firmeneigenen Inhalten
- [ ] Zulassung als Weiterbildungsträger (AZAV) für geförderte Weiterbildung
- [ ] Einträge in Google Play und Microsoft Store
- [ ] Phishing-Simulationen (nur mit Betriebsrat-Konzept, ggf. über Partner)
