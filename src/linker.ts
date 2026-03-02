import { App, TFile, normalizePath } from "obsidian";
import { GranolaAdoraSettings } from "./types";

interface LinkResult {
  meetingsLinked: number;
  issuesLinked: number;
  designsLinked: number;
}

export class Linker {
  private app: App;
  private getSettings: () => GranolaAdoraSettings;

  constructor(app: App, getSettings: () => GranolaAdoraSettings) {
    this.app = app;
    this.getSettings = getSettings;
  }

  async runFullLinkingPass(): Promise<LinkResult> {
    const settings = this.getSettings();
    const result: LinkResult = {
      meetingsLinked: 0,
      issuesLinked: 0,
      designsLinked: 0,
    };

    const meetingFiles = this.getFilesInFolder(
      `${settings.baseFolderPath}/${settings.meetingsFolderName}`,
    );
    const issueFiles = settings.syncLinear
      ? this.getFilesInFolder(
          `${settings.baseFolderPath}/${settings.linearFolderName}/Issues`,
        )
      : [];
    const designFiles = settings.syncFigma
      ? this.getFilesInFolder(
          `${settings.baseFolderPath}/${settings.designsFolderName}`,
        )
      : [];
    const customerFiles = this.getFilesInFolder(
      `${settings.baseFolderPath}/${settings.customersFolderName}`,
    );

    const issueIndex = await this.buildIssueIndex(issueFiles);
    const designIndex = this.buildDesignIndex(designFiles);

    for (const meeting of meetingFiles) {
      const updated = await this.linkMeetingNote(
        meeting,
        issueIndex,
        designIndex,
      );
      if (updated) result.meetingsLinked++;
    }

    for (const issue of issueFiles) {
      const updated = await this.linkIssueToCustomers(issue, customerFiles);
      if (updated) result.issuesLinked++;
    }

    for (const customer of customerFiles) {
      const updated = await this.enrichCustomer360(customer, settings);
      if (updated) result.designsLinked++;
    }

    return result;
  }

