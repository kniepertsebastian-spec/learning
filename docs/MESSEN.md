# Messen: Ausgangswerte vor Zielen

Dieses Dokument beschreibt, wie man die Wirkung der Lern- und Motivationsmechaniken beschreibend misst (`roadmap_motivation.md`, Phase 10). Es geht um **Ausgangswerte zuerst, Ziele erst danach**. Die Nutzerzahlen sind anfangs klein; alles hier ist ein beschreibender Bericht, keine automatische Auswertung und keine Signifikanzprüfung.

## Was gemessen wird
Aus dem anonymisierten Metrik-Export (`npm run psrp:metrics`, Salt in `PSRP_EXPORT_SALT`):

| Kennzahl | Bedeutung |
|---|---|
| `churn7`, `churn30` | Anteil der Personen, die 7 bzw. 30 Tage nach dem Start keine abgeschlossene Session mehr hatten (nur Personen, die lange genug dabei sind) |
| `returnAfterPause` | Von den Pausen (mindestens 7 Tage ohne Session) die Quote, nach der die Person zurückkam |
| `courseCompletion` | Kurse mit begonnener Lernreihe, die vollständig abgeschlossen wurden |
| `exitShare`, `deescalationShare` | Anteil der Personen, die den Notausstieg bzw. eine Entlastung erlebt haben |
| `retention.<flag>` | Behaltensquote der Reviews (Rating über „nochmal“), mit und ohne Flag |

Jede Kennzahl gibt es gesamt, je Evaluationsgruppe und **je Feature-Flag mit und ohne** (`flag.<name>.enabled|disabled.…`). Der Nenner `n` steht immer dabei: Zeilen mit weniger als 20 sind als „klein“ markiert, sie sind nur anzusehen, nicht zu deuten.

## Ablauf
1. **Ausgangswert festhalten, bevor eine Mechanik eingeschaltet wird oder eine Kontrollgruppe startet:**
   `npm run psrp:baseline -- save "Vor dem Pilot"`
   Die Momentaufnahme (Tabelle `metric_snapshots`) enthält nur Aggregate, keine Personen, dazu die Flag-Anteile zu diesem Zeitpunkt und die Größe der Datenbasis.
2. **Kontrollgruppe schaffen, wenn man eine Mechanik prüfen will.** Alle Flags sind standardmäßig für alle an. `FEATURE_<NAME>_ROLLOUT=50` (0 bis 100) gibt nur der Hälfte der Personen die Mechanik, stabil je Person (Hash aus Nutzer-ID); `FEATURE_<NAME>=0` schaltet hart ab. Flags: `pretest_questions`, `recall_check`, `understanding_mode`, `dropout_guard`, `exit_with_win`, `energy_modes`, `reactivation`, `woven_reviews`, `reading_time`, `device_class`, `interruptions`, `error_type_gate`, `self_reports`. Ausnahme: `guess_weighting` ist standardmäßig **aus** und wird mit `FEATURE_GUESS_WEIGHTING=1` oder `FEATURE_GUESS_WEIGHTING_ROLLOUT` eingeschaltet, weil es in eine Bewertung eingreift. Ohne Kontrollgruppe fehlt die Seite „disabled“, dann bleibt nur der Vorher-Nachher-Vergleich.
3. **Später vergleichen:**
   `npm run psrp:baseline -- compare latest` (letzte Momentaufnahme gegen jetzt) oder `compare <id-a> <id-b>`; `list` zeigt alle Momentaufnahmen.
4. **Ziele festlegen**, erst nachdem Ausgangswerte vorliegen und genug Personen dabei sind (Richtwert: mindestens 20 im Nenner der jeweiligen Kennzahl). Ziele gehören in diesen Abschnitt, mit Datum.

## Wichtig beim Testen
- Der Export und die Kennzahlen berücksichtigen nur Personen mit einer **Evaluationsgruppe**. Sie wird bei der Registrierung bzw. beim ersten Zugriff zufällig vergeben: `vanilla` (FSRS pur, ohne Planungsschicht), `planning`, `planning_state` (zusätzlich Tagesform). Wer selbst alle Mechaniken erleben will, sollte nicht in `vanilla` sein.
- Eigene Testkonten verzerren die Zahlen. Vor dem Pilot die Ausgangswerte mit einer Bezeichnung wie „Nur Testkonten“ festhalten und später nur gegen Echtdaten vergleichen.
- Eine einzelne Momentaufnahme ist noch kein Vergleich. Wer lernt, erzeugt die ersten Daten; der Ausgangswert ist dann der Stand **vor** der Einführung für die Pilotgruppe.

