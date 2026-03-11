import { describe, expect, it } from "vitest";

import {
  buildAutomationLogFilePath,
  buildAutomationLogsFolder,
  renderAutomationAuditBlock,
  renderAutomationAuditFile,
} from "../src/automation-audit";

describe("automation audit helpers", () => {
  it("builds deterministic automation log paths", () => {
    expect(buildAutomationLogsFolder("Adora", "Digests")).toBe(
      "Adora/Digests/Automation Logs",
    );
    expect(
      buildAutomationLogFilePath(
        "Adora",
        "Digests",
        "linear-customer-asks-sync-log",
        "2026-03-10",
      ),
    ).toBe(
      "Adora/Digests/Automation Logs/linear-customer-asks-sync-log--2026-03-10.md",
    );
  });

  it("renders reusable audit blocks and files", () => {
    const block = renderAutomationAuditBlock({
      timestamp: "2026-03-10T00:00:00.000Z",
      mode: "dry-run",
      summaryLines: ["Meetings inspected: 4", "Dry run candidates: 2"],
      detailLines: ["- [DRY RUN] Candidate A", "- [DRY RUN] Candidate B"],
    });
    const file = renderAutomationAuditFile(
      "linear-customer-asks-sync",
      "Linear Customer Ask Sync Log",
      "2026-03-10",
      block,
    );

    expect(file).toContain('type: "automation-log"');
    expect(file).toContain('automation: "linear-customer-asks-sync"');
    expect(file).toContain("Dry run candidates: 2");
  });
});
