/**
 * Angaben zur Person und ihre Verarbeitung (Aufgabe 07b, Review 12.11.2026): was die App erhebt, wozu, wie lange und wer es
 * bekommt. Die Datenschutzerklärung (`app/datenschutz/page.tsx`) zeigt diese Liste. Jeder Eintrag nennt, welche Teile des
 * Datenexports (`lib/server/account/export.ts`) er abdeckt; ein Test gleicht beides ab: eine neue Angabe im Export, die hier fehlt,
 * lässt ihn fehlschlagen.
 *
 * Die Texte beschreiben, was der Code tut. Rechtsgrundlagen, Fristen über das Kontoende hinaus und die Gesamtfassung muss der
 * Betreiber rechtlich prüfen lassen; bis er `LEGAL_PRIVACY_REVIEWED=true` setzt, trägt die Seite den Hinweis „Entwurf“.
 */
export type Bilingual = { de: string; en: string };

export interface PrivacyEntry {
  id: string;
  title: Bilingual;
  /** Welche Angaben genau. */
  data: Bilingual;
  purpose: Bilingual;
  retention: Bilingual;
  recipients: Bilingual;
  /** Schlüssel im Datenexport (`account`, `company.<x>`, `learning.<x>`, `activity.<x>`), die dieser Eintrag erklärt. */
  exportKeys: string[];
}

const UNTIL_DELETION: Bilingual = {
  de: "Bis zur Löschung des Kontos. Mit der Löschung werden die Daten gelöscht oder, soweit sie einen Vorgang der Plattform betreffen, anonymisiert.",
  en: "Until the account is deleted. On deletion the data is deleted or, where it belongs to a platform record, anonymised.",
};
const NO_RECIPIENT: Bilingual = {
  de: "Keine Weitergabe. Die Daten sind für den Betrieb der Plattform gespeichert.",
  en: "Not passed on. The data is stored to operate the platform.",
};

