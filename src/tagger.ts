import { GranolaDocument, ExtractedTags, getAttendeeName } from "./types";

export class AutoTagger {
  private knownCustomers: Set<string>;
  private knownTopics: Set<string>;

  constructor(knownCustomers: string[], knownTopics: string[]) {
    this.knownCustomers = new Set(
      knownCustomers.map((c) => c.toLowerCase().trim()),
    );
    this.knownTopics = new Set(knownTopics.map((t) => t.toLowerCase().trim()));
  }

  updateKnownCustomers(customers: string[]): void {
    this.knownCustomers = new Set(customers.map((c) => c.toLowerCase().trim()));
  }

  updateKnownTopics(topics: string[]): void {
    this.knownTopics = new Set(topics.map((t) => t.toLowerCase().trim()));
  }

  extract(doc: GranolaDocument): ExtractedTags {
    const content = this.getSearchableContent(doc);
    const contentLower = content.toLowerCase();

    return {
      customers: this.extractCustomers(contentLower, doc),
      topics: this.extractTopics(contentLower),
      actionItems: this.extractActionItems(content),
      people: this.extractPeople(doc),
    };
  }

  private extractCustomers(
    contentLower: string,
    doc: GranolaDocument,
  ): string[] {
    const found: Set<string> = new Set();

    for (const customer of this.knownCustomers) {
      if (contentLower.includes(customer)) {
        found.add(customer);
      }
    }

    const commonDomains = new Set([
      "gmail.com",
      "outlook.com",
      "hotmail.com",
      "yahoo.com",
      "icloud.com",
      "me.com",
      "live.com",
      "adora-ai.com",
    ]);

    const attendees = doc.people?.attendees ?? [];
    for (const attendee of attendees) {
      const domain = attendee.email.split("@")[1];
      if (domain && !commonDomains.has(domain)) {
        found.add(domain.split(".")[0]);
      }
    }

    return [...found];
  }

  private extractTopics(contentLower: string): string[] {
    const found: Set<string> = new Set();
    for (const topic of this.knownTopics) {
      if (contentLower.includes(topic)) {
        found.add(topic);
      }
    }
    return [...found];
  }

  private extractActionItems(content: string): string[] {
    const actionItems: string[] = [];
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();
      if (
        /^[-*]\s*\[[ x]\]\s+/i.test(trimmed) ||
        /^(action item|todo|to-do|follow[- ]?up|next step)s?:/i.test(trimmed) ||
        /^[-*]\s*(action|todo|follow[- ]?up):/i.test(trimmed)
      ) {
        const cleaned = trimmed
          .replace(/^[-*]\s*\[[ x]\]\s+/i, "")
          .replace(
            /^(action item|todo|to-do|follow[- ]?up|next step)s?:\s*/i,
            "",
          )
          .replace(/^[-*]\s*(action|todo|follow[- ]?up):\s*/i, "")
          .trim();

        if (cleaned.length > 0) {
          actionItems.push(cleaned);
        }
      }
    }

    return actionItems;
  }

  private extractPeople(doc: GranolaDocument): string[] {
    const people: Set<string> = new Set();

    if (doc.people?.creator?.name) {
      people.add(doc.people.creator.name);
    }

    for (const attendee of doc.people?.attendees ?? []) {
      people.add(getAttendeeName(attendee));
    }

    return [...people];
  }

  private getSearchableContent(doc: GranolaDocument): string {
    const parts: string[] = [];
    if (doc.title) parts.push(doc.title);
    if (doc.notes_markdown) parts.push(doc.notes_markdown);
    if (doc.overview) parts.push(doc.overview);
    if (doc.summary) parts.push(doc.summary);
    if (doc.google_calendar_event?.summary) {
      parts.push(doc.google_calendar_event.summary);
    }
    return parts.join("\n\n");
  }
}
