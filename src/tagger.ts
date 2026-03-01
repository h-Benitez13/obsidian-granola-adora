import { GranolaNote, ExtractedTags } from "./types";

/**
 * Auto-tagger — extracts structured metadata from Granola meeting notes.
 *
 * Extracts:
 * - Customer / company mentions (matched against known list + heuristics)
 * - Topic / product area tags (matched against known list)
 * - Action items (lines starting with action-item patterns)
 * - People mentioned (from attendees + content parsing)
 */
export class AutoTagger {
  private knownCustomers: Set<string>;
  private knownTopics: Set<string>;

  constructor(knownCustomers: string[], knownTopics: string[]) {
    this.knownCustomers = new Set(knownCustomers.map((c) => c.toLowerCase().trim()));
    this.knownTopics = new Set(knownTopics.map((t) => t.toLowerCase().trim()));
  }

  updateKnownCustomers(customers: string[]): void {
    this.knownCustomers = new Set(customers.map((c) => c.toLowerCase().trim()));
  }

  updateKnownTopics(topics: string[]): void {
    this.knownTopics = new Set(topics.map((t) => t.toLowerCase().trim()));
  }

  /**
   * Extract all tags from a Granola note.
   */
  extract(note: GranolaNote): ExtractedTags {
    const content = this.getSearchableContent(note);
    const contentLower = content.toLowerCase();

    return {
      customers: this.extractCustomers(contentLower, note),
      topics: this.extractTopics(contentLower),
      actionItems: this.extractActionItems(content),
      people: this.extractPeople(note)
    };
  }

  // ─── Private Extraction Methods ───────────────────────────────────

  private extractCustomers(contentLower: string, note: GranolaNote): string[] {
    const found: Set<string> = new Set();

    // Match against known customer list
    for (const customer of this.knownCustomers) {
      if (contentLower.includes(customer)) {
        found.add(customer);
      }
    }

    // Also check attendee email domains (skip common providers)
    const commonDomains = new Set([
      "gmail.com",
      "outlook.com",
      "hotmail.com",
      "yahoo.com",
      "icloud.com",
      "me.com",
      "live.com",
      "adora.ai"
    ]);

    for (const attendee of note.attendees) {
      const domain = attendee.email.split("@")[1];
      if (domain && !commonDomains.has(domain)) {
        const companyName = domain.split(".")[0];
        found.add(companyName);
      }
    }

    if (note.calendar_event) {
      for (const invitee of note.calendar_event.invitees) {
        const domain = invitee.email.split("@")[1];
        if (domain && !commonDomains.has(domain)) {
          const companyName = domain.split(".")[0];
          found.add(companyName);
        }
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

      // Match common action item patterns
      if (
        /^[-*]\s*\[[ x]\]\s+/i.test(trimmed) || // - [ ] task or - [x] task
        /^(action item|todo|to-do|follow[- ]?up|next step)s?:/i.test(trimmed) ||
        /^[-*]\s*(action|todo|follow[- ]?up):/i.test(trimmed)
      ) {
        const cleaned = trimmed
          .replace(/^[-*]\s*\[[ x]\]\s+/i, "")
          .replace(/^(action item|todo|to-do|follow[- ]?up|next step)s?:\s*/i, "")
          .replace(/^[-*]\s*(action|todo|follow[- ]?up):\s*/i, "")
          .trim();

        if (cleaned.length > 0) {
          actionItems.push(cleaned);
        }
      }
    }

    return actionItems;
  }

  private extractPeople(note: GranolaNote): string[] {
    const people: Set<string> = new Set();

    // Owner
    if (note.owner.name) {
      people.add(note.owner.name);
    }

    // Attendees
    for (const attendee of note.attendees) {
      if (attendee.name) {
        people.add(attendee.name);
      }
    }

    // Calendar invitees
    if (note.calendar_event) {
      for (const invitee of note.calendar_event.invitees) {
        if (invitee.name) {
          people.add(invitee.name);
        }
      }
    }

    return [...people];
  }

  private getSearchableContent(note: GranolaNote): string {
    const parts: string[] = [];

    if (note.title) parts.push(note.title);
    if (note.summary_markdown) parts.push(note.summary_markdown);
    if (note.summary_text) parts.push(note.summary_text);

    if (note.calendar_event?.event_title) {
      parts.push(note.calendar_event.event_title);
    }

    return parts.join("\n\n");
  }
}
