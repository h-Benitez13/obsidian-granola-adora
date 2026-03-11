import { describe, expect, it } from "vitest";

import { CanonicalIncidentRecord } from "../src/learning-schema";
import {
  buildIncidentNotionProperties,
  renderIncidentNotionMarkdown,
} from "../src/notion-incidents";

const incident: CanonicalIncidentRecord = {
  canonicalId: "incident:web:publish",
  sourceSystem: "manual",
  entityKind: "incident",
  title: "Publish flow degraded",
  summary: "Publishing failed for some accounts.",
  status: "resolved",
  repo: "web",
  tags: ["incident"],
  relatedIds: ["linear:WEB-42", "github:web:pr:42"],
  updatedAt: "2026-03-10T00:00:00.000Z",
  severity: "high",
  rootCauseCategory: "code_regression",
  fixSummary: "Restored retry handling and shipped a patch.",
  learningSummary: "Retry-sensitive flows need contract coverage.",
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

describe("notion incidents", () => {
  it("builds structured properties for incident database pages", () => {
    const properties = buildIncidentNotionProperties(incident);

    expect(properties.Name.title[0].text.content).toBe("Publish flow degraded");
    expect(properties.Severity.rich_text[0].text.content).toBe("high");
    expect(properties.Status.rich_text[0].text.content).toBe("resolved");
    expect(properties.Repo.rich_text[0].text.content).toBe("web");
    expect(properties["Root Cause"].rich_text[0].text.content).toBe(
      "code_regression",
    );
  });

  it("renders readable markdown with evidence and related records", () => {
    const markdown = renderIncidentNotionMarkdown(incident);

    expect(markdown).toContain("## Summary");
    expect(markdown).toContain("## Fix");
    expect(markdown).toContain("## Learning");
    expect(markdown).toContain("https://github.com/adora/web/pull/42");
    expect(markdown).toContain("linear:WEB-42");
  });
});
