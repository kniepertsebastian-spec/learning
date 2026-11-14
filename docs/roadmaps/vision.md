# Vision, Abgrenzung und Weg zum ersten Firmenkunden

> **Stand 14.11.2026.** Festgehalten aus dem Gespräch mit dem Betreiber nach dem PWA-Review vom 12.11.2026. Das Dokument beschreibt, wofür die Plattform steht, was sie bewusst nicht tut, und welche Punkte daraus als Nächstes folgen. Technische Befunde stehen in `roadmap_review_messung.md`.

---

## Die Vision in einem Satz

Arbeitgeber können bei Einstellung und internem Wechsel mehr wagen, weil Einarbeitung planbar und günstiger wird, und jede Person kann sich privat wie im Betrieb auf geprüften Kursen weiterbilden, die sich an ihre Lage anpassen.

## Für wen

**Private Personen.** Vorbereitung auf Zertifikate und Schließen von Wissenslücken, aus eigenem Antrieb: anderer Titel, andere Stelle, Quereinstieg. Wer in einem Firmenkonto ist, hat denselben privaten Bereich daneben.

**Unternehmen.** Derselbe Lernkern, dazu:
- Der Arbeitgeber legt fest, welche Kurse zu welcher Stelle gehören.
- Onboarding als fester Ablauf für neue Mitarbeitende, auch in der Probezeit. Der Mentor wird auf Anfrage gebraucht statt durchgehend.
- Eigene Kurse aus eigenem Wissen, mit oder ohne KI.
- Pflichtschulungen, die die Firma schützen (zum Beispiel Grundlagen der IT-Sicherheit).
- Interne Wechsel: Wer sich weiterbildet, bekommt eine Chance auf eine andere Stelle.

## Die drei Versprechen

1. **Mehr wagen.** Wer einen AWS-Experten sucht, kann einem GCP-Experten eine Chance geben, weil der Weg dorthin als Onboarding definiert ist. Dasselbe gilt für den Junior, der seine Ausbildung in einem kleinen Betrieb gemacht hat.
2. **Lernen passt sich dem Menschen an.** Wiederholungsplanung, Tagesform, Entlastung und Abbruchschutz sorgen dafür, dass eine Schulung auch bei hoher Belastung ankommt.
3. **Kein Kurs ohne Menschen.** Ein generierter Kurs wird erst sichtbar, nachdem eine Fachperson ihn geprüft, angepasst und freigegeben hat.

---

## Festlegungen

### Fachliche Prüfung
- Prüfer sind im besten Fall Mitarbeitende der Firma.
- Bei Engpässen übernimmt ein externer Dienstleister, der über ein eigenes Auswahlverfahren gewählt wird.
- Für Pilotkunden tragen Expertenfreigabe und Transparenz das Vertrauen, nicht Statistik.

### Nachweis
- Der Kurs bereitet vor. Der Nachweis ist das offizielle Zertifikat des Anbieters.
- Solange die Plattform unbekannt ist, verspricht sie nicht, dass ein abgeschlossener Kurs als Beleg gilt.
- Open Badges gibt es zunächst für echte Zertifikate.
- Wichtigste Kennzahl: Bestehensquote bei der echten Prüfung, immer mit Nenner (wie viele haben ihr Ergebnis gemeldet).

### Profil
- Angaben zu Stelle, Zielrolle und Skills sind freiwillig.
- Sie dienen nur dazu, Karrierepfade vorzuschlagen, wenn jemand nicht weiß, was er lernen soll.

### Statistik
- Ausgewertet werden Rohwerte ohne Namen. Rechtlich ist das **pseudonymisiert**, nicht anonym, weil der Betreiber die Kennungen zurückrechnen könnte. So steht es in Datenschutzerklärung und Vertrag.
- Nach außen gehen nur Summen, und nur ab 20 Personen im Nenner. Das gilt auch für alles, was ein Kunde über seine eigene Firma sieht.
- Diagramme als Wirkungsbeleg erst, wenn genug Daten da sind.

---

## Abgrenzung: was die Plattform nicht tut

| Grenze | Grund |
|---|---|
| **Keine Leistungskontrolle.** Der Arbeitgeber sieht beim Onboarding nur den Stand (erledigt oder offen), auch in der Probezeit. Fehlerquoten, Tempo, Tagesform und Antwortzeiten einzelner Personen sieht er nie. | Sonst lernt niemand ehrlich, und der Betriebsrat stimmt nicht zu. |
| **Keine Bewertung von Bewerbern.** Die Plattform reiht und beurteilt keine Kandidaten. Die Person teilt ihren Nachweis, der Arbeitgeber entscheidet. | Gleichbehandlung, Haftung. |
| **Keine Bestehensgarantie.** | Steht schon in den AGB. |
| **Keine zugesagte Ersparnis.** „Mentor nur auf Anfrage“ ja, „spart die vollen Mentorenkosten“ erst, wenn ein Pilot es zeigt (Hypothese H3 in `docs/MESSEN.md`). | Die Zahl fehlt noch. |

---

## Ausscheiden aus der Firma

**Ziel des Betreibers:** Firmenbereich und voller Katalog verschwinden. Die Person behält ihre Erfolge und hat nach einem Kauf im privaten Bereich wieder Kurse.

**Vorgeschlagener Weg: Konto umwandeln statt Export und Import.**

