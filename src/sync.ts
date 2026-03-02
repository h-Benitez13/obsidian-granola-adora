import { App, normalizePath, TFile } from "obsidian";
import { GranolaApiClient } from "./api";
import { FigmaClient } from "./figma";
import { LinearClient } from "./linear";
import { AutoTagger } from "./tagger";
import {
  renderMeetingNote,
  renderCustomerNote,
  sanitizeFileName,
} from "./renderer";
import { generateCustomer360, generateTeamProfile } from "./profiles";
import {
  FigmaFile,
  GranolaAdoraSettings,
  GranolaDocument,
  GranolaDocumentList,
  LinearIssue,
  LinearProject,
  SyncResult,
  WorkspaceMember,
} from "./types";

function escapeYaml(input: string): string {
  return input.replace(/"/g, '\\"').replace(/\n/g, " ");
}

export class SyncEngine {
  private app: App;
  private api: GranolaApiClient;
  private tagger: AutoTagger;
  private getSettings: () => GranolaAdoraSettings;
  private saveSettings: () => Promise<void>;

  constructor(
    app: App,
    api: GranolaApiClient,
    tagger: AutoTagger,
    getSettings: () => GranolaAdoraSettings,
    saveSettings: () => Promise<void>,
  ) {
    this.app = app;
    this.api = api;
    this.tagger = tagger;
    this.getSettings = getSettings;
    this.saveSettings = saveSettings;
  }

  async sync(): Promise<SyncResult> {
    const settings = this.getSettings();
    const result: SyncResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    await this.ensureFolderStructure(settings);

    const allDocs = await this.gatherAllDocuments(settings, result);

    const docs = settings.lastSyncTimestamp
      ? allDocs.filter((d) => d.updated_at > settings.lastSyncTimestamp!)
      : allDocs;

    if (docs.length === 0) {
      return result;
    }

    for (const doc of docs) {
      try {
        if (settings.includeTranscript) {
          try {
            doc.transcript = await this.api.fetchTranscript(doc.id);
          } catch {
            doc.transcript = null;
          }
        }

        const tags = this.tagger.extract(doc);
        const markdown = renderMeetingNote(
          doc,
          tags,
          settings.includeTranscript,
        );
        const filePath = this.buildMeetingFilePath(doc, settings);
        const existingFile = this.app.vault.getAbstractFileByPath(filePath);

        if (existingFile instanceof TFile) {
          const existingContent = await this.app.vault.read(existingFile);
          const existingUpdated =
            this.extractFrontmatterField(existingContent, "updated") ?? "";
          if (existingUpdated >= doc.updated_at) {
            result.skipped++;
            continue;
          }
          await this.app.vault.modify(existingFile, markdown);
          result.updated++;
        } else {
          await this.app.vault.create(filePath, markdown);
          result.created++;
        }

        await this.ensureCustomerNotes(tags.customers, settings);

        if (!settings.syncedDocIds.includes(doc.id)) {
          settings.syncedDocIds.push(doc.id);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        result.errors.push(`Failed to sync doc ${doc.id}: ${message}`);
      }
    }

    try {
      await this.syncCustomer360Pages(allDocs);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      result.errors.push(`Customer 360 sync failed: ${message}`);
    }

    try {
      const members = await this.api.fetchWorkspaceMembers();
      await this.syncTeamProfiles(members);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      result.errors.push(`Team profiles sync failed: ${message}`);
    }

    if (settings.syncLinear && settings.linearApiKey) {
      try {
        await this.syncLinearIssues();
        await this.syncLinearProjects();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        result.errors.push(`Linear sync failed: ${message}`);
      }
    }

    if (
      settings.syncFigma &&
      settings.figmaAccessToken &&
      settings.figmaTeamId
    ) {
      try {
        await this.syncFigmaFiles();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        result.errors.push(`Figma sync failed: ${message}`);
      }
    }

    settings.lastSyncTimestamp = new Date().toISOString();
    await this.saveSettings();

    return result;
  }

  private async syncLinearIssues(): Promise<void> {
    const settings = this.getSettings();
    const client = new LinearClient(settings.linearApiKey);
    const issues = await client.fetchMyIssues();
    const basePath = `${settings.baseFolderPath}/${settings.linearFolderName}/Issues`;
    const meetingsPath = `${settings.baseFolderPath}/${settings.meetingsFolderName}`;

    for (const issue of issues) {
      const fileName = sanitizeFileName(`${issue.identifier} ${issue.title}`);
      const filePath = normalizePath(`${basePath}/${fileName}.md`);
      const content = this.renderLinearIssueNote(issue, meetingsPath);
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);

      if (existingFile instanceof TFile) {
        const existing = await this.app.vault.read(existingFile);
        const existingUpdated =
          this.extractFrontmatterField(existing, "updated") ?? "";
        if (existingUpdated >= issue.updatedAt) continue;
        await this.app.vault.modify(existingFile, content);
      } else {
        await this.app.vault.create(filePath, content);
      }
    }
  }

  private async syncLinearProjects(): Promise<void> {
    const settings = this.getSettings();
    const client = new LinearClient(settings.linearApiKey);
    const projects = await client.fetchProjects();
    const basePath = `${settings.baseFolderPath}/${settings.linearFolderName}/Projects`;
    const issuesPath = `${settings.baseFolderPath}/${settings.linearFolderName}/Issues`;

    for (const project of projects) {
      const fileName = sanitizeFileName(project.name);
      const filePath = normalizePath(`${basePath}/${fileName}.md`);
      const content = this.renderLinearProjectNote(project, issuesPath);
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);

      if (existingFile instanceof TFile) {
        await this.app.vault.modify(existingFile, content);
      } else {
        await this.app.vault.create(filePath, content);
      }
    }
  }

  private renderLinearIssueNote(
    issue: LinearIssue,
    meetingsPath: string,
  ): string {
    const labels = issue.labels.nodes.map((l) => l.name);
    const tags = ["linear", "issue", `status/${escapeYaml(issue.state.type)}`];

    const fm = [
      "---",
      `type: "linear-issue"`,
      `linear_id: "${escapeYaml(issue.id)}"`,
      `identifier: "${escapeYaml(issue.identifier)}"`,
      `title: "${escapeYaml(issue.title)}"`,
      `status: "${escapeYaml(issue.state.name)}"`,
      `priority: "${escapeYaml(issue.priorityLabel)}"`,
    ];

    if (issue.assignee) {
      fm.push(`assignee: "${escapeYaml(issue.assignee.name)}"`);
    }
    if (issue.project) {
      fm.push(`project: "${escapeYaml(issue.project.name)}"`);
    }
    if (labels.length > 0) {
      fm.push("labels:");
      for (const label of labels) {
        fm.push(`  - "${escapeYaml(label)}"`);
      }
    }
    fm.push(`created: "${issue.createdAt}"`);
    fm.push(`updated: "${issue.updatedAt}"`);
    fm.push("tags:");
    for (const tag of tags) {
      fm.push(`  - "${tag}"`);
    }
    fm.push("---");

    const body: string[] = [
      `\n# ${issue.identifier}: ${issue.title}\n`,
      `> **Status:** ${issue.state.name} | **Priority:** ${issue.priorityLabel}${issue.assignee ? ` | **Assignee:** ${issue.assignee.name}` : ""}\n`,
    ];

    if (issue.description) {
      body.push("## Description\n");
      body.push(issue.description);
      body.push("");
    }

    body.push("## Related Meetings\n");
    body.push("```dataview");
    body.push(`TABLE date as "Date", title as "Meeting"`);
    body.push(`FROM "${meetingsPath}"`);
    body.push(
      `WHERE contains(file.content, "${escapeYaml(issue.identifier)}")`,
    );
    body.push("SORT date DESC");
    body.push("```");
    body.push("");

    return [...fm, ...body].join("\n");
  }

  private renderLinearProjectNote(
    project: LinearProject,
    issuesPath: string,
  ): string {
    const tags = ["linear", "project"];
    const progressPct = Math.round(project.progress * 100);

    const fm = [
      "---",
      `type: "linear-project"`,
      `linear_id: "${escapeYaml(project.id)}"`,
      `name: "${escapeYaml(project.name)}"`,
      `state: "${escapeYaml(project.state)}"`,
      `progress: ${progressPct}`,
    ];

    if (project.lead) {
      fm.push(`lead: "${escapeYaml(project.lead.name)}"`);
    }
    if (project.startDate) {
      fm.push(`start_date: "${project.startDate}"`);
    }
    if (project.targetDate) {
      fm.push(`target_date: "${project.targetDate}"`);
    }
    fm.push("tags:");
    for (const tag of tags) {
      fm.push(`  - "${tag}"`);
    }
    fm.push("---");

    const body: string[] = [
      `\n# ${project.name}\n`,
      `> **Progress:** ${progressPct}%${project.lead ? ` | **Lead:** ${project.lead.name}` : ""}${project.targetDate ? ` | **Target:** ${project.targetDate}` : ""}\n`,
    ];

    if (project.description) {
      body.push("## Description\n");
      body.push(project.description);
      body.push("");
    }

    body.push("## Issues\n");
    body.push("```dataview");
    body.push(
      `TABLE status as "Status", priority as "Priority", assignee as "Assignee"`,
    );
    body.push(`FROM "${issuesPath}"`);
    body.push(`WHERE project = "${escapeYaml(project.name)}"`);
    body.push("SORT priority ASC");
    body.push("```");
    body.push("");

    return [...fm, ...body].join("\n");
  }

  private async syncFigmaFiles(): Promise<void> {
    const settings = this.getSettings();
    const client = new FigmaClient(settings.figmaAccessToken);
    const projects = await client.fetchTeamProjects(settings.figmaTeamId);

    const MAX_FILES = 100;
    const allFiles: FigmaFile[] = [];

    for (const project of projects) {
      if (allFiles.length >= MAX_FILES) break;

      const files = await client.fetchProjectFiles(String(project.id));
      for (const file of files) {
        if (allFiles.length >= MAX_FILES) break;
        file.project_name = project.name;
        allFiles.push(file);
      }
    }

    const basePath = settings.baseFolderPath;
    const designsFolder = `${basePath}/${settings.designsFolderName}`;
    await this.ensureFolder(designsFolder);

    for (const file of allFiles) {
      const projectFolder = `${designsFolder}/${sanitizeFileName(file.project_name || "Uncategorized")}`;
      await this.ensureFolder(projectFolder);

      const fileName = sanitizeFileName(file.name);
      const filePath = normalizePath(`${projectFolder}/${fileName}.md`);
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);

      if (existingFile instanceof TFile) {
        const existingContent = await this.app.vault.read(existingFile);
        const existingModified =
          this.extractFrontmatterField(existingContent, "last_modified") ?? "";
        if (existingModified >= file.last_modified) continue;
        await this.app.vault.modify(
          existingFile,
          this.renderFigmaNote(file, basePath),
        );
      } else {
        await this.app.vault.create(
          filePath,
          this.renderFigmaNote(file, basePath),
        );
      }
    }
  }

  private renderFigmaNote(file: FigmaFile, basePath: string): string {
    const meetingsPath = `${basePath}/${this.getSettings().meetingsFolderName}`;
    const ideasPath = `${basePath}/${this.getSettings().ideasFolderName}`;

    const fm = [
      "---",
      `type: "design"`,
      `figma_key: "${escapeYaml(file.key)}"`,
      `project: "${escapeYaml(file.project_name)}"`,
      `last_modified: "${escapeYaml(file.last_modified)}"`,
      `tags:`,
      `  - "design"`,
      `  - "figma"`,
      `synced: "${new Date().toISOString()}"`,
      "---",
    ];

    const body: string[] = [
      "",
      `# ${file.name}`,
      "",
      `![${escapeYaml(file.name)}](${file.thumbnail_url})`,
      "",
      `[Open in Figma](https://www.figma.com/file/${file.key})`,
      "",
      "## Related Meetings",
      "",
      "```dataview",
      `TABLE date as "Date", title as "Meeting"`,
      `FROM "${meetingsPath}"`,
      `WHERE contains(title, "${escapeYaml(file.name)}")`,
      `SORT date DESC`,
      "```",
      "",
      "## Related Ideas",
      "",
      "```dataview",
      `LIST`,
      `FROM "${ideasPath}"`,
      `WHERE contains(file.outlinks, this.file.link) OR contains(title, "${escapeYaml(file.name)}")`,
      `SORT file.ctime DESC`,
      "```",
      "",
    ];

    return [...fm, ...body].join("\n");
  }

  private async syncCustomer360Pages(
    allDocs: GranolaDocument[],
  ): Promise<void> {
    const settings = this.getSettings();
    const basePath = settings.baseFolderPath;
    const meetingsFolderPath = `${basePath}/${settings.meetingsFolderName}`;
    const customersFolderPath = `${basePath}/${settings.customersFolderName}`;

    const customerSet = new Set<string>();
    for (const doc of allDocs) {
      const tags = this.tagger.extract(doc);
      for (const customer of tags.customers) {
        customerSet.add(customer);
      }
    }

    for (const customer of customerSet) {
      const fileName = sanitizeFileName(customer);
      const filePath = normalizePath(`${customersFolderPath}/${fileName}.md`);
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);

      if (existingFile instanceof TFile) {
        const existingContent = await this.app.vault.read(existingFile);
        const markerIndex = existingContent.indexOf("<!-- user-content -->");
        if (markerIndex !== -1) {
          const userContent = existingContent.substring(markerIndex);
          const generated = generateCustomer360(
            customer,
            meetingsFolderPath,
            basePath,
          );
          const generatedMarkerIndex = generated.indexOf(
            "<!-- user-content -->",
          );
          const generatedAbove =
            generatedMarkerIndex !== -1
              ? generated.substring(0, generatedMarkerIndex)
              : generated;
          await this.app.vault.modify(
            existingFile,
            generatedAbove + userContent,
          );
        } else {
          const content = generateCustomer360(
            customer,
            meetingsFolderPath,
            basePath,
          );
          await this.app.vault.modify(existingFile, content);
        }
      } else {
        const content = generateCustomer360(
          customer,
          meetingsFolderPath,
          basePath,
        );
        await this.app.vault.create(filePath, content);
      }
    }
  }

  private async syncTeamProfiles(members: WorkspaceMember[]): Promise<void> {
    const settings = this.getSettings();
    const basePath = settings.baseFolderPath;
    const meetingsFolderPath = `${basePath}/${settings.meetingsFolderName}`;
    const peopleFolderPath = `${basePath}/${settings.peopleFolderName}`;

    const internalMembers = members.filter((m) =>
      m.email.endsWith("@adora-ai.com"),
    );

    for (const member of internalMembers) {
      const fileName = sanitizeFileName(member.name);
      const filePath = normalizePath(`${peopleFolderPath}/${fileName}.md`);
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);

      if (existingFile instanceof TFile) {
        const existingContent = await this.app.vault.read(existingFile);
        const markerIndex = existingContent.indexOf("<!-- user-content -->");
        if (markerIndex !== -1) {
          const userContent = existingContent.substring(markerIndex);
          const generated = generateTeamProfile(
            member,
            basePath,
            meetingsFolderPath,
          );
          const generatedMarkerIndex = generated.indexOf(
            "<!-- user-content -->",
          );
          const generatedAbove =
            generatedMarkerIndex !== -1
              ? generated.substring(0, generatedMarkerIndex)
              : generated;
          await this.app.vault.modify(
            existingFile,
            generatedAbove + userContent,
          );
        }
      } else {
        const content = generateTeamProfile(
          member,
          basePath,
          meetingsFolderPath,
        );
        await this.app.vault.create(filePath, content);
      }
    }
  }

  private async gatherAllDocuments(
    settings: GranolaAdoraSettings,
    result: SyncResult,
  ): Promise<GranolaDocument[]> {
    const seen = new Map<string, GranolaDocument>();

    try {
      const myDocs = await this.api.fetchMyDocuments();
      for (const doc of myDocs) {
        seen.set(doc.id, doc);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      result.errors.push(`Failed to fetch your documents: ${message}`);
    }

    if (settings.syncSharedDocs) {
      try {
        const shared = await this.api.fetchSharedDocuments();
        for (const doc of shared) {
          if (!seen.has(doc.id)) {
            seen.set(doc.id, doc);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        result.errors.push(`Failed to fetch shared documents: ${message}`);
      }
    }

    if (settings.syncWorkspaceLists) {
      try {
        const lists = await this.api.fetchDocumentLists();
        for (const list of lists) {
          await this.ensureListFolder(list, settings);
          for (const doc of list.documents) {
            doc._listTitle = list.title;
            if (!seen.has(doc.id)) {
              seen.set(doc.id, doc);
            }
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        result.errors.push(`Failed to fetch workspace lists: ${message}`);
      }
    }

    return [...seen.values()];
  }

  private async ensureFolderStructure(
    settings: GranolaAdoraSettings,
  ): Promise<void> {
    const folders = [
      settings.baseFolderPath,
      `${settings.baseFolderPath}/${settings.meetingsFolderName}`,
      `${settings.baseFolderPath}/${settings.ideasFolderName}`,
      `${settings.baseFolderPath}/${settings.customersFolderName}`,
      `${settings.baseFolderPath}/${settings.peopleFolderName}`,
      `${settings.baseFolderPath}/${settings.prioritiesFolderName}`,
    ];

    if (settings.syncLinear) {
      folders.push(`${settings.baseFolderPath}/${settings.linearFolderName}`);
      folders.push(
        `${settings.baseFolderPath}/${settings.linearFolderName}/Issues`,
      );
      folders.push(
        `${settings.baseFolderPath}/${settings.linearFolderName}/Projects`,
      );
    }

    if (settings.syncFigma) {
      folders.push(`${settings.baseFolderPath}/${settings.designsFolderName}`);
    }

    if (settings.aiEnabled) {
      folders.push(`${settings.baseFolderPath}/${settings.digestsFolderName}`);
    }

    for (const folder of folders) {
      await this.ensureFolder(folder);
    }
  }

  private async ensureListFolder(
    list: GranolaDocumentList,
    settings: GranolaAdoraSettings,
  ): Promise<void> {
    const folderName = sanitizeFileName(list.title);
    await this.ensureFolder(
      `${settings.baseFolderPath}/${settings.meetingsFolderName}/${folderName}`,
    );
  }

  private async ensureFolder(path: string): Promise<void> {
    const normalized = normalizePath(path);
    if (!this.app.vault.getAbstractFileByPath(normalized)) {
      await this.app.vault.createFolder(normalized);
    }
  }

  private async ensureCustomerNotes(
    customers: string[],
    settings: GranolaAdoraSettings,
  ): Promise<void> {
    for (const customer of customers) {
      const fileName = sanitizeFileName(customer);
      const filePath = normalizePath(
        `${settings.baseFolderPath}/${settings.customersFolderName}/${fileName}.md`,
      );
      if (!this.app.vault.getAbstractFileByPath(filePath)) {
        await this.app.vault.create(filePath, renderCustomerNote(customer));
      }
    }
  }

  private buildMeetingFilePath(
    doc: GranolaDocument,
    settings: GranolaAdoraSettings,
  ): string {
    const datePrefix = new Date(doc.created_at).toISOString().split("T")[0];
    const title = sanitizeFileName(doc.title ?? "Untitled Meeting");

    if (doc._listTitle) {
      const listFolder = sanitizeFileName(doc._listTitle);
      return normalizePath(
        `${settings.baseFolderPath}/${settings.meetingsFolderName}/${listFolder}/${datePrefix} ${title}.md`,
      );
    }

    return normalizePath(
      `${settings.baseFolderPath}/${settings.meetingsFolderName}/${datePrefix} ${title}.md`,
    );
  }

  private extractFrontmatterField(
    content: string,
    field: string,
  ): string | null {
    const match = content.match(new RegExp(`${field}:\\s*"([^"]+)"`));
    return match ? match[1] : null;
  }
}

export function formatSyncResult(result: SyncResult): string {
  const parts: string[] = [];
  if (result.created > 0) parts.push(`${result.created} new`);
  if (result.updated > 0) parts.push(`${result.updated} updated`);
  if (result.skipped > 0) parts.push(`${result.skipped} unchanged`);

  const summary =
    parts.length > 0
      ? `Granola sync: ${parts.join(", ")}`
      : "Granola sync: no new notes";
  return result.errors.length > 0
    ? `${summary} (${result.errors.length} errors)`
    : summary;
}
