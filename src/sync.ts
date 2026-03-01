import { App, normalizePath, TFile } from "obsidian";
import { GranolaApiClient } from "./api";
import { AutoTagger } from "./tagger";
import {
  renderMeetingNote,
  renderCustomerNote,
  sanitizeFileName,
} from "./renderer";
import {
  GranolaAdoraSettings,
  GranolaDocument,
  GranolaDocumentList,
  SyncResult,
} from "./types";

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

    settings.lastSyncTimestamp = new Date().toISOString();
    await this.saveSettings();

    return result;
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
      `${settings.baseFolderPath}/${settings.prioritiesFolderName}`,
    ];

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
