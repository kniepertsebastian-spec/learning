import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }), usePathname: () => "/", useSearchParams: () => new URLSearchParams() }));

import { LocaleProvider } from "@/lib/i18n";
import { ExamSession } from "@/components/ExamSession";
import { FeedbackPanel } from "@/components/quiz/FeedbackPanel";
import { QuestionNavigator } from "@/components/quiz/QuestionNavigator";
import { OptionTile } from "@/components/quiz/OptionTile";

const wrap = (node: React.ReactNode) => renderToStaticMarkup(<LocaleProvider>{node}</LocaleProvider>);

const examQuestions = [1, 2].map((n) => ({
  questionId: `q${n}`,
  orderNum: n,
  question: { de: `Frage ${n}`, en: `Question ${n}` },
  options: [1, 2, 3, 4].map((o) => ({ id: `q${n}o${o}`, orderNum: o, text: { de: `Antwort ${o}`, en: `Answer ${o}` } })),
}));

describe("Prüfungsmodus verrät vor der Abgabe nichts über die Richtigkeit", () => {
  const html = wrap(<ExamSession certSlug="x" examId="e" questions={examQuestions} locale="de" durationMinutes={60} targetQuestionCount={2} />);

  it("keine Richtig-/Falsch-Zustände, kein Feedback, keine Selbsteinschätzung", () => {
    expect(html).not.toContain('data-state="correct"');
    expect(html).not.toContain('data-state="wrong"');
    expect(html).not.toContain("feedback-panel");
    expect(html).not.toContain("confidence-bar");
    expect(html).not.toContain("option-rationales");
  });
  it("zeigt den Prüfungsmodus und die Hinweiskarte", () => {
    expect(html).toContain('data-mode="exam"');
    expect(html).toContain("kein Sofort-Feedback");
  });
});

describe("QuestionNavigator", () => {
  it("Prüfungsmodus kennt nur offen/beantwortet, Übungsmodus richtig/falsch", () => {
    const exam = wrap(<QuestionNavigator mode="exam" states={["open", "answered"]} currentIndex={0} flagged={new Set([1])} onJump={() => {}} />);
    expect(exam).not.toContain("Richtig");
    expect(exam).toContain("Beantwortet");
    expect(exam).toContain('data-flagged="true"');
    const practice = wrap(<QuestionNavigator mode="practice" states={["correct", "wrong"]} currentIndex={0} flagged={new Set()} onJump={() => {}} />);
    expect(practice).toContain("Richtig");
    expect(practice).toContain("Falsch");
    expect(practice).not.toContain("kein Sofort-Feedback");
  });
});

describe("FeedbackPanel", () => {
  const base = { correct: false, correctIndex: 1, explanation: "Weil.", options: ["a", "b", "c", "d"], selectedIndex: 0, questionId: "q", nextLabel: "Weiter", onNext: () => {} };
  it("zeigt „Warum die anderen nicht passen“ nur mit Begründungen", () => {
    expect(wrap(<FeedbackPanel {...base} />)).not.toContain("Warum die anderen nicht passen");
    expect(wrap(<FeedbackPanel {...base} rationales={[null, null, null, null]} />)).not.toContain("Warum die anderen nicht passen");
    const out = wrap(<FeedbackPanel {...base} rationales={["Falsch weil A", null, "Falsch weil C", null]} />);
    expect(out).toContain("Warum die anderen nicht passen");
    expect(out).toContain("Falsch weil A");
    expect(out).toContain("Falsch weil C");
  });
  it("nennt den richtigen Buchstaben, nicht nur über Farbe", () => {
    expect(wrap(<FeedbackPanel {...base} />)).toContain("richtig ist B");
  });
});

describe("OptionTile", () => {
  it("richtig und falsch haben immer ein Icon und Screenreader-Text", () => {
    const ok = wrap(<OptionTile index={0} state="correct" stateLabel="Richtig">x</OptionTile>);
    expect(ok).toContain("<svg");
    expect(ok).toContain("sr-only");
    const bad = wrap(<OptionTile index={1} state="wrong" stateLabel="Falsch">x</OptionTile>);
    expect(bad).toContain("<svg");
  });
});
