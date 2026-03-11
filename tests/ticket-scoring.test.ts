import { describe, expect, it } from "vitest";

import { scoreEasyTicketHeuristics } from "../src/ticket-scoring";

describe("scoreEasyTicketHeuristics", () => {
  it("scores a low-risk fixture as easy", () => {
    const result = scoreEasyTicketHeuristics({
      sourceCanonicalId: "linear:WEB-42",
      repo: "web",
      changedFileCount: 2,
      affectedAreas: ["publishing"],
      hasTests: true,
      hasDeterministicVerification: true,
      requiredContextAvailable: true,
      touchesInfrastructure: false,
      touchesAuthOrPermissions: false,
      touchesDataModel: false,
      repeatedPatternCount: 3,
      fixType: "small_bugfix",
    });

    expect(result.easy).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0.65);
    expect(result.passedRules).toContain("small-file-count");
    expect(result.passedRules).toContain("has-tests");
  });

  it("rejects a high-risk fixture", () => {
    const result = scoreEasyTicketHeuristics({
      sourceCanonicalId: "linear:IAC-9",
      repo: "iac",
      changedFileCount: 8,
      affectedAreas: ["terraform", "deployments"],
      hasTests: true,
      hasDeterministicVerification: true,
      requiredContextAvailable: true,
      touchesInfrastructure: true,
      touchesAuthOrPermissions: false,
      touchesDataModel: false,
      repeatedPatternCount: 1,
      fixType: "small_bugfix",
    });

    expect(result.easy).toBe(false);
    expect(result.blockingReasons).toContain("too-many-files");
    expect(result.blockingReasons).toContain("touches-infrastructure");
  });

  it("fails closed when context or verification is missing", () => {
    const result = scoreEasyTicketHeuristics({
      sourceCanonicalId: "slack:support:1",
      repo: "web",
      changedFileCount: 1,
      affectedAreas: ["publishing"],
      hasTests: false,
      hasDeterministicVerification: false,
      requiredContextAvailable: false,
      touchesInfrastructure: false,
      touchesAuthOrPermissions: false,
      touchesDataModel: false,
      repeatedPatternCount: 4,
      fixType: "ui_text",
    });

    expect(result.easy).toBe(false);
    expect(result.blockingReasons).toContain("missing-context");
    expect(result.blockingReasons).toContain("no-deterministic-verification");
  });
});
