export interface User {
  id: number;
  username: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  llmProvider?: string | null;
  llmModel?: string | null;
  llmBaseUrl?: string | null;
  llmReasoningEffort?: 'none' | 'low' | 'medium' | 'high' | null;
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

export interface PortalSettings {
  enabled: boolean;
  url: string;
  label: string;
  imageUrl: string;
  openInNewTab: boolean;
}

export interface NavigationEntry {
  id: string;
  label: string;
  url: string;
  icon: string;
  enabled: boolean;
  openInNewTab: boolean;
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
  healthStatus?: 'ok' | 'redirected' | 'broken' | 'timeout' | 'invalid' | null;
  healthStatusCode?: number | null;
  healthReason?: string | null;
  healthFinalUrl?: string | null;
  healthCheckedAt?: string | null;
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
    ignoredFolders: number;
    ignoredLinks: number;
  };
  folders: Array<{ tempId: string; parentTempId: string | null; name: string; status: 'new' }>;
  links: Array<{ tempId: string; name: string; url: string; folderTempId: string | null; status: 'new' | 'duplicate' | 'invalid'; reason?: string }>;
}

export interface DuplicateLinkGroup {
  url: string;
  links: Link[];
}

export interface BulkLinkResult {
  moved?: number;
  deleted?: number;
}

export interface LinkHealthResult {
  id: number;
  name: string;
  url: string;
  status: 'ok' | 'redirected' | 'broken' | 'timeout' | 'invalid';
  statusCode?: number;
  finalUrl?: string;
  reason?: string;
  checkedAt: string;
}

export interface LinkHealthSummary {
  total: number;
  ok: number;
  redirected: number;
  broken: number;
  timeout: number;
  invalid: number;
}

export interface ApiToken {
  id: number;
  name: string;
  token: string;
  expiresAt?: string | null;
  createdAt: string;
}

export interface ApiTokenSummary {
  total: number;
  active: number;
  expired: number;
  neverExpires: number;
  expiringSoon: number;
}

export type AdminNotificationSource = 'nodesk' | 'nomoney' | 'nostar' | 'links' | 'backup';
export type AdminNotificationSeverity = 'info' | 'warning' | 'critical';

export interface AdminNotification {
  key: string;
  source: AdminNotificationSource;
  severity: AdminNotificationSeverity;
  title: string;
  description: string;
  href: string;
  occurredAt: string;
  dueAt: string | null;
  read: boolean;
}

export interface AdminNotificationFeed {
  items: AdminNotification[];
  unreadCount: number;
  generatedAt: string;
}

export type AuditResult = 'success' | 'failure';

export interface AuditLogEntry {
  id: number;
  actorUserId?: number | null;
  actorUsername: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  resourceLabel?: string | null;
  result: AuditResult;
  statusCode: number;
  ipAddress?: string | null;
  userAgent?: string | null;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogPage {
  items: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditSettings {
  id: number;
  retentionDays: number;
  createdAt: string;
  updatedAt: string;
  removed?: number;
}
