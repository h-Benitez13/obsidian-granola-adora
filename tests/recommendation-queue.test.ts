import { describe, expect, it } from "vitest";

import { CanonicalRecommendationRecord } from "../src/learning-schema";
import { createHoverboardProposalArtifact } from "../src/hoverboard-proposals";
import {
  buildRecommendationQueueFolder,
  createRecommendationQueueNote,
} from "../src/recommendation-queue";

const recommendation: CanonicalRecommendationRecord = {
  canonicalId: "recommendation:hoverboard:skill:publish-debugger",
  sourceSystem: "manual",
  entityKind: "recommendation",
  title: "Add publish debugger skill",
  summary: "Recommend a skill that teaches bots how to inspect publish regressions.",
  status: "reviewing",
  tags: ["recommendation", "skill"],
  relatedIds: ["incident:web:publish-retry"],
  updatedAt: "2026-03-10T00:00:00.000Z",
  recommendationKind: "skill",
  state: "reviewing",
  confidenceScore: 0.88,
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

describe("recommendation queue", () => {
  it("builds a deterministic queue folder", () => {
    expect(buildRecommendationQueueFolder("Adora")).toBe(
      "Adora/Recommendations",
    );
  });

  it("creates a queue note with machine-readable frontmatter", () => {
    const proposal = createHoverboardProposalArtifact(recommendation, {
      generatedAt: "2026-03-10T00:00:00.000Z",
      destinationBranch: "bot/recommendations/publish-debugger",
      riskLevel: "low",
      rationale: "Repeated incidents justify a reusable skill.",
    });

    const note = createRecommendationQueueNote(recommendation, {
      baseFolderPath: "Adora",
      generatedAt: "2026-03-10T00:00:00.000Z",
      rationale: "Repeated incidents justify a reusable skill.",
      hoverboardProposal: proposal,
    });

    expect(note.folderPath).toBe("Adora/Recommendations");
    expect(note.filePath).toBe(
      "Adora/Recommendations/add-publish-debugger-skill.md",
    );
    expect(note.content).toContain('type: "recommendation-queue-item"');
    expect(note.content).toContain('target_kind: "skill"');
    expect(note.content).toContain('review_state: "reviewing"');
    expect(note.content).toContain(
      'proposal_path: "proposals/skills/add-publish-debugger-skill.md"',
    );
    expect(note.content).toContain("https://github.com/adora/web/pull/42");
  });
});