## Hypothesen für den Pilot
Das sind **Annahmen, keine Zusagen** und keine Zielwerte. Sie werden mit den Ausgangswerten geprüft und erst danach zu Zielen mit Zahlen.

| Nr. | Annahme | Gemessen mit | Vergleich |
|---|---|---|---|
| H1 | Mit Entlastung (`dropout_guard`) und Notausstieg (`exit_with_win`) brechen weniger Personen nach 7 Tagen ab | `churn7` | mit/ohne Flag, bzw. vor/nach |
| H2 | Mit Reaktivierung (`reactivation`) kommen mehr Personen nach einer Pause zurück | `returnAfterPause` | mit/ohne Flag |
| H3 | Mit „Ich hänge fest“ steigen die Hilfeanfragen, ohne dass die Mentorenzeit steigt | Anfragen und Antwortzeit je Firma (Firmenbereich, ab Mindestgröße) | vor/nach |

Zu H3: Die Kennzahl liegt im Firmenbereich (anonym, aggregiert, erst ab Mindestgröße) und ist nicht Teil dieses Exports.

## Menschliche Faktoren: Aufschieben, Regelmäßigkeit, Schlaf (Stufe 1)
Zu diesen drei Faktoren gibt es **nur Auswertung**: Der Export (`npm run psrp:metrics`) enthält den Abschnitt `humanFactors` (gesamt und je Evaluationsgruppe), der nichts an der Planung ändert. Es gibt deshalb keinen Schalter und keinen Eingriff. Jeder Wert nennt seinen Nenner `n`, unter 20 ist er `small`. Die Werte bleiben roh; Ausreißer behandelt erst eine spätere Auswertung. Schlaf wird nicht erfragt, nur aus Zeitstempeln und der Zeitzone abgeleitet.

| Faktor | Wert im Export | Nenner `n` | Was gemessen wird |
|---|---|---|---|
| 4.4 Aufschieben | `procrastination.backlog` | Personen | Items, die zum Stichtag fällig und nicht wiederholt sind; je Person der Median der überfälligen Tage, darüber der Median |
| | `procrastination.lateness` | Reviews mit Abrufwahrscheinlichkeit | Anteil der Reviews, bei denen die Abrufwahrscheinlichkeit vor dem Review unter 0,8 lag (FSRS plant bei etwa 0,9) |
| | `procrastination.cramming` | Reviews der 4 Wochen vor einem Prüfungstermin | Anteil der letzten 7 Tage an diesen 4 Wochen; bei gleichmäßigem Lernen wären es 0,25 (`expectedShare`) |
| 4.5 Regelmäßigkeit | `regularity.hourSpreadHours` | Personen mit mindestens 10 Reviews | Streuung der lokalen Lernstunde (kreisförmige Standardabweichung in Stunden, 0 = immer dieselbe Zeit) |
| | `regularity.weekdaysUsed` | dieselben Personen | An wie vielen der 7 Wochentage gelernt wurde |
| | `regularity.weeklyGoal` | abgeschlossene Wochen | Anteil der Wochen mit mindestens so vielen Lerntagen wie das Wochenziel, dazu das Verhältnis Tage zu Ziel (UTC-Wochen von Montag, die laufende Woche zählt nicht) |
| 4.11 Schlaf | `sleep.withNight`, `sleep.withoutNight` | beantwortete Rückblicke | Trefferquote im Rückblick, getrennt danach, ob zwischen Lektion und Rückblick die lokale Uhrzeit 03:00 lag |

