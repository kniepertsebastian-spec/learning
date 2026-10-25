import { describe, expect, it } from "vitest";
import { planQualityTasks, QUALITY_KINDS } from "./batch";
import type { Improvement } from "./report";

const imp = (kind: Improvement["kind"], extra: Partial<Improvement> = {}): Improvement => ({
  id: `${kind}-${Math.random()}`, kind, severity: "low", objectiveId: "o1", objectiveCode: "1.1", sectionId: null, text: { de: kind, en: kind }, ...extra,
});

describe("planQualityTasks", () => {
  it("bildet Verbesserungspunkte auf KI-Aktionen ab", () => {
    const tasks = planQualityTasks(
      [
        imp("thin_lesson", { sectionId: "s1" }),
        imp("no_exam_callout", { sectionId: "s1" }),
        imp("hands_on_without_simulation", { sectionId: "s2" }),
        imp("open_report", { sectionId: "s3", severity: "high" }),
        imp("open_report", { questionId: "q1", severity: "high" }),
        imp("hard_question", { questionId: "q2" }),
      ],
      QUALITY_KINDS,
    );
    expect(tasks.map((t) => `${t.request.target}:${t.request.action}`)).toEqual([
      "section:fix_reports", "question:fix_reports", "question:improve", "section:expand", "section:simulation", "section:exam",
    ]);
  });

  it("legt „Fragen ergänzen“ je Lernziel zusammen (größere Anzahl gewinnt) und begrenzt sie", () => {
    const tasks = planQualityTasks([imp("few_questions", { needed: 2 }), imp("one_question_type"), imp("few_questions", { objectiveId: "o2", needed: 40 })], QUALITY_KINDS);
    const byObjective = Object.fromEntries(tasks.map((t) => [t.request.target === "objective" ? t.request.id : "", t.request]));
    expect(byObjective.o1).toMatchObject({ count: 3 });
    expect(tasks.find((t) => t.request.target === "objective" && t.request.id === "o1")?.improvementKinds).toEqual(["few_questions", "one_question_type"]);
    expect(byObjective.o2).toMatchObject({ count: 10 });
  });

  it("fehlende Lernziele zuletzt, nur mit Domain; Auswahl und Obergrenze greifen", () => {
    const missing = imp("missing_objective", { objectiveId: null, missing: { code: "9.9", title: "Neu", domainId: "d1" } });
    const noDomain = imp("missing_objective", { objectiveId: null, missing: { code: "9.8", title: "Ohne", domainId: null } });
    const all = planQualityTasks([missing, noDomain, imp("thin_lesson", { sectionId: "s1" })], QUALITY_KINDS);
    expect(all.map((t) => t.request.action)).toEqual(["expand", "add_objective"]);
    expect(planQualityTasks([missing, imp("thin_lesson", { sectionId: "s1" })], ["thin_lesson"])).toHaveLength(1);
    expect(planQualityTasks([imp("thin_lesson", { sectionId: "s1" }), imp("thin_lesson", { sectionId: "s2" })], QUALITY_KINDS, 1)).toHaveLength(1);
  });

  it("Fragenpool je Kapitel: fehlende Fragen werden auf die Lernziele des Kapitels verteilt, mit „Fragen ergänzen“ zusammengelegt", () => {
    const pool = imp("small_chapter_pool", { objectiveId: null, objectiveCode: null, needed: 8, chapterPool: { domainId: "d1", size: 22, needed: 8, perObjective: [{ objectiveId: "o1", count: 4 }, { objectiveId: "o2", count: 4 }] } });
    const tasks = planQualityTasks([pool, imp("few_questions", { needed: 6 })], QUALITY_KINDS);
    const byObjective = Object.fromEntries(tasks.map((t) => [t.request.target === "objective" ? t.request.id : "", t.request]));
    expect(byObjective.o1).toMatchObject({ action: "add_questions", count: 6 }); // größere Anzahl gewinnt
    expect(byObjective.o2).toMatchObject({ action: "add_questions", count: 4 });
    expect(planQualityTasks([pool], ["few_questions"])).toHaveLength(0); // nur wenn die Art gewählt ist
  });
});
