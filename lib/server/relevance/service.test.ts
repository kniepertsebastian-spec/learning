import { describe, expect, it } from "vitest";
import { careerPathsForCourse } from "./service";

describe("careerPathsForCourse", () => {
  const paths = [
    { title: "A", courses: [{ courseId: "c1" }, { courseId: "c2" }] },
    { title: "B", courses: [{ courseId: "c2" }] },
    { title: "C", courses: [{ courseId: "c2" }] },
    { title: 3, courses: [{ courseId: "c2" }] },
    { courses: null },
  ];
  it("liefert die Titel der Pfade, die den Kurs nennen, höchstens zwei", () => {
    expect(careerPathsForCourse(paths, "c1")).toEqual(["A"]);
    expect(careerPathsForCourse(paths, "c2")).toEqual(["A", "B"]);
    expect(careerPathsForCourse(paths, "c9")).toEqual([]);
  });
  it("übersteht beliebige gespeicherte Daten", () => {
    expect(careerPathsForCourse(null, "c1")).toEqual([]);
    expect(careerPathsForCourse({ x: 1 }, "c1")).toEqual([]);
    expect(careerPathsForCourse([null, 4, "x"], "c1")).toEqual([]);
  });
});
