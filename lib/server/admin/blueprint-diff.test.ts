import { describe, expect, it } from "vitest";
import { diffBlueprintAgainstObjectives, type ExistingObjectiveSnapshot } from "./blueprint-diff";
import type { BlueprintExtraction } from "@/lib/server/ai/service";

function existing(overrides: Partial<ExistingObjectiveSnapshot> = {}): ExistingObjectiveSnapshot {
  return {
    id: "obj-1",
    domainName: "Domain 1",
    code: "1.1",
    title: "Old title",
    description: "Old description",
    ...overrides,
  };
}

function blueprint(overrides: Partial<BlueprintExtraction> = {}): BlueprintExtraction {
  return {
    certificationName: "Test",
    provider: "Test Provider",
    examCode: "T0-001",
    domains: [
      {
        name: "Domain 1",
        weightPercent: 100,
        objectives: [
          { code: "1.1", title: "Old title", description: "Old description", locator: "S. 1", confidence: 0.9 },
        ],
      },
    ],
    ...overrides,
  };
}

describe("diffBlueprintAgainstObjectives", () => {
  it("reports no changes when nothing differs", () => {
    const diff = diffBlueprintAgainstObjectives([existing()], blueprint());
    expect(diff).toEqual({
      addedDomains: [],
      removedDomains: [],
      addedObjectives: [],
      removedObjectives: [],
      changedObjectives: [],
    });
  });

  it("detects an added domain and its objectives", () => {
    const diff = diffBlueprintAgainstObjectives(
      [existing()],
      blueprint({
        domains: [
          ...blueprint().domains,
          {
            name: "Domain 2",
            weightPercent: null,
            objectives: [{ code: "2.1", title: "New objective", description: "desc", locator: "S. 5", confidence: 0.8 }],
          },
        ],
      }),
    );
    expect(diff.addedDomains).toEqual(["Domain 2"]);
    expect(diff.addedObjectives).toEqual([{ domainName: "Domain 2", code: "2.1", title: "New objective" }]);
  });

  it("detects a removed domain", () => {
    const diff = diffBlueprintAgainstObjectives(
      [existing(), existing({ id: "obj-2", domainName: "Domain 2", code: "2.1" })],
      blueprint(), // only Domain 1 in the new content
    );
    expect(diff.removedDomains).toEqual(["Domain 2"]);
    expect(diff.removedObjectives).toEqual([{ id: "obj-2", domainName: "Domain 2", code: "2.1", title: "Old title" }]);
  });

  it("detects a changed title and description for the same objective code", () => {
    const diff = diffBlueprintAgainstObjectives(
      [existing()],
      blueprint({
        domains: [
          {
            name: "Domain 1",
            weightPercent: 100,
            objectives: [
              { code: "1.1", title: "New title", description: "New description", locator: "S. 1", confidence: 0.9 },
            ],
          },
        ],
      }),
    );
    expect(diff.changedObjectives).toEqual([
      { id: "obj-1", domainName: "Domain 1", code: "1.1", field: "title", oldValue: "Old title", newValue: "New title" },
      {
        id: "obj-1",
        domainName: "Domain 1",
        code: "1.1",
        field: "description",
        oldValue: "Old description",
        newValue: "New description",
      },
    ]);
  });

  it("matches objectives by domain+code, not just code, so the same code in different domains doesn't collide", () => {
    const diff = diffBlueprintAgainstObjectives(
      [existing({ domainName: "Domain 1", code: "1.1" })],
      blueprint({
        domains: [
          {
            name: "Domain 2",
            weightPercent: 100,
            objectives: [{ code: "1.1", title: "Different objective", description: "desc", locator: "S. 9", confidence: 0.9 }],
          },
        ],
      }),
    );
    // Domain 1's 1.1 disappeared (removed) and Domain 2's 1.1 is new (added) -
    // NOT treated as one "changed" objective just because the code matches.
    expect(diff.removedObjectives).toHaveLength(1);
    expect(diff.addedObjectives).toHaveLength(1);
    expect(diff.changedObjectives).toEqual([]);
  });
});
