# Roadmap: Bugs & Missing Features

Diese Roadmap dient als verbindliche Spezifikation zur Behebung von Darstellungsfehlern, zur didaktischen Umstrukturierung, zur Erweiterung der Prüfer-Governance sowie zur Einführung fehlender Kernfeatures.

---

## 1. Didaktik & Assessment-Restrukturierung

### 1.1 Pre-Assessment (Vorab-Prüfung)
* **Status Quo:** Vorab-Fragen tauchen fragmentiert zu Beginn jeder einzelnen Lektion auf und unterbrechen den Lernfluss.
* **Zielzustand:** Ein zentraler Einstufungstest direkt nach Kurswahl.
* **Spezifikation:**
  * **Timing:** Wird einmalig unmittelbar nach der Kursauswahl vor dem Start des ersten Kapitels initiiert.
  * **Umfang:** Exakt 10 Multiple-Choice-Fragen.
  * **Scope:** Breit gefächert über alle Kernkapitel des gewählten Kurses (synthetische Mini-Abschlussprüfung zur Wissensstand-Ermittlung).
  * **Verhalten:** Entfernung aller lektionsbasierten Vorab-Fragen aus den Einzellektionen.

### 1.2 „Sitzt das?“-Quizzes verschieben & Frage-Pools erweitern
* **Status Quo:** Quizzes erscheinen nach jeder Sektion; Fragen wiederholen sich bei Wiederholungsversuchen.
* **Zielzustand:** Bündelung am Kapitelende und dynamische Pool-Ziehung gegen Redundanz.
* **Spezifikation:**
  * **Platzierung:** Verschiebung der Quizzes von der Sektionsebene ausschließlich an das jeweilige **Kapitelende**.
  * **Pool-Generierung:** Pro Kapitel werden backend-seitig mindestens 30 Fragen generiert.
  * **Randomisierung:** Bei jedem Quiz-Aufruf werden aus diesem 30er-Pool randomisiert 10 Fragen gezogen (Sampling without replacement).

---

## 2. Inhalts-Freischaltung & progressive Dokumentation

### 2.1 Schrittweiser Merkzettel-Aufbau
* **Status Quo:** Der Merkzettel wird direkt zu Beginn für den kompletten Kurs auf einen Schlag generiert/ausgegeben (Spoiler- & Überforderungsgefahr).
* **Zielzustand:** Progressive Freischaltung.
* **Spezifikation:**
  * Der Merkzettel startet leer bzw. mit den Grundlagen des ersten Kapitels.
  * Nach erfolgreichem Abschluss eines Kapitels werden die spezifischen Merksätze und Zusammenfassungen dieses Kapitels automatisch an den Gesamtkurs-Merkzettel angehängt.

### 2.2 Simulationen als Repetition-Hub
* **Status Quo:** Simulationen aller Kapitel sind ggf. vorab sichtbar.
* **Zielzustand:** In der Wiederholungs- und Simulationsübersicht sind nur Simulationen aus bereits erfolgreich **abgeschlossenen Kapiteln** freigeschaltet und anwählbar. Noch nicht erreichte Kapitel bleiben gesperrt.

---

## 3. Prüfer-Governance & Kurs-Transparenz

### 3.1 Prüfer-Rollenmodell & Kurs-Scope
* **Spezifikation:**
  * Prüfer-Accounts erhalten eine 1:1-Zuweisung: Ein Prüfer ist im Profil explizit und exklusiv genau einem Kurs zugewiesen.
  * **Admin-/Prüfer-Rechte im Kurs:**
    * Manuelles Erstellen, Bearbeiten und Löschen von Sektionen.
    * Manuelles Bearbeiten und Nachschärfen von Simulationen.
    * Editier- und Freigabezugriff auf Fragenkataloge („Sitzt das?“-Pools, Pre-Assessment, Abschlussprüfungen).

