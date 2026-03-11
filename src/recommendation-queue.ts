import { CanonicalRecommendationRecord } from "./learning-schema";
import { HoverboardProposalArtifact } from "./hoverboard-proposals";

export interface RecommendationQueueNote {
  folderPath: string;
  filePath: string;
  content: string;
}

export interface RecommendationQueueOptions {
  baseFolderPath: string;
  generatedAt: string;
  rationale: string;
  hoverboardProposal?: HoverboardProposalArtifact;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function buildRecommendationQueueFolder(baseFolderPath: string): string {
  return `${baseFolderPath}/Recommendations`;
}

export function createRecommendationQueueNote(
  recommendation: CanonicalRecommendationRecord,
  options: RecommendationQueueOptions,
): RecommendationQueueNote {
  const folderPath = buildRecommendationQueueFolder(options.baseFolderPath);
  const slug = slugify(recommendation.title);
  const filePath = `${folderPath}/${slug}.md`;

  const fm = [
    "---",
    'type: "recommendation-queue-item"',
    `title: "${recommendation.title.replace(/"/g, '\\"')}"`,
    `target_kind: "${recommendation.recommendationKind}"`,
    `review_state: "${recommendation.state}"`,
    `confidence_score: ${recommendation.confidenceScore}`,
    `generated_at: "${options.generatedAt}"`,
    "source_canonical_ids:",
    `  - "${recommendation.canonicalId}"`,
  ];

  for (const id of recommendation.relatedIds) {
    fm.push(`  - "${id.replace(/"/g, '\\"')}"`);
  }

  if (options.hoverboardProposal) {
    fm.push(`proposal_path: "${options.hoverboardProposal.destinationPath}"`);
    fm.push(
      `proposal_branch: "${options.hoverboardProposal.destinationBranch}"`,
    );
  }

  fm.push("---", "", `# ${recommendation.title}`, "", "## Recommendation", "", options.rationale, "", "## Evidence", "");

  const evidenceLines = recommendation.evidence.map((item) => {
    const details = [
      item.url ? `[link](${item.url})` : undefined,
      item.obsidianPath ? `obsidian: ${item.obsidianPath}` : undefined,
      item.excerpt ? `excerpt: ${item.excerpt}` : undefined,
    ].filter(Boolean);

    return `- ${item.sourceSystem}:${item.entityKind}:${item.externalId}${details.length ? ` — ${details.join(" | ")}` : ""}`;
  });

  const body = [
    ...fm,
    ...(evidenceLines.length > 0 ? evidenceLines : ["- No evidence captured."]),
  ];

  if (options.hoverboardProposal) {
    body.push(
      "",
      "## Hoverboard Export",
      "",
      `- Branch: ${options.hoverboardProposal.destinationBranch}`,
      `- Path: ${options.hoverboardProposal.destinationPath}`,
    );
  }

  body.push("");

  return {
    folderPath,
    filePath,
    content: body.join("\n"),
  };
}