**Grenzen, die man kennen muss:**
- **4.4 „Tage nach der Fälligkeit“ ist für vergangene Reviews eine Näherung.** Der `review_log` hält die Fälligkeit nicht fest (er ist unveränderlich), sondern nur die Abrufwahrscheinlichkeit vor dem Review. Exakt sind nur der Rückstau zum Stichtag (`backlog`) und die Häufung vor dem Termin. Wer die echte Verspätung je Review braucht, muss die Fälligkeit künftig mit dem Review protokollieren (eigene Aufgabe, berührt die Verbuchung).
- Die Häufung vor dem Termin ordnet Reviews über den Kurs der Frage dem Termin zu (`exam_plans.scheduled_at`); abgesagte Termine zählen nicht.
- Das Wochenziel ist das aktuell eingestellte, nicht das zu jener Zeit gültige.
- 4.11: „Nacht“ heißt nur, dass 03:00 Ortszeit zwischen Lektion und Rückblick liegt, nicht, dass jemand geschlafen hat. Ein Rückblick nach 24 Stunden oder mehr hat immer eine Nacht.

**Hypothesen (Annahmen, keine Zusagen, keine Zielwerte):**

| Nr. | Annahme | Gemessen mit | Vergleich |
|---|---|---|---|
| H4 | Wer kurz vor dem Prüfungstermin viel nachholt (mehr als 0,25 der Reviews in der letzten Woche), hat vorher einen Rückstau aufgebaut | `cramming.share` und `backlog` je Person | beschreibend, erst ab 20 Termine |
| H5 | Gleichmäßigere Lernzeiten (kleine Streuung) und erreichte Wochenziele gehören zu weniger Rückstau | `hourSpreadHours`, `weeklyGoal.share`, `backlog` | beschreibend |
| H6 | Ein Rückblick nach einer Nacht wird besser beantwortet als einer am selben Tag | `sleep.difference` | mit/ohne Nacht |

**Empfehlung aus 4.11:** Die Empfehlung „abends lernen, morgens abrufen“ darf erst erscheinen, wenn `sleep.recommendationSupported` wahr ist: beide Seiten haben mindestens 20 beantwortete Rückblicke, und die Trefferquote mit Nacht liegt mindestens 10 Prozentpunkte über der ohne. Bis dahin zeigt die App nichts dazu, und auch dann nur im Rückblick. Die Schwellen sind Vorschläge (`SLEEP_EFFECT_MIN_N`, `SLEEP_EFFECT_MIN_DIFFERENCE` in `lib/server/psrp/human-factors.ts`); ein Unterschied dieser Größe ist keine Signifikanzprüfung, und Personen, die abends lernen, unterscheiden sich auch sonst von denen, die morgens lernen.

## Menschliche Faktoren: Lesetiefe, Durchhalten, Gerät (Stufe 1)
Auch hier **nur Auswertung**: Der Export (`npm run psrp:metrics`) enthält den Abschnitt `sessionContext` (gesamt und je Evaluationsgruppe). Der Hinweis vor dem Lektionstest (4.9) und die leichtere Frage nach Fehlern (4.10) sind noch **nicht** gebaut; sie kommen erst, wenn diese Zahlen einen Effekt zeigen. Zwei Werte brauchen neue Angaben und haben deshalb ein Flag (`reading_time`, `device_class`, beide standardmäßig für alle an, `FEATURE_<NAME>=0` schaltet ab; bei ausgeschaltetem Flag speichert der Server nichts).

| Faktor | Wert im Export | Nenner `n` | Was gemessen wird |
|---|---|---|---|
| 4.9 Lesetiefe | `reading.skimmed` | Lektionen mit Text | Anteil der Lektionen, die kaum gelesen wurden: Tempo über 600 Wörter pro Minute oder ohne Lesezeit geöffnet |
| | `reading.medianWordsPerMinute`, `reading.reopened` | Lektionen | Mittleres Lesetempo; Anteil der Lektionen, die mehr als einmal geöffnet wurden |
| | `reading.firstQuizScore` | Lektionen mit Test | Ergebnis des ersten Lektionstests, getrennt nach „kaum gelesen“ und „gelesen“, mit Unterschied |
| 4.10 Durchhalten | `persistence.continued`, `.exited`, `.ended` | Sitzungen mit einer Fehlerserie | Nach der ersten Serie von drei „nochmal“-Antworten in Folge: es geht weiter, Notausstieg „Heute reicht’s“, oder die Sitzung endet ohne Ausstieg (abgebrochen oder pausiert) |
| 4.12 Gerät | `device.narrow`, `device.wide` | abgeschlossene Sitzungen | Antworten, richtige Antworten und Trefferquote je Größenklasse; `device.unknown` zählt Sitzungen ohne Angabe |