  private getFilesInFolder(folderPath: string): TFile[] {
    const prefix = normalizePath(folderPath) + "/";
    return this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(prefix));
  }

  private async buildIssueIndex(
    issueFiles: TFile[],
  ): Promise<Map<string, { identifier: string; title: string; path: string }>> {
    const index = new Map<
      string,
      { identifier: string; title: string; path: string }
    >();
    for (const file of issueFiles) {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (!fm) continue;
      const identifier = fm.identifier ?? "";
      const title = fm.title ?? file.basename;
      if (identifier) {
        index.set(identifier, { identifier, title, path: file.path });
      }
    }
    return index;
  }

  private buildDesignIndex(
    designFiles: TFile[],
  ): Map<string, { name: string; path: string }> {
    const index = new Map<string, { name: string; path: string }>();
    for (const file of designFiles) {
      const name = file.basename;
      index.set(name.toLowerCase(), { name, path: file.path });
    }
    return index;
  }

  private async linkMeetingNote(
    meetingFile: TFile,
    issueIndex: Map<
      string,
      { identifier: string; title: string; path: string }
    >,
    designIndex: Map<string, { name: string; path: string }>,
  ): Promise<boolean> {
    const content = await this.app.vault.read(meetingFile);
    const bodyContent = content.replace(/^---[\s\S]*?---/, "").toLowerCase();

    const matchedIssues: string[] = [];
    for (const [identifier] of issueIndex) {
      if (bodyContent.includes(identifier.toLowerCase())) {
        matchedIssues.push(identifier);
      }
    }

    const matchedDesigns: string[] = [];
    for (const [nameLower, design] of designIndex) {
      if (nameLower.length > 3 && bodyContent.includes(nameLower)) {
        matchedDesigns.push(design.name);
      }
    }

    if (matchedIssues.length === 0 && matchedDesigns.length === 0) {
      return false;
    }

    const updatedContent = this.upsertFrontmatterArrays(content, {
      related_issues: matchedIssues,
      related_designs: matchedDesigns,
    });

    if (updatedContent !== content) {
      await this.app.vault.modify(meetingFile, updatedContent);
      return true;
    }
    return false;
  }

  private async linkIssueToCustomers(
    issueFile: TFile,
    customerFiles: TFile[],
  ): Promise<boolean> {
    const content = await this.app.vault.read(issueFile);
    const bodyLower = content.replace(/^---[\s\S]*?---/, "").toLowerCase();

    const matchedCustomers: string[] = [];
    for (const customerFile of customerFiles) {
      const customerName = customerFile.basename;
      if (
        customerName.length > 2 &&
        bodyLower.includes(customerName.toLowerCase())
      ) {
        matchedCustomers.push(customerName);
      }
    }

    if (matchedCustomers.length === 0) return false;

    const updatedContent = this.upsertFrontmatterArrays(content, {
      related_customers: matchedCustomers,
    });

    if (updatedContent !== content) {
      await this.app.vault.modify(issueFile, updatedContent);
      return true;
    }
    return false;
  }

  private async enrichCustomer360(
    customerFile: TFile,
    settings: GranolaAdoraSettings,
  ): Promise<boolean> {
    const content = await this.app.vault.read(customerFile);
    const fm = this.app.metadataCache.getFileCache(customerFile)?.frontmatter;

    if (fm?.type !== "customer-360") return false;

    const customerName = fm.company ?? customerFile.basename;
    let modified = false;
    let updated = content;

    if (settings.syncLinear && !content.includes("## Related Issues")) {
      const issuesSection = this.buildLinearIssuesSection(
        customerName,
        settings,
      );
      updated = this.insertBeforeUserContent(updated, issuesSection);
      modified = true;
    }

    if (settings.syncFigma && !content.includes("## Related Designs")) {
      const designsSection = this.buildFigmaDesignsSection(
        customerName,
        settings,
      );
      updated = this.insertBeforeUserContent(updated, designsSection);
      modified = true;
    }

    if (modified) {
      await this.app.vault.modify(customerFile, updated);
    }
    return modified;
  }

  private buildLinearIssuesSection(
    customerName: string,
    settings: GranolaAdoraSettings,
  ): string {
    const escaped = customerName.replace(/"/g, '\\"');
    const issuesPath = `${settings.baseFolderPath}/${settings.linearFolderName}/Issues`;
    return [
      "## Related Issues\n",
      "```dataview",
      `TABLE status as "Status", priority as "Priority", assignee as "Assignee"`,
      `FROM "${issuesPath}"`,
      `WHERE contains(related_customers, "${escaped}") OR contains(file.content, "${escaped}")`,
      "SORT priority ASC",
      "```\n",
    ].join("\n");
  }

  private buildFigmaDesignsSection(
    customerName: string,
    settings: GranolaAdoraSettings,
  ): string {
    const escaped = customerName.replace(/"/g, '\\"');
    const designsPath = `${settings.baseFolderPath}/${settings.designsFolderName}`;
    return [
      "## Related Designs\n",
      "```dataview",
      `TABLE project as "Project", last_modified as "Updated"`,
      `FROM "${designsPath}"`,
      `WHERE contains(file.name, "${escaped}")`,
      "SORT last_modified DESC",
      "```\n",
    ].join("\n");
  }

  private insertBeforeUserContent(content: string, section: string): string {
    const marker = "<!-- user-content -->";
    const markerIdx = content.indexOf(marker);
    if (markerIdx !== -1) {
      return (
        content.substring(0, markerIdx) + section + content.substring(markerIdx)
      );
    }
    return content.trimEnd() + "\n\n" + section;
  }

  private upsertFrontmatterArrays(
    content: string,
    fields: Record<string, string[]>,
  ): string {
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return content;

    let fmBody = fmMatch[1];
    const afterFm = content.substring(fmMatch[0].length);

    for (const [key, values] of Object.entries(fields)) {
      if (values.length === 0) continue;

      const escaped = values
        .map((v) => `  - "${v.replace(/"/g, '\\"')}"`)
        .join("\n");
      const newBlock = `${key}:\n${escaped}`;

      // Regex: match existing YAML array block to replace in-place
      const existingPattern = new RegExp(
        `^${key}:\\s*\\n(?:  - [^\\n]*\\n?)*`,
        "m",
      );
      if (existingPattern.test(fmBody)) {
        fmBody = fmBody.replace(existingPattern, newBlock + "\n");
      } else {
        fmBody = fmBody.trimEnd() + "\n" + newBlock;
      }
    }

    return `---\n${fmBody}\n---${afterFm}`;
  }
}

export function formatLinkResult(result: LinkResult): string {
  const parts: string[] = [];
  if (result.meetingsLinked > 0)
    parts.push(`${result.meetingsLinked} meetings linked`);
  if (result.issuesLinked > 0)
    parts.push(`${result.issuesLinked} issues linked`);
  if (result.designsLinked > 0)
    parts.push(`${result.designsLinked} customers enriched`);
  return parts.length > 0
    ? `Linking: ${parts.join(", ")}`
    : "Linking: no new connections found";
}
