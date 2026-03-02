import {
  App,
  Modal,
  Notice,
  Plugin,
  Setting,
  normalizePath,
  TFile,
} from "obsidian";
import { GranolaAdoraSettings, DEFAULT_SETTINGS } from "./types";
import { GranolaApiClient } from "./api";
import { AutoTagger } from "./tagger";
import { SyncEngine, formatSyncResult } from "./sync";
import { renderIdeaNote } from "./renderer";
import { GranolaAdoraSettingTab } from "./settings-tab";
import { IdeaFromMeetingModal } from "./modals";
import { AICortex } from "./ai";

export default class GranolaAdoraPlugin extends Plugin {
  settings: GranolaAdoraSettings = DEFAULT_SETTINGS;
  private api: GranolaApiClient = new GranolaApiClient();
  private tagger: AutoTagger = new AutoTagger([], []);
  private syncEngine!: SyncEngine;
  private autoSyncIntervalId: number | null = null;
  private isSyncing = false;

  async onload(): Promise<void> {
    await this.loadPluginSettings();

    this.tagger = new AutoTagger(
      this.settings.knownCustomers,
      this.settings.knownTopics,
    );
    this.syncEngine = new SyncEngine(
      this.app,
      this.api,
      this.tagger,
      () => this.settings,
      () => this.savePluginSettings(),
    );

    this.addSettingTab(new GranolaAdoraSettingTab(this.app, this));

    this.addRibbonIcon("refresh-cw", "Sync Granola", () => {
      this.runSync();
    });

    this.addCommand({
      id: "granola-sync",
      name: "Sync meetings from Granola",
      callback: () => this.runSync(),
    });

    this.addCommand({
      id: "granola-create-idea",
      name: "Create idea from meeting",
      callback: () => this.createIdeaFromMeeting(),
    });

    this.addCommand({
      id: "granola-full-resync",
      name: "Full re-sync (reset and re-import all)",
      callback: async () => {
        this.settings.lastSyncTimestamp = null;
        this.settings.syncedDocIds = [];
        await this.savePluginSettings();
        await this.runSync();
      },
    });

    this.addCommand({
      id: "granola-prep-brief",
      name: "Prepare customer brief (AI)",
      callback: () => this.generatePrepBrief(),
    });

    this.addCommand({
      id: "granola-weekly-digest",
      name: "Generate weekly digest (AI)",
      callback: () => this.generateWeeklyDigest(),
    });

    this.addCommand({
      id: "granola-detect-themes",
      name: "Analyze meeting themes (AI)",
      callback: () => this.generateThemeAnalysis(),
    });

    this.addCommand({
      id: "granola-extract-ideas",
      name: "Extract ideas from current note (AI)",
      callback: () => this.extractIdeasFromNote(),
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
      new Notice(
        "Granola: Could not find local session. Make sure Granola desktop app is open and you're signed in.",
      );
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
    const modal = new IdeaFromMeetingModal(
      this.app,
      async (title: string, meetingPaths: string[]) => {
        const { baseFolderPath, ideasFolderName } = this.settings;
        const fileName = title.replace(/[<>:"/\\|?*]/g, "-").substring(0, 80);
        const filePath = normalizePath(
          `${baseFolderPath}/${ideasFolderName}/${fileName}.md`,
        );
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
      },
    );
    modal.open();
  }

  private requireAI(): AICortex | null {
    if (!this.settings.aiEnabled || !this.settings.claudeApiKey) {
      new Notice(
        "AI features are disabled. Enable them in plugin settings and add your Claude API key.",
      );
      return null;
    }
    return new AICortex(this.settings.claudeApiKey, this.settings.aiModel);
  }

  private getMeetingFiles(): TFile[] {
    const { baseFolderPath, meetingsFolderName } = this.settings;
    const prefix = `${baseFolderPath}/${meetingsFolderName}/`;
    return this.app.vault
      .getMarkdownFiles()
      .filter((f) => f.path.startsWith(prefix));
  }

  private async getMeetingSummary(file: TFile): Promise<string> {
    const content = await this.app.vault.read(file);
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
    const title = fm?.title ?? file.basename;
    const date = fm?.date ?? "";
    const owner = fm?.owner ?? "";
    return `## ${title}\nDate: ${date} | Owner: ${owner}\n\n${content.replace(/^---[\s\S]*?---/, "").trim()}`;
  }

  private async writeAINote(
    filePath: string,
    title: string,
    aiType: string,
    aiOutput: string,
  ): Promise<void> {
    const now = new Date().toISOString();
    const content = [
      "---",
      `title: "${title.replace(/"/g, '\\"')}"`,
      `type: "${aiType}"`,
      `generated_at: "${now}"`,
      `tags:`,
      `  - "ai"`,
      `  - "${aiType}"`,
      "---",
      "",
      `# ${title}`,
      "",
      `> Generated on ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}`,
      "",
      aiOutput,
      "",
    ].join("\n");

    const existing = this.app.vault.getAbstractFileByPath(filePath);
    if (existing instanceof TFile) {
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(filePath, content);
    }

    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (file instanceof TFile) {
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);
    }
  }

  private generatePrepBrief(): void {
    const ai = this.requireAI();
    if (!ai) return;

    const modal = new CustomerNameModal(
      this.app,
      async (customerName: string) => {
        if (!customerName.trim()) return;
        new Notice(`Generating prep brief for ${customerName}...`);

        try {
          const meetingFiles = this.getMeetingFiles();
          const matching: TFile[] = [];
          for (const file of meetingFiles) {
            const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
            const customers: string[] = fm?.customers ?? [];
            if (
              customers.some((c: string) =>
                c.toLowerCase().includes(customerName.toLowerCase()),
              )
            ) {
              matching.push(file);
            }
          }

          if (matching.length === 0) {
            new Notice(`No meetings found for customer "${customerName}".`);
            return;
          }

          matching.sort((a, b) => {
            const aDate =
              this.app.metadataCache.getFileCache(a)?.frontmatter?.date ?? "";
            const bDate =
              this.app.metadataCache.getFileCache(b)?.frontmatter?.date ?? "";
            return bDate.localeCompare(aDate);
          });

          const summaries: string[] = [];
          for (const file of matching.slice(0, 10)) {
            summaries.push(await this.getMeetingSummary(file));
          }

          const result = await ai.generateCustomerPrepBrief(
            customerName,
            summaries,
          );
          const safeName = customerName
            .replace(/[<>:"/\\|?*]/g, "-")
            .substring(0, 60);
          const filePath = normalizePath(
            `${this.settings.baseFolderPath}/${this.settings.customersFolderName}/${safeName} — Prep Brief.md`,
          );

          await this.writeAINote(
            filePath,
            `${customerName} — Prep Brief`,
            "prep-brief",
            result,
          );
          new Notice(`Prep brief generated for ${customerName}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          new Notice(`Failed to generate prep brief: ${message}`);
        }
      },
    );
    modal.open();
  }

  private async generateWeeklyDigest(): Promise<void> {
    const ai = this.requireAI();
    if (!ai) return;

    new Notice("Generating weekly digest...");
    try {
      const meetingFiles = this.getMeetingFiles();
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);

      const recentFiles = meetingFiles.filter((f) => {
        const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
        return fm?.date && new Date(fm.date) >= weekAgo;
      });

      if (recentFiles.length === 0) {
        new Notice("No meetings found in the last 7 days.");
        return;
      }

      const summaries: string[] = [];
      for (const file of recentFiles.slice(0, 15)) {
        summaries.push(await this.getMeetingSummary(file));
      }

      let issuesSummary = "";
      if (this.settings.syncLinear) {
        const issueFiles = this.app.vault
          .getMarkdownFiles()
          .filter((f) =>
            f.path.startsWith(
              `${this.settings.baseFolderPath}/${this.settings.linearFolderName}/Issues/`,
            ),
          );
        const issueTitles = issueFiles.map((f) => f.basename).slice(0, 30);
        if (issueTitles.length > 0) {
          issuesSummary = issueTitles.join("\n");
        }
      }

      const result = await ai.generateWeeklyDigest(summaries, issuesSummary);
      const dateStr = new Date().toISOString().split("T")[0];
      const filePath = normalizePath(
        `${this.settings.baseFolderPath}/${this.settings.digestsFolderName}/Week of ${dateStr}.md`,
      );

      await this.writeAINote(
        filePath,
        `Weekly Digest — ${dateStr}`,
        "weekly-digest",
        result,
      );
      new Notice("Weekly digest generated!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      new Notice(`Failed to generate digest: ${message}`);
    }
  }

  private async generateThemeAnalysis(): Promise<void> {
    const ai = this.requireAI();
    if (!ai) return;

    new Notice("Analyzing meeting themes...");
    try {
      const meetingFiles = this.getMeetingFiles();
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);

      const recentFiles = meetingFiles.filter((f) => {
        const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
        return fm?.date && new Date(fm.date) >= monthAgo;
      });

      if (recentFiles.length === 0) {
        new Notice("No meetings found in the last 30 days.");
        return;
      }

      const summaries: string[] = [];
      for (const file of recentFiles.slice(0, 20)) {
        summaries.push(await this.getMeetingSummary(file));
      }

      const result = await ai.detectThemes(summaries);
      const dateStr = new Date().toISOString().split("T")[0];
      const filePath = normalizePath(
        `${this.settings.baseFolderPath}/${this.settings.digestsFolderName}/Theme Analysis — ${dateStr}.md`,
      );

      await this.writeAINote(
        filePath,
        `Theme Analysis — ${dateStr}`,
        "theme-analysis",
        result,
      );
      new Notice("Theme analysis generated!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      new Notice(`Failed to generate theme analysis: ${message}`);
    }
  }

  private async extractIdeasFromNote(): Promise<void> {
    const ai = this.requireAI();
    if (!ai) return;

    const activeFile = this.app.workspace.getActiveFile();
    if (!activeFile) {
      new Notice("No active file. Open a meeting note first.");
      return;
    }

    new Notice("Extracting ideas...");
    try {
      const content = await this.app.vault.read(activeFile);
      const result = await ai.extractIdeas(content);
      const title = `Ideas from ${activeFile.basename}`;
      const safeName = title.replace(/[<>:"/\\|?*]/g, "-").substring(0, 80);
      const filePath = normalizePath(
        `${this.settings.baseFolderPath}/${this.settings.ideasFolderName}/${safeName}.md`,
      );

      await this.writeAINote(filePath, title, "extracted-ideas", result);
      new Notice("Ideas extracted!");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      new Notice(`Failed to extract ideas: ${message}`);
    }
  }
}

class CustomerNameModal extends Modal {
  private onSubmit: (name: string) => void;

  constructor(app: App, onSubmit: (name: string) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Customer Prep Brief" });

    let inputValue = "";

    new Setting(contentEl)
      .setName("Customer name")
      .setDesc(
        "Enter the customer or company name to generate a prep brief for.",
      )
      .addText((text) =>
        text
          .setPlaceholder("e.g., Verizon, Servco...")
          .onChange((value) => {
            inputValue = value;
          })
          .then((t) => {
            t.inputEl.style.width = "100%";
            t.inputEl.addEventListener("keydown", (e: KeyboardEvent) => {
              if (e.key === "Enter") {
                this.onSubmit(inputValue.trim());
                this.close();
              }
            });
          }),
      );

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Generate Brief")
        .setCta()
        .onClick(() => {
          if (inputValue.trim()) {
            this.onSubmit(inputValue.trim());
            this.close();
          }
        }),
    );
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
