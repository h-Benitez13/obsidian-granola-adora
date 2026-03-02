import { requestUrl } from "obsidian";
import { LinearIssue, LinearProject } from "./types";

const LINEAR_API = "https://api.linear.app/graphql";

const ISSUE_FIELDS = `
  id
  identifier
  title
  description
  state { name type color }
  priority
  priorityLabel
  assignee { name email }
  project { name }
  labels { nodes { name color } }
  createdAt
  updatedAt
`;

interface ViewerResponse {
  viewer: { id: string; name: string; email: string };
}

interface IssuesResponse {
  issues: { nodes: LinearIssue[] };
}

interface ProjectsResponse {
  projects: { nodes: LinearProject[] };
}

export class LinearClient {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async testConnection(): Promise<boolean> {
    try {
      const data = await this.graphql<ViewerResponse>(
        `query { viewer { id name email } }`,
      );
      return !!data.viewer?.id;
    } catch {
      return false;
    }
  }

  async fetchMyIssues(): Promise<LinearIssue[]> {
    const query = `query {
      issues(
        filter: {
          assignee: { isMe: { eq: true } }
          state: { type: { nin: ["completed", "cancelled"] } }
        }
        first: 100
        orderBy: updatedAt
      ) {
        nodes { ${ISSUE_FIELDS} }
      }
    }`;
    const data = await this.graphql<IssuesResponse>(query);
    return data.issues.nodes;
  }

  async fetchTeamIssues(): Promise<LinearIssue[]> {
    const query = `query {
      issues(
        filter: {
          state: { type: { nin: ["completed", "cancelled"] } }
        }
        first: 200
        orderBy: updatedAt
      ) {
        nodes { ${ISSUE_FIELDS} }
      }
    }`;
    const data = await this.graphql<IssuesResponse>(query);
    return data.issues.nodes;
  }

  async fetchProjects(): Promise<LinearProject[]> {
    const query = `query {
      projects(
        filter: {
          state: { type: { in: ["started", "planned"] } }
        }
        first: 50
      ) {
        nodes {
          id
          name
          description
          state
          icon
          color
          progress
          lead { name email }
          startDate
          targetDate
        }
      }
    }`;
    const data = await this.graphql<ProjectsResponse>(query);
    return data.projects.nodes;
  }

  private async graphql<T>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T> {
    const response = await requestUrl({
      url: LINEAR_API,
      method: "POST",
      headers: {
        Authorization: this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    });
    if (response.status >= 400) {
      throw new Error(`Linear API error ${response.status}: ${response.text}`);
    }
    return response.json.data as T;
  }
}
