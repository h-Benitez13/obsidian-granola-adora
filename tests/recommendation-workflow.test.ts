import { describe, expect, it } from "vitest";

import { EvidencePointer } from "../src/learning-schema";
import {
  buildRecommendationWorkflowRationale,
  createRecommendationWorkflowArtifacts,
} from "../src/recommendation-workflow";
import { scoreEasyTicketHeuristics } from "../src/ticket-scoring";

const evidence: EvidencePointer[] = [
  {
    sourceSystem: "github",
    entityKind: "pull_request",
    externalId: "42",
    url: "https://github.com/adora/web/pull/42",
    capturedAt: "2026-03-10T00:00:00.000Z",
  },
];

describe("recommendation workflow", () => {
  it("builds recommendation, proposal, and queue note for eligible work", () => {
    const heuristicInput = {
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
      fixType: "small_bugfix" as const,
    };
    const heuristic = scoreEasyTicketHeuristics(heuristicInput);
    const refinement = {
      summary: "Reusable publish debugging command is justified.",
      confidenceScore: 0.91,
      missingContext: [],
      nextAction: "promote" as const,
      rationale: "The issue is bounded and repeated.",
      reviewRequired: false,
    };

    const artifacts = createRecommendationWorkflowArtifacts(
      {
        sourceCanonicalId: "linear:WEB-42",
        relatedIds: ["incident:web:publish"],
        repo: "web",
        title: "Add publish debugger command",
        summary: "Create a reusable command for publish-debug investigations.",
        recommendationKind: "command",
        evidence,
        heuristic,
        refinement,
      },
      {
        generatedAt: "2026-03-10T00:00:00.000Z",
        destinationBranch: "bot/recommendations/publish-debugger",
        riskLevel: "low",
        rationale: buildRecommendationWorkflowRationale(
          heuristicInput,
          heuristic,
          refinement,
        ),
      },
      {
        baseFolderPath: "Adora",
        generatedAt: "2026-03-10T00:00:00.000Z",
        rationale: "Repeated publish regressions justify a reusable command.",
      },
    );

    expect(artifacts).not.toBeNull();
    expect(artifacts!.recommendation.state).toBe("approved");
    expect(artifacts!.proposal.destinationPath).toBe(
      "proposals/commands/add-publish-debugger-command.md",
    );
    expect(artifacts!.queueNote.filePath).toBe(
      "Adora/Recommendations/add-publish-debugger-command.md",
    );
  });

  it("returns null when heuristic gating fails", () => {
    const heuristic = scoreEasyTicketHeuristics({
      sourceCanonicalId: "linear:IAC-1",
      repo: "iac",
      changedFileCount: 8,
      affectedAreas: ["terraform", "networking"],
      hasTests: true,
      hasDeterministicVerification: true,
      requiredContextAvailable: true,
      touchesInfrastructure: true,
      touchesAuthOrPermissions: false,
      touchesDataModel: false,
      repeatedPatternCount: 1,
      fixType: "small_bugfix",
    });

    const artifacts = createRecommendationWorkflowArtifacts(
      {
        sourceCanonicalId: "linear:IAC-1",
        relatedIds: [],
        repo: "iac",
        title: "Add terraform remediation command",
        summary: "Attempt to automate terraform remediation.",
        recommendationKind: "command",
        evidence,
        heuristic,
        refinement: {
          summary: "Should not run",
          confidenceScore: 1,
          missingContext: [],
          nextAction: "promote",
          rationale: "Should not run",
          reviewRequired: false,
        },
      },
      {
        generatedAt: "2026-03-10T00:00:00.000Z",
        destinationBranch: "bot/recommendations/terraform-remediation",
        riskLevel: "high",
        rationale: "Not applicable",
      },
      {
        baseFolderPath: "Adora",
        generatedAt: "2026-03-10T00:00:00.000Z",
        rationale: "Not applicable",
      },
    );

    expect(artifacts).toBeNull();
  });
});
