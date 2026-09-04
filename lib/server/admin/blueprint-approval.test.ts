import { describe, expect, it } from "vitest";
import { parseLocatorPageNumbers } from "./blueprint-approval";

describe("parseLocatorPageNumbers", () => {
  it("parses a single page", () => {
    expect(parseLocatorPageNumbers("S. 12")).toEqual([12]);
  });

  it("expands a hyphen range", () => {
    expect(parseLocatorPageNumbers("S. 4-6")).toEqual([4, 5, 6]);
  });

  it("expands an en-dash range", () => {
    expect(parseLocatorPageNumbers("S. 4–6")).toEqual([4, 5, 6]);
  });

  it("parses multiple comma-separated pages", () => {
    expect(parseLocatorPageNumbers("S. 4, 7")).toEqual([4, 7]);
  });

  it("combines a range and a standalone page, deduplicated and sorted", () => {
    expect(parseLocatorPageNumbers("S. 4-5, 5, 9")).toEqual([4, 5, 9]);
  });

  it("doesn't expand an implausibly large range, but keeps its two endpoint pages", () => {
    // Expanding "1-200" would link 200 chunks to one objective; falling back
    // to the two literal numbers mentioned is still useful and safe.
    expect(parseLocatorPageNumbers("S. 1-200")).toEqual([1, 200]);
  });

  it("returns an empty array when no page number can be found", () => {
    expect(parseLocatorPageNumbers("Anhang")).toEqual([]);
  });
});
