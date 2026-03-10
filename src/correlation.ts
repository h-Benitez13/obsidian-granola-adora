import { CanonicalRecord } from "./learning-schema";

export type CorrelationEvidenceCode =
  | "shared_related_id"
  | "shared_linear_issue"
  | "shared_evidence_url"
  | "same_repo"
  | "temporal_proximity"
  | "shared_keywords"
  | "ambiguous_match";

export interface CorrelationEvidence {
  code: CorrelationEvidenceCode;
  weight: number;
  detail: string;
}

export interface CorrelationMatch {
  sourceCanonicalId: string;
  targetCanonicalId: string;
  score: number;
  confidence: "high" | "medium" | "low";
  requiresReview: boolean;
  evidence: CorrelationEvidence[];
}

const LINEAR_ISSUE_REGEX = /\b[A-Z]+-\d+\b/g;

export function extractLinearIssueIdsFromText(text: string): string[] {
  const matches = text.match(LINEAR_ISSUE_REGEX);
  return matches ? [...new Set(matches)] : [];
}

function toKeywordSet(record: CanonicalRecord): Set<string> {
  const corpus = `${record.title} ${record.summary}`.toLowerCase();
  const tokens = corpus
    .split(/[^a-z0-9-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4 && !token.match(/^\d+$/));
  return new Set(tokens);
}

function intersection<T>(left: Set<T>, right: Set<T>): T[] {
  return [...left].filter((value) => right.has(value));
}

function toLinearIssueIdSet(record: CanonicalRecord): Set<string> {
  const ids = new Set<string>();

  for (const value of [...record.relatedIds, record.title, record.summary]) {
    for (const id of extractLinearIssueIdsFromText(value)) {
      ids.add(id);
    }
  }

  for (const evidence of record.evidence) {
    for (const id of extractLinearIssueIdsFromText(evidence.externalId)) {
      ids.add(id);
    }
    if (evidence.excerpt) {
      for (const id of extractLinearIssueIdsFromText(evidence.excerpt)) {
        ids.add(id);
      }
    }
  }

  return ids;
}

function toEvidenceUrlSet(record: CanonicalRecord): Set<string> {
  return new Set(
    record.evidence.map((item) => item.url?.trim()).filter((value): value is string => !!value),
  );
}

function toRelevantTimestamp(record: CanonicalRecord): string | undefined {
  return record.openedAt ?? record.updatedAt;
}

export function scoreCorrelation(
  source: CanonicalRecord,
  target: CanonicalRecord,
): CorrelationMatch | null {
  const evidence: CorrelationEvidence[] = [];

  const sharedRelatedIds = source.relatedIds.filter((id) => target.relatedIds.includes(id));
  if (sharedRelatedIds.length > 0) {
    evidence.push({
      code: "shared_related_id",
      weight: 0.7,
      detail: `Shared related IDs: ${sharedRelatedIds.join(", ")}`,
    });
  }

  const sharedLinearIssueIds = intersection(
    toLinearIssueIdSet(source),
    toLinearIssueIdSet(target),
  );
  if (sharedLinearIssueIds.length > 0) {
    evidence.push({
      code: "shared_linear_issue",
      weight: 0.75,
      detail: `Shared Linear issue references: ${sharedLinearIssueIds.join(", ")}`,
    });
  }

  const sharedUrls = intersection(toEvidenceUrlSet(source), toEvidenceUrlSet(target));
  if (sharedUrls.length > 0) {
    evidence.push({
      code: "shared_evidence_url",
      weight: 0.8,
      detail: `Shared evidence URLs: ${sharedUrls.join(", ")}`,
    });
  }

  if (source.repo && target.repo && source.repo === target.repo) {
    evidence.push({
      code: "same_repo",
      weight: 0.15,
      detail: `Both records reference repo ${source.repo}`,
    });
  }

  const sourceTimestamp = toRelevantTimestamp(source);
  const targetTimestamp = toRelevantTimestamp(target);
  if (sourceTimestamp && targetTimestamp) {
    const deltaMs = Math.abs(
      Date.parse(sourceTimestamp) - Date.parse(targetTimestamp),
    );
    if (deltaMs <= 72 * 60 * 60 * 1000) {
      evidence.push({
        code: "temporal_proximity",
        weight: 0.1,
        detail: "Records occurred within 72 hours of each other",
      });
    }
  }

  const sharedKeywords = intersection(toKeywordSet(source), toKeywordSet(target));
  if (sharedKeywords.length >= 2) {
    evidence.push({
      code: "shared_keywords",
      weight: 0.12,
      detail: `Shared keywords: ${sharedKeywords.slice(0, 5).join(", ")}`,
    });
  }

  if (evidence.length === 0) {
    return null;
  }

  const score = Math.min(
    1,
    evidence.reduce((sum, item) => sum + item.weight, 0),
  );
  const hasExactEvidence = evidence.some((item) =>
    ["shared_related_id", "shared_linear_issue", "shared_evidence_url"].includes(item.code),
  );

  const confidence: CorrelationMatch["confidence"] = hasExactEvidence && score >= 0.75
    ? "high"
    : score >= 0.45
      ? "medium"
      : "low";

  return {
    sourceCanonicalId: source.canonicalId,
    targetCanonicalId: target.canonicalId,
    score,
    confidence,
    requiresReview: !(hasExactEvidence && confidence === "high"),
    evidence,
  };
}

export function correlateRecord(
  source: CanonicalRecord,
  candidates: CanonicalRecord[],
): CorrelationMatch[] {
  const matches = candidates
    .filter((candidate) => candidate.canonicalId !== source.canonicalId)
    .map((candidate) => scoreCorrelation(source, candidate))
    .filter((match): match is CorrelationMatch => !!match)
    .sort((left, right) => right.score - left.score);

  if (matches.length < 2) {
    return matches;
  }

  const topScore = matches[0].score;
  const ambiguousMatches = matches.filter(
    (match) => Math.abs(match.score - topScore) < 0.05,
  );

  if (ambiguousMatches.length > 1) {
    return matches.map((match) => {
      if (Math.abs(match.score - topScore) >= 0.05) {
        return match;
      }

      return {
        ...match,
        requiresReview: true,
        evidence: [
          ...match.evidence,
          {
            code: "ambiguous_match",
            weight: 0,
            detail: "Another candidate scored within 0.05 of this match",
          },
        ],
      };
    });
  }

  return matches;
}
