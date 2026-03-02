import { requestUrl } from "obsidian";
import { GoogleDriveFile } from "./types";

const GOOGLE_DRIVE_API = "https://www.googleapis.com/drive/v3";
const GOOGLE_OAUTH_TOKEN_API = "https://oauth2.googleapis.com/token";
const GOOGLE_DOCS_MIME_TYPE = "application/vnd.google-apps.document";

interface DriveListResponse {
  files?: GoogleDriveFile[];
  nextPageToken?: string;
}

interface OAuthRefreshResponse {
  access_token: string;
}

export class GoogleDriveClient {
  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;
  private accessToken: string;

  constructor(
    clientId: string,
    clientSecret: string,
    refreshToken: string,
    accessToken: string,
  ) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.refreshToken = refreshToken;
    this.accessToken = accessToken;
  }

  getAccessToken(): string {
    return this.accessToken;
  }

  async testConnection(folderId: string): Promise<boolean> {
    try {
      await this.fetchGoogleDocsInFolder(folderId, 1);
      return true;
    } catch {
      return false;
    }
  }

  async fetchGoogleDocsInFolder(
    folderId: string,
    maxFiles: number = 100,
  ): Promise<GoogleDriveFile[]> {
    const results: GoogleDriveFile[] = [];
    let pageToken: string | undefined;

    while (results.length < maxFiles) {
      const remaining = maxFiles - results.length;
      const pageSize = Math.min(remaining, 100);
      const query = `'${folderId}' in parents and mimeType='${GOOGLE_DOCS_MIME_TYPE}' and trashed=false`;

      const params = new URLSearchParams({
        q: query,
        pageSize: String(pageSize),
        fields:
          "nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink)",
        includeItemsFromAllDrives: "true",
        supportsAllDrives: "true",
      });
      if (pageToken) {
        params.set("pageToken", pageToken);
      }

      const response = await this.requestWithRefresh<DriveListResponse>(
        `${GOOGLE_DRIVE_API}/files?${params.toString()}`,
      );
      if (response.files && response.files.length > 0) {
        results.push(...response.files);
      }

      pageToken = response.nextPageToken;
      if (!pageToken) {
        break;
      }
    }

    return results.slice(0, maxFiles);
  }

  async exportAsPlainText(fileId: string): Promise<string> {
    const params = new URLSearchParams({ mimeType: "text/plain" });
    return this.requestTextWithRefresh(
      `${GOOGLE_DRIVE_API}/files/${encodeURIComponent(fileId)}/export?${params.toString()}`,
    );
  }

  private async requestWithRefresh<T>(url: string): Promise<T> {
    try {
      return await this.requestJson<T>(url);
    } catch (err) {
      if (!this.isAuthError(err)) {
        throw err;
      }
      await this.refreshAccessToken();
      return this.requestJson<T>(url);
    }
  }

  private async requestTextWithRefresh(url: string): Promise<string> {
    try {
      return await this.requestText(url);
    } catch (err) {
      if (!this.isAuthError(err)) {
        throw err;
      }
      await this.refreshAccessToken();
      return this.requestText(url);
    }
  }

  private async requestJson<T>(url: string): Promise<T> {
    const response = await requestUrl({
      url,
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (response.status >= 400) {
      throw new Error(`Google Drive API error ${response.status}: ${response.text}`);
    }
    return response.json as T;
  }

  private async requestText(url: string): Promise<string> {
    const response = await requestUrl({
      url,
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (response.status >= 400) {
      throw new Error(`Google Drive export error ${response.status}: ${response.text}`);
    }
    return response.text;
  }

  private async refreshAccessToken(): Promise<void> {
    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      throw new Error(
        "Google Drive access token expired and refresh credentials are missing.",
      );
    }

    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken,
      grant_type: "refresh_token",
    });

    const response = await requestUrl({
      url: GOOGLE_OAUTH_TOKEN_API,
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (response.status >= 400) {
      throw new Error(
        `Google OAuth token refresh failed ${response.status}: ${response.text}`,
      );
    }

    const data = response.json as OAuthRefreshResponse;
    if (!data.access_token) {
      throw new Error("Google OAuth token refresh response did not include access_token.");
    }

    this.accessToken = data.access_token;
  }

  private isAuthError(err: unknown): boolean {
    if (!(err instanceof Error)) {
      return false;
    }
    return /401|403/.test(err.message);
  }
}
