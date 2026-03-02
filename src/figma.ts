import { requestUrl } from "obsidian";
import { FigmaProject, FigmaFile } from "./types";

const FIGMA_API = "https://api.figma.com";

interface FigmaUserResponse {
  id: string;
  handle: string;
  img_url: string;
  email: string;
}

interface FigmaTeamProjectsResponse {
  projects: FigmaProject[];
}

interface FigmaProjectFileEntry {
  key: string;
  name: string;
  thumbnail_url: string;
  last_modified: string;
}

interface FigmaProjectFilesResponse {
  files: FigmaProjectFileEntry[];
}

interface FigmaFileMetaResponse {
  thumbnailUrl: string;
  lastModified: string;
  name: string;
  version: string;
}

export class FigmaClient {
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.get<FigmaUserResponse>("/v1/me");
      return true;
    } catch {
      return false;
    }
  }

  async fetchTeamProjects(teamId: string): Promise<FigmaProject[]> {
    const data = await this.get<FigmaTeamProjectsResponse>(
      `/v1/teams/${teamId}/projects`,
    );
    return data.projects ?? [];
  }

  async fetchProjectFiles(projectId: string): Promise<FigmaFile[]> {
    const data = await this.get<FigmaProjectFilesResponse>(
      `/v1/projects/${projectId}/files`,
    );
    return (data.files ?? []).map((f: FigmaProjectFileEntry) => ({
      key: f.key,
      name: f.name,
      thumbnail_url: f.thumbnail_url,
      last_modified: f.last_modified,
      project_name: "",
    }));
  }

  async fetchFileMeta(
    fileKey: string,
  ): Promise<{ thumbnailUrl: string; lastModified: string }> {
    const data = await this.get<FigmaFileMetaResponse>(
      `/v1/files/${fileKey}?depth=1`,
    );
    return {
      thumbnailUrl: data.thumbnailUrl ?? "",
      lastModified: data.lastModified ?? "",
    };
  }

  private async get<T>(path: string): Promise<T> {
    const response = await requestUrl({
      url: `${FIGMA_API}${path}`,
      method: "GET",
      headers: {
        "X-Figma-Token": this.token,
      },
    });
    if (response.status >= 400) {
      throw new Error(`Figma API error ${response.status}: ${response.text}`);
    }
    return response.json as T;
  }
}
