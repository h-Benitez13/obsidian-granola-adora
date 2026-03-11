import { describe, expect, it } from "vitest";

import { CanonicalRecommendationRecord } from "../src/learning-schema";
import {
  createHoverboardProposalArtifact,
  renderHoverboardProposalMarkdown,
  slugifyProposalTitle,
} from "../src/hoverboard-proposals";

const recommendation: CanonicalRecommendationRecord = {
  canonicalId: "recommendation:hoverboard:command:retry-debugging",
  sourceSystem: "manual",
  entityKind: "recommendation",
  title: "Add retry debugging command",
  summary: "Recommend a reusable retry-debugging command for low-level incidents.",
  status: "candidate",
  tags: ["recommendation", "command"],
  relatedIds: ["incident:web:publish-retry", "linear:WEB-42"],
  updatedAt: "2026-03-10T00:00:00.000Z",
  recommendationKind: "command",
  state: "candidate",
  confidenceScore: 0.93,
  proposedDestination: "hoverboard",
  evidence: [
    {
      sourceSystem: "github",
      entityKind: "pull_request",
      externalId: "42",
      url: "https://github.com/adora/web/pull/42",
      capturedAt: "2026-03-10T00:00:00.000Z",
    },
  ],
};

describe("hoverboard proposals", () => {
  it("slugifies proposal titles deterministically", () => {
    expect(slugifyProposalTitle("Add retry debugging command!")).toBe(
      "add-retry-debugging-command",
    );
  });

  it("creates an additive proposal artifact for hoverboard", () => {
    const artifact = createHoverboardProposalArtifact(recommendation, {
      generatedAt: "2026-03-10T00:00:00.000Z",
      destinationBranch: "bot/recommendations/retry-debugging",
      worktreePath: "/Users/hector/hoverboard-recommendations",
      riskLevel: "low",
      rationale: "Repeated retry incidents indicate a reusable debugging command would help coding bots.",
    });

    expect(artifact.destinationPath).toBe(
      "proposals/commands/add-retry-debugging-command.md",
    );
    expect(artifact.targetKind).toBe("command");
    expect(artifact.confidenceScore).toBe(0.93);
    expect(artifact.riskLevel).toBe("low");
    expect(artifact.sourceCanonicalIds).toContain(
      "incident:web:publish-retry",
    );
  });

  it("renders markdown with required contract fields", () => {
    const artifact = createHoverboardProposalArtifact(recommendation, {
      generatedAt: "2026-03-10T00:00:00.000Z",
      destinationBranch: "bot/recommendations/retry-debugging",
      worktreePath: "/Users/hector/hoverboard-recommendations",
      riskLevel: "low",
      rationale: "Repeated retry incidents indicate a reusable debugging command would help coding bots.",
    });

    const markdown = renderHoverboardProposalMarkdown(artifact);

    expect(markdown).toContain('type: "hoverboard-proposal"');
    expect(markdown).toContain('target_kind: "command"');
    expect(markdown).toContain('review_state: "candidate"');
    expect(markdown).toContain("confidence_score: 0.93");
    expect(markdown).toContain('risk_level: "low"');
    expect(markdown).toContain(
      'destination_path: "proposals/commands/add-retry-debugging-command.md"',
    );
    expect(markdown).toContain("https://github.com/adora/web/pull/42");
  });
});