export const PRIVACY_ENTRIES: PrivacyEntry[] = [
  {
    id: "konto",
    title: { de: "Konto", en: "Account" },
    data: {
      de: "E-Mail-Adresse, Name, Rolle, Zeitpunkt der E-Mail-Bestätigung, Zeitzone, Zeitpunkt der Anlage, Passwort (nur als Hash, nie im Klartext und nicht im Datenexport), Zuteilung zu einer Auswertungsgruppe der Lernplanung.",
      en: "Email address, name, role, time of email confirmation, time zone, time of creation, password (as a hash only, never in plain text and not in the data export), assignment to an evaluation group of the learning planner.",
    },
    purpose: {
      de: "Anmeldung, Zuordnung der Lerndaten zur Person, Bestätigung der Adresse, Tagesgrenzen und lokale Tageszeit in der Lernplanung (Zeitzone), Vergleich von Planungsvarianten (Auswertungsgruppe).",
      en: "Sign-in, assigning learning data to the person, confirming the address, day boundaries and local time of day in learning planning (time zone), comparing planning variants (evaluation group).",
    },
    retention: UNTIL_DELETION,
    recipients: {
      de: "E-Mail-Dienst des Betreibers (SMTP) für Bestätigungs- und Passwort-Mails, soweit der Versand eingerichtet ist. Sonst keine.",
      en: "The operator's email service (SMTP) for confirmation and password emails, where sending is set up. Otherwise none.",
    },
    exportKeys: ["account"],
  },
  {
    id: "altersspanne",
    title: { de: "Altersspanne (freiwillig)", en: "Age range (optional)" },
    data: {
      de: "Eine grobe Altersspanne (zum Beispiel „25–34“), keine genaue Angabe, kein Geburtsdatum.",
      en: "A rough age range (for example “25–34”), no exact age and no date of birth.",
    },
    purpose: {
      de: "Nur Startwerte der Lernplanung, bis genug eigene Lerndaten vorliegen. Die Angabe lässt sich unter „Konto“ setzen und jederzeit entfernen.",
      en: "Only starting values for learning planning until enough of your own learning data exists. You can set it under “Account” and remove it at any time.",
    },
    retention: {
      de: "Bis zum Entfernen der Angabe oder zur Löschung des Kontos.",
      en: "Until you remove it or the account is deleted.",
    },
    recipients: NO_RECIPIENT,
    exportKeys: [],
  },
  {
    id: "firma",
    title: { de: "Firmenzugehörigkeit und Zuweisungen", en: "Company membership and assignments" },
    data: {
      de: "Zugehörige Firma und Rolle darin, zugewiesene Lernpfade mit Status, Frist und Abschluss, angenommene Einladungen, eigene Abgaben zu Praxisaufgaben mit Anmerkungen und Bestätigung.",
      en: "Company and role in it, assigned learning paths with status, due date and completion, accepted invitations, your own submissions to practice tasks with notes and confirmation.",
    },
    purpose: {
      de: "Pflichtschulungen und Lernpfade der Firma zuweisen und ihren Stand nachhalten, Praxisaufgaben bestätigen lassen.",
      en: "Assigning and tracking the company's mandatory training and learning paths, having practice tasks confirmed.",
    },
    retention: UNTIL_DELETION,
    recipients: {
      de: "Die Firma, der das Konto angehört (zuständige Rollen im Firmenbereich): Zuweisung mit Status (offen, in Arbeit, bestanden), Datum und Frist sowie die bestätigenden Personen bei Praxisaufgaben. Ergebnisse, Punktzahlen und einzelne Antworten sieht die Firma nicht.",
      en: "The company the account belongs to (responsible roles in the company area): assignment with status (open, in progress, passed), date and due date, and the confirming persons for practice tasks. The company does not see results, scores or individual answers.",
    },
    exportKeys: ["company.membership", "company.assignments", "company.practiceSubmissions", "company.acceptedInvitations"],
  },
  {
    id: "lernverlauf",
    title: { de: "Lernverlauf und Ergebnisse", en: "Learning progress and results" },
    data: {
      de: "Gelesene und übersprungene Lektionen, Quiz-, Prüfungs- und Simulationsergebnisse mit den einzelnen Antworten (bei Quizfragen mit der Selbsteinschätzung „geraten / unsicher / sicher“, der Antwortzeit und ob die Antwort vor dem Absenden geändert wurde), Stand je Lernziel und dessen Verlauf, Wiederholungsaufgaben, Lernzeit, Lesezeit je Lektion (aktive Sekunden und wie oft du sie geöffnet hast), Einstiegstests, abgebrochene Kurse, Prüfungstermine, hinterlegte Zertifikate, zugewiesene Prüfungsgutscheine (ohne Code).",
      en: "Lessons read and skipped, quiz, exam and simulation results with the individual answers (for quiz questions including the self-assessment “guessed / unsure / sure”, the response time and whether the answer was changed before submitting), standing per learning objective and its history, remediation sessions, learning time, reading time per lesson (active seconds and how often you opened it), entry tests, abandoned courses, exam dates, stored certificates, assigned exam vouchers (without the code).",
    },
    purpose: {
      de: "Lernstand anzeigen, passende Aufgaben und Wiederholungen auswählen, Prüfungsbereitschaft einschätzen, Ergebnisse der Prüfungen dokumentieren. Lesezeit und Bildschirmgröße dienen nur der Auswertung, ob Lesetiefe und Gerät mit dem Lernerfolg zusammenhängen; sie ändern nichts an deinem Plan.",
      en: "Showing your progress, choosing suitable tasks and reviews, estimating exam readiness, documenting exam results. Reading time and screen size are only used to evaluate whether reading depth and device relate to learning success; they do not change your plan.",
    },
    retention: UNTIL_DELETION,
    recipients: {
      de: "Die Firma sieht bei zugewiesenen Lernpfaden nur Status, Datum und Frist (siehe „Firmenzugehörigkeit und Zuweisungen“), keine Ergebnisse und keine einzelnen Antworten. Sonst keine Weitergabe.",
      en: "For assigned learning paths the company only sees status, date and due date (see “Company membership and assignments”), no results and no individual answers. Otherwise not passed on.",
    },
    exportKeys: [
      "learning.quizAttempts",
      "learning.examAttempts",
      "learning.lessonCompletions",
      "learning.lessonSkips",
      "learning.simulationResults",
      "learning.objectiveProgress",
      "learning.objectiveSnapshots",
      "learning.remediationSessions",
      "learning.learningTime",
      "learning.lessonReadingTime",
      "learning.courseAbandonments",
      "learning.preAssessments",
      "learning.examPlans",
      "learning.userCertificates",
      "learning.examVouchers",
    ],
  },
  {
    id: "wiederholung",
    title: { de: "Wiederholungsplanung und Lernsitzungen", en: "Review planning and study sessions" },
    data: {
      de: "Jede beantwortete Frage mit Zeitpunkt, Ergebnis, Antwortzeit und Selbsteinschätzung, Gedächtnismodell je Frage und persönliche Parameter dazu, Kalibrierung, Ergebnisse von Probeaufgaben, Lernsitzungen mit ihren Aufgaben, der groben Bildschirmgröße beim Abschluss („schmal“ oder „breit“, keine Gerätekennung) und wie oft und wie lange die App während der Sitzung im Hintergrund war (nur Zahl und Gesamtdauer), daraus abgeleitete Werte, Rückmeldungen zu Sitzungsvorschlägen.",
      en: "Every answered question with time, result, response time and self-assessment, memory model per question and personal parameters for it, calibration, results of probe tasks, study sessions with their tasks, the rough screen size at completion (“narrow” or “wide”, no device identifier) and how often and how long the app was in the background during the session (count and total duration only), values derived from them, feedback on session suggestions.",
    },
    purpose: {
      de: "Berechnen, wann welche Frage wieder fällig ist, und die Tagesplanung daran ausrichten. Die Antwortzeit dient dazu, den Aufwand eines Tages realistisch zu planen und Anzeichen von Überforderung zu erkennen. Aus Antwortzeit, Fehlern nach Position in der Sitzung und Unterbrechungen zeigt „Wie ich lerne“ dir kurze Aussagen über deine Sitzungen; sie ändern nichts an deinem Plan.",
      en: "Working out when each question is due again and aligning the daily plan with it. Response time is used to plan a day's effort realistically and to notice signs of overload. From response time, mistakes by position in the session and interruptions, “How I learn” shows you short statements about your sessions; they do not change your plan.",
    },
    retention: UNTIL_DELETION,
    recipients: NO_RECIPIENT,
    exportKeys: [
      "learning.reviewItems",
      "learning.itemStates",
      "learning.reviewLog",
      "learning.fsrsParams",
      "learning.calibration",
      "learning.probeResults",
      "learning.probeAttempts",
      "learning.studySessions",
      "learning.sessionDerived",
      "learning.sessionRecommendationFeedback",
    ],
  },
  {
    id: "tagesangaben",
    title: { de: "Angaben vor einer Lernsitzung", en: "Details before a study session" },
    data: {
      de: "Tagesform (Energie, Skala 1 bis 5), verfügbares Zeitbudget in Minuten, ob ein Arbeitstag war, und ob die Angabe übersprungen und ergänzt wurde. Dazu die Einstellungen, ob nach der Tagesform gefragt wird.",
      en: "Daily form (energy, scale 1 to 5), available time budget in minutes, whether it was a workday, and whether the entry was skipped and filled in. Plus the settings for whether you are asked about your daily form.",
    },
    purpose: {
      de: "Die Menge und Schwere der Aufgaben des Tages an Energie und Zeit anpassen. Freiwillig: die Abfrage lässt sich überspringen und abschalten.",
      en: "Adjusting the amount and difficulty of the day's tasks to energy and time. Optional: the question can be skipped and switched off.",
    },
    retention: UNTIL_DELETION,
    recipients: NO_RECIPIENT,
    exportKeys: ["learning.sessionCheckins", "learning.checkinFlags"],
  },
  {
    id: "rhythmus",
    title: { de: "Lernrhythmus und Einstellungen", en: "Learning rhythm and settings" },
    data: {
      de: "Tageszeit-Profil (zu welchen Tageszeiten du lernst und wie es läuft), Lernaktivität, Wochenziel und Anzeige-Einstellungen, Zustand der Motivations- und Entlastungshinweise, Ausstiege („Heute reicht’s“), Energiemodus, Rückblicke, Verstehens-Aufgaben, Erinnerungen und deren Einstellungen (E-Mail, Push), Meldungen zur Wiederaufnahme.",
      en: "Time-of-day profile (when you learn and how it goes), learning activity, weekly goal and display settings, state of motivation and relief hints, exits (“Enough for today”), energy mode, recall checks, comprehension tasks, reminders and their settings (email, push), reactivation messages.",
    },
    purpose: {
      de: "Lernzeiten und Erinnerungen passend legen, bei Überforderung entlasten, nach einer Pause wieder abholen. Die Hinweise lassen sich unter „Wie ich lerne“ und „Konto“ einstellen oder abschalten.",
      en: "Placing learning times and reminders sensibly, relieving you when overloaded, picking you up after a break. The hints can be adjusted or switched off under “How I learn” and “Account”.",
    },
    retention: UNTIL_DELETION,
    recipients: {
      de: "Für Web Push: der Push-Dienst deines Browsers erhält die Nachricht und die Adresse deines Geräts, nur wenn du Push eingeschaltet hast. Sonst keine.",
      en: "For web push: your browser's push service receives the message and the address of your device, only if you switched push on. Otherwise none.",
    },
    exportKeys: [
      "learning.studyProfiles",
      "learning.learningActivities",
      "learning.learningPreferences",
      "learning.pushPreferences",
      "learning.engagementState",
      "learning.learningExits",
      "learning.energyModeEvents",
      "learning.recallChecks",
      "learning.conceptStruggles",
      "learning.reactivationMessages",
    ],
  },
  {
    id: "berufsprofil",
    title: { de: "Berufsprofil, Skills und Karrierepfade (freiwillig)", en: "Career profile, skills and career paths (optional)" },
    data: {
      de: "Berufsbezeichnung, Beschreibung der Tätigkeit, Schwerpunkte, Bundesland, Zielrolle, Skills (Art, Name, Stufe, Aktualität; auch automatisch aus abgeschlossenen Kursen, wenn eingeschaltet) und die daraus erzeugten Karrierepfade.",
      en: "Job title, description of your work, focus areas, federal state, target role, skills (kind, name, level, recency; also added automatically from completed courses if switched on) and the career paths generated from them.",
    },
    purpose: {
      de: "Nächste mögliche Stellen vorschlagen und die Kurse nennen, die dorthin führen.",
      en: "Suggesting possible next jobs and naming the courses that lead there.",
    },
    retention: {
      de: "Bis du die Angaben änderst oder löschst, spätestens bis zur Löschung des Kontos.",
      en: "Until you change or delete the details, at the latest until the account is deleted.",
    },
    recipients: {
      de: "KI-Dienst: Für die Karrierepfade werden Berufsbezeichnung, Beschreibung, Schwerpunkte, Zielrolle, Skills (Art, Name, Stufe, Aktualität), abgeschlossene Kurse und Zertifikatstitel an die Gemini-Schnittstelle von Google übertragen, und nur, wenn du die Berechnung auslöst. Name, E-Mail-Adresse, Bundesland und Kennungen werden nicht übertragen.",
      en: "AI service: for career paths, job title, description, focus areas, target role, skills (kind, name, level, recency), completed courses and certificate titles are sent to Google's Gemini interface, and only when you trigger the calculation. Your name, email address, federal state and identifiers are not sent.",
    },
    exportKeys: ["learning.profile", "learning.skills", "learning.careerPaths"],
  },
  {
    id: "pruefer",
    title: { de: "Angaben von Prüferinnen und Prüfern", en: "Reviewer details" },
    data: {
      de: "Profil, Foto, Berufserfahrung, Zertifikate, Freischaltung, Zuweisungen zu Kursen, Kommentare und Zweitprüfungen.",
      en: "Profile, photo, work experience, certificates, qualification, course assignments, comments and second reviews.",
    },
    purpose: {
      de: "Kurse fachlich prüfen und die Prüfung nachvollziehbar machen. Nur für Personen mit der Rolle Prüfer.",
      en: "Technically reviewing courses and making the review traceable. Only for people with the reviewer role.",
    },
    retention: UNTIL_DELETION,
    recipients: {
      de: "Lernende sehen bei geprüften Kursen den Namen der prüfenden Person (auch anonym möglich) und das Datum, auf der Kursseite und im Offline-Paket.",
      en: "Learners see the reviewer's name (anonymous is possible) and the date on reviewed courses, on the course page and in the offline package.",
    },
    exportKeys: [
      "learning.courseReviewers",
      "learning.reviewerComments",
      "learning.reviewerProfile",
      "learning.reviewerPhoto",
      "learning.reviewerExperience",
      "learning.reviewerCertifications",
      "learning.reviewerQualification",
      "learning.secondReviews",
    ],
  },
  {
    id: "rueckmeldungen",
    title: { de: "Rückmeldungen, Meldungen und Anfragen", en: "Feedback, reports and requests" },
    data: {
      de: "Eigene Rückmeldungen und Meldungen zu Inhalten, Fragen an den Mentor, erzeugte Lernprofil-Exporte.",
      en: "Your own feedback and content reports, questions to the mentor, generated learning profile exports.",
    },
    purpose: {
      de: "Fehler in Inhalten beheben, Fragen beantworten, ein Lernprofil auf Wunsch bestätigen und widerrufen können.",
      en: "Fixing errors in content, answering questions, letting you confirm and revoke a learning profile on request.",
    },
    retention: UNTIL_DELETION,
    recipients: {
      de: "Die Betreiber-Administration, bei Fragen an den Mentor die zugeordnete Person der Firma.",
      en: "The operator's administration, and for questions to the mentor the assigned person at the company.",
    },
    exportKeys: ["learning.feedbackReports", "learning.mentorRequests", "learning.learningProfileExports", "activity.contentReports"],
  },
  {
    id: "technik",
    title: { de: "Technische Protokolle", en: "Technical logs" },
    data: {
      de: "Vom Gerät übertragene Lernereignisse (Offline-Synchronisation) mit Ergebnis der Verbuchung, Protokoll von Verwaltungsvorgängen, die du ausgelöst hast.",
      en: "Learning events transferred by the device (offline sync) with the result of booking them, log of administrative actions you triggered.",
    },
    purpose: {
      de: "Sicherstellen, dass jedes Ergebnis genau einmal verbucht wird, auch nach einer Unterbrechung der Verbindung, und Verwaltungsvorgänge nachvollziehen.",
      en: "Making sure every result is booked exactly once, even after the connection was interrupted, and tracing administrative actions.",
    },
    retention: UNTIL_DELETION,
    recipients: NO_RECIPIENT,
    exportKeys: ["activity.syncEvents", "activity.auditEventsAsActor"],
  },
];

