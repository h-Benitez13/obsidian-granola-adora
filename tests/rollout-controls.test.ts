import { describe, expect, it } from "vitest";

import { evaluateRolloutControl } from "../src/rollout-controls";

describe("rollout controls", () => {
  it("blocks side effects in dry-run mode", () => {
    expect(
      evaluateRolloutControl({ dryRun: true, processedCount: 0, budgetLimit: 3 }),
    ).toEqual({ allowed: false, reason: "dry-run" });
  });

  it("blocks side effects when budget is exhausted", () => {
    expect(
      evaluateRolloutControl({ dryRun: false, processedCount: 3, budgetLimit: 3 }),
    ).toEqual({ allowed: false, reason: "budget-exceeded" });
  });

  it("allows side effects when live and within budget", () => {
    expect(
      evaluateRolloutControl({ dryRun: false, processedCount: 2, budgetLimit: 3 }),
    ).toEqual({ allowed: true, reason: "within-budget" });
  });
});
