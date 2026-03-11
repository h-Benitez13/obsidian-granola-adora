import { describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => ({}));

import { updateHealthScoreInContent } from "../src/profiles";

describe("updateHealthScoreInContent", () => {
  it("injects health score frontmatter and section before user content marker", () => {
    const content = [
      "---",
      'type: "customer-360"',
      'company: "Acme"',
      "---",
      "",
      "# Acme",
      "",
      "## Overview",
      "",
      "<!-- user-content -->",
    ].join("\n");

    const updated = updateHealthScoreInContent(content, {
      score: 82,
      tier: "healthy",
      customer_satisfaction: 85,
      performance_goals: 80,
      product_engagement: 81,
      meeting_frequency: 4,
      open_issues: 1,
      sentiment: 90,
      last_calculated: "2026-03-10T00:00:00.000Z",
    });

    expect(updated).toContain("health_score: 82");
    expect(updated).toContain('health_tier: "healthy"');
    expect(updated).toContain("## Renewal Health Rubric (Notion-Aligned)");
    expect(updated).toContain("| Renewal Likelihood Score | 82/100 (Healthy) |");
    expect(updated).toContain("| Open Issues | 1 issues |");
    expect(updated.indexOf("## Renewal Health Rubric (Notion-Aligned)")).toBeLessThan(
      updated.indexOf("<!-- user-content -->"),
    );
  });
});