**Was gespeichert wird:**
- **Lesezeit** (`lesson_reading_time`): aktive Sekunden je Person und Lektion und wie oft sie geöffnet wurde. Gezählt wird wie bei der Lernzeit nur bei sichtbarer Seite und nach Eingaben in den letzten zwei Minuten (`lib/client/learning-time.ts`), nur im Lektionstext, nicht im Test. **Offline gelesene Lektionen fehlen**, weil die Zeit nur bei Verbindung gemeldet wird; die Lesetiefe-Zahlen gelten daher für online gelesene Lektionen.
- **Größenklasse** (`study_sessions.device_class`): nur `narrow` (unter 640 Pixel) oder `wide`, beim Abschluss der Sitzung. Keine Gerätekennung, kein Modell, keine genaue Breite; die Datenbank erlaubt nur diese beiden Werte. Sie wird nur mitgeschickt, wenn die Sitzung online oder über die Sync-Warteschlange abgeschlossen wird.
- Beides steht im Datenexport und in der Datenschutzerklärung.

**Grenzen:**
- 4.9: 600 Wörter pro Minute ist eine Schwelle als Vorschlag (aufmerksames Lesen liegt bei etwa 200 bis 300). Wer die Lektion außerhalb der App liest, wirkt wie jemand, der nur überflogen hat. Das Ergebnis des ersten Tests hängt auch vom Vorwissen ab; ein Unterschied ist kein Beleg für eine Wirkung des Lesens.
- 4.10: „Fehler“ heißt Rating 1 („nochmal“). Ob eine Sitzung nach der Serie pausiert wurde oder abbrach, lässt sich aus den Daten nicht trennen (beides ist `ended`). Es zählt nur die erste Serie einer Sitzung.
- 4.12: Die Auswertung trennt nicht nach online oder offline und nicht nach installierter App oder Browser; das ist bewusst offen geblieben, damit nicht mehr Angaben zur Lage gespeichert werden als nötig.

**Hypothesen (Annahmen, keine Zusagen, keine Zielwerte):**

| Nr. | Annahme | Gemessen mit | Vergleich |
|---|---|---|---|
| H7 | Wer eine Lektion kaum liest, schneidet im ersten Lektionstest schlechter ab | `reading.firstQuizScore` | gelesen gegen kaum gelesen, ab 20 Lektionen je Seite |
| H8 | Nach drei Fehlern in Folge steigt der Anteil, der aufhört, ohne dass ein Ausstieg gewählt wird | `persistence.ended` gegen `exited` | beschreibend, ab 20 Sitzungen mit Serie |
| H9 | Am Smartphone ist die Trefferquote je Sitzung niedriger oder die Sitzung kürzer als am großen Bildschirm | `device.narrow` gegen `device.wide` | beschreibend, ab 20 Sitzungen je Seite |

## Menschliche Faktoren: Ermüdung und Unterbrechungen (Stufe 1)
Auch hier **nur Auswertung**: Der Export (`npm run psrp:metrics`) enthält den Abschnitt `fatigue` (gesamt und je Evaluationsgruppe). Eine persönliche Sitzungslänge und „schwere Fragen nach vorn“ sind **nicht** gebaut; sie brauchen erst die Hypothesen unten und einen Effekt in den Zahlen. Die Unterbrechungen sind eine neue Angabe und haben deshalb ein Flag (`interruptions`, standardmäßig für alle an, `FEATURE_INTERRUPTIONS=0` schaltet ab; dann speichert der Server nichts).

