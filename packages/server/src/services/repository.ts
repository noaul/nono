import { randomUUID } from 'node:crypto';
import { generateApiToken, generateSessionToken, hashApiToken, hashSessionToken } from '../utils/crypto.js';
import type { Role } from '../types.js';

export interface UserRecord {
  id: number;
  username: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: Role;
  llmProvider?: string | null;
  llmApiKey?: string | null;
  llmModel?: string | null;
  llmBaseUrl?: string | null;
  llmReasoningEffort?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SiteRecord {
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
  guestAccessEnabled: boolean;
  guestAccessPasswordHash?: string | null;
  settings: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface FolderRecord {
  id: number;
  userId: number;
  parentId?: number | null;
  name: string;
  icon?: string | null;
  description?: string | null;
  sortOrder: number;
  passwordHash?: string | null;
  passwordHint?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface LinkRecord {
  id: number;
  folderId: number;
  name: string;
  url: string;
  icon?: string | null;
  description?: string | null;
  sortOrder: number;
  healthCheckEnabled?: boolean;
  healthStatus?: LinkHealthStatus | null;
  healthStatusCode?: number | null;
  healthReason?: string | null;
  healthFinalUrl?: string | null;
  healthCheckedAt?: Date | null;
  clickCount?: number;
  lastClickedAt?: Date | null;
  readLaterAt?: Date | null;
  readAt?: Date | null;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface TagSummary {
  name: string;
  count: number;
}

export const MAX_TAGS_PER_LINK = 20;
export const MAX_TAG_LENGTH = 32;

/** Trims, drops empties and case-insensitive repeats (first spelling wins), and caps the list. */
export function normalizeTags(values: readonly string[]) {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const value of values) {
    const tag = String(value).trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH);
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
    if (tags.length === MAX_TAGS_PER_LINK) break;
  }
  return tags;
}

export type ReadingStatus = 'unread' | 'read';

export interface ReadingListOptions {
  status: ReadingStatus;
  limit: number;
  offset: number;
}

export interface ReadingListPage {
  /** Unread: newest queued first. Read: most recently finished first. */
  items: LinkRecord[];
  total: number;
  unread: number;
}

export interface LinkSearchOptions {
  limit: number;
  /** Restrict to these folders; omit to search every folder the user owns. */
  folderIds?: number[];
}

export type LinkSearchHit = LinkRecord & { score: number };

export function linkSearchTerms(query: string) {
  return [...new Set(query.toLowerCase().split(/\s+/).filter(Boolean))].slice(0, 8);
}

export interface BookmarkImportFolder {
  /** Plan-local key; children reference their parent's key, so parents must come first. */
  key: string;
  parentKey: string | null;
  name: string;
  icon: string;
  sortOrder: number;
}

export interface BookmarkImportLink {
  /** Either a folder created by this import (folderKey) or an existing owned folder (folderId). */
  folderKey?: string | null;
  folderId?: number | null;
  name: string;
  url: string;
  icon: string;
  description: string;
  sortOrder: number;
}

export interface BookmarkImportPlan {
  folders: BookmarkImportFolder[];
  links: BookmarkImportLink[];
}

export type TrashItemKind = 'bookmark' | 'folder' | 'notab';

export interface TrashItemRecord {
  id: string;
  userId: number;
  kind: TrashItemKind;
  entityId: number;
  label: string;
  payload: Record<string, unknown>;
  deletedAt: Date;
}

export type TrashItemSummary = Omit<TrashItemRecord, 'payload'>;

export interface TrashListOptions {
  limit: number;
  /** Opaque cursor from a previous page's nextCursor. */
  cursor?: string | null;
}

export interface TrashItemPage {
  items: TrashItemSummary[];
  nextCursor: string | null;
  total: number;
}

export function encodeTrashCursor(item: { deletedAt: Date; id: string }) {
  return Buffer.from(JSON.stringify([item.deletedAt.toISOString(), item.id])).toString('base64url');
}

export function decodeTrashCursor(cursor: string) {
  try {
    const [deletedAt, id] = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const date = new Date(deletedAt);
    if (typeof id === 'string' && id && !Number.isNaN(date.getTime())) return { deletedAt: date, id };
  } catch {
    // Falls through to the 400 below.
  }
  throw Object.assign(new Error('Invalid trash cursor'), { statusCode: 400 });
}

export type LinkHealthStatus = 'ok' | 'redirected' | 'restricted' | 'broken' | 'timeout' | 'invalid';

export interface LinkHealthUpdate {
  id: number;
  url: string;
  status: LinkHealthStatus;
  statusCode?: number | null;
  reason?: string | null;
  finalUrl?: string | null;
  checkedAt: Date;
}

export interface ApiTokenRecord {
  id: number;
  userId: number;
  tokenHash: string;
  tokenPrefix: string;
  name: string;
  scopes: string[];
  expiresAt?: Date | null;
  lastUsedAt?: Date | null;
  createdAt: Date;
}

export interface CreatedApiTokenRecord extends ApiTokenRecord {
  token: string;
}

export interface AuthSessionRecord {
  id: string;
  userId: number;
  tokenHash: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  lastSeenAt: Date;
  expiresAt: Date;
  createdAt: Date;
}

export interface CreatedAuthSessionRecord extends AuthSessionRecord {
  token: string;
}

export interface PasskeyCredentialRecord {
  id: string;
  userId: number;
  name: string;
  publicKey: Uint8Array;
  counter: bigint;
  transports: string[];
  deviceType: string;
  backedUp: boolean;
  lastUsedAt?: Date | null;
  createdAt: Date;
}

export interface WebAuthnChallengeRecord {
  id: string;
  userId?: number | null;
  challenge: string;
  type: 'registration' | 'authentication';
  expiresAt: Date;
  createdAt: Date;
}

export interface AppConfigRecord {
  id: number;
  allowRegistration: boolean;
  defaultRole: Role;
  settings: Record<string, unknown>;
  initializedAt?: Date | null;
}

export type BackupCadence = 'daily' | 'weekly';

export interface BackupAutomationRecord {
  id: number;
  enabled: boolean;
  cadence: BackupCadence;
  hour: number;
  weekday: number;
  retentionDays: number;
  maxBackups: number;
  lastScheduledFor?: string | null;
  lastStartedAt?: Date | null;
  lastCompletedAt?: Date | null;
  lastSuccessAt?: Date | null;
  lastFailureAt?: Date | null;
  lastError?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type AuditResult = 'success' | 'failure';

export interface AuditConfigRecord {
  id: number;
  retentionDays: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuditLogRecord {
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
  createdAt: Date;
}

export interface AuditLogQuery {
  page: number;
  pageSize: number;
  actor?: string;
  action?: string;
  resourceType?: string;
  result?: AuditResult;
  search?: string;
  from?: Date;
  to?: Date;
}

export interface AuditLogPage {
  items: AuditLogRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export type MobileBookmarkOutcome = 'created' | 'existing';

export interface MobileBookmarkRequestRecord {
  id: number;
  userId: number;
  requestId: string;
  contentHash: string;
  linkId: number | null;
  outcome: MobileBookmarkOutcome;
  createdAt: Date;
}

export interface MobileBookmarkSaveInput {
  requestId: string;
  contentHash: string;
  folderId: number;
  link: Omit<LinkRecord, 'id' | 'folderId' | 'createdAt' | 'updatedAt'>;
}

/**
 * `saved`: this call claimed the requestId and either created the bookmark or found the URL already
 * bookmarked. `claimed`: another call already holds the requestId (seen before or lost the race on the
 * unique key); the caller reads the stored request and replays it.
 */
export type MobileBookmarkSaveResult =
  | { status: 'saved'; outcome: MobileBookmarkOutcome; link: LinkRecord }
  | { status: 'claimed' };

export interface Repository {
  getConfig(): Promise<AppConfigRecord>;
  updateConfig(input: Partial<AppConfigRecord>): Promise<AppConfigRecord>;
  getBackupAutomation(): Promise<BackupAutomationRecord>;
  updateBackupAutomation(input: Partial<BackupAutomationRecord>): Promise<BackupAutomationRecord>;
  getAuditConfig(): Promise<AuditConfigRecord>;
  updateAuditConfig(input: Partial<AuditConfigRecord>): Promise<AuditConfigRecord>;
  createAuditLog(input: Omit<AuditLogRecord, 'id' | 'createdAt'>): Promise<AuditLogRecord>;
  listAuditLogs(query: AuditLogQuery): Promise<AuditLogPage>;
  deleteAuditLogsBefore(cutoff: Date): Promise<number>;
  listUsers(): Promise<UserRecord[]>;
  initializeAdmin(input: Omit<UserRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserRecord>;
  findUserById(id: number): Promise<UserRecord | null>;
  findUserByUsername(username: string): Promise<UserRecord | null>;
  findUserByEmail(email: string): Promise<UserRecord | null>;
  createUser(input: Omit<UserRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<UserRecord>;
  updateUser(id: number, input: Partial<UserRecord>): Promise<UserRecord>;
  deleteUser(id: number): Promise<void>;
  getSite(userId: number): Promise<SiteRecord | null>;
  getSiteBySlug(slug: string): Promise<(SiteRecord & { user: UserRecord }) | null>;
  updateSite(userId: number, input: Partial<SiteRecord>): Promise<SiteRecord>;
  listFolders(userId: number): Promise<FolderRecord[]>;
  getFolder(userId: number, id: number): Promise<FolderRecord | null>;
  createFolder(input: Omit<FolderRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<FolderRecord>;
  updateFolder(userId: number, id: number, input: Partial<FolderRecord>): Promise<FolderRecord>;
  reorderFolders(userId: number, ids: number[]): Promise<void>;
  deleteFolder(userId: number, id: number): Promise<void>;
  deleteFolders(userId: number, ids: number[]): Promise<void>;
  /** Writes a whole import or nothing. */
  importBookmarkPlan(userId: number, plan: BookmarkImportPlan): Promise<{ folders: number; links: number }>;
  listLinks(userId: number): Promise<LinkRecord[]>;
  getLink(userId: number, id: number): Promise<LinkRecord | null>;
  /** Owned links among `ids`, in display order; ids the user does not own are dropped. */
  getLinksByIds(userId: number, ids: number[]): Promise<LinkRecord[]>;
  listFolderLinks(userId: number, folderId: number): Promise<LinkRecord[]>;
  /** Oldest owned link whose URL equals the normalized `url` exactly (see duplicateUrlKey). */
  findLinkByUrl(userId: number, url: string): Promise<LinkRecord | null>;
  listReadingLinks(userId: number, options: ReadingListOptions): Promise<ReadingListPage>;
  /** Every tag the user has used, most used first. */
  listTags(userId: number): Promise<TagSummary[]>;
  /** Owned links carrying `tag` (exact spelling). */
  listLinksWithTag(userId: number, tag: string): Promise<LinkRecord[]>;
  /** Every whitespace-separated term must appear in the name, URL or description; best matches first. */
  searchLinks(userId: number, query: string, options: LinkSearchOptions): Promise<LinkSearchHit[]>;
  createLink(input: Omit<LinkRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<LinkRecord>;
  updateLink(userId: number, id: number, input: Partial<LinkRecord>): Promise<LinkRecord>;
  updateLinkHealth(userId: number, updates: LinkHealthUpdate[]): Promise<void>;
  recordLinkClick(userId: number, id: number): Promise<boolean>;
  reorderLinks(userId: number, ids: number[]): Promise<void>;
  moveLink(userId: number, id: number, targetFolderId: number, sourceIds: number[], targetIds: number[]): Promise<LinkRecord>;
  deleteLink(userId: number, id: number): Promise<void>;
  deleteLinks(userId: number, ids: number[]): Promise<void>;
  /** Newest first, ordered by (deletedAt, id) descending; payloads are not loaded. */
  listTrashItems(userId: number, options: TrashListOptions): Promise<TrashItemPage>;
  restoreTrashItem(userId: number, id: string): Promise<TrashItemRecord>;
  permanentlyDeleteTrashItem(userId: number, id: string): Promise<TrashItemSummary>;
  emptyTrash(userId: number): Promise<number>;
  /** Retention purge across every user. */
  purgeTrashBefore(cutoff: Date): Promise<number>;
  listTokens(userId: number): Promise<ApiTokenRecord[]>;
  createToken(userId: number, name: string, expiresAt?: Date | null, scopes?: string[]): Promise<CreatedApiTokenRecord>;
  findToken(token: string): Promise<(ApiTokenRecord & { user: UserRecord }) | null>;
  /** Records a use of the token; callers throttle, so this always writes. */
  touchToken(id: number): Promise<void>;
  // Amends scopes in place. The stored secret is untouched, so a token with amended scopes does
  // not have to be reissued and reconfigured in the extension.
  updateTokenScopes(userId: number, id: number, scopes: string[]): Promise<ApiTokenRecord | null>;
  deleteToken(userId: number, id: number): Promise<void>;
  createSession(userId: number, input: { userAgent?: string | null; ipAddress?: string | null; expiresAt: Date }): Promise<CreatedAuthSessionRecord>;
  findSession(token: string): Promise<(AuthSessionRecord & { user: UserRecord }) | null>;
  listSessions(userId: number): Promise<AuthSessionRecord[]>;
  touchSession(id: string): Promise<void>;
  deleteSession(userId: number, id: string): Promise<void>;
  deleteOtherSessions(userId: number, currentId?: string | null): Promise<void>;
  listPasskeys(userId: number): Promise<PasskeyCredentialRecord[]>;
  findPasskey(id: string): Promise<(PasskeyCredentialRecord & { user: UserRecord }) | null>;
  createPasskey(input: Omit<PasskeyCredentialRecord, 'createdAt' | 'lastUsedAt'>): Promise<PasskeyCredentialRecord>;
  updatePasskeyCounter(userId: number, id: string, counter: bigint): Promise<void>;
  deletePasskey(userId: number, id: string): Promise<void>;
  createWebAuthnChallenge(input: Omit<WebAuthnChallengeRecord, 'id' | 'createdAt'>): Promise<WebAuthnChallengeRecord>;
  consumeWebAuthnChallenge(id: string, type: WebAuthnChallengeRecord['type'], userId: number | null): Promise<WebAuthnChallengeRecord | null>;
  findMobileBookmarkRequest(userId: number, requestId: string): Promise<MobileBookmarkRequestRecord | null>;
  /** One transaction: claim (userId, requestId), check folder ownership, reuse a same-URL bookmark or create one. */
  saveMobileBookmark(userId: number, input: MobileBookmarkSaveInput): Promise<MobileBookmarkSaveResult>;
}

export function publicUser(user: UserRecord) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    llmProvider: user.llmProvider,
    llmModel: user.llmModel,
    llmBaseUrl: user.llmBaseUrl,
    llmReasoningEffort: user.llmReasoningEffort,
    hasLlmApiKey: Boolean(user.llmApiKey),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function defaultBackupAutomation(): BackupAutomationRecord {
  const now = new Date();
  return {
    id: 1,
    enabled: false,
    cadence: 'daily',
    hour: 3,
    weekday: 0,
    retentionDays: 30,
    maxBackups: 7,
    lastScheduledFor: null,
    lastStartedAt: null,
    lastCompletedAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  };
}

function defaultAuditConfig(): AuditConfigRecord {
  const now = new Date();
  return { id: 1, retentionDays: 180, createdAt: now, updatedAt: now };
}

export class MemoryRepository implements Repository {
  users: UserRecord[] = [];
  sites: SiteRecord[] = [];
  folders: FolderRecord[] = [];
  links: LinkRecord[] = [];
  trashItems: TrashItemRecord[] = [];
  tokens: ApiTokenRecord[] = [];
  sessions: AuthSessionRecord[] = [];
  passkeys: PasskeyCredentialRecord[] = [];
  webAuthnChallenges: WebAuthnChallengeRecord[] = [];
  auditLogs: AuditLogRecord[] = [];
  mobileBookmarkRequests: MobileBookmarkRequestRecord[] = [];
  config: AppConfigRecord = { id: 1, allowRegistration: false, defaultRole: 'user', settings: {}, initializedAt: null };
  backupAutomation: BackupAutomationRecord = defaultBackupAutomation();
  auditConfig: AuditConfigRecord = defaultAuditConfig();

  constructor(seed = true) {
    if (seed) this.seed();
  }

  async getConfig() {
    return this.config;
  }

  async findMobileBookmarkRequest(userId: number, requestId: string) {
    return this.mobileBookmarkRequests.find((item) => item.userId === userId && item.requestId === requestId) || null;
  }

  async saveMobileBookmark(userId: number, input: MobileBookmarkSaveInput): Promise<MobileBookmarkSaveResult> {
    // No await before the claim is pushed, so concurrent calls behave like the unique key in PostgreSQL.
    if (this.mobileBookmarkRequests.some((item) => item.userId === userId && item.requestId === input.requestId)) return { status: 'claimed' };
    const folder = this.folders.find((item) => item.userId === userId && item.id === input.folderId);
    if (!folder) throw Object.assign(new Error('Folder not found'), { statusCode: 404 });
    const userFolderIds = new Set(this.folders.filter((item) => item.userId === userId).map((item) => item.id));
    const existing = this.links
      .filter((link) => userFolderIds.has(link.folderId) && link.url === input.link.url)
      .sort((a, b) => a.id - b.id)[0];
    const now = new Date();
    const link: LinkRecord = existing || { ...input.link, folderId: folder.id, healthCheckEnabled: input.link.healthCheckEnabled ?? true, clickCount: 0, id: nextId(this.links), createdAt: now, updatedAt: now };
    if (!existing) this.links.push(link);
    const outcome: MobileBookmarkOutcome = existing ? 'existing' : 'created';
    this.mobileBookmarkRequests.push({ id: nextId(this.mobileBookmarkRequests), userId, requestId: input.requestId, contentHash: input.contentHash, linkId: link.id, outcome, createdAt: now });
    return { status: 'saved', outcome, link };
  }

  async updateConfig(input: Partial<AppConfigRecord>) {
    this.config = { ...this.config, ...input, id: 1 };
    return this.config;
  }

  async getBackupAutomation() {
    return this.backupAutomation;
  }

  async updateBackupAutomation(input: Partial<BackupAutomationRecord>) {
    this.backupAutomation = { ...this.backupAutomation, ...input, id: 1, updatedAt: new Date() };
    return this.backupAutomation;
  }

  async getAuditConfig() {
    return this.auditConfig;
  }

  async updateAuditConfig(input: Partial<AuditConfigRecord>) {
    this.auditConfig = { ...this.auditConfig, ...input, id: 1, updatedAt: new Date() };
    return this.auditConfig;
  }

  async createAuditLog(input: Omit<AuditLogRecord, 'id' | 'createdAt'>) {
    const record: AuditLogRecord = { ...input, id: nextId(this.auditLogs), createdAt: new Date() };
    this.auditLogs.unshift(record);
    return record;
  }

  async listAuditLogs(query: AuditLogQuery) {
    const actor = query.actor?.toLocaleLowerCase();
    const search = query.search?.toLocaleLowerCase();
    const items = this.auditLogs
      .filter((item) => !actor || item.actorUsername.toLocaleLowerCase().includes(actor))
      .filter((item) => !query.action || item.action === query.action)
      .filter((item) => !query.resourceType || item.resourceType === query.resourceType)
      .filter((item) => !query.result || item.result === query.result)
      .filter((item) => !query.from || item.createdAt >= query.from)
      .filter((item) => !query.to || item.createdAt <= query.to)
      .filter((item) => !search || [item.actorUsername, item.resourceLabel, item.resourceId, item.ipAddress]
        .some((value) => String(value || '').toLocaleLowerCase().includes(search)))
      .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime() || right.id - left.id);
    const start = (query.page - 1) * query.pageSize;
    return { items: items.slice(start, start + query.pageSize), total: items.length, page: query.page, pageSize: query.pageSize };
  }

  async deleteAuditLogsBefore(cutoff: Date) {
    const initialCount = this.auditLogs.length;
    this.auditLogs = this.auditLogs.filter((item) => item.createdAt >= cutoff);
    return initialCount - this.auditLogs.length;
  }

  async listUsers() {
    return [...this.users];
  }

  async initializeAdmin(input: Omit<UserRecord, 'id' | 'createdAt' | 'updatedAt'>) {
    if (this.config.initializedAt) throw Object.assign(new Error('Admin is already initialized'), { statusCode: 409 });
    const existingAdmin = this.users.find((user) => user.role === 'admin' && user.passwordHash);
    if (existingAdmin) throw Object.assign(new Error('Admin is already initialized'), { statusCode: 409 });

    const existing = this.users.find((user) => user.username === input.username) || this.users[0];
    if (existing) {
      Object.assign(existing, input, { updatedAt: new Date() });
      this.config.initializedAt = new Date();
      return existing;
    }
    const created = await this.createUser(input);
    this.config.initializedAt = new Date();
    return created;
  }

  async findUserById(id: number) {
    return this.users.find((user) => user.id === id) || null;
  }

  async findUserByUsername(username: string) {
    return this.users.find((user) => user.username === username) || null;
  }

  async findUserByEmail(email: string) {
    return this.users.find((user) => user.email === email) || null;
  }

  async createUser(input: Omit<UserRecord, 'id' | 'createdAt' | 'updatedAt'>) {
    const now = new Date();
    const user = { ...input, id: nextId(this.users), createdAt: now, updatedAt: now };
    this.users.push(user);
    this.sites.push(defaultSite(user.id, user.username));
    return user;
  }

  async updateUser(id: number, input: Partial<UserRecord>) {
    const user = await this.requiredUser(id);
    if (user.role === 'admin' && input.role === 'user' && this.users.filter((item) => item.role === 'admin').length <= 1) {
      throw Object.assign(new Error('The last administrator cannot be demoted'), { statusCode: 409 });
    }
    Object.assign(user, input, { updatedAt: new Date() });
    return user;
  }

  async deleteUser(id: number) {
    const user = await this.requiredUser(id);
    if (user.role === 'admin' && this.users.filter((item) => item.role === 'admin').length <= 1) {
      throw Object.assign(new Error('The last administrator cannot be deleted'), { statusCode: 409 });
    }
    this.auditLogs.forEach((entry) => {
      if (entry.actorUserId === id) entry.actorUserId = null;
    });
    this.users = this.users.filter((user) => user.id !== id);
    this.sites = this.sites.filter((site) => site.userId !== id);
    this.folders = this.folders.filter((folder) => folder.userId !== id);
    this.trashItems = this.trashItems.filter((item) => item.userId !== id);
    const folderIds = new Set(this.folders.map((folder) => folder.id));
    this.links = this.links.filter((link) => folderIds.has(link.folderId));
    this.tokens = this.tokens.filter((token) => token.userId !== id);
    this.sessions = this.sessions.filter((session) => session.userId !== id);
    this.passkeys = this.passkeys.filter((passkey) => passkey.userId !== id);
    this.webAuthnChallenges = this.webAuthnChallenges.filter((challenge) => challenge.userId !== id);
  }

  async getSite(userId: number) {
    return this.sites.find((site) => site.userId === userId) || null;
  }

  async getSiteBySlug(slug: string) {
    const site = this.sites.find((item) => item.slug === slug);
    if (!site) return null;
    const user = await this.findUserById(site.userId);
    return user ? { ...site, user } : null;
  }

  async updateSite(userId: number, input: Partial<SiteRecord>) {
    let site = await this.getSite(userId);
    if (!site) {
      site = defaultSite(userId, input.slug || `user-${userId}`);
      this.sites.push(site);
    }
    Object.assign(site, input, { id: site.id, userId, updatedAt: new Date() });
    return site;
  }

  async listFolders(userId: number) {
    return this.folders.filter((folder) => folder.userId === userId).sort(sortOrder);
  }

  async getFolder(userId: number, id: number) {
    return this.folders.find((folder) => folder.userId === userId && folder.id === id) || null;
  }

  async createFolder(input: Omit<FolderRecord, 'id' | 'createdAt' | 'updatedAt'>) {
    const now = new Date();
    const folder = { ...input, id: nextId(this.folders), createdAt: now, updatedAt: now };
    this.folders.push(folder);
    return folder;
  }

  async updateFolder(userId: number, id: number, input: Partial<FolderRecord>) {
    const folder = await this.requiredFolder(userId, id);
    Object.assign(folder, input, { updatedAt: new Date() });
    return folder;
  }

  async reorderFolders(userId: number, ids: number[]) {
    const folders = await this.listFolders(userId);
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    if (ids.some((id) => !byId.has(id))) throw Object.assign(new Error('Folder not found'), { statusCode: 404 });
    const now = new Date();
    ids.forEach((id, index) => Object.assign(byId.get(id)!, { sortOrder: (ids.length - index) * 10, updatedAt: now }));
  }

  async deleteFolder(userId: number, id: number) {
    await this.deleteFolders(userId, [id]);
  }

  async deleteFolders(userId: number, rootIds: number[]) {
    const all = await this.listFolders(userId);
    const roots = topLevelFolderIds(all, rootIds);
    const ids = new Set<number>();
    for (const rootId of roots) {
      const folderIds = new Set(collectFolderIds(all, rootId));
      const root = all.find((folder) => folder.id === rootId);
      if (!root) continue;
      const folders = this.folders.filter((folder) => folderIds.has(folder.id));
      const links = this.links.filter((link) => folderIds.has(link.folderId));
      this.trashItems.unshift({
        id: randomUUID(),
        userId,
        kind: root.parentId ? 'folder' : 'notab',
        entityId: root.id,
        label: root.name,
        payload: { folders: cloneTrashValue(folders), links: cloneTrashValue(links) },
        deletedAt: new Date(),
      });
      folderIds.forEach((folderId) => ids.add(folderId));
    }
    this.folders = this.folders.filter((folder) => !ids.has(folder.id));
    this.links = this.links.filter((link) => !ids.has(link.folderId));
  }

  async importBookmarkPlan(userId: number, plan: BookmarkImportPlan) {
    const folders = [...this.folders];
    const links = [...this.links];
    try {
      const idByKey = new Map<string, number>();
      for (const item of plan.folders) {
        const parentId = item.parentKey ? idByKey.get(item.parentKey) : null;
        if (parentId === undefined) throw new Error(`Import folder ${item.parentKey} is not created before its children`);
        const folder = await this.createFolder({ userId, parentId, name: item.name, icon: item.icon, description: '', sortOrder: item.sortOrder, passwordHash: null, passwordHint: null });
        idByKey.set(item.key, folder.id);
      }
      for (const item of plan.links) {
        await this.createLink({ ...importLinkFields(item), folderId: resolveImportFolderId(item, idByKey) });
      }
    } catch (error) {
      this.folders = folders;
      this.links = links;
      throw error;
    }
    return { folders: plan.folders.length, links: plan.links.length };
  }

  async listLinks(userId: number) {
    const folderIds = new Set((await this.listFolders(userId)).map((folder) => folder.id));
    return this.links.filter((link) => folderIds.has(link.folderId)).sort(sortOrder);
  }

  async getLink(userId: number, id: number) {
    const link = this.links.find((item) => item.id === id);
    return link && await this.getFolder(userId, link.folderId) ? link : null;
  }

  async getLinksByIds(userId: number, ids: number[]) {
    if (!ids.length) return [];
    const wanted = new Set(ids);
    const folderIds = new Set((await this.listFolders(userId)).map((folder) => folder.id));
    return this.links.filter((link) => wanted.has(link.id) && folderIds.has(link.folderId)).sort(sortOrder);
  }

  async listFolderLinks(userId: number, folderId: number) {
    if (!await this.getFolder(userId, folderId)) return [];
    return this.links.filter((link) => link.folderId === folderId).sort(sortOrder);
  }

  async findLinkByUrl(userId: number, url: string) {
    return (await this.listLinks(userId)).filter((link) => link.url === url).sort((a, b) => a.id - b.id)[0] || null;
  }

  async searchLinks(userId: number, query: string, options: LinkSearchOptions) {
    const terms = linkSearchTerms(query);
    if (!terms.length) return [];
    const phrase = query.trim().toLowerCase();
    const allowed = options.folderIds ? new Set(options.folderIds) : null;
    return (await this.listLinks(userId))
      .filter((link) => !allowed || allowed.has(link.folderId))
      .map((link) => ({ link, haystack: `${link.name}\n${link.url}\n${link.description || ''}`.toLowerCase() }))
      .filter(({ haystack }) => terms.every((term) => haystack.includes(term)))
      .map(({ link, haystack }) => ({
        ...link,
        score: (link.name.toLowerCase().startsWith(phrase) ? 1 : 0) + (haystack.includes(phrase) ? 0.5 : 0),
      }))
      .sort((a, b) => b.score - a.score || (b.clickCount || 0) - (a.clickCount || 0) || a.id - b.id)
      .slice(0, options.limit);
  }

  async listTags(userId: number) {
    const counts = new Map<string, number>();
    for (const link of await this.listLinks(userId)) {
      for (const tag of link.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
    }
    return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  async listLinksWithTag(userId: number, tag: string) {
    return (await this.listLinks(userId)).filter((link) => link.tags?.includes(tag));
  }

  async listReadingLinks(userId: number, options: ReadingListOptions) {
    const queued = (await this.listLinks(userId)).filter((link) => link.readLaterAt);
    const unreadLinks = queued.filter((link) => !link.readAt);
    const matching = options.status === 'unread'
      ? unreadLinks.sort((a, b) => b.readLaterAt!.getTime() - a.readLaterAt!.getTime() || b.id - a.id)
      : queued.filter((link) => link.readAt).sort((a, b) => b.readAt!.getTime() - a.readAt!.getTime() || b.id - a.id);
    return { items: matching.slice(options.offset, options.offset + options.limit), total: matching.length, unread: unreadLinks.length };
  }

  async createLink(input: Omit<LinkRecord, 'id' | 'createdAt' | 'updatedAt'>) {
    const now = new Date();
    const link = { ...input, healthCheckEnabled: input.healthCheckEnabled ?? true, clickCount: input.clickCount ?? 0, id: nextId(this.links), createdAt: now, updatedAt: now };
    this.links.push(link);
    return link;
  }

  async updateLink(userId: number, id: number, input: Partial<LinkRecord>) {
    const link = await this.requiredLink(userId, id);
    Object.assign(link, input, { updatedAt: new Date() });
    return link;
  }

  async updateLinkHealth(userId: number, updates: LinkHealthUpdate[]) {
    const links = await this.listLinks(userId);
    const byId = new Map(links.map((link) => [link.id, link]));
    if (updates.some((update) => !byId.has(update.id))) throw Object.assign(new Error('Link not found'), { statusCode: 404 });
    for (const update of updates) {
      const link = byId.get(update.id)!;
      if (link.url !== update.url) continue;
      Object.assign(link, {
        healthStatus: update.status,
        healthStatusCode: update.statusCode ?? null,
        healthReason: update.reason ?? null,
        healthFinalUrl: update.finalUrl ?? null,
        healthCheckedAt: update.checkedAt,
      });
    }
  }

  async recordLinkClick(userId: number, id: number) {
    const link = (await this.listLinks(userId)).find((item) => item.id === id);
    if (!link) return false;
    link.clickCount = (link.clickCount || 0) + 1;
    link.lastClickedAt = new Date();
    return true;
  }

  async reorderLinks(userId: number, ids: number[]) {
    const links = await this.listLinks(userId);
    const byId = new Map(links.map((link) => [link.id, link]));
    if (ids.some((id) => !byId.has(id))) throw Object.assign(new Error('Link not found'), { statusCode: 404 });
    const now = new Date();
    ids.forEach((id, index) => Object.assign(byId.get(id)!, { sortOrder: (ids.length - index) * 10, updatedAt: now }));
  }

  async moveLink(userId: number, id: number, targetFolderId: number, sourceIds: number[], targetIds: number[]) {
    const link = await this.requiredLink(userId, id);
    await this.requiredFolder(userId, targetFolderId);
    if (link.folderId === targetFolderId) throw Object.assign(new Error('Bookmark already belongs to target folder'), { statusCode: 400 });

    const links = await this.listLinks(userId);
    const expectedSourceIds = links.filter((item) => item.folderId === link.folderId && item.id !== id).map((item) => item.id);
    const expectedTargetIds = [...links.filter((item) => item.folderId === targetFolderId).map((item) => item.id), id];
    assertExactIds(sourceIds, expectedSourceIds);
    assertExactIds(targetIds, expectedTargetIds);

    const byId = new Map(links.map((item) => [item.id, item]));
    const now = new Date();
    Object.assign(link, { folderId: targetFolderId, updatedAt: now });
    sourceIds.forEach((linkId, index) => Object.assign(byId.get(linkId)!, { sortOrder: (sourceIds.length - index) * 10, updatedAt: now }));
    targetIds.forEach((linkId, index) => Object.assign(byId.get(linkId)!, { sortOrder: (targetIds.length - index) * 10, updatedAt: now }));
    return link;
  }

  async deleteLink(userId: number, id: number) {
    await this.deleteLinks(userId, [id]);
  }

  async deleteLinks(userId: number, ids: number[]) {
    const owned = await this.getLinksByIds(userId, ids);
    for (const link of owned) {
      this.trashItems.unshift({
        id: randomUUID(),
        userId,
        kind: 'bookmark',
        entityId: link.id,
        label: link.name,
        payload: { link: cloneTrashValue(link) },
        deletedAt: new Date(),
      });
    }
    const deletedIds = new Set(owned.map((link) => link.id));
    this.links = this.links.filter((item) => !deletedIds.has(item.id));
  }

  async listTrashItems(userId: number, options: TrashListOptions) {
    const after = options.cursor ? decodeTrashCursor(options.cursor) : null;
    const owned = this.trashItems
      .filter((item) => item.userId === userId)
      .sort((left, right) => right.deletedAt.getTime() - left.deletedAt.getTime() || (right.id < left.id ? -1 : right.id > left.id ? 1 : 0));
    const rows = owned
      .filter((item) => !after || item.deletedAt < after.deletedAt || (item.deletedAt.getTime() === after.deletedAt.getTime() && item.id < after.id))
      .slice(0, options.limit + 1)
      .map(({ payload: _payload, ...summary }) => summary);
    return trashPage(rows, options.limit, owned.length);
  }

  async restoreTrashItem(userId: number, id: string) {
    const item = this.trashItems.find((entry) => entry.userId === userId && entry.id === id);
    if (!item) throw Object.assign(new Error('Trash item not found'), { statusCode: 404 });
    if (item.kind === 'bookmark') {
      const link = reviveLinkRecord((item.payload as { link?: unknown }).link);
      if (!await this.getFolder(userId, link.folderId)) throw Object.assign(new Error('Restore the original folder first'), { statusCode: 409 });
      if (this.links.some((entry) => entry.id === link.id)) throw Object.assign(new Error('Bookmark already exists'), { statusCode: 409 });
      this.links.push(link);
    } else {
      const folders = reviveFolderRecords((item.payload as { folders?: unknown }).folders);
      const links = reviveLinkRecords((item.payload as { links?: unknown }).links);
      const root = folders.find((folder) => folder.id === item.entityId);
      if (!root) throw Object.assign(new Error('Invalid trash snapshot'), { statusCode: 409 });
      if (root.parentId && !await this.getFolder(userId, root.parentId)) throw Object.assign(new Error('Restore the parent NoTab first'), { statusCode: 409 });
      if (folders.some((folder) => this.folders.some((entry) => entry.id === folder.id))) throw Object.assign(new Error('Folder already exists'), { statusCode: 409 });
      if (links.some((link) => this.links.some((entry) => entry.id === link.id))) throw Object.assign(new Error('Bookmark already exists'), { statusCode: 409 });
      this.folders.push(...folders);
      this.links.push(...links);
    }
    this.trashItems = this.trashItems.filter((entry) => entry.id !== item.id);
    return item;
  }

  async permanentlyDeleteTrashItem(userId: number, id: string) {
    const item = this.trashItems.find((entry) => entry.userId === userId && entry.id === id);
    if (!item) throw Object.assign(new Error('Trash item not found'), { statusCode: 404 });
    this.trashItems = this.trashItems.filter((entry) => entry !== item);
    const { payload: _payload, ...summary } = item;
    return summary;
  }

  async emptyTrash(userId: number) {
    const count = this.trashItems.filter((item) => item.userId === userId).length;
    this.trashItems = this.trashItems.filter((item) => item.userId !== userId);
    return count;
  }

  async purgeTrashBefore(cutoff: Date) {
    const before = this.trashItems.length;
    this.trashItems = this.trashItems.filter((item) => item.deletedAt >= cutoff);
    return before - this.trashItems.length;
  }

  async listTokens(userId: number) {
    return this.tokens.filter((token) => token.userId === userId);
  }

  async createToken(userId: number, name: string, expiresAt?: Date | null, scopes: string[] = []) {
    const token = generateApiToken();
    const record = {
      id: nextId(this.tokens),
      userId,
      tokenHash: hashApiToken(token),
      tokenPrefix: token.slice(0, 10),
      name,
      scopes,
      expiresAt,
      createdAt: new Date(),
    };
    this.tokens.push(record);
    return { ...record, token };
  }

  async findToken(token: string) {
    const tokenHash = hashApiToken(token);
    const record = this.tokens.find((item) => item.tokenHash === tokenHash && (!item.expiresAt || item.expiresAt > new Date()));
    if (!record) return null;
    const user = await this.findUserById(record.userId);
    return user ? { ...record, user } : null;
  }

  async touchToken(id: number) {
    const record = this.tokens.find((item) => item.id === id);
    if (record) record.lastUsedAt = new Date();
  }

  async updateTokenScopes(userId: number, id: number, scopes: string[]) {
    const record = this.tokens.find((token) => token.userId === userId && token.id === id);
    if (!record) return null;
    record.scopes = scopes;
    return record;
  }

  async deleteToken(userId: number, id: number) {
    this.tokens = this.tokens.filter((token) => !(token.userId === userId && token.id === id));
  }

  async createSession(userId: number, input: { userAgent?: string | null; ipAddress?: string | null; expiresAt: Date }) {
    const token = generateSessionToken();
    const now = new Date();
    const record: AuthSessionRecord = {
      id: randomUUID(),
      userId,
      tokenHash: hashSessionToken(token),
      userAgent: input.userAgent || null,
      ipAddress: input.ipAddress || null,
      lastSeenAt: now,
      expiresAt: input.expiresAt,
      createdAt: now,
    };
    this.sessions.unshift(record);
    return { ...record, token };
  }

  async findSession(token: string) {
    const tokenHash = hashSessionToken(token);
    const record = this.sessions.find((session) => session.tokenHash === tokenHash && session.expiresAt > new Date());
    if (!record) return null;
    const user = await this.findUserById(record.userId);
    return user ? { ...record, user } : null;
  }

  async listSessions(userId: number) {
    return this.sessions.filter((session) => session.userId === userId && session.expiresAt > new Date());
  }

  async touchSession(id: string) {
    const session = this.sessions.find((item) => item.id === id);
    if (session) session.lastSeenAt = new Date();
  }

  async deleteSession(userId: number, id: string) {
    this.sessions = this.sessions.filter((session) => !(session.userId === userId && session.id === id));
  }

  async deleteOtherSessions(userId: number, currentId?: string | null) {
    this.sessions = this.sessions.filter((session) => session.userId !== userId || session.id === currentId);
  }

  async listPasskeys(userId: number) {
    return this.passkeys.filter((passkey) => passkey.userId === userId);
  }

  async findPasskey(id: string) {
    const passkey = this.passkeys.find((item) => item.id === id);
    if (!passkey) return null;
    const user = await this.findUserById(passkey.userId);
    return user ? { ...passkey, user } : null;
  }

  async createPasskey(input: Omit<PasskeyCredentialRecord, 'createdAt' | 'lastUsedAt'>) {
    if (this.passkeys.some((item) => item.id === input.id)) {
      throw Object.assign(new Error('Passkey already registered'), { statusCode: 409 });
    }
    const passkey: PasskeyCredentialRecord = { ...input, lastUsedAt: null, createdAt: new Date() };
    this.passkeys.unshift(passkey);
    return passkey;
  }

  async updatePasskeyCounter(userId: number, id: string, counter: bigint) {
    const passkey = this.passkeys.find((item) => item.userId === userId && item.id === id);
    if (passkey) Object.assign(passkey, { counter, lastUsedAt: new Date() });
  }

  async deletePasskey(userId: number, id: string) {
    this.passkeys = this.passkeys.filter((passkey) => !(passkey.userId === userId && passkey.id === id));
  }

  async createWebAuthnChallenge(input: Omit<WebAuthnChallengeRecord, 'id' | 'createdAt'>) {
    const challenge: WebAuthnChallengeRecord = { ...input, id: randomUUID(), createdAt: new Date() };
    this.webAuthnChallenges.push(challenge);
    return challenge;
  }

  async consumeWebAuthnChallenge(id: string, type: WebAuthnChallengeRecord['type'], userId: number | null) {
    const index = this.webAuthnChallenges.findIndex((item) => item.id === id && item.type === type && (item.userId ?? null) === userId && item.expiresAt > new Date());
    if (index < 0) return null;
    return this.webAuthnChallenges.splice(index, 1)[0] || null;
  }

  seed() {
    const now = new Date();
    const user: UserRecord = {
      id: 1,
      username: 'admin',
      email: 'admin@nono.local',
      displayName: 'NoNo Admin',
      passwordHash: '',
      role: 'admin',
      createdAt: now,
      updatedAt: now,
    };
    this.users = [user];
    this.sites = [defaultSite(1, 'admin')];
    this.folders = [
      { id: 1, userId: 1, parentId: null, name: '常用工具', icon: 'star', description: '', sortOrder: 100, createdAt: now, updatedAt: now },
      { id: 2, userId: 1, parentId: null, name: '开发资源', icon: 'code', description: '', sortOrder: 90, createdAt: now, updatedAt: now },
      { id: 3, userId: 1, parentId: null, name: 'AI 工具', icon: 'sparkles', description: '', sortOrder: 80, createdAt: now, updatedAt: now },
    ];
    this.links = [
      { id: 1, folderId: 1, name: 'GitHub', url: 'https://github.com/', icon: 'github', description: '', sortOrder: 100, createdAt: now, updatedAt: now },
      { id: 2, folderId: 1, name: 'MDN', url: 'https://developer.mozilla.org/', icon: 'book', description: '', sortOrder: 90, createdAt: now, updatedAt: now },
      { id: 3, folderId: 3, name: 'ChatGPT', url: 'https://chatgpt.com/', icon: 'message', description: '', sortOrder: 100, createdAt: now, updatedAt: now },
    ];
  }

  private async requiredUser(id: number) {
    const user = await this.findUserById(id);
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });
    return user;
  }

  private async requiredFolder(userId: number, id: number) {
    const folder = await this.getFolder(userId, id);
    if (!folder) throw Object.assign(new Error('Folder not found'), { statusCode: 404 });
    return folder;
  }

  private async requiredLink(userId: number, id: number) {
    const link = await this.getLink(userId, id);
    if (!link) throw Object.assign(new Error('Link not found'), { statusCode: 404 });
    return link;
  }
}

/** `rows` holds up to limit + 1 entries; the extra one only signals that another page exists. */
export function trashPage(rows: TrashItemSummary[], limit: number, total: number): TrashItemPage {
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit && items.length ? encodeTrashCursor(items[items.length - 1]) : null, total };
}

export function importLinkFields(item: BookmarkImportLink) {
  return { name: item.name, url: item.url, icon: item.icon, description: item.description, sortOrder: item.sortOrder };
}

export function resolveImportFolderId(item: BookmarkImportLink, idByKey: Map<string, number>) {
  const folderId = item.folderKey ? idByKey.get(item.folderKey) : item.folderId;
  if (!folderId) throw Object.assign(new Error('No target folder available'), { statusCode: 400 });
  return folderId;
}

export function nextId(items: Array<{ id: number }>) {
  return Math.max(0, ...items.map((item) => item.id)) + 1;
}

export function sortOrder(left: { sortOrder: number; id: number }, right: { sortOrder: number; id: number }) {
  return right.sortOrder - left.sortOrder || left.id - right.id;
}

export function defaultSite(userId: number, slug: string): SiteRecord {
  const now = new Date();
  return {
    id: userId,
    userId,
    name: 'NoNo',
    description: '一个可自托管的网址导航主页',
    slug,
    backgroundImage: 'https://api.dujin.org/bing/1920.php',
    backgroundColor: '#000000',
    fontColor: '#ffffff',
    searchUrlTemplate: 'https://www.google.com/search?q={query}',
    localSearchFirst: true,
    guestAccessEnabled: false,
    guestAccessPasswordHash: null,
    settings: {},
    createdAt: now,
    updatedAt: now,
  };
}

function collectFolderIds(folders: FolderRecord[], rootId: number) {
  const ids = new Set<number>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        changed = true;
      }
    }
  }
  return ids;
}

function topLevelFolderIds(folders: FolderRecord[], requestedIds: number[]) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const selected = new Set(requestedIds.filter((id) => byId.has(id)));
  return [...selected].filter((id) => {
    let parentId = byId.get(id)?.parentId ?? null;
    while (parentId) {
      if (selected.has(parentId)) return false;
      parentId = byId.get(parentId)?.parentId ?? null;
    }
    return true;
  });
}

function cloneTrashValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function reviveFolderRecords(value: unknown): FolderRecord[] {
  if (!Array.isArray(value)) throw Object.assign(new Error('Invalid trash snapshot'), { statusCode: 409 });
  return value.map((item) => {
    const record = item as FolderRecord;
    return { ...record, createdAt: new Date(record.createdAt), updatedAt: new Date(record.updatedAt) };
  });
}

function reviveLinkRecords(value: unknown): LinkRecord[] {
  if (!Array.isArray(value)) throw Object.assign(new Error('Invalid trash snapshot'), { statusCode: 409 });
  return value.map(reviveLinkRecord);
}

function reviveLinkRecord(value: unknown): LinkRecord {
  if (!value || typeof value !== 'object') throw Object.assign(new Error('Invalid trash snapshot'), { statusCode: 409 });
  const record = value as LinkRecord;
  return {
    ...record,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
    healthCheckedAt: record.healthCheckedAt ? new Date(record.healthCheckedAt) : null,
  };
}

function assertExactIds(actual: number[], expected: number[]) {
  if (actual.length !== expected.length || new Set(actual).size !== actual.length) {
    throw Object.assign(new Error('Bookmark order changed; reload and try again'), { statusCode: 409 });
  }
  const expectedIds = new Set(expected);
  if (actual.some((id) => !expectedIds.has(id))) {
    throw Object.assign(new Error('Bookmark order changed; reload and try again'), { statusCode: 409 });
  }
}
