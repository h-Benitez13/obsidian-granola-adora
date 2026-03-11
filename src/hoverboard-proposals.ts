import {
  CanonicalRecommendationRecord,
  EvidencePointer,
} from "./learning-schema";

export type HoverboardProposalReviewState =
  | "candidate"
  | "reviewing"
  | "approved"
  | "rejected"
  | "exported";

export type HoverboardProposalRiskLevel = "low" | "medium" | "high";

export interface HoverboardProposalArtifact {
  schemaVersion: "1";
  title: string;
  slug: string;
  targetKind: "skill" | "command";
  reviewState: HoverboardProposalReviewState;
  confidenceScore: number;
  riskLevel: HoverboardProposalRiskLevel;
  generatedAt: string;
  destinationBranch: string;
  destinationPath: string;
  worktreePath?: string;
  sourceCanonicalIds: string[];
  evidence: EvidencePointer[];
  rationale: string;
}

export interface HoverboardProposalOptions {
  generatedAt: string;
  destinationBranch: string;
  worktreePath?: string;
  riskLevel: HoverboardProposalRiskLevel;
  rationale: string;
}

export function slugifyProposalTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function buildDestinationPath(targetKind: "skill" | "command", slug: string): string {
  const folder = targetKind === "skill" ? "skills" : "commands";
  return `proposals/${folder}/${slug}.md`;
}

export function createHoverboardProposalArtifact(
  recommendation: CanonicalRecommendationRecord,
  options: HoverboardProposalOptions,
): HoverboardProposalArtifact {
  const slug = slugifyProposalTitle(recommendation.title);

  return {
    schemaVersion: "1",
    title: recommendation.title,
    slug,
    targetKind: recommendation.recommendationKind,
    reviewState: recommendation.state,
    confidenceScore: recommendation.confidenceScore,
    riskLevel: options.riskLevel,
    generatedAt: options.generatedAt,
    destinationBranch: options.destinationBranch,
    destinationPath: buildDestinationPath(recommendation.recommendationKind, slug),
    worktreePath: options.worktreePath,
    sourceCanonicalIds: [recommendation.canonicalId, ...recommendation.relatedIds],
    evidence: recommendation.evidence,
    rationale: options.rationale,
  };
}

export function renderHoverboardProposalMarkdown(
  artifact: HoverboardProposalArtifact,
): string {
  const fm = [
    "---",
    'type: "hoverboard-proposal"',
    `schema_version: "${artifact.schemaVersion}"`,
    `title: "${artifact.title.replace(/"/g, '\\"')}"`,
    `slug: "${artifact.slug}"`,
    `target_kind: "${artifact.targetKind}"`,
    `review_state: "${artifact.reviewState}"`,
    `confidence_score: ${artifact.confidenceScore}`,
    `risk_level: "${artifact.riskLevel}"`,
    `generated_at: "${artifact.generatedAt}"`,
    `destination_branch: "${artifact.destinationBranch}"`,
    `destination_path: "${artifact.destinationPath}"`,
  ];

  if (artifact.worktreePath) {
    fm.push(`worktree_path: "${artifact.worktreePath.replace(/"/g, '\\"')}"`);
  }

  fm.push("source_canonical_ids:");
  for (const id of artifact.sourceCanonicalIds) {
    fm.push(`  - "${id.replace(/"/g, '\\"')}"`);
  }

  fm.push("---", "", `# ${artifact.title}`, "", "## Recommendation", "", artifact.rationale, "", "## Evidence", "");

  const body = artifact.evidence.length
    ? artifact.evidence.map((item) => {
        const source = `${item.sourceSystem}:${item.entityKind}:${item.externalId}`;
        const details = [
          item.url ? `[link](${item.url})` : undefined,
          item.obsidianPath ? `obsidian: ${item.obsidianPath}` : undefined,
          item.excerpt ? `excerpt: ${item.excerpt}` : undefined,
        ].filter(Boolean);
        return `- ${source}${details.length ? ` — ${details.join(" | ")}` : ""}`;
      })
    : ["- No evidence captured."];

  return [...fm, ...body, "", "## Export Contract", "", "- Recommend-only artifact", `- Target branch: ${artifact.destinationBranch}`, `- Target path: ${artifact.destinationPath}`, ""].join("\n");
}