| Faktor | Wert im Export | Nenner `n` | Was gemessen wird |
|---|---|---|---|
| 4.1 Ermüdung | `thirds.first`, `.second`, `.third` | Antworten im Drittel (`errors.n`), Antworten mit Zeit (`timed`) | Abgeschlossene Sitzungen mit mindestens drei beantworteten Fragen, nach der Reihenfolge der Aufgaben in Drittel geteilt (Antwort i von n im Drittel ⌊3·i/n⌋). Je Drittel Fehlerquote und Median der Antwortzeit |
| | `errorIncrease`, `slowdown` | wie oben | Fehlerquote letztes minus erstes Drittel; Median der Antwortzeit letztes durch erstes Drittel |
| | `sessions`, `answers`, `medianSessionLength` | Sitzungen | Wie viele Sitzungen und Antworten eingehen, typische Länge |
| 4.3 Unterbrechungen | `interruptions.interrupted` | Sitzungen mit Messung (`measured`) | Anteil der Sitzungen mit mindestens einem Wechsel in den Hintergrund |
| | `interruptions.medianCount`, `.medianSeconds` | unterbrochene Sitzungen | Typische Zahl und Gesamtdauer der Unterbrechungen |
| | `interruptions.accuracy` | Sitzungen je Seite | Trefferquote der Sitzungen mit und ohne Unterbrechung |

**Was gespeichert wird:** `study_sessions.interruption_count` und `interruption_ms`: wie oft die Seite während der Sitzung mindestens 2 Sekunden im Hintergrund war (Tab-Wechsel, App im Hintergrund, gesperrter Bildschirm) und wie lange insgesamt. Nicht wann, nicht wohin. Bei „Pause für heute“ steht der bisherige Stand im Zwischenstand und wird beim Fortsetzen weitergezählt; die Pause selbst zählt nicht. Die Werte kommen online, beim Notausstieg und über die Sync-Warteschlange an. Beides steht im Datenexport und in der Datenschutzerklärung.

**Was die Person sieht:** Auf „Wie ich lerne“ erscheinen nur ganze Sätze und nur bei genug Daten und deutlichem Unterschied (Schwellen als Vorschlag in `lib/server/psrp/fatigue.ts`):
- „Nach etwa N Fragen machst du mehr Fehler …“: mindestens 30 Antworten im ersten und im letzten Drittel, Fehlerquote mindestens 10 Prozentpunkte höher. N ist der Beginn des letzten Drittels einer typischen Sitzung (zwei Drittel der Median-Länge).
- „Gegen Ende … deutlich länger“: mindestens 30 gemessene Antworten auf beiden Seiten, Median mindestens ein Viertel länger.
- „In X von Y Sitzungen … unterbrochen“: mindestens 5 gemessene Sitzungen, davon mindestens die Hälfte unterbrochen.

Die Sätze sind Beobachtungen und ändern nichts am Plan.

**Grenzen:**
- 4.1: Die Reihenfolge ist die geplante Reihenfolge der Aufgaben, nicht die Zeit. Spätere Aufgaben sind nicht zufällig verteilt: der Session-Builder stellt fällige Wiederholungen, neue Fragen und Rückblicke in eine feste Abfolge. Ein Anstieg der Fehler im letzten Drittel kann deshalb auch an der Art der Aufgaben liegen und ist für sich kein Beleg für Ermüdung. Kurze Sitzungen (3 bis 5 Fragen) verteilen sich grob.
- 4.3: Ein Wechsel unter 2 Sekunden zählt nicht. Wer die App offen lässt und weggeht, ohne den Bildschirm zu sperren, wirkt nicht unterbrochen. Offline wird gezählt, aber nur mit der Sync-Warteschlange übertragen.

**Hypothesen (Annahmen, keine Zusagen, keine Zielwerte):**

| Nr. | Annahme | Gemessen mit | Vergleich |
|---|---|---|---|
| H10 | Im letzten Drittel einer Sitzung liegt die Fehlerquote höher und die Antwortzeit länger als im ersten | `thirds`, `errorIncrease`, `slowdown` | beschreibend, ab 20 Sitzungen; vor einer persönlichen Sitzungslänge zusätzlich mit gemischter Reihenfolge prüfen (sonst ist Ermüdung nicht von der Aufgabenart zu trennen) |
| H11 | Unterbrochene Sitzungen haben eine niedrigere Trefferquote als ununterbrochene | `interruptions.accuracy` | mit gegen ohne Unterbrechung, ab 20 Sitzungen je Seite |
| H12 | Wer oft unterbrochen wird, schließt kürzere Sitzungen häufiger ab | `interruptions` gegen `medianSessionLength` je Person | beschreibend; Voraussetzung für „kürzere Sitzungen anbieten“ |

