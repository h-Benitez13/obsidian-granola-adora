export interface GranolaDocument {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  notes_markdown: string | null;
  notes_plain: string | null;
  overview: string | null;
  summary: string | null;
  people: GranolaPeople | null;
  google_calendar_event: GranolaCalendarEvent | null;
  transcript: GranolaTranscriptEntry[] | null;
}

export interface GranolaPeople {
  creator: GranolaPerson | null;
  attendees: GranolaPerson[];
}

export interface GranolaPerson {
  name: string | null;
  email: string;
}

export interface GranolaCalendarEvent {
  id: string | null;
  summary: string | null;
  start?: string | null;
  end?: string | null;
}

export interface GranolaTranscriptEntry {
  document_id: string;
  start_timestamp: string;
  end_timestamp: string;
  text: string;
  source: "microphone" | "speaker";
  id: string;
  is_final: boolean;
}

export interface GranolaListResponse {
  docs: GranolaDocument[];
  next_cursor: string | null;
}

export interface GranolaAdoraSettings {
  syncIntervalMinutes: number;
  syncOnStartup: boolean;
  baseFolderPath: string;
  meetingsFolderName: string;
  ideasFolderName: string;
  customersFolderName: string;
  prioritiesFolderName: string;
  includeTranscript: boolean;
  autoTagEnabled: boolean;
  knownCustomers: string[];
  knownTopics: string[];
  lastSyncTimestamp: string | null;
  syncedDocIds: string[];
}

export const DEFAULT_SETTINGS: GranolaAdoraSettings = {
  syncIntervalMinutes: 30,
  syncOnStartup: true,
  baseFolderPath: "Adora",
  meetingsFolderName: "Meetings",
  ideasFolderName: "Ideas",
  customersFolderName: "Customers",
  prioritiesFolderName: "Priorities",
  includeTranscript: false,
  autoTagEnabled: true,
  knownCustomers: [],
  knownTopics: [],
  lastSyncTimestamp: null,
  syncedDocIds: []
};

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

export interface ExtractedTags {
  customers: string[];
  topics: string[];
  actionItems: string[];
  people: string[];
}
