import { App, Modal, Setting } from "obsidian";

export class IdeaFromMeetingModal extends Modal {
  private title = "";
  private meetingPaths = "";
  private onSubmit: (title: string, meetingPaths: string[]) => void;

  constructor(app: App, onSubmit: (title: string, meetingPaths: string[]) => void) {
    super(app);
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "New Idea" });

    new Setting(contentEl).setName("Title").addText((text) =>
      text
        .setPlaceholder("What's the idea?")
        .onChange((value) => {
          this.title = value;
        })
        .then((t) => {
          t.inputEl.style.width = "100%";
        })
    );

    new Setting(contentEl)
      .setName("Linked meetings")
      .setDesc("Comma-separated paths to meeting notes (e.g., Adora/Meetings/2025-01-15 Customer Call.md)")
      .addTextArea((text) =>
        text
          .setPlaceholder("Adora/Meetings/...")
          .onChange((value) => {
            this.meetingPaths = value;
          })
          .then((t) => {
            t.inputEl.style.width = "100%";
            t.inputEl.style.height = "80px";
          })
      );

    new Setting(contentEl).addButton((btn) =>
      btn
        .setButtonText("Create Idea")
        .setCta()
        .onClick(() => {
          if (!this.title.trim()) {
            return;
          }

          const paths = this.meetingPaths
            .split(",")
            .map((p) => p.trim())
            .filter((p) => p.length > 0);

          this.onSubmit(this.title.trim(), paths);
          this.close();
        })
    );
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