**Persönliche Sitzungslänge:** erst, wenn H10 mit gemischter Reihenfolge einen Effekt zeigt. Bis dahin schlägt die App keine Länge vor.

## Menschliche Faktoren: Raten und Unsicherheit (Stufe 1)
**Nur Auswertung**, bis auf eine Gewichtung hinter einem Flag, das standardmäßig aus ist. Der Export (`npm run psrp:metrics`) enthält den Abschnitt `guessing` (gesamt und je Evaluationsgruppe).

**Schwelle für Durchklicken (4.2), vorab festgelegt:** Eine Antwort gilt als durchgeklickt, wenn sie schneller kam als **ein Drittel der Basiszeit** der Frage (`RUSH_FRACTION` in `lib/server/psrp/guessing.ts`). Die Basiszeit ist der Median aller gemessenen Antwortzeiten dieser Frage (alle Personen, bis zum Stichtag) und gilt erst ab **20 Messungen** als stabil (`STABLE_BASE_MIN_N`). Fragen mit weniger Messungen werden nicht beurteilt. „Gehäuft“ heißt: mindestens 3 durchgeklickte Antworten in einer Sitzung (`RUSH_CLUSTER`). Die Schwelle wird nicht nachträglich an die Daten angepasst; wer sie ändern will, trägt die neue Zahl hier ein, bevor er neu auswertet.

| Faktor | Wert im Export | Nenner `n` | Was gemessen wird |
|---|---|---|---|
| 4.2 Durchklicken | `rushing.rushed` | Reviews mit Zeit und stabiler Basiszeit (`judged`) | Anteil der durchgeklickten Antworten |
| | `rushing.accuracy.rushed`, `.normal` | Reviews je Seite | Trefferquote durchgeklickt gegen normal (Rating 1 ist falsch) |
| | `rushing.clusteredSessions` | Sitzungen mit mindestens 3 beurteilten Reviews | Anteil mit mindestens 3 durchgeklickten Antworten |
| 4.6 Unsicherheit | `changedAnswer.changed` | Antworten mit Angabe | Anteil der Antworten, die vor dem Absenden geändert wurden |
| | `changedAnswer.accuracy.changed`, `.unchanged` | Antworten je Seite | Trefferquote geändert gegen nicht geändert |

**Was gespeichert wird:** `changed_answer` an `study_session_items` und `quiz_answers` (null bei älteren Clients), dazu die Antwortzeit an `quiz_answers` (`response_time_ms`, Grenzen wie in `review_log`). Beides steht im Datenexport und in der Datenschutzerklärung. Die Zeit zwischen erster Auswahl und Absenden wird noch nicht gespeichert.

**Gewichtung (Flag `guess_weighting`, standardmäßig aus):** Ist das Flag an, zählt eine durchgeklickte Antwort im Lernzielstand (`objective_progress`, Lektionstests) nur halb (`RUSHED_ANSWER_WEIGHT`). FSRS bekommt die Antwort unverändert. **Erst einschalten, wenn die Basiszeiten stabil sind** (nach einigen Wochen Echtbetrieb, die meisten Fragen mit mindestens 20 Messungen) und H13 einen Unterschied zeigt.

**Grenzen:**
- 4.2: Schnell heißt nicht geraten: wer die Antwort sicher weiß, ist auch schnell. Deshalb steht die Trefferquote daneben; nur wenn durchgeklickte Antworten deutlich seltener richtig sind, ist „Raten“ eine gute Deutung. Die Basiszeit enthält auch die Antworten der beurteilten Person.
- 4.6: Ändern lässt sich eine Antwort nur, wenn die Rückmeldung erst am Ende der Sitzung kommt. Bei sofortiger Rückmeldung und im Lektionstest ist die Auswahl nach dem Wählen gesperrt; dort ist der Wert immer „nicht geändert“. Bei Reihenfolge, Kurzantwort und Zuordnung zählt erst das Prüfen als Auswahl. Eine Auswertung je Person sollte deshalb nur Sitzungen mit Rückmeldung am Ende vergleichen.

