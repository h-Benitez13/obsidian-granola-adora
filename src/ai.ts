import { requestUrl } from "obsidian";

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";

interface ClaudeResponse {
  content: { type: string; text: string }[];
}

export class AICortex {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async generateCustomerPrepBrief(
    customerName: string,
    meetingSummaries: string[],
  ): Promise<string> {
    const truncated = meetingSummaries
      .slice(0, 10)
      .map((s) => this.truncate(s))
      .join("\n\n---\n\n");

    return this.callClaude(
      "You are a customer intelligence analyst for Adora AI, a Seattle-based SaaS startup with 17 people. You help the team prepare for customer meetings by synthesizing past interactions into actionable briefs. Output clean markdown.",
      `Customer: ${customerName}\n\nRecent meeting notes with this customer:\n\n${truncated}\n\nGenerate a customer prep brief with these sections:\n## Relationship Summary\nBrief overview of the relationship history and current status.\n\n## Recent Discussion Topics\nKey topics from recent meetings.\n\n## Open Items & Action Items\nAnything unresolved or pending.\n\n## Suggested Talking Points\nRecommended topics for the next conversation.`,
    );
  }

  async generateWeeklyDigest(
    meetingSummaries: string[],
    issuesSummary: string,
  ): Promise<string> {
    const truncated = meetingSummaries
      .slice(0, 15)
      .map((s) => this.truncate(s))
      .join("\n\n---\n\n");

    const issuesBlock = issuesSummary
      ? `\n\nActive engineering issues:\n${this.truncate(issuesSummary, 4000)}`
      : "";

    return this.callClaude(
      "You are a company intelligence analyst for Adora AI, a Seattle-based SaaS startup with 17 people. Synthesize the week's activity into a concise, actionable digest for the whole team. Output clean markdown.",
      `This week's meeting notes:\n\n${truncated}${issuesBlock}\n\nGenerate a weekly digest with these sections:\n## Key Themes\nMain topics and patterns from this week.\n\n## Customer Activity\nSummary of customer interactions and sentiment.\n\n## Action Items\nPending tasks and follow-ups.\n\n## New Ideas & Opportunities\nAny new ideas or opportunities surfaced.\n\n## Team Highlights\nNotable contributions or wins.`,
    );
  }

  async detectThemes(meetingSummaries: string[]): Promise<string> {
    const truncated = meetingSummaries
      .slice(0, 20)
      .map((s) => this.truncate(s))
      .join("\n\n---\n\n");

    return this.callClaude(
      "You are a pattern detection analyst for Adora AI, a Seattle-based SaaS startup. Analyze meeting content to surface recurring themes and emerging patterns. Output clean markdown.",
      `Recent meeting notes:\n\n${truncated}\n\nAnalyze these meetings and generate a theme report with:\n## Recurring Themes\nTopics that come up repeatedly.\n\n## Emerging Patterns\nNew trends or shifts in conversation.\n\n## Customer Sentiment\nOverall tone and satisfaction indicators.\n\n## Feature Requests\nProduct features or improvements mentioned.\n\n## Risks & Concerns\nPotential issues to watch.`,
    );
  }

  async extractIdeas(meetingContent: string): Promise<string> {
    return this.callClaude(
      "You are a product strategist for Adora AI, a Seattle-based SaaS startup. Extract actionable ideas from meeting notes. Output clean markdown as a numbered list.",
      `Meeting content:\n\n${this.truncate(meetingContent, 12000)}\n\nExtract all actionable ideas, product suggestions, feature requests, and process improvements. For each idea, provide:\n- A clear title\n- Brief description\n- Potential impact (high/medium/low)\n\nFormat as a numbered list.`,
    );
  }

  private truncate(content: string, maxChars: number = 8000): string {
    if (content.length <= maxChars) return content;
    return (
      content.substring(0, maxChars) +
      "\n\n[... content truncated for analysis ...]"
    );
  }

  private async callClaude(
    systemPrompt: string,
    userContent: string,
  ): Promise<string> {
    const response = await requestUrl({
      url: ANTHROPIC_API,
      method: "POST",
      headers: {
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (response.status >= 400) {
      throw new Error(`Claude API error ${response.status}: ${response.text}`);
    }

    const data = response.json as ClaudeResponse;
    return data.content?.[0]?.text ?? "";
  }
}
