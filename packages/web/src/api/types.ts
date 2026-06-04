export interface User {
  id: number;
  username: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  llmProvider?: string | null;
  llmModel?: string | null;
  hasLlmApiKey?: boolean;
}

export interface Site {
  id: number;
  userId: number;
  name: string;
  description: string;
  slug: string;
  backgroundImage?: string | null;
  backgroundColor: string;
  fontColor: string;
  searchUrlTemplate: string;
  localSearchFirst: boolean;
  settings?: Record<string, unknown>;
}

export interface Folder {
  id: number;
  userId: number;
  parentId?: number | null;
  name: string;
  icon?: string | null;
  description?: string | null;
  sortOrder: number;
  passwordHint?: string | null;
  locked?: boolean;
  links?: Link[];
}

export interface Link {
  id: number;
  folderId: number;
  name: string;
  url: string;
  icon?: string | null;
  description?: string | null;
  sortOrder: number;
}

export interface NavigationPayload {
  site: Site & { user?: User };
  folders: Folder[];
}

export interface SessionPayload {
  authenticated: boolean;
  setupRequired: boolean;
  user: User | null;
}

export interface BookmarkImportPreview {
  summary: {
    parsedFolders: number;
    parsedLinks: number;
    newFolders: number;
    newLinks: number;
    duplicateLinks: number;
    invalidLinks: number;
  };
  folders: Array<{ tempId: string; parentTempId: string | null; name: string; status: 'new' }>;
  links: Array<{ name: string; url: string; folderTempId: string | null; status: 'new' | 'duplicate' | 'invalid'; reason?: string }>;
}

export interface DuplicateLinkGroup {
  url: string;
  links: Link[];
}

export interface BulkLinkResult {
  moved?: number;
  deleted?: number;
}
