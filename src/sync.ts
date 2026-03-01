import { App, Notice, normalizePath, TFile } from "obsidian";
import { GranolaApiClient } from "./api";
import { AutoTagger } from "./tagger";
import { renderMeetingNote, renderCustomerNote, sanitizeFileName } from "./renderer";
import { GranolaAdoraSettings, GranolaNote, SyncResult } from "./types";

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
    saveSettings: () => Promise<void>
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
      errors: []
    };

    await this.ensureFolderStructure(settings);

    let notes: GranolaNote[];
    try {
      notes = await this.api.fetchAllNotes(settings.lastSyncTimestamp ?? undefined);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      result.errors.push(`Failed to fetch notes: ${message}`);
      return result;
    }

    if (notes.length === 0) {
      return result;
    }

    for (const note of notes) {
      try {
        let fullNote = note;
        if (settings.includeTranscript) {
          fullNote = await this.api.fetchNote(note.id, true);
        }

        const tags = this.tagger.extract(fullNote);
        const markdown = renderMeetingNote(fullNote, tags, settings.includeTranscript);

        const filePath = this.buildMeetingFilePath(fullNote, settings);
        const existingFile = this.app.vault.getAbstractFileByPath(filePath);

        if (existingFile instanceof TFile) {
          const existingContent = await this.app.vault.read(existingFile);
          const existingId = this.extractGranolaId(existingContent);

          if (existingId === fullNote.id) {
            const existingUpdated = this.extractFrontmatterField(existingContent, "updated") ?? "";
            if (existingUpdated >= fullNote.updated_at) {
              result.skipped++;
              continue;
            }
          }

          await this.app.vault.modify(existingFile, markdown);
          result.updated++;
        } else {
          await this.app.vault.create(filePath, markdown);
          result.created++;
        }

        await this.ensureCustomerNotes(tags.customers, settings);

        if (!settings.syncedNoteIds.includes(fullNote.id)) {
          settings.syncedNoteIds.push(fullNote.id);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        result.errors.push(`Failed to sync note ${note.id}: ${message}`);
      }
    }

    settings.lastSyncTimestamp = new Date().toISOString();
    await this.saveSettings();

    return result;
  }

  private async ensureFolderStructure(settings: GranolaAdoraSettings): Promise<void> {
    const folders = [
      settings.baseFolderPath,
      `${settings.baseFolderPath}/${settings.meetingsFolderName}`,
      `${settings.baseFolderPath}/${settings.ideasFolderName}`,
      `${settings.baseFolderPath}/${settings.customersFolderName}`,
      `${settings.baseFolderPath}/${settings.prioritiesFolderName}`
    ];

    for (const folder of folders) {
      const normalized = normalizePath(folder);
      const existing = this.app.vault.getAbstractFileByPath(normalized);
      if (!existing) {
        await this.app.vault.createFolder(normalized);
      }
    }
  }

  private async ensureCustomerNotes(customers: string[], settings: GranolaAdoraSettings): Promise<void> {
    for (const customer of customers) {
      const fileName = sanitizeFileName(customer);
      const filePath = normalizePath(`${settings.baseFolderPath}/${settings.customersFolderName}/${fileName}.md`);
      const existing = this.app.vault.getAbstractFileByPath(filePath);
      if (!existing) {
        const content = renderCustomerNote(customer);
        await this.app.vault.create(filePath, content);
      }
    }
  }

  private buildMeetingFilePath(note: GranolaNote, settings: GranolaAdoraSettings): string {
    const date = new Date(note.created_at);
    const datePrefix = date.toISOString().split("T")[0];
    const title = sanitizeFileName(note.title ?? "Untitled Meeting");
    const fileName = `${datePrefix} ${title}.md`;

    return normalizePath(`${settings.baseFolderPath}/${settings.meetingsFolderName}/${fileName}`);
  }

  private extractGranolaId(content: string): string | null {
    const match = content.match(/granola_id:\s*"([^"]+)"/);
    return match ? match[1] : null;
  }

  private extractFrontmatterField(content: string, field: string): string | null {
    const regex = new RegExp(`${field}:\\s*"([^"]+)"`);
    const match = content.match(regex);
    return match ? match[1] : null;
  }
}

export function formatSyncResult(result: SyncResult): string {
  const parts: string[] = [];

  if (result.created > 0) {
    parts.push(`${result.created} new`);
  }
  if (result.updated > 0) {
    parts.push(`${result.updated} updated`);
  }
  if (result.skipped > 0) {
    parts.push(`${result.skipped} unchanged`);
  }

  const summary = parts.length > 0 ? `Granola sync: ${parts.join(", ")}` : "Granola sync: no new notes";

  if (result.errors.length > 0) {
    return `${summary} (${result.errors.length} errors)`;
  }

  return summary;
}
