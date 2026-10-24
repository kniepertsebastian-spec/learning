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

## Noch offen
- Foto (braucht Dateispeicher).
- Siegel „Fachlich geprüft von …“ an Kurs, Katalog, Offline-Paket und Bescheinigung samt neutralem Text nach Rückzug (Paket 4.7b).
- Rechtliches (`roadmap_pruefer.md` Phase 7): Expertenvertrag, Datenschutzerklärung für öffentliche Prüferprofile, Hinweistext zum Siegel. Das ist Organisation, kein Code, und sollte vor der ersten Veröffentlichung eines echten Profils geklärt sein.
- Die Freischaltung der Veröffentlichung durch das Probe-Review (Paket 4.8) gibt es noch nicht.