/**
 * Daten, die nicht im Datenexport stehen, weil sie keinen Inhalt der Person darstellen (Begründungen in
 * `EXCLUDED_USER_REFERENCES`). Die Erklärung nennt sie trotzdem.
 */
export const PRIVACY_TECHNICAL: Array<{ title: Bilingual; text: Bilingual }> = [
  {
    title: { de: "Anmeldung und Cookies", en: "Sign-in and cookies" },
    text: {
      de: "Die App setzt nur technisch notwendige Cookies: das Anmelde-Cookie (Sitzung) und die Spracheinstellung. Die Wahl von hellem oder dunklem Aussehen und Zwischenstände von Antworten bleiben im Speicher deines Browsers. Es gibt keine Werbe- oder Analyse-Cookies.",
      en: "The app only sets technically necessary cookies: the sign-in cookie (session) and the language setting. Your choice of light or dark appearance and interim answers stay in your browser's storage. There are no advertising or analytics cookies.",
    },
  },
  {
    title: { de: "Geräte für Web Push", en: "Devices for web push" },
    text: {
      de: "Schaltest du Push ein, speichert die App die Adresse des Push-Dienstes deines Browsers und den Geräteschlüssel, dazu ein Protokoll gesendeter Erinnerungen gegen Doppelte. Du siehst und beendest die Geräte unter „Konto“. Mit dem Konto werden sie gelöscht.",
      en: "If you switch push on, the app stores the address of your browser's push service and the device key, plus a log of reminders sent to avoid duplicates. You can see and end devices under “Account”. They are deleted with the account.",
    },
  },
  {
    title: { de: "Sicherheits-Token und Firmen-Login", en: "Security tokens and company sign-in" },
    text: {
      de: "Für Bestätigung der E-Mail-Adresse, Passwort-Zurücksetzen und Firmen-Login speichert die App kurzlebige Token (nur als Hash) und, beim Login über das Firmenkonto, die Kennung deines Kontos beim Anmeldedienst deiner Firma. Eine offene Anfrage zur Firmen-Registrierung enthält Name und Firmen-E-Mail. Alles wird mit dem Konto gelöscht.",
      en: "For confirming your email address, resetting your password and company sign-in, the app stores short-lived tokens (as hashes only) and, for sign-in with a company account, the identifier of your account at your company's identity provider. An open company registration request contains your name and company email. Everything is deleted with the account.",
    },
  },
];

export const PRIVACY_RIGHTS: Bilingual = {
  de: "Du kannst deine Daten unter „Konto“ als Datei herunterladen (Auskunft und Übertragbarkeit) und dein Konto dort löschen. Für alles Weitere, etwa Berichtigung oder Widerspruch, wende dich an den Verantwortlichen.",
  en: "Under “Account” you can download your data as a file (access and portability) and delete your account. For anything else, such as correction or objection, contact the controller.",
};
