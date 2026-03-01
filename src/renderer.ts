import {
  GranolaDocument,
  ExtractedTags,
  getAttendeeName,
  getAttendeeCompany,
} from "./types";

const HORIZONTAL_RULE = "\n---\n";

export function renderMeetingNote(
  doc: GranolaDocument,
  tags: ExtractedTags,
  includeTranscript: boolean,
): string {
  const parts: string[] = [];

  parts.push(renderFrontmatter(doc, tags));
  parts.push(renderHeader(doc));
  parts.push(renderAttendees(doc));
  parts.push(renderSummary(doc));

  if (tags.actionItems.length > 0) {
    parts.push(renderActionItems(tags.actionItems));
  }

  if (tags.customers.length > 0 || tags.topics.length > 0) {
    parts.push(renderTagsSection(tags));
  }

  if (includeTranscript && doc.transcript && doc.transcript.length > 0) {
    parts.push(renderTranscript(doc));
  }

  return parts.join("\n");
}

function renderFrontmatter(doc: GranolaDocument, tags: ExtractedTags): string {
  const fm: Record<string, string | string[] | boolean | null> = {
    granola_id: doc.id,
    title: doc.title ?? "Untitled Meeting",
    date: doc.created_at,
    updated: doc.updated_at,
    type: "meeting",
  };

  if (doc.people?.creator?.name) {
    fm["owner"] = doc.people.creator.name;
  }

  if (doc.google_calendar_event?.start?.dateTime) {
    fm["scheduled_start"] = doc.google_calendar_event.start.dateTime;
  }
  if (doc.google_calendar_event?.end?.dateTime) {
    fm["scheduled_end"] = doc.google_calendar_event.end.dateTime;
  }

  const allTags = ["meeting", "granola"];
  for (const customer of tags.customers) {
    allTags.push(`customer/${sanitizeTag(customer)}`);
  }
  for (const topic of tags.topics) {
    allTags.push(`topic/${sanitizeTag(topic)}`);
  }
  fm["tags"] = allTags;

  if (tags.people.length > 0) {
    fm["people"] = tags.people;
  }

  if (tags.customers.length > 0) {
    fm["customers"] = tags.customers;
  }

  if (doc._listTitle) {
    fm["folder"] = doc._listTitle;
  }
  if (doc._shared) {
    fm["shared"] = true;
  }

  fm["synced"] = new Date().toISOString();

  const lines = ["---"];
  for (const [key, value] of Object.entries(fm)) {
    if (value === null || value === undefined) continue;

    if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - "${escapeYaml(String(item))}"`);
      }
    } else if (typeof value === "boolean") {
      lines.push(`${key}: ${value}`);
    } else {
      lines.push(`${key}: "${escapeYaml(String(value))}"`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

function renderHeader(doc: GranolaDocument): string {
  const title = doc.title ?? "Untitled Meeting";
  const lines: string[] = [`\n# ${title}\n`];

  if (doc.google_calendar_event?.start?.dateTime) {
    const start = new Date(doc.google_calendar_event.start.dateTime);
    const dateStr = start.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const timeStr = start.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
    lines.push(`> ${dateStr} at ${timeStr}\n`);
  }

  return lines.join("\n");
}

function renderAttendees(doc: GranolaDocument): string {
  const attendees = doc.people?.attendees ?? [];
  if (attendees.length === 0) return "";

  const lines: string[] = ["## Attendees\n"];
  for (const person of attendees) {
    const name = getAttendeeName(person);
    const company = getAttendeeCompany(person);
    if (company) {
      lines.push(`- [[${name}]] (${person.email}) — ${company}`);
    } else {
      lines.push(`- [[${name}]] (${person.email})`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function renderSummary(doc: GranolaDocument): string {
  const lines: string[] = ["## Notes\n"];

  if (doc.notes_markdown) {
    lines.push(doc.notes_markdown);
  } else if (doc.overview) {
    lines.push(doc.overview);
  } else if (doc.summary) {
    lines.push(doc.summary);
  } else if (doc.notes_plain) {
    lines.push(doc.notes_plain);
  } else {
    lines.push("*No notes available.*");
  }

  lines.push("");
  return lines.join("\n");
}

function renderActionItems(actionItems: string[]): string {
  const lines: string[] = ["## Action Items\n"];
  for (const item of actionItems) {
    lines.push(`- [ ] ${item}`);
  }
  lines.push("");
  return lines.join("\n");
}

function renderTagsSection(tags: ExtractedTags): string {
  const lines: string[] = [HORIZONTAL_RULE, "## Related\n"];

  if (tags.customers.length > 0) {
    lines.push(
      "**Customers:** " +
        tags.customers.map((c) => `[[Customers/${c}|${c}]]`).join(", "),
    );
  }

  if (tags.topics.length > 0) {
    lines.push(
      "**Topics:** " +
        tags.topics.map((t) => `#topic/${sanitizeTag(t)}`).join(" "),
    );
  }

  lines.push("");
  return lines.join("\n");
}

function renderTranscript(doc: GranolaDocument): string {
  if (!doc.transcript || doc.transcript.length === 0) return "";

  const lines: string[] = [HORIZONTAL_RULE, "## Transcript\n"];

  for (const entry of doc.transcript) {
    const speaker = entry.source === "microphone" ? "You" : "Participant";
    const time = new Date(entry.start_timestamp).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    lines.push(`**${speaker}** (${time}): ${entry.text}`);
    lines.push("");
  }

  return lines.join("\n");
}

export function renderIdeaNote(
  title: string,
  linkedMeetingPaths: string[],
  initialContent?: string,
): string {
  const fm = [
    "---",
    `title: "${escapeYaml(title)}"`,
    `created: "${new Date().toISOString()}"`,
    `type: "idea"`,
    `status: "draft"`,
    `tags:`,
    `  - "idea"`,
    `---`,
  ];

  const body = [
    `\n# ${title}\n`,
    "## Context\n",
    initialContent ?? "*Describe the idea here...*",
    "",
    "## Origin Meetings\n",
    ...linkedMeetingPaths.map((p) => `- [[${p}]]`),
    "",
    "## Development\n",
    "*How should this idea evolve? What are the next steps?*",
    "",
    "## Open Questions\n",
    "- ",
    "",
  ];

  return [...fm, ...body].join("\n");
}

export function renderCustomerNote(customerName: string): string {
  const fm = [
    "---",
    `title: "${escapeYaml(customerName)}"`,
    `created: "${new Date().toISOString()}"`,
    `type: "customer"`,
    `tags:`,
    `  - "customer"`,
    `---`,
  ];

  const body = [
    `\n# ${customerName}\n`,
    "## Overview\n",
    "*Add customer details here...*",
    "",
    "## Meeting History\n",
    "```dataview",
    `TABLE date as "Date", title as "Meeting"`,
    `FROM "Adora/Meetings"`,
    `WHERE contains(customers, "${escapeYaml(customerName)}")`,
    `SORT date DESC`,
    "```",
    "",
    "## Feedback & Requests\n",
    "- ",
    "",
  ];

  return [...fm, ...body].join("\n");
}

function sanitizeTag(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-_/]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeYaml(input: string): string {
  return input.replace(/"/g, '\\"').replace(/\n/g, " ");
}

export function sanitizeFileName(name: string): string {
  return name
    .replace(/[<>:"/\\|?*]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 80);
}