**Hypothesen (Annahmen, keine Zusagen, keine Zielwerte):**

| Nr. | Annahme | Gemessen mit | Vergleich |
|---|---|---|---|
| H13 | Durchgeklickte Antworten sind seltener richtig als normal schnelle | `rushing.accuracy` | durchgeklickt gegen normal, ab 20 Reviews je Seite; Voraussetzung für `guess_weighting` |
| H14 | Geänderte Antworten sind seltener richtig als nicht geänderte; die Änderungsquote ergänzt die Kalibrierung bei Personen ohne Sicherheitsangabe | `changedAnswer.accuracy` | geändert gegen nicht geändert, ab 20 Antworten je Seite |

## Menschliche Faktoren: Fehlerart und Hilfe-Verhalten (Stufe 1)
Abgeleitet aus vorhandenen Tabellen, ohne neue Daten. Der Export (`npm run psrp:metrics`) enthält die Abschnitte `errorTypes` und `helpBehavior`: gesamt mit Listen je Frage (`human_id`) und je Konzept („Name [ID-Anfang]“), je Evaluationsgruppe nur die Summen. Code: `lib/server/psrp/error-types.ts` (Regeln) und `error-types-db.ts` (Laden).

**Heuristik Fehlerart (4.8), vorab festgelegt.** Eingeordnet wird je Person und Frage (das Item; Antworten auf Varianten zählen mit), aus abgeschlossenen Lernsitzungen und Lektionstests. Verstehens- und Voraussetzungs-Aufgaben zählen nicht.

| Klasse | Regel |
|---|---|
| unbekannt | weniger als **3 Versuche** (`MIN_ATTEMPTS`), oder sicherer Stoff ohne messbare Antwortzeit der Fehler |
| Fehlvorstellung | dieselbe falsche Option derselben gezeigten Frage mindestens **2-mal** und mindestens die Hälfte der Fehler, **oder** mindestens **2 Fehler mit „sicher“** |
| Flüchtigkeit | Trefferquote mindestens **2/3** und jeder Fehler schneller als der Median der Antwortzeiten dieser Frage (erst ab 20 Messungen, wie bei 4.2) |
| Lücke | alles andere: wechselnde falsche Optionen ohne „sicher“, oder Fehler bei normaler oder langer Antwortzeit |

Fragen ohne Fehler bekommen keine Klasse. Die Prüfung läuft in dieser Reihenfolge, jede Frage mit Fehlern landet also in genau einer Klasse. „Sicher und falsch“ zählt als Fehlvorstellung, weil eine Variante andere Option-IDs hat: dieselbe Verwechslung zeigt sich dort nicht als dieselbe Option, aber als feste Überzeugung.

**Was die App damit tut (Flag `error_type_gate`, standardmäßig an):** Der Verstehens-Modus schaltet ein Konzept nur noch ein, wenn zusätzlich zum bisherigen Muster (zwei Signalarten oder zweimal „sicher“ falsch) mindestens eine Frage des Konzepts im Signalfenster (14 Tage, nach einer Lösung oder Ablehnung nur neuere Antworten) als **Fehlvorstellung** gilt. Ein schon laufender Verstehens-Modus bleibt unberührt. Mit `FEATURE_ERROR_TYPE_GATE=0` gilt das alte Muster allein; der Vergleich beider Seiten ist H15. Lücke („Lektion zeigen“) und Flüchtigkeit (kein Eingriff) steuern noch nichts.

