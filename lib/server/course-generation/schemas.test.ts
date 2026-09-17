import { describe, expect, it } from "vitest";
import { coursePackageV1Schema, courseBlueprintV1Schema } from "./schemas";
import { buildSampleCoursePackage } from "./fixtures";

describe("coursePackageV1Schema", () => {
  it("accepts the sample fixture", () => {
    const result = coursePackageV1Schema.safeParse(buildSampleCoursePackage("test"));
    expect(result.success).toBe(true);
  });

  it("rejects a domain weight outside 0-1 (guards against a raw percent value)", () => {
    const pkg = buildSampleCoursePackage("test");
    pkg.domains[0].weight = 100;
    expect(coursePackageV1Schema.safeParse(pkg).success).toBe(false);
  });

  it("rejects a question without exactly one correct option", () => {
    const pkg = buildSampleCoursePackage("test");
    // options[0] is already the correct answer for this question - flipping a
    // second option to true creates two correct answers, which must fail.
    pkg.domains[0].objectives[0].questions[0].options[1].isCorrect = true;
    expect(coursePackageV1Schema.safeParse(pkg).success).toBe(false);
  });

  it("rejects an objective with no sections", () => {
    const pkg = buildSampleCoursePackage("test");
    pkg.domains[0].objectives[0].sections = [];
    expect(coursePackageV1Schema.safeParse(pkg).success).toBe(false);
  });

  it("rejects the wrong schemaVersion", () => {
    const pkg = buildSampleCoursePackage("test");
    // @ts-expect-error deliberately wrong literal to test schema enforcement
    pkg.schemaVersion = "2.0";
    expect(coursePackageV1Schema.safeParse(pkg).success).toBe(false);
  });
});

describe("courseBlueprintV1Schema", () => {
  it("accepts a minimal valid blueprint (no lessons/questions yet, unlike CoursePackageV1)", () => {
    const blueprint = {
      schemaVersion: "1.0" as const,
      requestId: "req-1",
      title: "Minimal Cert",
      description: "A minimal blueprint fixture.",
      language: "en" as const,
      provider: "Fixture Provider",
      examQuestionCount: null,
      examDurationMinutes: null,
      passingScore: null,
      scoreScale: null,
      sources: [],
      domains: [
        {
          id: "dom-1",
          title: "Domain 1",
          weight: 1,
          objectives: [
            {
              id: "obj-1",
              code: "1.1",
              title: "Objective 1",
              description: "First objective.",
              examWeight: 1,
              complexity: "low" as const,
              requiredConcepts: ["a"],
              commonMisconceptions: [],
              lessonPlan: ["step 1"],
              sourceLocators: [],
              recommendedQuestions: 5,
              requiredScenarios: [],
            },
          ],
        },
      ],
    };
    expect(courseBlueprintV1Schema.safeParse(blueprint).success).toBe(true);
  });

  it("rejects an objective with recommendedQuestions above the hard max", () => {
    const blueprint = {
      schemaVersion: "1.0" as const,
      requestId: "req-1",
      title: "Cert",
      description: "d",
      language: "en" as const,
      provider: "p",
      examQuestionCount: null,
      examDurationMinutes: null,
      passingScore: null,
      scoreScale: null,
      sources: [],
      domains: [
        {
          id: "dom-1",
          title: "Domain 1",
          weight: 1,
          objectives: [
            {
              id: "obj-1",
              code: "1.1",
              title: "Objective 1",
              description: "d",
              examWeight: 1,
              complexity: "low" as const,
              requiredConcepts: ["a"],
              commonMisconceptions: [],
              lessonPlan: ["step 1"],
              sourceLocators: [],
              recommendedQuestions: 99,
              requiredScenarios: [],
            },
          ],
        },
      ],
    };
    expect(courseBlueprintV1Schema.safeParse(blueprint).success).toBe(false);
  });
});
