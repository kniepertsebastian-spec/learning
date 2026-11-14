// Texte der freiwilligen Fragen (Aufgabe 18): components/SelfReportPrompt.tsx und die Zeile im Check-in (components/StartSessionPicker.tsx).
// Neue Texte hier ergänzen, nicht als `de ? … : …` ins JSX. Die erlaubten Werte je Art stehen in lib/self-reports.ts.
import type { SelfReportKind } from "@/lib/self-reports";

type Question = { question: string; options: Record<string, string> };

const texts = {
  de: {
    intro: "Eine kurze Frage an dich",
    optional: "Freiwillig, du kannst sie überspringen.",
    skip: "Nicht jetzt",
    thanks: "Danke!",
    failed: "Das hat nicht geklappt.",
    environmentOptional: "Wo lernst du heute? (freiwillig)",
    questions: {
      effort: {
        question: "Wie anstrengend war das?",
        options: { "1": "Sehr leicht", "2": "Leicht", "3": "Mittel", "4": "Anstrengend", "5": "Sehr anstrengend" },
      },
      retention_forecast: {
        question: "Wie viel davon weißt du in einer Woche noch?",
        options: { "0": "Fast nichts", "25": "Etwa ein Viertel", "50": "Etwa die Hälfte", "75": "Das meiste", "100": "Alles" },
      },
      exam_confidence: {
        question: "Wie sicher bestehst du die Prüfung?",
        options: { "0": "Gar nicht sicher", "25": "Eher unsicher", "50": "Halb und halb", "75": "Eher sicher", "100": "Sehr sicher" },
      },
      learning_reason: {
        question: "Warum lernst du diesen Kurs?",
        options: { required: "Es ist Pflicht", job: "Für meine Stelle", career_change: "Für einen Wechsel", interest: "Aus Interesse" },
      },
      work_relevance: {
        question: "Brauchst du das in deiner Arbeit?",
        options: { yes: "Ja", partly: "Teilweise", no: "Nein" },
      },
      learning_environment: {
        question: "Wo lernst du heute?",
        options: { quiet: "Ruhig", on_the_go: "Unterwegs", at_work: "Bei der Arbeit" },
      },
    } satisfies Record<SelfReportKind, Question>,
  },
  en: {
    intro: "A short question for you",
    optional: "Optional, you can skip it.",
    skip: "Not now",
    thanks: "Thanks!",
    failed: "That did not work.",
    environmentOptional: "Where are you learning today? (optional)",
    questions: {
      effort: {
        question: "How demanding was that?",
        options: { "1": "Very easy", "2": "Easy", "3": "Medium", "4": "Demanding", "5": "Very demanding" },
      },
      retention_forecast: {
        question: "How much of it will you still know in a week?",
        options: { "0": "Almost nothing", "25": "About a quarter", "50": "About half", "75": "Most of it", "100": "All of it" },
      },
      exam_confidence: {
        question: "How sure are you that you will pass the exam?",
        options: { "0": "Not sure at all", "25": "Rather unsure", "50": "Half and half", "75": "Rather sure", "100": "Very sure" },
      },
      learning_reason: {
        question: "Why are you taking this course?",
        options: { required: "It is required", job: "For my job", career_change: "For a career change", interest: "Out of interest" },
      },
      work_relevance: {
        question: "Do you need this in your work?",
        options: { yes: "Yes", partly: "Partly", no: "No" },
      },
      learning_environment: {
        question: "Where are you learning today?",
        options: { quiet: "Somewhere quiet", on_the_go: "On the go", at_work: "At work" },
      },
    } satisfies Record<SelfReportKind, Question>,
  },
} as const;

/** Texte in der Sprache `lang` (Locale oder `de` als boolean). */
export function c_selfReportPrompt(lang: boolean | string) {
  return texts[lang === true || lang === "de" ? "de" : "en"];
}
