import { CanonicalIncidentRecord } from "./learning-schema";

type NotionRichText = { rich_text: Array<{ type: "text"; text: { content: string } }> };

export interface NotionIncidentProperties {
  Name: { title: Array<{ text: { content: string } }> };
  Severity: NotionRichText;
  Status: NotionRichText;
  Repo: NotionRichText;
  "Root Cause": NotionRichText;
}

function toRichText(content: string): NotionRichText {
  return {
    rich_text: [{ type: "text", text: { content } }],
  };
}

export function buildIncidentNotionProperties(
  incident: CanonicalIncidentRecord,
): NotionIncidentProperties {
  return {
    Name: {
      title: [{ text: { content: incident.title } }],
    },
    Severity: toRichText(incident.severity),
    Status: toRichText(incident.status),
    Repo: toRichText(incident.repo ?? "unknown"),
    "Root Cause": toRichText(incident.rootCauseCategory),
  };
}

export function renderIncidentNotionMarkdown(
  incident: CanonicalIncidentRecord,
): string {
  const lines = [
    "## Summary",
    incident.summary,
    "",
    "## Fix",
    incident.fixSummary,
    "",
    "## Learning",
    incident.learningSummary,
    "",
    "## Evidence",
  ];

  for (const item of incident.evidence) {
    const details = [
      item.url ? `[link](${item.url})` : undefined,
      item.obsidianPath ? `obsidian: ${item.obsidianPath}` : undefined,
      item.excerpt ? `excerpt: ${item.excerpt}` : undefined,
    ].filter(Boolean);
    lines.push(
      `- ${item.sourceSystem}:${item.entityKind}:${item.externalId}${details.length ? ` — ${details.join(" | ")}` : ""}`,
    );
  }

  if (incident.relatedIds.length > 0) {
    lines.push("", "## Related Records");
    for (const relatedId of incident.relatedIds) {
      lines.push(`- ${relatedId}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}