Der zuerst gedachte Weg (Export per E-Mail, später Import in ein neues Konto) hat zwei Schwächen: Eine Datei, die die Person selbst hochlädt, lässt sich vorher ändern, und die Firmenadresse ist beim Ausscheiden oft schon abgeschaltet.

- [ ] Private E-Mail-Adresse im Konto hinterlegen können, mit Bestätigung. Hinweis darauf, solange nur eine Firmenadresse vorhanden ist.
- [ ] Beim Entfernen aus der Firma: Mitgliedschaft, Zuweisungen, Katalog-Freigaben und interne Kurse weg. Das Konto bleibt und wechselt auf die private Adresse.
- [ ] Ohne private Adresse: Konto für 30 Tage halten, in dieser Zeit kann die Person sich über einen einmaligen Link an die zuletzt bekannte Adresse eine private Adresse setzen. Danach Löschung.
- [ ] Was bleibt: Erfolge und Zertifikate allgemeiner Kurse, Lernstand der Wiederholungen (damit ein später gekaufter Kurs weitermacht), Profil.
- [ ] Was nicht bleibt: Inhalte interner Firmenkurse. Sie erscheinen nur als Titel mit Datum.
- [ ] Konten mit Anmeldung über das Firmenkonto: Beim Umwandeln ein Passwort setzen lassen (hängt mit Befund 6 aus dem Review zusammen).
- [ ] Offline-Pakete interner Kurse werden wie bisher beim nächsten Online-Start entfernt.
- [ ] Falls doch ein Export gewünscht ist: Die Datei wird vom Server signiert, der Import prüft die Signatur.

**Akzeptanzkriterium:** Eine Person, die aus der Firma entfernt wird, meldet sich danach mit ihrer privaten Adresse an, sieht ihre Erfolge und keinen Firmeninhalt.

---

## Was daraus nach vorn rückt

Diese Punkte stehen schon in anderen Roadmaps als offen. Für die Vision sind sie der Kern.

- [ ] **Rollenprofile als Kompetenzbündel** (`ROADMAP-TECHNISCH.md`, Phase 5). Grundlage für „Stelle legt Kurse fest“.
- [ ] **Lückenanalyse zwischen Nachweisen und Zielrolle**, nur für die Person sichtbar (ebenda).
- [ ] **Brückenpfade** zwischen ähnlichen Werkzeugen, zum Beispiel GCP nach AWS (`roadmap_didaktik.md`, Phase 11). Das ist die Funktion hinter dem ersten Versprechen.
- [ ] **Onboarding in der Probezeit:** Ablauf je Stelle, Stand für den Arbeitgeber nach der Abgrenzung oben.
- [ ] **Bestehensquote mit Nenner** als Kennzahl im Wirkungsbericht.
- [ ] **Unterlage für den Betriebsrat:** eine Seite, die erklärt, was die Firma sieht und was nicht.

## Was zurückgestellt wird

Nichts davon wird gelöscht. Es wird bis nach den ersten Pilotkunden nicht weitergebaut.

| Punkt | Entscheidung |
|---|---|
| Karrierepfade | **Bleiben.** Sie sind der Einstieg für Private („was soll ich lernen?“) und passen zu den Rollenprofilen. Kein weiterer Ausbau. |
| Gehaltsdaten in den Karrierepfaden | Einfrieren. Pflege der Datensätze kostet Zeit, und veraltete Zahlen schaden dem Vertrauen. Anzeige nur, solange der Stand jünger als ein Jahr ist. |
| Einträge in Google Play und Microsoft Store | Zurückgestellt. |
| Übungsumgebungen in Containern | Zurückgestellt, Kosten und Betrieb ungeklärt. |
| Phishing-Simulationen | Zurückgestellt. |
| Pflichtschulungen | Als Zugabe anbieten, nicht als Hauptargument. Dafür gibt es viele etablierte Anbieter. |
| Weitere Mechaniken der Wiederholungsplanung | Erst messen, dann erweitern (`roadmap_review_messung.md`, Phasen 4 bis 6). |

---

## Weg zum ersten zahlenden Firmenkunden

1. **Vor dem ersten Gespräch:** Datenschutzerklärung, Impressum, Vertrag zur Auftragsverarbeitung, Unterlage für den Betriebsrat, KI-Zugang ohne Training auf Kundendaten (`roadmap_review_messung.md`, Phase 3).
2. **Angebot in einem Satz:** Onboarding je Stelle mit geprüften Kursen, Mentor nur auf Anfrage.
3. **Drei bis fünf Piloten,** möglichst bezahlt, mit einer vorab vereinbarten Kennzahl (Zeit bis zur Einarbeitung, Mentorstunden, Bestehensquote).
4. **Ausgangswert festhalten,** bevor der Pilot startet (`docs/MESSEN.md`).
5. **Nach dem Piloten:** eine belegte Zahl je Kunde. Erst dann Preise, Checkout und breitere Ansprache.

## Offene Entscheidungen des Betreibers

- [ ] Preis für den privaten Bereich: je Kurs, als Abo, oder kostenlos als Zugang.
- [ ] Wer bezahlt die Prüfer der allgemeinen Kurse, und wie viele Kurse je Prüfer sind realistisch.
- [ ] Auswahlverfahren für den externen Prüf-Dienstleister schriftlich festlegen.
- [ ] Konto umwandeln (Vorschlag oben) oder signierter Export mit Import.
