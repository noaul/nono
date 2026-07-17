import { generateApiToken, hashApiToken } from '../utils/crypto.js';
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
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiTokenRecord {
  id: number;
  userId: number;
  tokenHash: string;
  tokenPrefix: string;
  name: string;
  expiresAt?: Date | null;
  createdAt: Date;
}

export interface CreatedApiTokenRecord extends ApiTokenRecord {
  token: string;
}

export interface AppConfigRecord {
  id: number;
  allowRegistration: boolean;
  defaultRole: Role;
  settings: Record<string, unknown>;
}

export interface Repository {
  getConfig(): Promise<AppConfigRecord>;
  updateConfig(input: Partial<AppConfigRecord>): Promise<AppConfigRecord>;
  listUsers(): Promise<UserRecord[]>;
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
  listLinks(userId: number): Promise<LinkRecord[]>;
  createLink(input: Omit<LinkRecord, 'id' | 'createdAt' | 'updatedAt'>): Promise<LinkRecord>;
  updateLink(userId: number, id: number, input: Partial<LinkRecord>): Promise<LinkRecord>;
  reorderLinks(userId: number, ids: number[]): Promise<void>;
  deleteLink(userId: number, id: number): Promise<void>;
  deleteLinks(userId: number, ids: number[]): Promise<void>;
  listTokens(userId: number): Promise<ApiTokenRecord[]>;
  createToken(userId: number, name: string, expiresAt?: Date | null): Promise<CreatedApiTokenRecord>;
  findToken(token: string): Promise<(ApiTokenRecord & { user: UserRecord }) | null>;
  deleteToken(userId: number, id: number): Promise<void>;
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

export class MemoryRepository implements Repository {
  users: UserRecord[] = [];
  sites: SiteRecord[] = [];
  folders: FolderRecord[] = [];
  links: LinkRecord[] = [];
  tokens: ApiTokenRecord[] = [];
  config: AppConfigRecord = { id: 1, allowRegistration: false, defaultRole: 'user', settings: {} };

  constructor(seed = true) {
    if (seed) this.seed();
  }

  async getConfig() {
    return this.config;
  }

  async updateConfig(input: Partial<AppConfigRecord>) {
    this.config = { ...this.config, ...input, id: 1 };
    return this.config;
  }

  async listUsers() {
    return [...this.users];
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
    Object.assign(user, input, { updatedAt: new Date() });
    return user;
  }

  async deleteUser(id: number) {
    this.users = this.users.filter((user) => user.id !== id);
    this.sites = this.sites.filter((site) => site.userId !== id);
    this.folders = this.folders.filter((folder) => folder.userId !== id);
    const folderIds = new Set(this.folders.map((folder) => folder.id));
    this.links = this.links.filter((link) => folderIds.has(link.folderId));
    this.tokens = this.tokens.filter((token) => token.userId !== id);
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
    const ids = new Set<number>();
    for (const rootId of rootIds) {
      for (const id of collectFolderIds(all, rootId)) ids.add(id);
    }
    this.folders = this.folders.filter((folder) => !ids.has(folder.id));
    this.links = this.links.filter((link) => !ids.has(link.folderId));
  }

  async listLinks(userId: number) {
    const folderIds = new Set((await this.listFolders(userId)).map((folder) => folder.id));
    return this.links.filter((link) => folderIds.has(link.folderId)).sort(sortOrder);
  }

  async createLink(input: Omit<LinkRecord, 'id' | 'createdAt' | 'updatedAt'>) {
    const now = new Date();
    const link = { ...input, id: nextId(this.links), createdAt: now, updatedAt: now };
    this.links.push(link);
    return link;
  }

  async updateLink(userId: number, id: number, input: Partial<LinkRecord>) {
    const link = await this.requiredLink(userId, id);
    Object.assign(link, input, { updatedAt: new Date() });
    return link;
  }

  async reorderLinks(userId: number, ids: number[]) {
    const links = await this.listLinks(userId);
    const byId = new Map(links.map((link) => [link.id, link]));
    if (ids.some((id) => !byId.has(id))) throw Object.assign(new Error('Link not found'), { statusCode: 404 });
    const now = new Date();
    ids.forEach((id, index) => Object.assign(byId.get(id)!, { sortOrder: (ids.length - index) * 10, updatedAt: now }));
  }

  async deleteLink(userId: number, id: number) {
    await this.deleteLinks(userId, [id]);
  }

  async deleteLinks(userId: number, ids: number[]) {
    const ownedIds = new Set((await this.listLinks(userId)).map((link) => link.id));
    const deletedIds = new Set(ids.filter((id) => ownedIds.has(id)));
    this.links = this.links.filter((item) => !deletedIds.has(item.id));
  }

  async listTokens(userId: number) {
    return this.tokens.filter((token) => token.userId === userId);
  }

  async createToken(userId: number, name: string, expiresAt?: Date | null) {
    const token = generateApiToken();
    const record = {
      id: nextId(this.tokens),
      userId,
      tokenHash: hashApiToken(token),
      tokenPrefix: token.slice(0, 10),
      name,
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

  async deleteToken(userId: number, id: number) {
    this.tokens = this.tokens.filter((token) => !(token.userId === userId && token.id === id));
  }

  seed() {
    const now = new Date();
    const user: UserRecord = {
      id: 1,
      username: 'admin',
      email: 'admin@nono.local',
      displayName: 'Nono Admin',
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
    const links = await this.listLinks(userId);
    const link = links.find((item) => item.id === id);
    if (!link) throw Object.assign(new Error('Link not found'), { statusCode: 404 });
    return link;
  }
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
    name: 'Nono',
    description: '一个可自托管的网址导航主页',
    slug,
    backgroundImage: 'https://api.dujin.org/bing/1920.php',
    backgroundColor: '#000000',
    fontColor: '#ffffff',
    searchUrlTemplate: 'https://www.google.com/search?q={query}',
    localSearchFirst: true,
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
