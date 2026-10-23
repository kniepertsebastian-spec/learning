/** Leitfaden docs/RUECKMELDUNGEN.md: Rückmeldungs-Texte ohne wertende Wörter und ohne Zahlen, die nicht aus echten Daten kommen. */
import { describe, expect, it } from "vitest";
import { uiStrings } from "@/lib/i18n-strings";
import { FEEDBACK_TONE_PROMPT } from "@/lib/server/ai/feedback-tone";
import { OPTION_RATIONALE_PROMPT } from "@/lib/server/ai/option-rationale";

/** Texte, die Lernende nach Fehlern oder bei Schwierigkeiten sehen. Neue Rückmeldungs-Texte hier aufnehmen. */
const FEEDBACK_KEYS = [
  "correctWrong",
  "legendWrong",
  "reviewWrong",
  "notQuite",
  "whyNot",
  "easeTitle",
  "easeHint",
  "easeDecline",
  "understandTitle",
  "understandHint",
  "understandConfusion",
  "understandResultOk",
  "understandResultAgain",
  "prereqTitle",
  "prereqHint",
  "prereqResult",
  "bridgeHint",
  "exitHeadline",
  "exitDoneHint",
  "exitWinHint",
  "winResult",
  "recallResult",
  "recallResultNone",
] as const;

/** Wertende Wörter über Person oder Antwort. Der Hinweis „nichts ist als falsch gewertet“ nennt das Wort, um es auszuschließen. */
const JUDGING = /\b(falsch\w*|leider|versag\w*|unfähig|schlecht\w*|wrong|failed|unfortunately|bad)\b/i;
const ALLOWED_NEGATED = /nichts ist als falsch gewertet|nothing was marked wrong/i;

describe("Rückmeldungen ohne Schuldzuweisung", () => {
  for (const locale of ["de", "en"] as const) {
    const quiz = uiStrings[locale].quiz as Record<string, string>;

    it(`${locale}: Rückmeldungs-Texte vorhanden, ohne wertende Wörter`, () => {
      for (const key of FEEDBACK_KEYS) {
        expect(typeof quiz[key], `${locale}.quiz.${key}`).toBe("string");
        const text = quiz[key].replace(ALLOWED_NEGATED, "");
        expect(text, `${locale}.quiz.${key}`).not.toMatch(JUDGING);
      }
    });

    it(`${locale}: keine Zahl ohne Datenbasis - Zahlen stehen nur als Platzhalter`, () => {
      for (const key of FEEDBACK_KEYS) expect(quiz[key], `${locale}.quiz.${key}`).not.toMatch(/\d/);
    });
  }

  it("die Prompts für Begründungen und Erklärungen tragen den Ton-Baustein", () => {
    expect(OPTION_RATIONALE_PROMPT).toContain(FEEDBACK_TONE_PROMPT);
    expect(FEEDBACK_TONE_PROMPT).toMatch(/Zahlen ohne Quelle/);
  });
});
