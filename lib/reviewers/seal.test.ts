import { describe, expect, it } from "vitest";
import { anonymousLabel, changeDetail, changeLabel, reviewersText } from "./seal";

describe("Siegel: Texte", () => {
  it("neutrale Bezeichnung für Prüfer ohne öffentliches Profil", () => {
    expect(anonymousLabel(1, "de")).toBe("einem externen Experten");
    expect(anonymousLabel(3, "de")).toBe("3 externen Experten");
    expect(anonymousLabel(1, "en")).toBe("an external expert");
    expect(anonymousLabel(2, "en")).toBe("2 external experts");
  });
  it("Prüferzeile: nur Namen, nur neutral, gemischt", () => {
    const eva = { name: "Eva Müller", slug: "eva" };
    const jan = { name: "Jan Kern", slug: "jan" };
    expect(reviewersText({ reviewers: [eva], anonymousCount: 0 }, "de")).toBe("Eva Müller");
    expect(reviewersText({ reviewers: [], anonymousCount: 1 }, "de")).toBe("einem externen Experten");
    expect(reviewersText({ reviewers: [eva, jan], anonymousCount: 0 }, "de")).toBe("Eva Müller und Jan Kern");
    expect(reviewersText({ reviewers: [eva, jan], anonymousCount: 2 }, "en")).toBe("Eva Müller, Jan Kern and 2 external experts");
    expect(reviewersText({ reviewers: [], anonymousCount: 0 }, "en")).toBe("an external expert");
  });
  it("Änderungen", () => {
    expect(changeLabel(1, "de")).toBe("1 Änderung seit der Prüfung");
    expect(changeLabel(4, "en")).toBe("4 changes since the review");
    expect(changeDetail({ sections: 2, questions: 1 }, "de")).toBe("2 Abschnitte, 1 Frage");
    expect(changeDetail({ sections: 0, questions: 3 }, "en")).toBe("3 questions");
  });
});
