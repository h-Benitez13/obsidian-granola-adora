import { CanonicalRecommendationRecord, EvidencePointer } from "./learning-schema";
import {
  createHoverboardProposalArtifact,
  HoverboardProposalArtifact,
  HoverboardProposalOptions,
} from "./hoverboard-proposals";
import {
  createRecommendationQueueNote,
  RecommendationQueueNote,
  RecommendationQueueOptions,
} from "./recommendation-queue";
import {
  EasyTicketHeuristicInput,
  EasyTicketHeuristicResult,
} from "./ticket-scoring";
import { TicketRefinementResult } from "./ticket-refinement";

export interface RecommendationWorkflowInput {
  sourceCanonicalId: string;
  relatedIds: string[];
  repo: string;
  title: string;
  summary: string;
  recommendationKind: "skill" | "command";
  evidence: EvidencePointer[];
  heuristic: EasyTicketHeuristicResult;
  refinement: TicketRefinementResult;
}

export interface RecommendationWorkflowArtifacts {
  recommendation: CanonicalRecommendationRecord;
  proposal: HoverboardProposalArtifact;
  queueNote: RecommendationQueueNote;
}

export function buildRecommendationRecord(
  input: RecommendationWorkflowInput,
): CanonicalRecommendationRecord | null {
  if (!input.heuristic.easy) return null;
  if (input.refinement.nextAction === "reject") return null;

  const confidenceScore = Math.max(
    input.heuristic.score,
    input.refinement.confidenceScore,
  );
  const state = input.refinement.reviewRequired ? "reviewing" : "approved";

  return {
    canonicalId: `recommendation:${input.recommendationKind}:${input.repo}:${input.sourceCanonicalId}`,
    sourceSystem: "manual",
    entityKind: "recommendation",
    title: input.title,
    summary: input.summary,
    status: state,
    repo: input.repo,
    tags: ["recommendation", input.recommendationKind, `repo/${input.repo}`],
    relatedIds: input.relatedIds,
    updatedAt: new Date().toISOString(),
    recommendationKind: input.recommendationKind,
    state,
    confidenceScore: Number(confidenceScore.toFixed(2)),
    proposedDestination: "hoverboard",
    evidence: input.evidence,
  };
}

export function createRecommendationWorkflowArtifacts(
  input: RecommendationWorkflowInput,
  proposalOptions: HoverboardProposalOptions,
  queueOptions: Omit<RecommendationQueueOptions, "hoverboardProposal">,
): RecommendationWorkflowArtifacts | null {
  const recommendation = buildRecommendationRecord(input);
  if (!recommendation) return null;

  const proposal = createHoverboardProposalArtifact(recommendation, proposalOptions);
  const queueNote = createRecommendationQueueNote(recommendation, {
    ...queueOptions,
    hoverboardProposal: proposal,
  });

  return {
    recommendation,
    proposal,
    queueNote,
  };
}

export function buildRecommendationWorkflowRationale(
  heuristicInput: EasyTicketHeuristicInput,
  heuristic: EasyTicketHeuristicResult,
  refinement: TicketRefinementResult,
): string {
  return [
    `Repo: ${heuristicInput.repo}`,
    `Heuristic score: ${heuristic.score}`,
    `Heuristic passes: ${heuristic.passedRules.join(", ") || "none"}`,
    `Heuristic blockers: ${heuristic.blockingReasons.join(", ") || "none"}`,
    `Refinement action: ${refinement.nextAction}`,
    `Refinement rationale: ${refinement.rationale}`,
  ].join("\n");
}
