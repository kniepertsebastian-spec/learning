import { describe, expect, it } from "vitest";
import { jobStepFill, jobStepIndex } from "./job-steps";

describe("jobStepIndex / jobStepFill", () => {
  it("ordnet Status den fünf Schritten zu", () => {
    expect(jobStepIndex("queued")).toBe(0);
    expect(jobStepIndex("blueprint_generating")).toBe(1);
    expect(jobStepIndex("canary_validating")).toBe(2);
    expect(jobStepIndex("batch_generating")).toBe(3);
    expect(jobStepIndex("validating")).toBe(4);
    expect(jobStepIndex("irgendwas")).toBe(0);
  });
  it("füllt vorherige Schritte voll, den aktuellen anteilig", () => {
    expect(jobStepFill("batch_generating", 0.25)).toEqual([100, 100, 100, 25, 0]);
    expect(jobStepFill("queued", 2)).toEqual([100, 0, 0, 0, 0]);
  });
});
