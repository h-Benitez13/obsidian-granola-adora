import { describe, expect, it } from "vitest";

import { CanonicalRecord } from "../src/learning-schema";
import { correlateRecord, extractLinearIssueIdsFromText } from "../src/correlation";

const now = "2026-03-10T00:00:00.000Z";

function makeRecord(overrides: Partial<CanonicalRecord>): CanonicalRecord {
  return {
    canonicalId: "manual:base",
    sourceSystem: "manual",
    entityKind: "support_signal",
    title: "Base title",
    summary: "Base summary",
    status: "open",
    tags: [],
    evidence: [
      {
        sourceSystem: "manual",
        entityKind: "support_signal",
        externalId: "base-1",
        capturedAt: now,
      },
    ],
    relatedIds: [],
    updatedAt: now,
    ...overrides,
  };
}

describe("correlation model", () => {
  it("extracts Linear issue IDs from free text", () => {
    expect(extractLinearIssueIdsFromText("Fixes WEB-42 and DEL-9")).toEqual([
      "WEB-42",
      "DEL-9",
    ]);
  });

  it("correlates exact references with high confidence", () => {
    const source = makeRecord({
      canonicalId: "slack:support:1",
      title: "Publish timeout for WEB-42",
      summary: "Customer reports publish timeout linked to WEB-42",
      relatedIds: ["linear:WEB-42"],
    });
    const target = makeRecord({
      canonicalId: "github:web:pr:42",
      sourceSystem: "github",
      entityKind: "pull_request",
      repo: "web",
      title: "Fix WEB-42 publish timeout",
      summary: "Merged fix for WEB-42 publish timeout regression",
      relatedIds: ["linear:WEB-42"],
      evidence: [
        {
          sourceSystem: "github",
          entityKind: "pull_request",
          externalId: "42",
          capturedAt: now,
        },
      ],
    });

    const [match] = correlateRecord(source, [target]);

    expect(match.confidence).toBe("high");
    expect(match.requiresReview).toBe(false);
    expect(match.evidence.some((item) => item.code === "shared_related_id")).toBe(true);
  });

  it("returns heuristic matches as review-required", () => {
    const source = makeRecord({
      canonicalId: "slack:support:2",
      repo: "web",
      title: "Publish retry degraded",
      summary: "A support escalation about publish retry flow failing for one account",
      updatedAt: "2026-03-10T02:00:00.000Z",
    });
    const target = makeRecord({
      canonicalId: "linear:WEB-99",
      sourceSystem: "linear",
      entityKind: "issue",
      repo: "web",
      title: "Investigate publish retry degradation",
      summary: "Engineering issue for publish retry failure path",
      updatedAt: "2026-03-10T03:00:00.000Z",
    });

    const [match] = correlateRecord(source, [target]);

    expect(match.confidence).toBe("low");
    expect(match.requiresReview).toBe(true);
    expect(match.evidence.some((item) => item.code === "same_repo")).toBe(true);
    expect(match.evidence.some((item) => item.code === "shared_keywords")).toBe(true);
  });

  it("returns no matches when there is no usable evidence", () => {
    const source = makeRecord({
      canonicalId: "slack:support:3",
      title: "Billing export confusion",
      summary: "Question about billing exports",
    });
    const target = makeRecord({
      canonicalId: "linear:OPS-1",
      sourceSystem: "linear",
      entityKind: "issue",
      title: "Terraform drift remediation",
      summary: "IaC fix for environment drift",
      repo: "iac",
      updatedAt: "2026-02-01T00:00:00.000Z",
    });

    expect(correlateRecord(source, [target])).toEqual([]);
  });

  it("marks near-tied top matches as ambiguous", () => {
    const source = makeRecord({
      canonicalId: "incident:web:publish",
      repo: "web",
      title: "Publish flow degraded",
      summary: "Incident on publish retry flow",
    });
    const targetA = makeRecord({
      canonicalId: "linear:WEB-201",
      sourceSystem: "linear",
      entityKind: "issue",
      repo: "web",
      title: "Investigate publish flow degradation",
      summary: "Issue for publish retry degradation",
    });
    const targetB = makeRecord({
      canonicalId: "linear:WEB-202",
      sourceSystem: "linear",
      entityKind: "issue",
      repo: "web",
      title: "Fix publish flow issue",
      summary: "Issue for publish retry issue",
    });

    const matches = correlateRecord(source, [targetA, targetB]);

    expect(matches).toHaveLength(2);
    expect(matches[0].requiresReview).toBe(true);
    expect(matches[1].requiresReview).toBe(true);
    expect(matches[0].evidence.some((item) => item.code === "ambiguous_match")).toBe(true);
    expect(matches[1].evidence.some((item) => item.code === "ambiguous_match")).toBe(true);
  });
});