| Faktor | Wert im Export | Nenner `n` | Was gemessen wird |
|---|---|---|---|
| 4.8 Fehlerart | `errorTypes.all.totals` | Person-Frage-Paare mit Fehlern (`questionsWithErrors`) | Anzahl je Klasse |
| | `errorTypes.all.byQuestion`, `.byConcept` | dieselben Paare je Frage bzw. Konzept | Anzahl je Klasse |
| 4.7 Hilfe-Verhalten | `helpBehavior.all.simulations.withHelp` | gelöste Simulationen | Anteil mit Hilfe (Tipp, Lösung, Fehlversuch) beim letzten Lösen |
| | `simulations.early`, `.late` | einmal bzw. mehrfach gelöste Simulationen | Hilfe schon beim ersten Lösen gegen Hilfe noch beim Wiederholen |
| | `mentorRequests` | Personen | Anfragen „Ich hänge fest“ und Anteil der Personen mit mindestens einer |
| | `people.seeksHelp`, `.skips`, `.both`, `.neither` | Personen | sucht Hilfe (Simulation mit Hilfe oder „Ich hänge fest“) gegen überspringt (Frage offen gelassen oder Notausstieg) |
| | `byQuestion`, `byConcept` | Zählwerte | offen gelassene Fragen und Notausstiege je Frage, dazu Simulationen (über das Lernziel) je Konzept |

**Grenzen:**
- „Antwort zeigen“ (`/reveal`) ist die Rückmeldung nach dem Antworten, keine Hilfe davor, und wird nicht gespeichert. Hilfe vor dem Antworten gibt es nur in Simulationen.
- „Ich hänge fest“ ist ohne Bezug zur Frage gespeichert und erscheint deshalb nur je Person.
- `simulation_results` hält nur das beste und das letzte Lösen. „Früh“ und „spät“ sind deshalb erstes gegen wiederholtes Lösen, nicht der Zeitpunkt der Hilfe innerhalb eines Versuchs.
- Die Grenze zwischen Lücke und Fehlvorstellung ist eine Heuristik. Drei Versuche sind wenig; „unbekannt“ wird anfangs die häufigste Klasse sein.

**Hypothesen (Annahmen, keine Zusagen, keine Zielwerte):**

| Nr. | Annahme | Gemessen mit | Vergleich |
|---|---|---|---|
| H15 | Mit `error_type_gate` löst der Verstehens-Modus seltener aus, aber die ausgelösten Fälle enden häufiger mit „resolved“ | `concept_struggle.status`, `understandingMode` | Flag an gegen aus (`FEATURE_ERROR_TYPE_GATE_ROLLOUT=50`), ab 20 ausgelösten Konzepten je Seite |
| H16 | Fragen mit Fehlvorstellung werden nach der Verstehens-Aufgabe öfter richtig beantwortet als Fragen mit Lücke nach normaler Wiederholung | `errorTypes.byQuestion` und `review_log` danach | beschreibend, ab 20 Person-Frage-Paaren je Klasse; Voraussetzung für „Lücke: Lektion zeigen“ |
| H17 | Wer Hilfe sucht, bricht seltener ab als wer überspringt | `helpBehavior.people` gegen `engagement` | beschreibend, ab 20 Personen je Seite |

## Freiwillige Selbstauskünfte (Grundlage, Stufe 2)
Speicher und Regeln für Fragen, die sich aus dem Verhalten nicht ablesen lassen (Aufgabe 17). Die Fragen selbst kommen mit Aufgabe 18, hinter dem Flag `self_reports` (Kontrollgruppe mit `FEATURE_SELF_REPORTS_ROLLOUT=50`).

- **Speicher:** `self_reports` (Art, Wert, Bezug, Sitzung, Zeitpunkt; Wert null = übersprungen) und `self_report_settings` (Schalter je Art, Zähler fürs Überspringen, Pause). Arten und erlaubte Werte: `lib/self-reports.ts`.
- **Regeln:** jede Art einzeln unter „Wie ich lerne“ abschaltbar; dreimal in Folge übersprungen pausiert die Art 30 Tage, danach zählt es neu; höchstens eine Frage je Lernsitzung (eindeutiger Index). Vor dem Zeigen einer Frage fragt Aufgabe 18 `canAskSelfReport`.
- **Fragemüdigkeit messen:** Anteil übersprungener Fragen je Art (`value` null) und Zahl der Pausen. Steigt das Überspringen über die Zeit, sind es zu viele Fragen.

## Grenzen
- Reaktivierung per Push gibt es nicht, nur per E-Mail (siehe Web Push in `umsetzungsplan.md`, Stufe 5).
- Kleine Stichproben: Veränderungen von wenigen Prozentpunkten bei n unter 20 sind Rauschen.
- Die Auswertung ändert nichts automatisch. Entscheidungen trifft man aus dem Bericht.
