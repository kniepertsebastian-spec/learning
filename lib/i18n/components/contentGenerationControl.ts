// Texte von components/ContentGenerationControl.tsx (de/en). Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX.
const texts = {
  de: {
    couldNotLoadJobStatus: "Jobstatus konnte nicht geladen werden.",
    couldNotStartJob: "Job konnte nicht gestartet werden.",
    curriculum: "Curriculum",
    lessonsAndQuestions: "Lektionen und Fragen",
    complete: "Abgeschlossen",
    preparing: "Vorbereitung",
    aiContentGeneration: "KI-Inhaltsgenerierung",
    generatesMissingCurriculumLessonsAnd: "Erzeugt fehlendes Curriculum, Lektionen und Quizfragen. Vorhandene Inhalte werden übersprungen.",
    generating: "Generierung läuft",
    tryAgain: "Erneut versuchen",
    generateContent: "Inhalte generieren",
    newGenerationsAreBlockedExisting: " Neue Generierungen sind gesperrt; vorhandene Inhalte bleiben verfügbar.",
    aiContentGenerationRequiresA: "Die KI-Inhaltsgenerierung benötigt eine Verbindung.",
    allDomainsAndObjectivesAlready: "Alle Domains und Objectives haben bereits Inhalte.",
    tokens: "Tokens",
    learningContentIsReady: "Die Lerninhalte sind bereit.",
    generationFailed: "Generierung fehlgeschlagen",
    technicalDetails: "Technische Details",
    tryAgainAboveOnlyRedoes: "\"Erneut versuchen\" oben wiederholt nur das Fehlende - bereits erzeugte Lektionen und Fragen werden nicht neu generiert.",
    aiBudget0Of1: "KI-Budget: ${0} von ${1} verbraucht.",
    n0DomainSWithoutCurriculum: "{0} Domain(s) ohne Curriculum, {1} Objective(s) ohne vollständige Lektionen/Fragen – geschätzt {2} KI-Aufrufe.",
  },
  en: {
    couldNotLoadJobStatus: "Could not load job status.",
    couldNotStartJob: "Could not start job.",
    curriculum: "Curriculum",
    lessonsAndQuestions: "Lessons and questions",
    complete: "Complete",
    preparing: "Preparing",
    aiContentGeneration: "AI content generation",
    generatesMissingCurriculumLessonsAnd: "Generates missing curriculum, lessons, and quiz questions. Existing content is skipped.",
    generating: "Generating",
    tryAgain: "Try again",
    generateContent: "Generate content",
    newGenerationsAreBlockedExisting: " New generations are blocked; existing content remains available.",
    aiContentGenerationRequiresA: "AI content generation requires a connection.",
    allDomainsAndObjectivesAlready: "All domains and objectives already have content.",
    tokens: "tokens",
    learningContentIsReady: "Learning content is ready.",
    generationFailed: "Generation failed",
    technicalDetails: "Technical details",
    tryAgainAboveOnlyRedoes: "\"Try again\" above only redoes what's missing - lessons and questions already generated are not recreated.",
    aiBudget0Of1: "AI budget: ${0} of ${1} spent.",
    n0DomainSWithoutCurriculum: "{0} domain(s) without curriculum, {1} objective(s) without complete lessons/questions – estimated {2} AI calls.",
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_contentGenerationControl(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
