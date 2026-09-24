import { describe, expect, it } from "vitest";
import { deriveCostPerItem } from "./objective-costs";

describe("deriveCostPerItem", () => {
  it("splits the batch cost evenly across accepted lessons and questions", () => {
    expect(deriveCostPerItem(1.0, 4, 6)).toBeCloseTo(0.1, 6);
  });

  it("returns null when the cost is unknown, rather than inventing a number", () => {
    expect(deriveCostPerItem(null, 4, 6)).toBeNull();
  });

  it("returns null when nothing was accepted, even if the batch had a real cost", () => {
    expect(deriveCostPerItem(0.5, 0, 0)).toBeNull();
  });

  it("counts lessons and questions together, not separately", () => {
    expect(deriveCostPerItem(2.0, 10, 0)).toBeCloseTo(0.2, 6);
    expect(deriveCostPerItem(2.0, 0, 10)).toBeCloseTo(0.2, 6);
  });
});
