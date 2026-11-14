# Aufgabe 08: AGB-Seite vervollständigen

**Herkunft:** Befund 4 (Teil) aus dem Review vom 12.11.2026 · Phase 3
**Priorität:** vor den ersten Personen außerhalb des eigenen Tests
**Ort:** `app/agb/page.tsx:12`

## Problem
Die AGB-Seite ist ein Auszug. Der Platzhalter „Der vollständige Vertragstext … ist hier zu ergänzen“ steht noch im Code.

## Aufgaben
- [x] Parteien benennen (Betreiber, Kontakt).
- [x] Laufzeit und Kündigung beschreiben, einschließlich Kontolöschung (Verweis auf Aufgabe 09).
- [x] Haftung regeln.
- [x] Platzhalter aus `app/agb/page.tsx:12` entfernen.

## Akzeptanzkriterium
Die Seite enthält keinen Platzhalter mehr. Parteien, Laufzeit und Haftung sind beschrieben und vom Betreiber freigegeben.

## Hinweis
Der Wortlaut ist eine rechtliche Frage. Hier wird nur die Lücke im Code geschlossen.

## Umsetzung (14.11.2026)
- **Seite `/agb`** (`app/agb/page.tsx`): neu sind § 1 Vertragspartner und Geltung (mit Betreiber und Kontakt aus der Server-Konfiguration, siehe 07a), Laufzeit und Kündigung, Haftung und der Verweis auf die Datenschutzerklärung. Die drei bisherigen Paragraphen (fachliche Prüfung, keine Bestehensgarantie, Prüfungsbedingungen der Anbieter) bleiben unverändert und folgen dem neuen § 1. Der Platzhalter-Satz im Code und der Untertitel „Auszug“ sind weg.
- **Kontolöschung:** Die Kündigung beschreibt die Löschung des Kontos unter „Konto“ mit Löschung oder Anonymisierung der Daten. **Für SSO-Konten stimmt das erst mit Aufgabe 09.** Bis dahin muss der Betreiber wissen, dass diese Konten sich nicht selbst löschen können.
- **Wortlaut ist ein Entwurf:** Laufzeit, Kündigung und Haftung habe ich in der üblichen Form formuliert (unbeschränkte Haftung für Vorsatz, grobe Fahrlässigkeit, Leben, Körper, Gesundheit und nach Produkthaftungsgesetz, bei leichter Fahrlässigkeit nur bei wesentlichen Vertragspflichten und begrenzt auf den vorhersehbaren, typischen Schaden). Das ist keine Rechtsberatung. Der Betreiber muss den Text rechtlich prüfen lassen, vor allem die Kündigung durch den Betreiber („aus wichtigem Grund“, ohne feste Frist), die Aussagen zu Firmenkonten und ob die Plattform kostenpflichtige Angebote hat (davon steht nichts drin). Bis `LEGAL_TERMS_REVIEWED=true` gesetzt ist, trägt die Seite den Hinweis „Entwurf: Die Freigabe der Bedingungen durch den Betreiber steht noch aus“. Das Akzeptanzkriterium „vom Betreiber freigegeben“ ist damit **technisch vorbereitet, aber nicht erfüllt**.
- **Test:** `e2e/legal-pages.spec.ts` (alle Paragraphen sichtbar, kein Platzhalter, Betreiberangaben im § 1, Hinweis „Entwurf“, Link zur Datenschutzerklärung).
