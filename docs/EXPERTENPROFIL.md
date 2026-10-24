# Expertenprofil

Öffentliches Profil für fachliche Prüfer (`roadmap_pruefer.md` Phase 3), Paket 4.7a.

## Für Prüfer
- **Pflegen:** `/reviewer/profile` (Link auf `/reviewer`). Name, Land, optional Region, Kurzvorstellung (de/en) und LinkedIn.
- **Einwilligung je Feld:** Jedes Feld hat sein eigenes „Öffentlich zeigen“; Erfahrungseinträge und Zertifikate je Eintrag. Ohne Haken bleibt es privat. Der Zeitpunkt der Einwilligung wird gespeichert (`reviewer_profiles.consent`). Suchmaschinen dürfen das Profil nur bei ausdrücklicher Einwilligung („Indexierung“) finden, sonst `noindex`.
- **Veröffentlichen:** Voraussetzung sind Name und Land (freigegeben) und mindestens ein öffentlicher Erfahrungseintrag oder ein öffentliches Zertifikat. Ein veröffentlichtes Profil darf nicht unvollständig werden; dafür vorher zurückziehen.
- **Zurückziehen:** Das Profil ist sofort nicht mehr erreichbar (404), alle Einwilligungen entfallen. Freigaben von Kursen bleiben gültig.
- **Vorschau:** Der Editor zeigt die öffentliche Seite so, wie sie mit den aktuellen Freigaben aussähe.

## Zertifikate und Nachweise
Nur Links auf die offizielle Prüfseite oder das digitale Abzeichen des Herstellers (https), keine Dateien. Ein Admin öffnet den Link, prüft Name und Gültigkeit und setzt in `/admin/reviewers` „Als geprüft markieren“. Erst dann steht auf der öffentlichen Seite „Nachweis geprüft am …“, davor „Nachweis noch nicht geprüft“. Ändert die Person den Link, entfällt die Prüfung. Abgelaufene Zertifikate bleiben sichtbar und sind als „abgelaufen“ markiert. 60 Tage vor Ablauf geht eine Erinnerung an die Person und die Admins (`npm run reviewers:remind`, siehe `docs/EMAIL.md`).

## Öffentliche Seite
`/experts/<slug>` ohne Anmeldung. Die Adresse entsteht aus dem Namen („eva-mueller“, bei Namensgleichheit mit Zahl) und bleibt stabil. Sie zeigt nur Freigegebenes, dazu die Kurse, die die Person zuletzt freigegeben hat (Version und Datum; nur allgemeine Kurse im Katalog).

## Daten
Tabellen `reviewer_profiles`, `reviewer_experience`, `reviewer_certifications` (Migration 0094). Datenexport und Kontolöschung umfassen sie; die Löschung entfernt die Seite.

## Siegel „Fachlich geprüft von …“ (Paket 4.7b)
- **Wo:** Kursseite (volle Zeile mit Version und Stand), Katalog (kompakt: „Fachlich geprüft · Version · Stand“) und Offline-Paket (Zeile in der Offline-Übersicht, Stand zum Download).
- **Inhalt:** „✓ Fachlich geprüft von **Vorname Name** · Version 2.1 · Stand 14.10.2026“. Der Name verlinkt auf `/experts/<slug>`, aber nur bei veröffentlichtem Profil mit Einwilligung für den Namen. Prüfer ohne öffentliches Profil (auch Altbestand und Einträge ohne Konto) erscheinen nur als „einem externen Experten“. Haben mehrere Prüfer genau diesen Inhaltsstand freigegeben, stehen alle da.
- **Rückzug und Löschung:** Das Siegel bleibt, der Name verschwindet sofort („von einem externen Experten · Stand …“). Die interne Freigabe bleibt gültig.
- **Änderungen:** Auf der Kursseite steht bei Abweichung vom geprüften Stand „X Änderungen seit der Prüfung“; Details (Zahl der Abschnitte/Fragen) auf Klick. Ohne Freigabe gibt es kein Siegel.
- **Hinweistext** (auf Klick): „Geprüft“ bezieht sich auf die fachliche Richtigkeit zum angegebenen Stand, keine Garantie für das Bestehen einer Prüfung.
- **Interne Lernpfade** bekommen kein Siegel; dort bleibt „Freigegeben von …“ im Firmenbereich.
- **Katalog ohne Änderungszähler:** Die Änderungserkennung liest alle Inhalte eines Kurses. Für Listen wäre das zu teuer; der Katalog zeigt deshalb den Stand der letzten Prüfung, die Kursseite den genauen Zustand.

## Noch offen
- Foto (braucht Dateispeicher).
- Siegel auf **Abschlussbescheinigungen**: Eine Bescheinigung über den Kursabschluss gibt es im Produkt noch nicht (das PDF im Firmenbereich ist das Zertifikats-Register). Sobald sie existiert, baut sie das Siegel aus `getCourseSeal` und `reviewersText` (`lib/reviewers/seal.ts`).
- Siegel auf der Dashboard-Kachel und Geltungsbereich je Domain (Freigaben gelten bisher für den ganzen Kurs).
- Rechtliches (`roadmap_pruefer.md` Phase 7): Expertenvertrag, Datenschutzerklärung für öffentliche Prüferprofile, Prüfung des Siegel-Hinweistexts. Das ist Organisation, kein Code, und sollte vor der ersten Veröffentlichung eines echten Profils geklärt sein.
- Die Freischaltung der Veröffentlichung durch das Probe-Review (Paket 4.8) gibt es noch nicht.