### 3.2 Prominente Experten-Präsentation & Wording-Refactoring
* **Status Quo:** Unklare, teils irritierende Formulierungen bzgl. „geprüfter Kurs / Bestehensquote“.
* **Spezifikation:**
  * **Prüfer-Badge im Kurs-Header:** Direkt beim Öffnen des Kurses wird das verifizierte Profil des zuständigen Fachprüfers prominent angezeigt (Name, Fachgebiet, Link zum Expertenprofil).
  * **Wording:** Der Text wird verbindlich geändert in:  
    > *„Dieser Kurs wurde fachlich von [Experten-Name] geprüft.“* (inkl. Direktverlinkung zum Profil).
  * **Auslagerung:** Aussagen zu Bestehensgarantien oder juristischen Prüfungsmodalitäten werden vollständig aus der Kursbeschreibung entfernt und in die **Service Agreements / AGB** verschoben.

---

## 4. UI/UX, Rendering & Qualitätssicherung

### 4.1 Formel- & Sonderzeichen-Rendering (Brüche)
* **Problem:** Falsche oder unvollständige Darstellung von Sonderzeichen (insbesondere mathematische Brüche wie $\frac{a}{b}$).
* **Spezifikation:**
  * Integration/Validierung von KaTeX bzw. MathJax für mathematische Ausdrücke.
  * Markdown-Parser-Härtung: Brüche sind standardisiert über LaTeX-Syntax (`\frac{x}{y}`) oder saubere Unicode-Ersatzzeichen abzusichern.

### 4.2 Quellenangaben (Collapsible Accordion)
* **Spezifikation:**
  * Am Ende jedes Kurses wird eine einklappbare Akkordeon-Komponente (`<details>` / Accordion) integriert: **„Quellen & Fachliteratur“**.
  * Vollständig einsehbar für sowohl Lernende als auch Prüfer.

### 4.3 Prüfungstermin als dynamischer Richtwert
* **Spezifikation:**
  * Beim Anlegen/Einsehen des Prüfungstermins muss ein Hinweistext hinterlegt werden:  
    > *„Hinweis: Dieser Termin ist ein unverbindlicher Richtwert zur optimalen Einteilung Ihres Lernpensums und kann jederzeit flexibel im Profil angepasst werden.“*
  * Direkte Editier-Möglichkeit des Datums im Kurs-Dashboard.

### 4.4 In-App Reporting für Lerninhalte (Bug- & Inhaltsfehler)
* **Spezifikation:**
  * In jeder Kursübersicht und Sektionsansicht wird ein dezenter **„Problem melden / Feedback“**-Button platziert.
  * Erlaubt schnelles Melden von Bugs, Typo-Fehlern oder inhaltlichen Unstimmigkeiten direkt mit Kontext-Referenz (Kurs-ID, Kapitel-ID, Sektions-ID).

---

## 5. Lerner-Profil, Schwächenanalyse & Karrierepfade

### 5.1 Dynamischer Schwächen-Radar in der Statusleiste
* **Spezifikation:**
  * In der Statusleiste (neben Badges wie *„Offline verfügbar“*) wird ein Indikator für **aktuelle Lern-Schwachstellen** ergänzt.
  * Aggregation falscher Antworten aus den „Sitzt das?“-Quizzes zur transparenten Auflistung der Top-3-Themen, die Nachbereitung erfordern.

### 5.2 Lernprofil-Export als verifizierter PDF-Nachweis
* **Spezifikation:**
  * Exportfunktion für ein standardisiertes, fälschungssicheres PDF-Lernprofil zum Kenntnisnachweis (z. B. für Arbeitgeber).
  * **Restriktion:** Kurse dürfen nur dann auf diesem PDF gelistet werden, wenn eine **erfolgreiche Zertifikatsprüfung** für den jeweiligen Kurs in der Datenbank hinterlegt ist.

### 5.3 Rollenbasierte Kursempfehlungen (Zielbereich / Career Path)
* **Spezifikation:**
  * Lernende können im Profil ein berufliches Entwicklungsziel festlegen (z. B. *Aktuelle Rolle: Cloud Engineer* $\rightarrow$ *Zielrolle: Site Reliability Engineer (SRE)*).
  * Das System ermittelt die Kompetenzlücke (Skill-Gap) und spielt passende Folgekurse aus.
  * Jeder Vorschlag enthält einen aufklappbaren Bereich **„Warum dieser Kurs?“**, der konkret begründet, welche Lücke im Hinblick auf das definierte Rollenprofil geschlossen wird.