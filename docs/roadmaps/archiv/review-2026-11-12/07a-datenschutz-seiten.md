# Aufgabe 07a: Seiten Datenschutz und Impressum anlegen

**Herkunft:** Befund 4 (Mittel, Datenschutz) aus dem Review vom 12.11.2026 · Phase 3
**Priorität:** vor den ersten Personen außerhalb des eigenen Tests
**Ort:** `app/agb/page.tsx:12`. Es gibt keine Route für Datenschutz oder Impressum.

## Aufgaben
- [x] Seiten `/datenschutz` und `/impressum` anlegen, ohne Anmeldung erreichbar.
- [x] Links im Fuß, auf Login und Registrierung.
- [ ] Texte vom Betreiber verfassen lassen (Inhalt in Aufgabe 07b).

## Akzeptanzkriterium
Beide Seiten sind ohne Anmeldung erreichbar und von Login und Registrierung verlinkt.

## Umsetzung (14.11.2026)
- **Seiten:** `/datenschutz` und `/impressum` (`app/datenschutz/page.tsx`, `app/impressum/page.tsx`), ohne Anmeldung erreichbar (nur `/cert/…` verlangt eine Sitzung, siehe `proxy.ts`). Sie erscheinen in der schlanken Rahmen-Seite ohne Navigation, wenn niemand angemeldet ist, sonst in der normalen Oberfläche.
- **Links:** `components/LegalLinks.tsx` (Datenschutz, Impressum, AGB) im Fuß der öffentlichen Rahmen-Seite, die auch Login und Registrierung umgibt, und im Fuß der angemeldeten Oberfläche (`components/shell/AppShell.tsx`).
- **Angaben des Betreibers stehen nicht im Code**, sondern in der Umgebung des Servers: `LEGAL_OPERATOR_NAME`, `LEGAL_OPERATOR_ADDRESS` (Zeilen mit `;` trennen), `LEGAL_CONTACT_EMAIL`, optional `LEGAL_PHONE`, `LEGAL_REPRESENTATIVE`, `LEGAL_REGISTER`, `LEGAL_VAT_ID` (siehe `.env.example` und `docker-compose.yml`, Code in `lib/legal/operator.ts`). Fehlt Name, Anschrift oder E-Mail, zeigt die Seite einen sichtbaren Hinweis statt einer erfundenen Angabe und ist per `noindex` für Suchmaschinen gesperrt. **Der Betreiber muss diese Werte eintragen, bevor Fremdnutzer die App sehen.**
- **Tests:** `lib/legal/operator.test.ts`; `e2e/legal-pages.spec.ts` (beide Seiten ohne Anmeldung mit Status 200, Hinweis und `noindex` bei fehlenden Angaben; Login und Registrierung verlinken Datenschutz, Impressum und AGB).
