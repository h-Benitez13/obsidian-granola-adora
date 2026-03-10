export interface AutomationAuditBlockInput {
  timestamp: string;
  mode: "dry-run" | "live";
  summaryLines: string[];
  detailLines: string[];
}

export function buildAutomationLogsFolder(
  baseFolderPath: string,
  digestsFolderName: string,
): string {
  return `${baseFolderPath}/${digestsFolderName}/Automation Logs`;
}

export function buildAutomationLogFilePath(
  baseFolderPath: string,
  digestsFolderName: string,
  automation: string,
  day: string,
): string {
  return `${buildAutomationLogsFolder(baseFolderPath, digestsFolderName)}/${automation}--${day}.md`;
}

export function renderAutomationAuditBlock(
  input: AutomationAuditBlockInput,
): string {
  return [
    `## ${input.timestamp}`,
    "",
    `- Mode: ${input.mode}`,
    ...input.summaryLines.map((line) => `- ${line}`),
    "",
    ...input.detailLines,
    "",
  ].join("\n");
}

export function renderAutomationAuditFile(
  automation: string,
  title: string,
  day: string,
  block: string,
): string {
  return [
    "---",
    'type: "automation-log"',
    `automation: "${automation}"`,
    `date: "${day}"`,
    "---",
    "",
    `# ${title}`,
    "",
    block,
  ].join("\n");
}
