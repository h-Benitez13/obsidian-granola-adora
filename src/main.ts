import { Notice, Plugin, normalizePath, TFile } from "obsidian";
import { GranolaAdoraSettings, DEFAULT_SETTINGS } from "./types";
import { GranolaApiClient } from "./api";
import { AutoTagger } from "./tagger";
import { SyncEngine, formatSyncResult } from "./sync";
import { renderIdeaNote } from "./renderer";
import { GranolaAdoraSettingTab } from "./settings-tab";
import { IdeaFromMeetingModal } from "./modals";

export default class GranolaAdoraPlugin extends Plugin {
  settings: GranolaAdoraSettings = DEFAULT_SETTINGS;
  private api: GranolaApiClient = new GranolaApiClient();
  private tagger: AutoTagger = new AutoTagger([], []);
  private syncEngine!: SyncEngine;
  private autoSyncIntervalId: number | null = null;
  private isSyncing = false;

  async onload(): Promise<void> {
    await this.loadPluginSettings();

    this.tagger = new AutoTagger(this.settings.knownCustomers, this.settings.knownTopics);
    this.syncEngine = new SyncEngine(
      this.app,
      this.api,
      this.tagger,
      () => this.settings,
      () => this.savePluginSettings()
    );

    this.addSettingTab(new GranolaAdoraSettingTab(this.app, this));

    this.addRibbonIcon("refresh-cw", "Sync Granola", () => {
      this.runSync();
    });

    this.addCommand({
      id: "granola-sync",
      name: "Sync meetings from Granola",
      callback: () => this.runSync()
    });

    this.addCommand({
      id: "granola-create-idea",
      name: "Create idea from meeting",
      callback: () => this.createIdeaFromMeeting()
    });

    this.addCommand({
      id: "granola-full-resync",
      name: "Full re-sync (reset and re-import all)",
      callback: async () => {
        this.settings.lastSyncTimestamp = null;
        this.settings.syncedDocIds = [];
        await this.savePluginSettings();
        await this.runSync();
      }
    });

    if (this.settings.syncOnStartup) {
      setTimeout(() => this.runSync(), 3000);
    }

    this.startAutoSync();
  }

  onunload(): void {
    this.stopAutoSync();
  }

  async loadPluginSettings(): Promise<void> {
    const loaded = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, loaded);
  }

  async savePluginSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async checkAuth(): Promise<boolean> {
    return this.api.ensureAuthenticated();
  }

  updateTaggerConfig(): void {
    this.tagger.updateKnownCustomers(this.settings.knownCustomers);
    this.tagger.updateKnownTopics(this.settings.knownTopics);
  }

  startAutoSync(): void {
    this.stopAutoSync();
    if (this.settings.syncIntervalMinutes > 0) {
      const ms = this.settings.syncIntervalMinutes * 60 * 1000;
      this.autoSyncIntervalId = window.setInterval(() => this.runSync(), ms);
      this.registerInterval(this.autoSyncIntervalId);
    }
  }

  restartAutoSync(): void {
    this.startAutoSync();
  }

  stopAutoSync(): void {
    if (this.autoSyncIntervalId !== null) {
      window.clearInterval(this.autoSyncIntervalId);
      this.autoSyncIntervalId = null;
    }
  }

  private async runSync(): Promise<void> {
    if (this.isSyncing) {
      new Notice("Granola: Sync already in progress.");
      return;
    }

    const authenticated = await this.api.ensureAuthenticated();
    if (!authenticated) {
      new Notice("Granola: Could not find local session. Make sure Granola desktop app is open and you're signed in.");
      return;
    }

    this.isSyncing = true;

    try {
      new Notice("Granola: Starting sync...");
      const result = await this.syncEngine.sync();
      new Notice(formatSyncResult(result));

      if (result.errors.length > 0) {
        console.error("Granola sync errors:", result.errors);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      new Notice(`Granola sync failed: ${message}`);
      console.error("Granola sync failed:", err);
    } finally {
      this.isSyncing = false;
    }
  }

  private createIdeaFromMeeting(): void {
    const modal = new IdeaFromMeetingModal(this.app, async (title: string, meetingPaths: string[]) => {
      const { baseFolderPath, ideasFolderName } = this.settings;
      const fileName = title.replace(/[<>:"/\\|?*]/g, "-").substring(0, 80);
      const filePath = normalizePath(`${baseFolderPath}/${ideasFolderName}/${fileName}.md`);
      const content = renderIdeaNote(title, meetingPaths);

      try {
        await this.app.vault.create(filePath, content);
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (file instanceof TFile) {
          const leaf = this.app.workspace.getLeaf(false);
          await leaf.openFile(file);
        }
        new Notice(`Created idea: ${title}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        new Notice(`Failed to create idea: ${message}`);
      }
    });
    modal.open();
  }
}
