import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createDefaultState } from './default-state.js';

export async function createStore(options = {}) {
  const filePath = options.filePath || defaultDataFile();
  let state = await loadState(filePath);
  await saveState(filePath, state);

  return {
    filePath,
    getState() {
      return state;
    },
    async replace(nextState) {
      state = migrateState(nextState);
      await saveState(filePath, state);
      return state;
    },
    async update(mutator) {
      const draft = structuredClone(state);
      const result = await mutator(draft);
      state = migrateState(result || draft);
      await saveState(filePath, state);
      return state;
    },
  };
}

export function defaultDataFile() {
  return process.env.NONO_DATA_FILE || join(process.env.APP_DATA_DIR || join(process.cwd(), 'data'), 'nono.json');
}

async function loadState(filePath) {
  try {
    return migrateState(JSON.parse(await readFile(filePath, 'utf8')));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    return createDefaultState();
  }
}

async function saveState(filePath, state) {
  await mkdir(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`);
  await rename(tempPath, filePath);
}

export function migrateState(input) {
  const fallback = createDefaultState();
  const state = input && typeof input === 'object' ? input : fallback;
  const site = { ...fallback.site, ...(state.site || {}) };
  const users = Array.isArray(state.users) && state.users.length > 0 ? state.users : fallback.users;
  const folders = Array.isArray(state.folders) ? state.folders : fallback.folders;
  const links = Array.isArray(state.links) ? state.links : fallback.links;

  return {
    version: 1,
    site: {
      ...site,
      description: site.description ?? site.info ?? fallback.site.description,
      backgroundImage: site.backgroundImage ?? site.bg ?? fallback.site.backgroundImage,
      mobileBackgroundImage: site.mobileBackgroundImage ?? site.mobile_bg ?? fallback.site.mobileBackgroundImage,
      backgroundColor: site.backgroundColor ?? site.bg_color ?? fallback.site.backgroundColor,
      fontColor: site.fontColor ?? site.font_color ?? fallback.site.fontColor,
      searchEngine: site.searchEngine || 'google',
      searchUrlTemplate: site.searchUrlTemplate || 'https://www.google.com/search?q={query}',
      localSearchFirst: site.localSearchFirst !== false,
    },
    users: users.map((user, index) => ({
      ...fallback.users[0],
      ...user,
      id: Number(user.id ?? index + 1),
      username: user.username || user.name || 'admin',
      name: user.name || user.username || 'admin',
      displayName: user.displayName || user.name || user.username || 'Nono',
      passwordHash: user.passwordHash || '',
      passwordSalt: user.passwordSalt || '',
    })),
    folders: folders.map((folder, index) => ({
      ...folder,
      id: Number(folder.id ?? index + 1),
      userId: Number(folder.userId ?? 1),
      parentId: folder.parentId ?? null,
      icon: folder.icon || '',
      description: folder.description ?? folder.info ?? '',
      passwordHash: folder.passwordHash || '',
      passwordHint: folder.passwordHint || '',
      sortOrder: Number(folder.sortOrder ?? folder.weight ?? 0),
      weight: Number(folder.weight ?? folder.sortOrder ?? 0),
      need_password: Boolean(folder.need_password || folder.passwordHash),
    })),
    links: links.map((link, index) => ({
      ...link,
      id: Number(link.id ?? index + 1),
      folderId: Number(link.folderId ?? link.folder_id ?? 0),
      icon: link.icon || '',
      description: link.description ?? link.info ?? '',
      sortOrder: Number(link.sortOrder ?? link.weight ?? 0),
      weight: Number(link.weight ?? link.sortOrder ?? 0),
    })),
  };
}

export function nextId(items) {
  return Math.max(0, ...items.map((item) => Number(item.id) || 0)) + 1;
}
