import { GranolaNote, ExtractedTags } from "./types";

const HORIZONTAL_RULE = "\n---\n";

export function renderMeetingNote(note: GranolaNote, tags: ExtractedTags, includeTranscript: boolean): string {
  const parts: string[] = [];

  parts.push(renderFrontmatter(note, tags));
  parts.push(renderHeader(note));
  parts.push(renderAttendees(note));
  parts.push(renderSummary(note));

  if (tags.actionItems.length > 0) {
    parts.push(renderActionItems(tags.actionItems));
  }

  if (tags.customers.length > 0 || tags.topics.length > 0) {
    parts.push(renderTagsSection(tags));
  }

  if (includeTranscript && note.transcript && note.transcript.length > 0) {
    parts.push(renderTranscript(note));
  }

  return parts.join("\n");
}

function renderFrontmatter(note: GranolaNote, tags: ExtractedTags): string {
  const fm: Record<string, string | string[] | boolean | null> = {
    granola_id: note.id,
    title: note.title ?? "Untitled Meeting",
    date: note.created_at,
    updated: note.updated_at,
    type: "meeting"
  };

  if (note.owner.name) {
    fm["owner"] = note.owner.name;
  }

  if (note.calendar_event?.scheduled_start_time) {
    fm["scheduled_start"] = note.calendar_event.scheduled_start_time;
  }
  if (note.calendar_event?.scheduled_end_time) {
    fm["scheduled_end"] = note.calendar_event.scheduled_end_time;
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

  if (note.folder_membership.length > 0) {
    fm["granola_folders"] = note.folder_membership.map((f) => f.name);
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

function renderHeader(note: GranolaNote): string {
  const title = note.title ?? "Untitled Meeting";
  const lines: string[] = [`\n# ${title}\n`];

  if (note.calendar_event) {
    const event = note.calendar_event;
    if (event.scheduled_start_time) {
      const start = new Date(event.scheduled_start_time);
      const dateStr = start.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
      });
      const timeStr = start.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit"
      });
      lines.push(`> ${dateStr} at ${timeStr}\n`);
    }
  }

  return lines.join("\n");
}

function renderAttendees(note: GranolaNote): string {
  const attendees = note.attendees;
  if (attendees.length === 0) return "";

  const lines: string[] = ["## Attendees\n"];
  for (const person of attendees) {
    const name = person.name ?? person.email;
    const link = `[[${name}]]`;
    lines.push(`- ${link} (${person.email})`);
  }
  lines.push("");
  return lines.join("\n");
}

function renderSummary(note: GranolaNote): string {
  const lines: string[] = ["## Summary\n"];

  if (note.summary_markdown) {
    lines.push(note.summary_markdown);
  } else if (note.summary_text) {
    lines.push(note.summary_text);
  } else {
    lines.push("*No summary available.*");
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
    lines.push("**Customers:** " + tags.customers.map((c) => `[[Customers/${c}|${c}]]`).join(", "));
  }

  if (tags.topics.length > 0) {
    lines.push("**Topics:** " + tags.topics.map((t) => `#topic/${sanitizeTag(t)}`).join(" "));
  }

  lines.push("");
  return lines.join("\n");
}

function renderTranscript(note: GranolaNote): string {
  if (!note.transcript || note.transcript.length === 0) return "";

  const lines: string[] = [HORIZONTAL_RULE, "## Transcript\n"];

  for (const entry of note.transcript) {
    const speaker = entry.speaker.source === "microphone" ? "You" : "Participant";
    const time = new Date(entry.start_time).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    lines.push(`**${speaker}** (${time}): ${entry.text}`);
    lines.push("");
  }

  return lines.join("\n");
}

export function renderIdeaNote(title: string, linkedMeetingPaths: string[], initialContent?: string): string {
  const fm = [
    "---",
    `title: "${escapeYaml(title)}"`,
    `created: "${new Date().toISOString()}"`,
    `type: "idea"`,
    `status: "draft"`,
    `tags:`,
    `  - "idea"`,
    `---`
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
    ""
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
    `---`
  ];

  const body = [
    `\n# ${customerName}\n`,
    "## Overview\n",
    "*Add customer details here...*",
    "",
    "## Meeting History\n",
    `\`\`\`dataview`,
    `TABLE date as "Date", title as "Meeting"`,
    `FROM "Adora/Meetings"`,
    `WHERE contains(customers, "${escapeYaml(customerName)}")`,
    `SORT date DESC`,
    `\`\`\``,
    "",
    "## Feedback & Requests\n",
    "- ",
    "",
    "## Notes\n",
    ""
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
