# UI-/UX-Roadmap – Learning-Plattform (ProofPath)

> **Geltungsbereich:** Oberfläche, Bedienung und die dafür nötigen Daten- und API-Erweiterungen. Infrastruktur, Sicherheit und Betrieb stehen in [`docs/ROADMAP-TECHNISCH.md`](ROADMAP-TECHNISCH.md); deren **Leitplanken gelten hier unverändert** und gehen bei jedem Konflikt vor.
>
> **Referenz:** Design-Entwurf „ProofPath – UI Redesign“ (damals noch unter dem Namen CertStudy AI) (claude.ai, Design-Canvas) mit 7 Screens. Jede Phase nennt den Screen, dem das Ergebnis entsprechen soll. Wo Entwurf und dieses Dokument abweichen, gilt dieses Dokument. Alle Zahlen und Namen in den Screens sind Beispieldaten.
>
> | Nr. | Screen | Phase |
> |---|---|---|
> | 1 | Lernen – Dashboard | U3 |
> | 2 | Quiz – Fokusmodus | U4 |
> | 3 | Lernmaterial – Praxisbeispiel | U5 |
> | 4 | Firmenbereich (inkl. Kursgruppen) | U6 |
> | 5 | Plattform-Admin (Kurskatalog mit Kursgruppen) | U7 |
> | 6 | Prüfungsplaner | U8 |
> | 7 | Firma – Zertifikats-Register | U9 |
>
> **Regel (wie in der technischen Roadmap):** Ein Punkt wird erst abgehakt, wenn er gebaut *und* geprüft ist. Eine Phase ist erst abgeschlossen, wenn ihr **Gate** erfüllt ist. UI-Punkte gelten erst als geprüft, wenn die [Definition of Done für UI](#definition-of-done-für-ui) erfüllt ist.
>
> **Nicht enthalten:** SSO (existiert bereits). Live-Suche nach freien Prüfungsterminen (siehe [Nicht-Ziele](#nicht-ziele)).

---

## Inhalt

- [Ausgangslage](#ausgangslage)
- [Designsprache (verbindlich)](#designsprache-verbindlich)
- [U1 – Fundament: Tokens und Komponenten](#u1--fundament-tokens-und-komponenten)
- [U2 – App-Shell und Kontexttrennung](#u2--app-shell-und-kontexttrennung)
- [U3 – Lern-Dashboard (Screen 1)](#u3--lern-dashboard-screen-1)
- [U4 – Quiz und Prüfung (Screen 2)](#u4--quiz-und-prüfung-screen-2)
- [U5 – Lernmaterial und Praxisbeispiele (Screen 3)](#u5--lernmaterial-und-praxisbeispiele-screen-3)
- [U6 – Firmenbereich und Firmen-Kursgruppen (Screen 4)](#u6--firmenbereich-und-firmen-kursgruppen-screen-4)
- [U7 – Plattform-Admin und Katalog-Kursgruppen (Screen 5)](#u7--plattform-admin-und-katalog-kursgruppen-screen-5)
- [U8 – Prüfungsplaner (Screen 6)](#u8--prüfungsplaner-screen-6)
- [U9 – Zertifikats-Register und Voucher (Screen 7)](#u9--zertifikats-register-und-voucher-screen-7)
- [Später](#später)
- [Nicht-Ziele](#nicht-ziele)
- [Reihenfolge und Abhängigkeiten](#reihenfolge-und-abhängigkeiten)
- [Definition of Done für UI](#definition-of-done-für-ui)

---

## Ausgangslage

Lesebefund aus dem Repo (09.10.2026), keine Testergebnisse:

- `app/globals.css` definiert nur 4 Farb-Tokens (`background`, `foreground`, `surface`, `border`, `accent`). Alles andere sind Tailwind-Rohwerte direkt im JSX (u. a. ~255× `rounded-md`, ~81× `rounded-lg`, eine einzige Schattenklasse).
- Es gibt kein `components/ui/`. Buttons, Karten, Badges usw. werden pro Seite neu gebaut.
- Akzentfarbe ist Tailwind-`sky-400` auf Slate – die Standardfarben des Starters, daher der „Baukasten“-Eindruck.
- Inhalte sind schmal zentriert (~780 px), auch auf breiten Bildschirmen.
- Header mit 6 gleich aussehenden Icon-Buttons; „Sign out“ zusätzlich doppelt auf dem Dashboard.
- Sprachmix in der Oberfläche („Welcome back“, „Continue learning“ neben „Firmenbereich“).
- Privat, Firma und Admin teilen dieselbe Optik. Nur der Seiteninhalt unterscheidet sie.

Was schon da ist und wiederverwendet wird: `Geist`/`Geist Mono` über `next/font`, Hell/Dunkel über `lib/theme.tsx` (Klasse `.dark`), Zweisprachigkeit über `lib/i18n.tsx`, `lucide-react`, `RichText` (sicheres Markdown), `TodayDashboard`, `ReadinessCard`, `ActivityTrends`, `ExamNavigator`, `ExamTimer`, `QuizQuestionCard`, Streak-Logik, Merkzettel, Offline-Pakete.

---

## Designsprache (verbindlich)

Diese Werte sind die Quelle der Wahrheit. **Keine Farb-, Radius- oder Schattenwerte außerhalb der Tokens** im JSX.

### Farben – Dunkel (Standard, entspricht den Screens)

| Token | Wert | Verwendung |
|---|---|---|
| `--bg` | `#0A0C10` | Seitenhintergrund |
| `--bg-sidebar` | `#0E1117` | Sidebar, Fokusleiste |
| `--surface` | `#12161E` | Karten, Tabellen, Panels |
| `--surface-2` | `#171D28` | Innenflächen in Karten, aktive Nav-Einträge, Chips |
| `--surface-inset` | `#0F1219` | Eingelassene Flächen (Segment-Control, Codeblock-Rahmen) |
| `--control` | `#1A212D` | Sekundär-Buttons, Inline-Code |
| `--track` | `#1E2633` | Hintergrund von Fortschrittsbalken |
| `--border` | `#222938` | Standardrahmen |
| `--border-strong` | `#2A3242` | Rahmen von Controls |
| `--border-subtle` | `#1C2230` | Tabellenzeilen, Trenner |
| `--text` | `#E8ECF3` | Haupttext |
| `--text-2` | `#C9D0DC` | Fließtext in Lektionen |
| `--text-muted` | `#AEB7C6` | Nav-Einträge, Sekundärtext |
| `--text-subtle` | `#9AA4B5` | Untertitel, Labels |
| `--text-faint` | `#8C96A8` | Meta-Angaben (nur ≥ 12 px) |
| `--accent` | `#34E3A4` | Primär (Mint): Buttons, Fortschritt, aktive Markierung |
| `--accent-hover` | `#7BF0C6` | Link-Hover |
| `--on-accent` | `#04140D` | Text auf Mint |
| `--accent-soft` | `rgba(52,227,164,0.12)` | Mint-Badges, Icon-Hintergründe |
| `--accent-border` | `#1F4A3B` | Rahmen bei Mint-Flächen |
| `--info` / `--info-text` | `#6EA8FF` / `#8DBBFF` | „In Arbeit“, gewählte Antwort, Praxisbeispiel |
| `--warning` | `#F4B740` | Hinweise, „Läuft bald ab“, Häufiger Fehler |
| `--danger` / `--danger-text` | `#FF7A66` / `#FF9A8A` | Falsch, überfällig, abgelaufen |
| `--violet` | `#C9A2FF` | Nur Kategorie-/Gruppenfarbe |

Hero-Fläche („Weitermachen“, „Nächste Prüfung“, Kurz-Check): `linear-gradient(135deg, #12201B 0%, #12161E 55%)`, Rahmen `#1F3A30`. **Sonst keine Verläufe.**

### Kontextfarben (Kern der Trennung Privat / Firma / Admin)

| Kontext | Akzent | Sidebar-Hintergrund | Sidebar-Rahmen | Switcher-Fläche / -Rahmen | Aktiver Nav-Eintrag | Label-Farbe | Text auf Akzent |
|---|---|---|---|---|---|---|---|
| Persönlich | `#34E3A4` | `#0E1117` | `#1C2230` | `#151A23` / `#252C3B` | `#171D28` | `#8C96A8` | `#04140D` |
| Firma | `#F4B740` | `#100F0B` | `#2A2414` | `#1A1710` / `#3A3018` | `#1F1B10` | `#B8A47A` | `#1A1204` |
| Plattform-Admin | `#FF7A66` | `#0E1117` | `#1C2230` | `#1A1312` / `#3A2420` | `#1A1D26` | `#C0928A` | `#1A0805` |

Admin zusätzlich: Warnstreifen über der ganzen Seite (Hintergrund `#2A1210`, Rahmen unten `#5A2C26`, Text `#FFC0B5`). Primär-Buttons im Admin sind **invertiert** (`#E8ECF3` auf `#0A0C10`), nicht Koralle – Koralle bleibt Warnfarbe.

Links übernehmen die Kontextfarbe (Persönlich Mint, Firma Bernstein, Admin `#FF9A8A`).

### Farben – Hell

Gleiche Token-Namen, Werte unter `:root`; die dunklen Werte unter `.dark` (bestehender Mechanismus in `lib/theme.tsx`).

| Token | Wert |
|---|---|
| `--bg` | `#F6F7F9` |
| `--bg-sidebar` | `#FFFFFF` |
| `--surface` | `#FFFFFF` |
| `--surface-2` | `#F1F3F6` |
| `--surface-inset` | `#ECEFF3` |
| `--control` | `#F1F3F6` |
| `--track` | `#E3E7EE` |
| `--border` | `#E3E7EE` |
| `--border-strong` | `#D3D9E2` |
| `--border-subtle` | `#ECEFF3` |
| `--text` | `#0E1218` |
| `--text-2` | `#2A3140` |
| `--text-muted` | `#4A5466` |
| `--text-subtle` | `#5B6577` |
| `--text-faint` | `#6B7588` |
| `--accent` | `#1FCB8F` (Flächen), Text/Links `#0A8F63` |
| `--on-accent` | `#04140D` |
| Firma-Akzent | `#E3A21A` (Flächen), Text `#9A6A08` |
| Admin-Akzent | `#E85A45` (Flächen), Text `#B83E2B` |

Im Hellmodus Kontrast jedes Text-/Hintergrundpaars mit einem Kontrastprüfer bestätigen (≥ 4.5:1, ab 24 px ≥ 3:1). Wo es nicht reicht, den Textwert abdunkeln, nicht die Fläche.

### Typografie

Schrift: **Geist** (Text), **Geist Mono** (Befehle, Codes, Timer, Tastenkürzel, Kurzcodes wie `K8s`). Zahlen in Statistiken, Tabellen und Timern mit `font-variant-numeric: tabular-nums`.

| Stufe | Größe / Zeilenhöhe | Gewicht | Laufweite | Einsatz |
|---|---|---|---|---|
| Display | 38 px / 1.15 | 600 | −0.03em | Lektionstitel |
| H1 | 32–34 px / 1.15 | 600 | −0.025em | Seitentitel, Begrüßung |
| H1 Quiz | 24 px / 1.4 | 600 | −0.015em | Fragetext |
| H2 Hero | 26 px / 1.2 | 600 | −0.02em | Titel in Hero-Karten |
| H2 | 24 px (Lektion) / 18 px (Seiten) | 600 | −0.02em / −0.01em | Abschnitte |
| H3 | 15–17 px | 600 | 0 | Kartentitel |
| Body Lektion | 16 px / 1.75 | 400 | 0 | Fließtext in Lektionen |
| Lead | 17 px / 1.65 | 400 | 0 | Einleitung unter Lektionstitel |
| Body | 14–15 px / 1.5 | 400 | 0 | Standard |
| Small | 12–13 px | 400–500 | 0 | Meta, Tabellen |
| Overline | 11–12 px, GROSS | 600 | 0.06–0.08em | Abschnittslabels („Weitermachen“, „Kontext“) |

### Radius, Abstände, Schatten, Bewegung

- **Radius:** `xs 6` (Inline-Code, Kbd) · `sm 8–9` (kleine Controls, Nav-Einträge) · `md 10–11` (Buttons, Inputs) · `lg 12` (Innenpanels, Callouts) · `xl 14` (Antwortkacheln, Tabellencontainer, Stat-Kacheln) · `2xl 16` (Karten) · `3xl 18` (Hero) · `full` (Pills, Badges, Avatare).
- **Abstände:** 4-px-Raster. Seitenpadding Desktop `28–40 px`, Mobil `16 px`. Abstand zwischen Sektionen `24–28 px`, zwischen Karten `12–16 px`.
- **Schatten:** im Dunkelmodus praktisch keine; Tiefe entsteht über Flächenstufen (`bg → surface → surface-2`). Einzige Ausnahme: Sheets/Drawer (`-24px 0 48px rgba(0,0,0,.35)`) und Dialoge.
- **Bewegung:** 150 ms für Hover/Zustände, 200–250 ms für Einblenden (Feedback-Panel, Sheet). `prefers-reduced-motion` respektieren.
- **Touch-Ziele:** mindestens 40 px Höhe, primäre Aktionen 44–46 px.
- **Icons:** `lucide-react`, Strichstärke 1.8–2, 16–18 px. **Keine Emojis.**

### Sprache und Begriffe

- Alle UI-Texte über `lib/i18n.tsx`, **Deutsch und Englisch vollständig**. Kein englischer Text in der deutschen Oberfläche und umgekehrt.
- Feste Begriffe: „Merkzettel“ (nicht „Spickzettel“), „Kurz-Check“, „Prüfungssimulation“, „Wiederholen“, „Kursgruppe“, „Lernpfad“, „Pflichtschulung“, „Internes Learning“, „Prüfungsplaner“, „Zertifikats-Register“, „Voucher“.

---

## U1 – Fundament: Tokens und Komponenten

**Ziel:** Jede spätere Seite wird nur noch aus Tokens und `components/ui/*` gebaut.

### Tokens

- [x] Alle Tokens aus [Designsprache](#designsprache-verbindlich) in `app/globals.css`: Werte in `:root` (hell) und `.dark`, über `@theme inline` als Tailwind-Farben verfügbar (`bg-surface`, `text-muted`, `border-strong`, `bg-accent`, …), Radius- und Schriftskala ebenso.
- [x] Kontextfarben als **ein** Satz Variablen (`--ctx-accent`, `--ctx-on-accent`, `--ctx-sidebar`, `--ctx-sidebar-border`, `--ctx-switcher`, `--ctx-switcher-border`, `--ctx-active`, `--ctx-label`), umgeschaltet über ein Attribut am Layout-Root: `data-context="personal" | "company" | "admin"`. Komponenten nutzen nur `--ctx-*`, nie die Kontextfarbe direkt.
- [x] `themeColor` in `app/layout.tsx` auf `#0A0C10` (dunkel) bzw. `#F6F7F9` (hell).
- [x] Prüfskript oder ESLint-Regel: im JSX keine Hex-Werte und keine Tailwind-Standardpaletten (`sky-*`, `slate-*`, `emerald-*`, `red-*`, `neutral-*`) mehr außerhalb von `components/ui` und `globals.css`. Bestehende Treffer stehen als Liste im PR und werden schrittweise mit den folgenden Phasen abgebaut.

### Komponenten (`components/ui/`)

Basis: **shadcn/ui** (MIT, Code liegt im Repo, Radix-Primitives darunter) – nur die unten genannten Bausteine übernehmen und auf die Tokens umstellen. Prüfen, dass Radix-Portale mit der CSP (Nonce) funktionieren.

- [x] `Button` – Varianten `primary` (Kontextakzent, Text `--ctx-on-accent`, 600), `secondary` (`--control`, Rahmen `--border-strong`), `ghost` (transparent, Rahmen), `inverted` (Admin). Größen `sm 36`, `md 44`, `lg 46` px. Optional Icon links/rechts (Pfeil rechts bei „Weiter“-Aktionen).
- [x] `Card` – `surface`, Rahmen `border`, Radius 16, Padding 18–24. Variante `hero` (Verlauf + Rahmen `#1F3A30`, Radius 18).
- [x] `Badge`/`Pill` – Radius `full`, 12 px, 500. Töne `accent | info | warning | danger | neutral`, jeweils weiche Fläche (12–14 % Alpha) + farbiger Text.
- [x] `StatTile` – Label (13, subtle), Wert (26–28, 600, tabular-nums), Unterzeile (12; optional farbig).
- [x] `ProgressBar` – Höhe 5/6/8 px, Track `--track`, Füllung Akzent oder Ton.
- [x] `SegmentedProgress` – N Segmente à 6 px, Lücke 4 px; Zustände offen/aktuell/richtig/falsch.
- [x] `ProgressRing` – SVG, r=52, Strich 10, Track `--track`, Wert mittig (28 px, 700) mit Unterzeile „von 100“.
- [x] `Tabs` (Unterstrich) und `SegmentedControl` (Pillen auf `--surface-inset`).
- [x] `Callout` – Töne `exam` (Mint, Ziel-Icon, „Prüfungsrelevant“), `mistake` (Bernstein, Warndreieck, „Häufiger Fehler“), `memo` (Info-Blau, Glühbirne, „Merksatz“), `info` (neutral, Schild-Icon). Aufbau: Icon-Kachel 32 px (Radius 9) + Overline-Titel 13/600 + Text 15/1.6. Fläche 6 % Alpha, Rahmen in abgedunkeltem Ton.
- [x] `Kbd` – Geist Mono 11 px, Rahmen `--border-strong`, Radius 5–6.
- [x] `Avatar` – Initialen, 26–34 px, farbige Fläche; `AvatarStack` mit −6 px Überlappung und 2 px Ring in `--surface`.
- [x] `DataTable` – Kopfzeile 12 px `--text-faint`, Zeilen mit `--border-subtle` oben, Zeilenhöhe ≥ 52 px, horizontal scrollbarer Container, Zahlen rechtsbündig mit tabular-nums.
- [x] `EmptyState` – Icon, Satz, eine klare Aktion. Ersetzt alle „Noch keine …“-Zeilen.
- [x] `Dialog`, `Sheet` (rechts, 360–420 px), `DropdownMenu`, `Select`, `Tooltip`, `Skeleton`, `Toast` (`sonner`).
- [x] `SearchField` mit `⌘K`-Hinweis (Funktion selbst siehe [Später](#später)).
- [x] Kurze Übersichtsseite (nur für Admins, z. B. `/admin/ui`) mit allen Komponenten in hell und dunkel – dient als Sichtprüfung.

### Gate U1

**Stand: erfüllt (geprüft).** Geprüft: `tsc`, `eslint`, 605 Tests, `next build`; `/admin/ui` in Dunkel/Hell bei 1280 und 390 px ohne horizontales Scrollen, Fokusring per Tab sichtbar, Dialog/Sheet/Menü/Toast öffnen unter der CSP ohne Konsolenfehler; Kontrast: `npm run check:contrast` (68 Paare, Ergebnis in [UI-KONTRAST.md](UI-KONTRAST.md)); Rohfarben-Ratchet: `npm run lint:ui` (Bestand 315 Treffer in 56 Dateien, darf nur sinken, Abbau mit U2–U9). Nicht geprüft: echte Screenreader.

- Alle Komponenten existieren, nutzen nur Tokens und sind auf der Übersichtsseite in hell/dunkel geprüft.
- Kontrast aller Textstufen auf `bg`, `surface`, `surface-2` gemessen und dokumentiert.
- Bestehende Tests grün; CSP ohne neue Verletzungen.

---

## U2 – App-Shell und Kontexttrennung

**Ziel:** Man sieht jederzeit, in welchem Bereich man ist. Entspricht der Sidebar in den Screens 1, 4, 5, 6, 7.

### Layouts

- [x] Drei Layouts mit eigener Navigation, jeweils `data-context` am Root:
  - Persönlich: `/`, `/cert/*`, `/profile`, `/account`, neue Seiten aus U8 → `personal`
  - Firma: `/company/*` → `company`
  - Admin: `/admin/*` → `admin`
- [x] Aufbau Desktop: Sidebar 248 px (Admin 232 px) links, Inhalt rechts; Inhalt nutzt die Breite (kein festes 780-px-Zentrum mehr). Lesbare Breiten nur dort, wo Text läuft (Lektion max. 740 px, Quiz max. 760 px).
- [x] Mobil (< 768 px): Sidebar wird zur oberen Leiste (Logo, Kontextname, Menü-Button) mit `Sheet` für die Navigation. Keine horizontale Seitenscroll-Leiste bei 390 px.
- [x] `components/Header.tsx` wird durch die Shell ersetzt. „Sign out“ gibt es nur noch im Benutzermenü.

### Sidebar (oben nach unten)

1. Logo-Kachel (30 px, Mint, „P“) + „ProofPath“ + „Beta“-Pill.
2. **Kontext-Switcher:** Kachel 32 px in Kontextfarbe (Persönlich: Mütze-Icon auf Mint-Soft; Firma: Firmenkürzel auf Bernstein; Admin: Zahnrad auf Koralle), darüber Overline „Kontext“ / „Firma · Admin“, darunter Kontextname, rechts Doppelpfeil. Öffnet `DropdownMenu` mit allen Kontexten, die die Person hat (Punkt in Kontextfarbe, Häkchen beim aktiven). Nur Kontexte anzeigen, für die die Person Rechte hat (serverseitig ermittelt, wie heute in `app/layout.tsx`).
3. Navigation des Kontexts (Einträge siehe Phasen U3–U9), Höhe 40 px, aktiver Eintrag mit `--ctx-active`; Zähler als Pill in Kontextfarbe (z. B. „Wiederholen 12“, „Interne Learnings 1“).
4. Nur Persönlich: Abschnitt „Bereiche“ mit Direktlinks zu Firma/Admin (farbiger Punkt).
5. Unten: Firma zeigt Plan-Kachel („Team · 14 / 25 Plätze“ mit Balken); Persönlich zeigt Benutzerzeile (Avatar, Name, „Konto, Sprache, Theme“) → öffnet Benutzermenü mit Profil, Konto & Daten, Sprache, Hell/Dunkel, Abmelden.

### Kopfzeile im Inhalt

- [x] Persönlich: Suchfeld (max. 460 px, `⌘K`-Hinweis), rechts Streak-Pill (Bernstein-Soft, Flammen-Icon, „9 Tage Serie“) und Benachrichtigungs-Button (44 px).
- [x] Admin: Warnstreifen über der gesamten Seite: Schild-Icon, „PLATTFORM-ADMIN“, „Änderungen wirken für alle Kunden und Lernenden.“, rechts Link „Zur Lernansicht“.

### Gate U2

**Stand: erfüllt (geprüft), mit zwei bewussten Lücken.** Geprüft (Browser, Playwright): Kontexte `personal`/`company`/`admin` per `data-context`, Kontextwechsel ohne Neuanmeldung, Lernende sehen weder Firma noch Admin (Switcher nicht klickbar, keine „Bereiche“), Abmelden nur im Benutzermenü, Mobil 390 px: Menü-Sheet erreichbar, kein horizontales Scrollen auf `/`, `/company`, `/admin`, `/profile`, `/account` in Dunkel/Hell; Tests (612) grün. **Lücken:** (1) Das Suchfeld ist sichtbar, aber deaktiviert – die Funktion (⌘K) steht unter „Später“. (2) Der Benachrichtigungs-Button fehlt, weil es noch keine Benachrichtigungen gibt (kein toter Knopf). Zähler-Pills in der Sidebar (z. B. „Wiederholen 12“) folgen mit U3/U6. Nicht geprüft: Screenreader.

- Alle bestehenden Seiten laufen in der neuen Shell, keine Seite mehr mit altem Header.
- Kontextwechsel ohne Neuanmeldung; Rechte unverändert serverseitig geprüft (bestehende Tests grün).
- Mobil 390 px: Navigation erreichbar, keine horizontale Scrollleiste.

---

## U3 – Lern-Dashboard (Screen 1)

Route `/` (eingeloggt). Ersetzt die heutige Kurskachel-Liste.

- [x] **Begrüßung:** „Guten Morgen/Tag/Abend, {Name}“ (34 px) + Zeile „Heute fällig: {n} Wiederholungen · ca. {m} Minuten. Deine {Kurs}-Prüfung ist in {t} Tagen.“ (zweiter Satz nur mit geplanter Prüfung aus U8).
- [x] **Hero „Weitermachen“** (Card `hero`, 2/3 Breite): Overline „Weitermachen“ + „zuletzt vor …“; Kurs · Domain; Titel der Sektion (26 px); „Sektion x von y“ mit Prozent und Balken 8 px (max. 520 px breit); Buttons „Weiterlernen →“ (primary) und „{n} Wiederholungen“ (secondary). Daten: zuletzt bearbeitete Sektion des Nutzers. Ohne Historie: „Ersten Kurs starten“ mit Katalog-Link.
- [x] **Karte „Prüfungsbereitschaft“** (1/3): `ProgressRing` mit Readiness des Hauptkurses (Wert aus `ReadinessCard`/`lib/server/readiness`), daneben bis zu 3 Domains mit Ampelpunkt (stark/üben/schwach, Schwellen wie im Readiness-Service), unten Zeile „Prüfung in {t} Tagen · Simulieren“ (nur mit Prüfungstermin, sonst „Prüfung planen“ → U8).
- [x] **Vier Stat-Kacheln:** Fragen beantwortet (+Woche), Trefferquote (Δ Punkte), Fällige Karten (Minuten), Lernzeit gesamt (diese Woche). Nur Werte, die es serverseitig schon gibt oder in diesem Schritt ergänzt werden; keine erfundenen Kennzahlen.
- [x] **„Meine Zertifizierungen“** als Raster (min. 280 px pro Karte): Kurzcode-Kachel 42 px (Geist Mono, Farbe der Katalog-Kursgruppe aus U7), Titel, Version, „x von y Lektionen“ + Prozent + Balken, Status-Pill und Button je Zustand:

  | Zustand | Pill | Button |
  |---|---|---|
  | Prüfung geplant | Mint „Prüfung in {t} Tagen“ | „Weiter“ |
  | Begonnen | Info „In Arbeit“ | „Weiter“ |
  | Nicht begonnen | Neutral „Noch nicht gestartet“ | „Starten“ |
  | Abgeschlossen | Mint „Abgeschlossen“ | „Wiederholen“ |

  Link „Katalog durchsuchen“ rechts über dem Raster.
- [x] **Seitenkarte „Diese Woche“:** 7 Balken Mo–So (Minuten pro Tag, heute in Mint, Tage ohne Lernen als Track-Farbe), Wochenziel mit Balken, darunter **Empfehlung** zur schwächsten Domain/Objective mit Link „Lücke schließen →“ (startet eine gezielte Sitzung).
- [x] Bestehende `TodayDashboard`/`ActivityTrends` in diese Bausteine überführen statt doppelt anzeigen.

**Stand Gate U3: erfüllt (geprüft), mit Abweichungen.** Geprüft (Browser, Fixture-Nutzer): Dashboard in Dunkel/Hell bei 1440 und 390 px ohne horizontales Scrollen, leerer Zustand (Nutzer ohne Kurse: „Ersten Kurs starten“ → `/catalog`), Zahlen kommen aus Quiz-/Prüfungsantworten, Lektionsabschlüssen, Wiederholungen und Readiness; Logik (Begrüßung, Zustände, Ampel, Wochenbalken) in `lib/dashboard/logic.test.ts`; neue Seite `/catalog` mit denselben Kursgruppen als Filter. **Abweichungen:** (1) **Keine Lernzeit-Kachel und keine Minuten-Balken:** Lernzeit wird nicht erfasst. Stattdessen „Lektionen erledigt“ und Balken mit beantworteten Fragen je Tag; das Wochenziel zählt aktive Tage (Wunschtage aus dem Lernprofil). (2) „ca. m Minuten“ für fällige Karten ist ein Richtwert (0,6 Min je Karte), kein Messwert. (3) Die Prüfungsfrist stammt noch aus dem Lernprofil (`study_profiles.exam_date`), bis U8 den Planer liefert. (4) Beantwortete Fragen zählen Quiz- und Prüfungsantworten; Tagessitzungs-Antworten stehen nur in der Wiederholungsplanung (keine Historie). (5) `TodayDashboard`/`ActivityTrends` bleiben auf der Kursseite `/cert/[id]` (pro Kurs), sie wurden nicht auf die Startseite verdoppelt. (6) „Meine Zertifizierungen“ zeigt Kurse mit Aktivität, Lernprofil oder Zuweisung. (7) Die Begrüßungszeit richtet sich nach der Uhr im Browser (zuerst neutral „Hallo“).

**Gate U3 (Vorgabe):** Screen 1 in hell/dunkel nachgebaut; alle Zahlen aus echten Daten; leere Zustände (neuer Nutzer, kein Termin, keine Kurse) gestaltet.

---

## U4 – Quiz und Prüfung (Screen 2)

Gilt für Abschnittsquiz, Übungssitzungen, Wiederholung, Remediation und Abschlussprüfung (`QuizQuestionCard`, `StudySession`, `RemediationSession`, `ExamSession`, `ExamNavigator`, `ExamTimer`).

### Fokusmodus

- [x] Kein Shell-Navigation während einer Sitzung. Fokusleiste oben (`--bg-sidebar`): Schließen (44 px, X), Kontext („CKA · Domain 3 · Troubleshooting“ + Modus „Übungsmodus“/„Prüfungsmodus“), `SegmentedProgress` mit Text „Frage x von y“ und „a richtig · b falsch“ (im Prüfungsmodus nur „x von y beantwortet“), rechts Timer (Geist Mono, tabular-nums).
- [x] Verlassen fragt per `Dialog` nach, wenn Antworten ungespeichert wären.

### Frage

- [x] Kopf: Objective-Pill (Info), Schwierigkeit, rechts „Markieren“ (Flaggen-Icon; aktiv Bernstein-Soft „Markiert“).
- [x] Fragetext 24 px / 1.4, über `RichText` (Inline-Code darin Geist Mono auf `--control`).
- [x] Antwortoptionen als Kacheln: min. 60 px hoch, Radius 14, Buchstaben-Badge A–D (30 px, Geist Mono). Zustände:

  | Zustand | Fläche | Rahmen | Badge |
  |---|---|---|---|
  | neutral | `surface` | `#252C3B` | `control` |
  | gewählt (vor Aufdeckung) | Info 8 % | `info` | Info gefüllt |
  | richtig | Mint 8 % | `accent` | Mint gefüllt + Häkchen rechts |
  | falsch gewählt | Koralle 8 % | `danger` | Koralle gefüllt + X rechts |
  | übrige nach Aufdeckung | `surface-inset` | `border-subtle` | gedimmt, Text `--text-faint` |

  Richtig/falsch nie nur über Farbe: immer Icon dazu.
- [x] **Selbsteinschätzung** (bestehendes `askConfidence`): nach Auswahl erscheint Leiste „Wie sicher bist du?“ mit drei Pills „Geraten / Unsicher / Sicher“ und Hinweis „fließt in deine Wiederholungsplanung ein“. Erst danach wird aufgedeckt.
- [x] **Feedback-Panel** (blendet in 200 ms ein): Kreis-Icon + „Richtig“ bzw. „Nicht ganz – richtig ist B“, rechts „Selbsteinschätzung: …“; Erklärung (15 px / 1.65); Abschnitt **„Warum die anderen nicht passen“** (je Option eine Zeile); Fußzeile mit knapper Quelle, „Frage melden“ (bestehende Meldefunktion) und „Nächste Frage →“.
- [x] **Tastatur:** `A–D` bzw. `1–4` wählen, `Enter` weiter/bestätigen, `F` markieren, `Esc` Schließen-Dialog. Hinweiszeile mit `Kbd` unter der Frage. Kürzel nur aktiv, wenn kein Eingabefeld fokussiert ist.

### Navigator (rechte Spalte, 260–300 px)

- [x] Raster 5 Spalten, Kacheln 40 px mit Fragenummer: offen / richtig (`#1F4A3B`) / falsch (`#4A2622`) / markiert (2 px Bernstein-Rahmen) / aktuell (2 px heller Rahmen). Legende darunter. Im Prüfungsmodus nur „beantwortet/offen/markiert“, keine Richtig-Farben.
- [x] Hinweiskarte: „Im Prüfungsmodus gibt es kein Sofort-Feedback – Auswertung erst am Ende.“
- [x] Mobil: Navigator als `Sheet` hinter einem Button in der Fokusleiste.

### Datenanforderung

- [x] Erklärung **je falscher Option** in Fragen: Schema um `optionRationales` (zweisprachig, je Option) erweitern, Generator und Validierung anpassen, Backfill-Skript nach dem Muster `cheatsheets:backfill`. Fragen ohne Begründungen zeigen den Abschnitt nicht an.

### Ergebnisseite (ohne eigenen Screen)

- [ ] Nach Abschlussprüfung/Simulation: `ProgressRing` mit Ergebnis und (falls vorhanden) Bestehensgrenze als Markierung, Balken je Domain (stark/schwach), Buttons „Falsche Antworten durchgehen“ und „Gezielt üben“ (Remediation), Konfetti nur bei Bestehen und nur einmal. *(Konfetti bewusst nicht gebaut: ohne Wirkung auf das Lernen, Bestehen ist bei Skalenpunkten wie 700/900 nicht zuverlässig prozentual bestimmbar; Ring + Bestehensmarke nur bei Prozent-Skala.)*

**Stand Gate U4: erfüllt (geprüft), mit Lücken.** Geprüft (Browser, Playwright, Fixture-Kurs): Abschnitts-Kurz-Check und Abschlussprüfung komplett nur mit Tastatur (A–D, Enter, F, Esc, Tab) durchlaufen, Dunkel/Hell, 1280 und 390 px ohne horizontales Scrollen; Fokusrahmen legt sich per Portal über die Shell, die währenddessen `inert` ist; Verlassen mit Antworten fragt per Dialog nach; Test: Prüfungsmodus enthält vor Abgabe weder Richtig-/Falsch-Zustände noch Feedback, Selbsteinschätzung oder Begründungen; Tests (627) grün. **Lücken:** (1) Die Tagessitzung (`StudySession`) hat weiterhin kein Sofort-Feedback, weil die Richtigkeit nur serverseitig bei der Abgabe geprüft wird – sie nutzt Fokusleiste, Kacheln, Selbsteinschätzung und Navigator, aber keine Erklärung je Frage. (2) Begründungen („Warum die anderen nicht passen“) erscheinen nur, wo sie gespeichert sind: neue Kurse über den Generator, bestehende nach `npm run rationales:backfill -- <slug>` (nicht mit echter KI geprüft). (3) Kein Konfetti (siehe oben). (4) Schwierigkeit-Pill nur im Abschnitts-Quiz und in der Wiederholung; Prüfung zeigt sie nicht (Vorab-Hinweis). (5) Echte Screenreader nicht geprüft.

**Gate U4 (Vorgabe):** Ein kompletter Durchlauf (Übung und Prüfung) nur mit Tastatur möglich; Screen 2 in hell/dunkel nachgebaut; Prüfungsmodus verrät vor Abgabe nichts über Richtigkeit (Test).

---

## U5 – Lernmaterial und Praxisbeispiele (Screen 3)

Route `/cert/[id]/section/[sectionId]`.

### Seitenaufbau

- [x] Kopfleiste: Breadcrumb (Übersicht / Kurs / Domain / Sektion), rechts „Merkzettel“ (secondary) und „Kurz-Check starten“ (primary). Darunter **Lesefortschritt** als 2-px-Linie in Mint über die volle Breite.
- [x] Drei Spalten (Desktop): **Gliederung** links (240–280 px; Sektionen der Domain mit Kreis-Status: erledigt Mint gefüllt mit Häkchen, aktuell Mint-Ring, offen grau; darunter Domain-Fortschritt mit Gewichtung „30 % der Prüfung“), **Artikel** Mitte (max. 740 px), **„Auf dieser Seite“** rechts (200–220 px; H2-Anker, aktiver mit 2-px-Mint-Linie; darunter Quellenkarte mit „Inhalt melden“). Tablet: rechte Spalte entfällt. Mobil: nur Artikel, Gliederung als `Sheet`.
- [x] Artikelkopf: Pills „Sektion x von y“, „ca. n Min.“, optional „Hands-on“ (Mint); Titel 38 px; Lead 17 px.
- [x] Ende jeder Sektion: Hero-Karte „Sitzt das?“ mit „3 Fragen zu dieser Sektion · ca. 2 Min.“ und „Kurz-Check starten“ (bestehendes `SectionQuiz`).

### Neue Inhaltsblöcke im Markdown

`RichText` bleibt sicher (kein rohes HTML, keine Links, keine Bilder). Die neuen Blöcke werden über **Markdown-Syntax** erkannt und auf Komponenten gemappt:

| Block | Syntax | Darstellung |
|---|---|---|
| Prüfungsrelevant | `> [!EXAM]` | `Callout exam` |
| Häufiger Fehler | `> [!MISTAKE]` | `Callout mistake` |
| Merksatz | `> [!MEMO]` | `Callout memo` |
| Hinweis | `> [!NOTE]` | `Callout info` |
| Terminal | ` ```console ` | Terminal-Block (s. u.) |
| Code mit Datei | ` ```yaml title="deployment.yaml" {7-8} ` | Codeblock mit Kopfzeile und hervorgehobenen Zeilen |
| Varianten | `:::tabs` mit `::tab[Imperativ (kubectl)]` | `SegmentedControl` + Inhalt |
| Ablauf | `:::steps` mit Listenpunkten `Label \| Befehl` | Schrittkette (Kästen mit Pfeilen, umbrechend) |
| Praxisbeispiel | `:::practice` mit `### Szenario`, `### Aufgabe`, `### Lösung`, `### Warum` | Praxiskarte (s. u.) |

- [x] Parser: `remark-gfm` (vorhanden) + `remark-directive` für `:::`-Blöcke; GFM-Alerts über eigenes kleines Remark-Plugin. Unbekannte Direktiven werden als normaler Text gezeigt, nie als HTML.
- [x] **Syntax-Highlighting:** von `highlight.js` (Client) auf **Shiki über `rehype-pretty-code` serverseitig** umstellen, wenn `RichText` dafür in eine Server-Komponente überführt werden kann; sonst `highlight.js` behalten und nur Kopfzeile/Zeilenmarkierung ergänzen. Entscheidung im PR begründen. Farbschema an Tokens anpassen (Schlüssel `#8DBBFF`, Werte `#F4B740`, Kommentare/Ausgabe `#7C8699`).
- [x] **Terminal-Block:** Kopfzeile (`#121722`) mit drei grauen Punkten, „terminal · bash“, „Kopieren“-Button; Zeilen mit `$ ` werden als Befehl erkannt (Prompt Mint, Befehl hell), alle anderen als Ausgabe (grau). Kopieren übernimmt **nur die Befehle** ohne `$` und ohne Ausgabe. Zeilen mit Fehlern lassen sich markieren (`{7}` → roter Zeilenhintergrund 10 %).
- [x] **Praxiskarte:** Kopf mit Werkzeug-Icon und Overline „Praxisbeispiel“ (Info-Blau) + Zeitangabe; „1 · Szenario“ und „2 · Aufgabe“ als zwei Kacheln nebeneinander; „3 · Lösung“ standardmäßig **eingeklappt** (Button „3 · Lösung anzeigen“), darin optional `:::tabs`; „4 · Warum das funktioniert“ erscheint mit der Lösung.
- [x] Tabellen: Container mit Radius 14 und horizontalem Scroll, Kopf `#151A23`, erste Spalte bei Befehlen in Geist Mono Mint.

### Generator

- [x] `course_generation.md` und die Generierungs-Prompts um die Blöcke erweitern: je Sektion mindestens ein `[!EXAM]`, bei Hands-on-Themen mindestens ein `:::practice` und Terminal-Blöcke mit realistischer Ausgabe; `[!MISTAKE]` nur, wenn die Quelle einen typischen Fehler hergibt. Nichts erfinden, was nicht in den Quellen steht (Leitplanke Source Grounding).
- [x] Zod-Schema/Validierung: Direktiven müssen korrekt geschlossen sein, `:::practice` braucht alle vier Teile, sonst Validierungsfehler wie bei anderen Qualitätsprüfungen.
- [x] Backfill-Skript für bestehende Kurse (nur Ergänzung der Blöcke, Inhalte bleiben), mit Kostenanzeige und Rate-Limit wie bei anderen kostenpflichtigen Aktionen; bei internen Lernpfaden prüft die Firma das Ergebnis wie bisher.

**Stand Gate U5: erfüllt (geprüft), mit Lücken.** Geprüft: Seite `/cert/[id]/section/[sectionId]` mit Fixture-Lektion in Dunkel/Hell bei 1440 und 390 px ohne horizontales Scrollen (Browser), drei Spalten, Gliederung als Sheet mobil, Lesefortschritt, „Auf dieser Seite“; alle Blocktypen haben Render-Tests inkl. „kein HTML/Skript/Link/Bild durch“ und „Port:443 wird nicht zur Direktive“; Kopieren aus dem Terminal liefert im Browser nur `kubectl get pods\nkubectl describe pod web`; Validierung und Prompt-Test; Backfill mit Prüfregeln (Text bleibt, Blöcke gültig) auf echter DB getestet; 662 Tests grün. **Entscheidung Highlighting:** `highlight.js` (rehype-highlight) bleibt, weil `RichText` in Client-Komponenten (Quiz, Offline-Reader) läuft; Kopfzeile, Zeilenmarkierung und Terminal bauen wir selbst, Farben aus `--code-*`. **Lücken:** (1) „Mit echter CKA-Sektion nachgebaut“ und „ein neu generierter Kurs enthält die Blöcke“ nicht geprüft – es gibt hier keinen KI-Zugang; geprüft ist nur, dass Prompt und Validierung die Blöcke verlangen/prüfen (Fixture-Lektion mit Blöcken per SQL). (2) `npm run lessons:blocks` nicht mit echter KI gelaufen. (3) Die „Hands-on“-Erkennung und Lesezeit sind Heuristiken. (4) Kein Kostenlimit-Abbruch im Backfill, nur Kostenanzeige.

**Gate U5 (Vorgabe):** Screen 3 mit echter CKA-Sektion nachgebaut; alle Blocktypen haben Tests (Rendern + „kein HTML durch“); ein neu generierter Kurs enthält die Blöcke; Kopieren aus Terminal-Blöcken liefert nur Befehle.

---

## U6 – Firmenbereich und Firmen-Kursgruppen (Screen 4)

Route `/company`. Ersetzt `CompanyTabs` durch Sidebar-Navigation im Firmenkontext.

### Navigation (Firma)

Übersicht · Mitarbeitende · Kursgruppen · Lernpfade · Zertifikate (U9) · Pflichtschulungen · Interne Learnings (Zähler) · Aufgaben & Module · Onboarding · Dokumente · Einstellungen. Bestehende Tab-Inhalte wandern 1:1 auf eigene Unterseiten (`/company/members`, `/company/groups`, …).

### Übersicht

- [x] Kopf: Overline „Firmenbereich“, Titel „Übersicht“, rechts „Mitarbeitende einladen“ (secondary) und „Lernpfad zuweisen“ (primary Bernstein, Plus-Icon).
- [x] **Datenschutz-Zeile** (statt Textwand): Schild-Icon in Mint, „**Privacy by Design:** Du siehst Status und Termine. Punkte, Antworten und Lernstand bleiben bei den Lernenden.“, rechts „Mehr erfahren“ (öffnet `Dialog` mit dem bisherigen ausführlichen Text).
- [x] **Vier Stat-Kacheln:** Mitarbeitende (offene Einladungen), Aktive Lernpfade (über n Zertifizierungen), Überfällig (Koralle, „Erinnerung möglich“), Abschlussquote letzte 90 Tage (Mint). Nur aus Status-Feldern berechnet (Leitplanke).
- [x] **Kursgruppen** (Raster, min. 280 px): je Karte Farbkachel + Name + „n Kurse · Herkunft“, Kurs-Chips mit Punkt (Katalogkurs Info-Blau, Internes Learning Bernstein, Pflichtschulung Koralle; Legende über dem Raster), unten `AvatarStack` + „n Personen“/„Alle · 14“ + Button „Zuweisen“. Letzte Kachel gestrichelt: „Kursgruppe anlegen“ mit Beispielen.
- [x] **Zuweisungen** (`DataTable`): Filter-Segment „Alle / Überfällig / Abgeschlossen“, Personensuche; Spalten Person (Avatar, Name, Team), Lernpfad, Status-Pill (Abgeschlossen Mint, In Bearbeitung Info, Überfällig Koralle, Nicht begonnen neutral), Frist (überfällig in Koralle), Abgeschlossen am. **Keine weiteren Spalten** (Leitplanke `COMPANY_STATUS_FIELDS`).
- [x] Seitenspalte: **Pflichtschulungen** (je Schulung „x / y“ + Balken + Fälligkeit) und **Offene Einladungen** (gestrichelter Avatar, Adresse, „seit n Tagen“, „Erinnerung senden“).
- [x] „Lernpfad zuweisen“ als `Dialog` in drei Schritten: Personen wählen (Mehrfachauswahl mit Suche) → Lernpfad **oder Kursgruppe** wählen → Frist. Ersetzt das heutige Inline-Formular.
- [x] Sidebar unten: Plan-Kachel (nur wenn Platz-Limits existieren; sonst weglassen).

### Datenmodell Firmen-Kursgruppen

- [x] `company_course_groups` (`id`, `organization_id`, `name` (de/en), `color` aus fester Palette, `position`, `created_at`, `created_by`).
- [x] `company_course_group_items` (`group_id`, `certification_id`, `position`) – m:n; erlaubt Katalogkurse (mit Firmenfreigabe), interne Lernpfade und Pflichtschulungen der eigenen Firma. Serverseitig prüfen, dass jeder Kurs für die Firma freigegeben bzw. ihr eigener ist.
- [x] **Gruppe zuweisen** erzeugt für jede Person und jeden Kurs eine normale Zuweisung (bestehende Logik), gemeinsame Frist. Die Gruppe wird an der Zuweisung vermerkt (`assignment.group_id`, nullable), damit „Alle · 14“ und Avatare berechnet werden können. Spätere Änderungen an der Gruppe ändern bestehende Zuweisungen **nicht** automatisch; Hinweis im Dialog.
- [x] Rechte: anlegen/ändern/zuweisen nur Rollen, die heute zuweisen dürfen (Firmen-Admin, Mentor laut Phase 3). Audit-Event bei Anlegen, Ändern, Zuweisen.
- [x] Architektur-Test erweitern: Kursgruppen-Code importiert keine Lerndaten-Tabellen.

**Stand Gate U6: größtenteils erfüllt (geprüft), mit Abweichungen.** Geprüft: Übersicht in Dunkel/Hell bei 1440 und 390 px ohne horizontales Scrollen (Firmen-Admin und Mentor); eine Testfirma legt im Browser eine gemischte Gruppe (Katalogkurs + interne Lernpfade) an und weist sie per Dialog in drei Schritten zu, die Zuweisungen erscheinen in der Statusansicht; DB-Tests (`course-groups.test.ts`): gemischte Gruppe, nur freigegebene/eigene Kurse (fremde, nicht freigegebene, Entwürfe → 404), Rechte (Lernende 403), Mandantentrennung (fremde Gruppe 404), Frist und Audit, Löschen lässt Zuweisungen bestehen; `company-architecture.test.ts` (nur die zwei neuen Tabellen erlaubt) und `results-privacy.test.ts` grün; 685+ Tests. **Abweichungen:** (1) **Die übrigen Tabs wurden nicht auf eigene Routen verschoben:** Pflichtschulung, Interne Learnings, Aufgaben & Module, Onboarding, Dokumente, Team und Anmeldung liegen weiter unter `/company?tab=…` (jetzt über die Sidebar erreichbar, die Tab-Leiste entfällt); `/company/members`, `/company/groups` usw. gibt es nicht. (2) In der Navigation fehlen „Mitarbeitende“, „Kursgruppen“ (liegen auf der Übersicht) und „Zertifikate“ (U9), „Einstellungen“. (3) „Erinnerung senden“ bei offenen Einladungen und die Plan-Kachel (Platz-Limits gibt es nicht) fehlen. (4) „Abschlussquote“ = abgeschlossene Zuweisungen ÷ alle Zuweisungen der letzten 90 Tage (Zuweisungsdatum). (5) Kurs-Chips: „Pflichtschulung“ gilt, wenn der Kurs Ziel einer Pflichtregel der Firma ist. (6) Die Zeile „Zuweisungen“ hat die zusätzliche Aktion „Verwalten“ (Frist ändern/Entfernen) aus dem alten Panel; Daten-Spalten bleiben auf `COMPANY_STATUS_FIELDS` beschränkt (Praxis-Zähler entfallen in der Tabelle).

**Gate U6 (Vorgabe):** Screen 4 nachgebaut; eine Testfirma legt eine gemischte Gruppe an und weist sie zu; Statusansicht zeigt die entstandenen Zuweisungen; `results-privacy.test.ts` weiter grün.

---

## U7 – Plattform-Admin und Katalog-Kursgruppen (Screen 5)

Route `/admin`.

### Navigation (Admin)

Kurskatalog · Kursgruppen · Generierungen (Zähler laufender Jobs) · Quellen · Gemeldete Inhalte · Kundenanfragen · Firmen · KI-Einstellungen.

### Kurskatalog

- [x] Kopf: „Kurskatalog“ + Zeile „{n} Zertifizierungen in {g} Kursgruppen · {l} Lektionen · {q} Fragen“; rechts „Manuell anlegen“ (secondary) und „Kurs generieren“ (inverted, Funken-Icon).
- [x] **Laufender Job** als Leiste über dem Katalog (nur wenn ein Job läuft): Spinner-Icon, „Generierung läuft: {Kurs}“, „Schritt x / 5 · {Schrittname}“, 5-teiliger Balken (aktueller Schritt anteilig), rechts Kosten „$ist / $Zielbudget“ und „Limit $Sicherheitslimit“ (Werte aus dem bestehenden Job). Mehrere Jobs untereinander.
- [x] **Filter-Chips** je Kursgruppe mit Farbpunkt und Anzahl, „Alle“ zuerst, am Ende gestrichelter Chip „Gruppe anlegen“.
- [x] **Katalog gruppiert:** je Gruppe ein Abschnitt mit Kopf (Farbkachel, Name, „n Kurse · q Fragen“, Buttons „Umbenennen“ und „Reihenfolge“), darin je Kurs eine Zeile: Titel, „Anbieter · Version“ (Geist Mono 11.5), „d Domains · l Lektionen · q Fragen“, Status-Pill, **`Select` „Gruppe“** (ändert die Zuordnung sofort, mit Toast und Rückgängig), „Öffnen →“.
- [x] Abschnitt **„Nicht zugeordnet“** erscheint nur, solange dort Kurse liegen.
- [x] Unter dem Katalog drei Kacheln: Kundenanfragen (offen), Gemeldete Inhalte (offen), KI-Kosten diesen Monat (aus `objective_generation_costs`/Job-Kosten).

### „Kurs generieren“ als Assistent

- [x] `Sheet` rechts (360–420 px) statt der heutigen dauerhaften Seitenspalte. Schritte als 4-teilige Leiste: **Basis** (Titel, Beschreibung, Sprache, Anbieter, Version, **Kursgruppe**) → **Quellen** (Drop-Zone „PDF ablegen oder URLs einfügen“, Liste mit Typ-Badge `PDF`/`URL` und Prüf-Häkchen, „max. 30“) → **Budget** (Zielbudget, Sicherheitslimit, „Automatisch veröffentlichen“) → **Prüfen** (Zusammenfassung, „Kurs generieren“). Footer: „Zurück“ / „Weiter zu …“.
- [x] „Kursstruktur manuell anlegen“ ebenfalls als `Sheet`.

### Datenmodell Katalog-Kursgruppen

- [x] `course_categories` (`id`, `slug`, `name` (de/en), `color` aus fester Palette, `position`).
- [x] `certifications.category_id` (nullable, FK) – **genau eine** Gruppe je Kurs (n:1). Startwerte: Infrastruktur & Netzwerk (Info-Blau), Plattform & Kubernetes (Mint), Observability (Bernstein), Security (Koralle), Cloud (Violett).
- [x] Die Gruppenfarbe färbt die Kurzcode-Kachel im Lern-Dashboard (U3) und im Prüfungsplaner (U8). Der Kurzcode (`K8s`, `SEC+`, `PCA`, `AWS`, `CCNA`) wird als Feld `certifications.short_code` gepflegt.
- [x] Nutzer- und Firmenkatalog („Katalog durchsuchen“) zeigt dieselben Gruppen als Filter.
- [x] Audit-Event bei Anlegen/Umbenennen/Zuordnen.

**Stand Gate U7: erfüllt (geprüft), mit Abweichungen.** Geprüft: Katalog in Dunkel/Hell bei 1280 und 390 px ohne horizontales Scrollen; Kurs per Auswahlfeld verschieben → Toast mit „Rückgängig“; Gruppe anlegen/umbenennen/Reihenfolge; Assistent als Sheet mit 4 Schritten (Weiter ist gesperrt, solange Pflichtangaben/Quellen fehlen); Zuordnung ist auditiert (`course_category.*`), interne Firmenlernpfade sind für die Gruppen-API nicht auffindbar und erscheinen nicht mehr im Betreiberkatalog; `npm run course:e2e -- happy-path` läuft mit Fake-KI durch und übernimmt Kursgruppe + Kurzcode auf den fertigen Kurs; 671 Tests grün. **Abweichungen/Lücken:** (1) Das „Gruppe“-Feld nutzt ein natives `<select>` statt des Radix-`Select` (zugänglich, einfach testbar). (2) Die Admin-Navigation hat nur Kurskatalog, Kursanfragen und Komponenten, weil die Seiten Kursgruppen/Generierungen/Quellen/Gemeldete Inhalte/Firmen/KI-Einstellungen als eigene Routen noch nicht existieren (Gruppen und Generierungen liegen im Katalog; Zähler laufender Jobs fehlt in der Navigation). (3) Der „Nutzer- und Firmenkatalog“ zeigt die Gruppen als Filter erst mit U3/U6. (4) Die Drop-Zone „PDF ablegen“ im Quellen-Schritt ist die bestehende URL-/Bundle-Eingabe (`SourceUrlInput`); Typ-Badges PDF/URL und Prüf-Häkchen sind nicht neu gebaut. (5) Der „Schritt x / 5“-Balken schätzt den laufenden Schritt, nur bei den Lernzielen aus echten Zahlen.

**Gate U7 (Vorgabe):** Screen 5 nachgebaut; Kurs per Dropdown verschieben funktioniert und ist auditiert; Generierung über den Assistenten läuft mit Fake-KI durch (`course:e2e`).

---

## U8 – Prüfungsplaner (Screen 6)

Neue Route `/exams` im persönlichen Kontext, Nav-Eintrag „Prüfungsplaner“.

### Ansicht

- [x] Kopf: „Prüfungsplaner“ + „Termine, Lernplan und Buchung an einem Ort“, rechts „Termin eintragen“ (primary).
- [x] **Nächste Prüfung** (Card `hero`): Countdown-Kachel 132 px („23“ in 52 px, „Tage“), Overline „Nächste Prüfung“, Kursname, Pills mit Datum/Uhrzeit, Prüfungsart („Online mit Aufsicht“ / „Testcenter“) und Buchungsweg („Buchung über Linux Foundation“), Buttons „Zur Buchungsseite ↗“ (Link nach außen) und „In Kalender (.ics)“.
- [x] **„Bist du bereit?“**: Empfehlung „drei Prüfungssimulationen in Folge mit mindestens 80 Punkten“, drei Kacheln mit den letzten Simulationsergebnissen (erreicht Mint, offen „–“), Hinweisleiste (Bernstein) „x von 3 erreicht …“, Link „Simulation starten →“. Schwelle und Anzahl als Konstante zentral, nicht pro Komponente.
- [x] **Lernplan bis zur Prüfung:** Wochen-Kacheln (KW, Zustand „Erledigt“/„Diese Woche“/„Geplant“, Thema, Beschreibung, „x von y Std.“ + Balken), Wochenziel oben rechts. Aktuelle Woche mit Mint-Rahmen.
- [x] **Weitere Prüfungen:** Liste je Kurs mit Kurzcode-Kachel, Titel, „Anbieter · Prüfungsarten“, Status-Pill („Nicht geplant“, „Voucher vorhanden“, „Geplant“), Button „Testcenter finden“ (Pearson VUE) bzw. „Termin buchen“.
- [x] **Erinnerungen:** Voucher läuft ab, Wiederholungsversuch enthalten, neue Prüfungsversion angekündigt (vom Admin am Kurs gepflegt). Fußnote: „Freie Termine zeigen die Anbieter nur im eigenen Kandidatenkonto. Wir verlinken direkt dorthin.“

### Datenmodell

- [x] An `certifications` (gepflegt im Admin): `exam_provider` (`pearson_vue | psi | linux_foundation | other`), `delivery_modes` (`online`, `test_center`), `booking_url`, `test_center_url`, `validity_months` (nullable = unbegrenzt), `successor_note` (optional, Text zur angekündigten Nachfolgeversion).
- [x] `exam_plans` (gehört der Person): `user_id`, `certification_id`, `scheduled_at` (nullable = noch nicht gebucht), `delivery_mode`, `voucher_expires_at`, `retake_included` (bool), `share_with_company` (bool, Standard **aus**), `status` (`planned | passed | failed | cancelled`).
- [x] Ergebnis eintragen („bestanden am …“) legt automatisch einen Eintrag in `user_certificates` (U9) an.

### Logik

- [x] **Lernplan rückwärts:** verteilt offene Lektionen und schwache Objectives (aus Readiness) auf die Wochen bis zum Termin; vorletzte Woche = zwei Simulationen; letzte Woche = nur Wiederholung und Merkzettel, keine neuen Themen. Wochenziel einstellbar (Standard 5 Std.). Wöchentliche Neuberechnung, wenn Rückstand > 20 %. Algorithmus mit Unit-Tests (kurze Vorlaufzeit, kein Termin, alles erledigt).
- [x] **.ics-Export** (Prüfungstermin, optional wöchentliche Lernblöcke), Download als Datei, keine externe Kalender-API.
- [x] Erinnerungen per E-Mail über die bestehende Mail-Infrastruktur (Opt-out im Konto). Push siehe [Später](#später).

**Stand Gate U8: erfüllt (geprüft), mit Abweichungen.** Geprüft: Termin eintragen → Countdown „23 Tage“, Lernplan-Wochen (Wiederholung letzte, zwei Simulationen vorletzte Woche, davor Lernen) und heruntergeladene `.ics` stimmen (Browser + DB-Test); Dunkel/Hell/390 px ohne horizontales Scrollen; der Termin ist für die Firma nicht sichtbar (`planner.test.ts`: Statusansicht enthält nur `COMPANY_STATUS_FIELDS`, `share_with_company` bleibt aus; die Architektur-Tests erlauben der Firma die Tabelle `exam_plans` nicht); Algorithmus mit Unit-Tests (kurze Vorlaufzeit, kein Termin, alles erledigt, Rückstand); Erinnerungen einmal je Art und mit Opt-out (`npm run exams:remind`, Opt-out im Konto). **Abweichungen:** (1) „x von y Std.“ je Woche geht nicht, weil Lernzeit nicht erfasst wird: gezeigt werden „x von y Lektionen“ und die geplante Zeit. (2) Die Neuberechnung bei Rückstand > 20 % ist als Funktion (`backlogPercent`) vorhanden, die Wochenansicht rechnet bei jedem Aufruf neu; ein eigener Wochenjob fehlt. (3) „Ergebnis eintragen legt `user_certificates` an“ folgt mit U9 (Tabelle gibt es erst dort); bis dahin setzt „Bestanden“ nur den Status. (4) Der „Voucher läuft ab“-Zähler nutzt `voucher_expires_at` am Plan; Vouchers mit Code kommen mit U9. (5) Erinnerungen per E-Mail laufen nur mit konfiguriertem SMTP; es gibt keinen automatischen Cron-Eintrag. (6) Uhrzeit wird in UTC eingegeben. (7) Prüfungsdaten (Anbieter, Buchungslink, Gültigkeit, Nachfolgehinweis) pflegt der Betreiber im Admin am Kurs; die Startwerte sind leer.

**Gate U8 (Vorgabe):** Screen 6 nachgebaut; Termin eintragen → Countdown, Lernplan und .ics stimmen; Termin ist ohne Freigabe für die Firma nicht sichtbar (Test).

---

## U9 – Zertifikats-Register und Voucher (Screen 7)

Neue Route `/company/certificates` (Firmenkontext, Nav „Zertifikate“) und im persönlichen Bereich `/certificates` (Nav „Zertifikate“, eigene Zertifikate verwalten).

### Leitplanken-Prüfung (vor dem Bauen)

- Zertifikate und Prüfungstermine sind **Daten der Person**. Die Firma sieht sie nur, wenn die Person sie **einzeln freigibt** (`shared_with_company`). Keine Punktzahlen, keine Versuche, kein Lernstand.
- Die neuen sichtbaren Felder (Zertifikatsname, erworben am, gültig bis, Status; geplanter Prüfungstermin) sind eine **bewusste Erweiterung** der Firmen-Feldliste: als eigene, festgeschriebene Liste `COMPANY_CERTIFICATE_FIELDS` neben `COMPANY_STATUS_FIELDS`, mit Architektur-Test und Datenschutztest gegen echte DB nach dem Muster von `results-privacy.test.ts`.
- Keine Ranglisten, keine Vergleiche zwischen Personen.

### Ansicht Firma

- [x] Kopf: „Zertifikats-Register“, rechts „Voucher hinzufügen“ (secondary) und „Audit-Export“ (primary Bernstein, Download-Icon).
- [x] Datenschutz-Zeile: „Zertifikate und Prüfungstermine erscheinen hier nur, wenn die Person sie **selbst für die Firma freigibt**. Keine Punktzahlen, kein Lernstand.“
- [x] Vier Stat-Kacheln: Gültige Zertifikate (bei n Personen), Laufen in 90 Tagen ab (Bernstein), Abgelaufen (Koralle), Offene Voucher (davon verfallen bald).
- [x] **Abläufe in den nächsten 12 Monaten:** Balken pro Monat (Anzahl), nächste 3 Monate in Bernstein, spätere gedämpft, Monate ohne Ablauf als Track.
- [x] **Tabelle Zertifikate:** Filter „Alle / Läuft bald ab / Abgelaufen“; Spalten Person, Zertifikat (+ Anbieter), Erworben, Gültig bis (farbig nach Status), Status-Pill (Gültig / Läuft bald ab / Abgelaufen). „Läuft bald ab“ = ≤ 90 Tage. „unbegrenzt“ bei Zertifikaten ohne Ablauf.
- [x] **Prüfungsvoucher:** Liste mit Kurzcode, Person oder „nicht zugewiesen“, Zustand („eingelöst · Termin …“ Mint, „zugewiesen · nicht eingelöst“, „verfällt am …“ Bernstein bei ≤ 30 Tagen).
- [x] **Geplante Prüfungen:** nur freigegebene Termine aus `exam_plans`, „In Teamkalender exportieren“ (.ics).
- [x] **Audit-Export:** CSV und PDF mit Zertifikaten (freigegeben), Pflichtschulungs-Status und Stichtag; Kopf mit Firma, Erstellungsdatum, erstellender Person; Audit-Event beim Export.

### Ansicht Person

- [x] Eigene Zertifikate eintragen (Name aus Katalog oder frei, Anbieter, erworben am, gültig bis – vorbelegt über `validity_months`, optional Credly-/Nachweis-Link als Text), je Eintrag Schalter „Für {Firma} freigeben“.
- [x] Erinnerung vor Ablauf (E-Mail, 90 und 30 Tage).

### Datenmodell

- [x] `user_certificates` (`user_id`, `certification_id` nullable, `title`, `vendor`, `earned_at`, `expires_at` nullable, `evidence_url` nullable, `shared_with_company` bool, Standard aus).
- [x] `exam_vouchers` (`organization_id`, `certification_id`, `assigned_user_id` nullable, `expires_at`, `redeemed_at` nullable, `note`). Der Gutscheincode selbst wird **verschlüsselt** gespeichert (bestehende `APP_ENCRYPTION_KEY`-Logik) und nur der zugewiesenen Person angezeigt.
- [x] Die Person sieht ihren zugewiesenen Voucher im Prüfungsplaner (U8, Status „Voucher vorhanden“).

**Gate U9:** Screen 7 nachgebaut; Datenschutztest: ohne Freigabe sieht die Firma weder Zertifikat noch Termin, mit Freigabe nur die festgeschriebenen Felder; Mutationsprobe (Freigabeprüfung entfernt) fällt durch; Audit-Export enthält nur freigegebene Daten.


**Stand Gate U9: erfüllt (geprüft), mit Abweichungen.** Geprüft: Person trägt im Browser ein Zertifikat ein und gibt es frei; Firmen-Admin sieht es in `/company/certificates` (Dunkel/Hell bei 1440, 390 px ohne horizontales Scrollen), legt einen Voucher mit Code an, lädt das CSV – der Code steht weder im CSV noch im HTML. `certificates-privacy.test.ts` (7 Tests, echte DB): ohne Freigabe weder Zertifikat noch Termin, mit Freigabe nur `COMPANY_CERTIFICATE_FIELDS` / `COMPANY_PLANNED_EXAM_FIELDS`, Mutationsprobe (Freigabefilter entfernt) fällt durch, Voucher-Code nur für die zugewiesene Person, Audit-Export nur freigegebene Daten; `company-architecture.test.ts` erlaubt die drei Tabellen nur in `lib/server/company/certificates.ts`; Konto-Export deckt die neuen Tabellen ab (Code ausgenommen); 718 Tests grün, `tsc`, `eslint` (0 Fehler), `lint:ui` ohne Zuwachs. **Abweichungen:** (1) PDF-Export mit `pdf-lib` (jetzt reguläre Abhängigkeit), schlichte Tabellen ohne Firmenlogo. (2) Ablauf-Erinnerungen (90/30 Tage) laufen im bestehenden Lauf `npm run exams:remind`, es gibt keinen eigenen Cron-Eintrag und nur mit konfiguriertem SMTP. (3) Der Voucher-Code der Person erscheint auf `/certificates` (auf Klick entschlüsselt); im Planer nur als Pille „Voucher vorhanden“. (4) Der Credly-/Nachweis-Link ist reiner Text, kein Abruf. (5) Echte Screenreader nicht geprüft.

---

## Später

Bewusst nach U9; jeweils erst mit eigenem kurzem Konzept.

- [ ] **Command-Palette (`⌘K`)** – Suche über Kurse, Sektionen, Befehle in Merkzetteln, Seiten.
- [ ] **„Meine Schwachstellen“** – Seite mit wiederholt falsch beantworteten Fragen/Objectives, ein Klick → gezielte Sitzung.
- [ ] **Web-Push über die PWA** – fällige Karten, Serie in Gefahr, Prüfung morgen. Dosiert, alles einzeln abschaltbar.
- [ ] **Katalog-Gruppen als Vorlage für Firmen** – „Security-Paket aus Katalog übernehmen“ legt eine Firmen-Kursgruppe mit den freigegebenen Kursen an.
- [ ] **Automatisches Onboarding** – Person kommt in Team X → bekommt Kursgruppe X (mit Abgleich zu Phase 5/Onboarding der technischen Roadmap).
- [ ] **Skill-Abdeckung je Team** – nur **aggregiert** (z. B. „3 von 5 im Plattform-Team haben CKA“), nie als Raster einzelner Personen und nie als Vergleich (Leitplanke „kein Talent-Score“). Vor dem Bau gegen die Leitplanken prüfen.
- [ ] **Praxis-Labs** (z. B. Kubernetes-Aufgaben mit Prüfskript) – erst Kosten/Betrieb klären; bis dahin Verweis auf externe Sandboxes.

---

## Nicht-Ziele

- **Live-Suche nach freien Prüfungsterminen.** Pearson VUE und PSI bieten dafür keine öffentliche Schnittstelle; Termine sieht man nur eingeloggt im Kandidatenkonto. Scraping mit Zugangsdaten der Nutzer verstößt gegen deren Nutzungsbedingungen, ist instabil und würde fremde Passwörter verarbeiten. Stattdessen: Direktlinks, Testcenter-Suche, eingetragene Termine (U8).
- **SSO** – existiert bereits, nicht Teil dieser Roadmap.
- Ranglisten, Talent-Scores, Vergleiche zwischen Lernenden (Leitplanke).
- Verläufe, Glas-Effekte, Emojis und Stockfotos als Gestaltungsmittel.

---

## Reihenfolge und Abhängigkeiten

| Phase | Hängt ab von | Liefert für | Aufwand (grob) |
|---|---|---|---|
| U1 Fundament | – | alles | M |
| U2 App-Shell | U1 | U3–U9 | M |
| U4 Quiz/Prüfung | U1 | U3 (Simulationen), U8 (Bereitschaft) | M |
| U5 Lernmaterial | U1 | – | L (Generator + Backfill) |
| U3 Lern-Dashboard | U2, Termin optional aus U8 | – | M |
| U7 Admin + Katalog-Gruppen | U2 | U3 (Gruppenfarben), U6 | M |
| U6 Firma + Firmen-Gruppen | U2, U7 | U9 | M |
| U8 Prüfungsplaner | U2, U4 | U3, U9 | M |
| U9 Register + Voucher | U6, U8 | – | M |

Empfohlene Reihenfolge: **U1 → U2 → U4 → U5 → U7 → U3 → U6 → U8 → U9.** U4 und U5 zuerst, weil Lernende dort die meiste Zeit verbringen; U3 erst nach U7, damit die Kurskarten gleich die Gruppenfarben haben. U8 und U9 sind neue Funktionen und kommen nach dem Umbau des Bestands.

Größen: S = bis 1 Tag, M = wenige Tage, L = mehr als eine Woche (Abend-/Wochenendarbeit nicht eingerechnet).

---

## Definition of Done für UI

Ein UI-Punkt ist erst erledigt, wenn alles davon stimmt:

- [ ] Sieht aus wie der zugehörige Screen (Abstände, Größen, Farben, Zustände) – Vergleich per Screenshot im PR.
- [ ] Funktioniert in **dunkel und hell**.
- [ ] Funktioniert bei **390 px** Breite ohne horizontale Seitenscroll-Leiste.
- [ ] Vollständig per **Tastatur** bedienbar, sichtbarer Fokusring (2 px, Kontextakzent).
- [ ] Kontrast ≥ 4.5:1 für Text (≥ 3:1 ab 24 px); Zustände nie nur über Farbe.
- [ ] Alle Texte über `lib/i18n.tsx` in **Deutsch und Englisch**.
- [ ] Nur Tokens und `components/ui/*`, keine Rohfarben.
- [ ] Leere Zustände, Ladezustände (`Skeleton`) und Fehlerzustände gestaltet.
- [ ] Bestehende Tests grün, neue Logik mit Tests; Datenschutz- und Architektur-Tests bei Firmenfunktionen erweitert.
- [ ] CSP ohne neue Verletzungen; Offline-Paket und Service Worker funktionieren weiter.

---

## Nachtrag: Kursgruppen und individuelle Trainings

- **Mehrere Gruppen je Kurs** (Migration `0054`, Tabelle `certification_categories`): `certifications.category_id` bleibt die Hauptgruppe (Farbe, Kurzcode), die erste Gruppe der Liste. Admin-Katalog: Dialog „Gruppen ändern“; `/catalog` filtert nach allen Gruppen. Standardgruppen der IT inkl. „AI & Generative KI“ legt die Migration an.
- **Training für: Zertifikat / Individuell** (Migration `0055`, `course_type` an `certifications` und `course_generation_jobs`): Im Assistenten entfallen bei „Individuell“ Anbieter und Version; der Blueprint-Prompt sagt „kein Zertifizierungskurs, keine Prüfung“ und ist themenneutral (nicht auf IT beschränkt, z. B. Videoschnitt). Quellenpflicht und Prüfregeln bleiben unverändert. Der Katalog zeigt „Individuelles Training“ statt Anbieter · Version; Gruppen „Kreativ & Medien“, „Büro & Produktivität“, „Weitere Themen“ kommen mit `0055`. **Nicht geprüft:** echte KI-Generierung eines individuellen Kurses (nur Fake-Lauf `npm run course:e2e` mit `E2E_COURSE_TYPE=custom`) und der Assistent im Browser.
