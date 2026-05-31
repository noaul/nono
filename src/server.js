import { createServer as createHttpServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSessionCookie, clearSessionCookie, getSessionUser, hashPassword, publicAdminUser, verifyPassword } from './auth.js';
import { exportBookmarksHtml, parseBookmarksHtml } from './bookmarks-html.js';
import { adminState, getNavigationByUsername } from './navigation.js';
import { createStore, nextId } from './store.js';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const publicDir = join(rootDir, 'public');

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'application/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
]);

function sendJson(response, status, payload, headers = {}) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  response.end(JSON.stringify(payload));
}

function sendText(response, status, body, headers = {}) {
  response.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  response.end(body);
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

async function sendStatic(response, pathname) {
  const normalizedPath = pathname === '/' ? '/index.html' : pathname;
  const safePath = normalize(decodeURIComponent(normalizedPath)).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(publicDir, safePath);

  try {
    const body = await readFile(filePath);
    response.writeHead(200, {
      'content-type': contentTypes.get(extname(filePath)) || 'application/octet-stream',
      'cache-control': 'public, max-age=60',
    });
    response.end(body);
  } catch {
    const fallback = await readFile(join(publicDir, 'index.html'));
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(fallback);
  }
}

async function handleRequest(request, response, context) {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const state = context.store.getState();

  if (request.method === 'GET' && url.pathname === '/healthz') {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === 'GET' && (url.pathname === '/admin' || url.pathname === '/admin/')) {
    await sendStatic(response, '/admin.html');
    return;
  }

  const navigationMatch = url.pathname.match(/^\/api\/v1\/allsiteandlinks\/([^/]+)$/);
  if (request.method === 'GET' && navigationMatch) {
    const username = decodeURIComponent(navigationMatch[1]);
    const data = getNavigationByUsername(state, username);

    if (!data) {
      sendJson(response, 404, { code: 404, data: null, msg: `user ${username} not found` });
      return;
    }

    sendJson(response, 200, { code: 0, data, msg: '' });
    return;
  }

  if (url.pathname.startsWith('/api/admin/')) {
    await handleAdminRequest(request, response, context, url);
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    sendJson(response, 404, { code: 404, data: null, msg: 'api route not found' });
    return;
  }

  await sendStatic(response, url.pathname);
}

async function handleAdminRequest(request, response, context, url) {
  const state = context.store.getState();
  const admin = getAdminAccount(state);

  if (request.method === 'GET' && url.pathname === '/api/admin/session') {
    const user = getSessionUser(request, state, context.sessionSecret);
    sendJson(response, 200, {
      authenticated: Boolean(user),
      setupRequired: !admin?.passwordHash,
      user: publicAdminUser(user),
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/setup') {
    if (admin?.passwordHash) {
      sendJson(response, 409, { error: 'admin account already initialized' });
      return;
    }
    const body = await readJson(request);
    const password = text(body.password);
    if (password.length < 8) {
      sendJson(response, 400, { error: 'password must be at least 8 characters' });
      return;
    }
    const { salt, hash } = await hashPassword(password);
    let updatedUser;
    await context.store.update((draft) => {
      const user = getAdminAccount(draft);
      user.username = text(body.username) || 'admin';
      user.name = user.username;
      user.displayName = text(body.displayName) || user.username;
      user.passwordSalt = salt;
      user.passwordHash = hash;
      user.updatedAt = now();
      updatedUser = user;
    });
    sendJson(response, 200, { user: publicAdminUser(updatedUser) }, { 'set-cookie': createSessionCookie(updatedUser, context.sessionSecret) });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/login') {
    const body = await readJson(request);
    const user = state.users.find((item) => item.username === text(body.username));
    const ok = user && (await verifyPassword(text(body.password), user.passwordSalt, user.passwordHash));
    if (!ok) {
      sendJson(response, 401, { error: 'invalid username or password' });
      return;
    }
    sendJson(response, 200, { user: publicAdminUser(user) }, { 'set-cookie': createSessionCookie(user, context.sessionSecret) });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/logout') {
    sendJson(response, 200, { ok: true }, { 'set-cookie': clearSessionCookie() });
    return;
  }

  const user = getSessionUser(request, state, context.sessionSecret);
  if (!user) {
    sendJson(response, 401, { error: 'authentication required' });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/state') {
    sendJson(response, 200, adminState(state, user));
    return;
  }

  if (request.method === 'PUT' && url.pathname === '/api/admin/site') {
    const body = await readJson(request);
    let site;
    await context.store.update((draft) => {
      draft.site = normalizeSite(draft.site, body);
      site = draft.site;
    });
    sendJson(response, 200, { site });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/folders') {
    const body = await readJson(request);
    let folder;
    await context.store.update((draft) => {
      folder = createFolder(draft, body);
      draft.folders.push(folder);
    });
    sendJson(response, 201, { folder });
    return;
  }

  const folderMatch = url.pathname.match(/^\/api\/admin\/folders\/(\d+)$/);
  if (folderMatch) {
    const id = Number(folderMatch[1]);
    if (request.method === 'PUT') {
      const body = await readJson(request);
      let folder;
      await context.store.update((draft) => {
        folder = draft.folders.find((item) => item.id === id);
        if (!folder) return;
        updateFolder(folder, body);
      });
      if (!folder) return sendJson(response, 404, { error: 'folder not found' });
      sendJson(response, 200, { folder });
      return;
    }
    if (request.method === 'DELETE') {
      await context.store.update((draft) => {
        draft.folders = draft.folders.filter((item) => item.id !== id);
        draft.links = draft.links.filter((item) => item.folderId !== id);
      });
      sendJson(response, 200, { ok: true });
      return;
    }
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/links') {
    const body = await readJson(request);
    let link;
    await context.store.update((draft) => {
      link = createLink(draft, body);
      draft.links.push(link);
    });
    sendJson(response, 201, { link });
    return;
  }

  const linkMatch = url.pathname.match(/^\/api\/admin\/links\/(\d+)$/);
  if (linkMatch) {
    const id = Number(linkMatch[1]);
    if (request.method === 'PUT') {
      const body = await readJson(request);
      let link;
      await context.store.update((draft) => {
        link = draft.links.find((item) => item.id === id);
        if (!link) return;
        updateLink(draft, link, body);
      });
      if (!link) return sendJson(response, 404, { error: 'link not found' });
      sendJson(response, 200, { link });
      return;
    }
    if (request.method === 'DELETE') {
      await context.store.update((draft) => {
        draft.links = draft.links.filter((item) => item.id !== id);
      });
      sendJson(response, 200, { ok: true });
      return;
    }
  }

  if (request.method === 'PUT' && url.pathname === '/api/admin/reorder') {
    const body = await readJson(request);
    await context.store.update((draft) => {
      applyReorder(body.resource || body.type, body.ids, draft);
    });
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/account/password') {
    const body = await readJson(request);
    const password = text(body.password);
    if (password.length < 8) {
      sendJson(response, 400, { error: 'password must be at least 8 characters' });
      return;
    }
    const { salt, hash } = await hashPassword(password);
    await context.store.update((draft) => {
      const account = draft.users.find((item) => item.id === user.id);
      account.passwordSalt = salt;
      account.passwordHash = hash;
      account.updatedAt = now();
    });
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/admin/bookmarks/import') {
    const body = await readJson(request);
    let summary;
    await context.store.update((draft) => {
      summary = importBookmarks(draft, String(body.html || ''));
    });
    sendJson(response, 200, { summary });
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/admin/bookmarks/export') {
    sendText(response, 200, exportBookmarksHtml(state), {
      'content-type': 'text/html; charset=utf-8',
      'content-disposition': 'attachment; filename="nono-bookmarks.html"',
    });
    return;
  }

  sendJson(response, 404, { error: 'admin route not found' });
}

export async function createServer(options = {}) {
  const store = await createStore({ filePath: options.dataFile });
  const context = {
    store,
    sessionSecret: options.sessionSecret || process.env.NONO_SESSION_SECRET || 'nono-local-session-secret',
  };
  return createHttpServer((request, response) => {
    handleRequest(request, response, context).catch((error) => {
      sendJson(response, 500, { code: 500, data: null, msg: error.message });
    });
  });
}

function getAdminAccount(state) {
  return state.users[0];
}

function text(value) {
  return String(value ?? '').trim();
}

function now() {
  return new Date().toISOString();
}

function normalizeSite(current, body) {
  return {
    ...current,
    name: text(body.name) || current.name,
    description: text(body.description ?? body.info) || current.description,
    slug: text(body.slug) || current.slug,
    backgroundMode: body.backgroundMode === 'color' ? 'color' : 'image',
    backgroundImage: text(body.backgroundImage) || current.backgroundImage,
    mobileBackgroundImage: text(body.mobileBackgroundImage) || text(body.backgroundImage) || current.mobileBackgroundImage,
    backgroundColor: text(body.backgroundColor) || current.backgroundColor,
    fontColor: text(body.fontColor) || current.fontColor,
    searchEngine: text(body.searchEngine) || 'google',
    searchUrlTemplate: text(body.searchUrlTemplate) || 'https://www.google.com/search?q={query}',
    localSearchFirst: body.localSearchFirst !== false,
    publishUrl: text(body.publishUrl),
    updatedAt: now(),
  };
}

function createFolder(state, body) {
  const createdAt = now();
  return {
    id: nextId(state.folders),
    userId: 1,
    parentId: nullableNumber(body.parentId),
    name: text(body.name) || '未命名文件夹',
    icon: text(body.icon),
    description: text(body.description),
    passwordHash: '',
    passwordHint: text(body.passwordHint),
    sortOrder: nextSortOrder(state.folders.filter((folder) => sameParent(folder.parentId, nullableNumber(body.parentId)))),
    weight: 0,
    need_password: false,
    info: text(body.description),
    createdAt,
    updatedAt: createdAt,
  };
}

function updateFolder(folder, body) {
  if ('name' in body) folder.name = text(body.name) || folder.name;
  if ('icon' in body) folder.icon = text(body.icon);
  if ('description' in body) {
    folder.description = text(body.description);
    folder.info = folder.description;
  }
  if ('passwordHint' in body) folder.passwordHint = text(body.passwordHint);
  if ('parentId' in body) folder.parentId = nullableNumber(body.parentId);
  folder.updatedAt = now();
}

function createLink(state, body) {
  const folderId = Number(body.folderId);
  ensureFolder(state, folderId);
  const createdAt = now();
  return {
    id: nextId(state.links),
    folderId,
    name: text(body.name) || '未命名书签',
    url: normalizeUrl(body.url),
    icon: text(body.icon),
    description: text(body.description),
    sortOrder: nextSortOrder(state.links.filter((link) => link.folderId === folderId)),
    weight: 0,
    createdAt,
    updatedAt: createdAt,
  };
}

function updateLink(state, link, body) {
  if ('folderId' in body) {
    const folderId = Number(body.folderId);
    ensureFolder(state, folderId);
    link.folderId = folderId;
  }
  if ('name' in body) link.name = text(body.name) || link.name;
  if ('url' in body) link.url = normalizeUrl(body.url);
  if ('icon' in body) link.icon = text(body.icon);
  if ('description' in body) link.description = text(body.description);
  link.updatedAt = now();
}

function normalizeUrl(value) {
  const url = new URL(text(value));
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('url must start with http:// or https://');
  }
  return url.href;
}

function ensureFolder(state, folderId) {
  if (!state.folders.some((folder) => folder.id === folderId)) {
    throw new Error('folder not found');
  }
}

function nextSortOrder(items) {
  return Math.max(0, ...items.map((item) => Number(item.sortOrder) || 0)) + 10;
}

function nullableNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sameParent(left, right) {
  return (left ?? null) === (right ?? null);
}

function applyReorder(resource, ids, state) {
  const items = resource === 'folders' ? state.folders : resource === 'links' ? state.links : [];
  const order = Array.isArray(ids) ? ids.map(Number) : [];
  const base = order.length * 10;
  order.forEach((id, index) => {
    const item = items.find((candidate) => candidate.id === id);
    if (item) {
      item.sortOrder = base - index * 10;
      item.weight = item.sortOrder;
      item.updatedAt = now();
    }
  });
}

function importBookmarks(state, html) {
  const parsed = parseBookmarksHtml(html);
  const tempToId = new Map();
  const existingUrls = new Set(state.links.map((link) => link.url.toLowerCase()));
  const createdAt = now();
  const summary = { addedFolders: 0, addedLinks: 0, skippedDuplicates: 0 };

  for (const item of parsed.folders) {
    const folder = {
      id: nextId(state.folders),
      userId: 1,
      parentId: item.parentTempId ? tempToId.get(item.parentTempId) || null : null,
      name: item.name,
      icon: item.icon || '',
      description: '',
      passwordHash: '',
      passwordHint: '',
      sortOrder: nextSortOrder(state.folders),
      weight: 0,
      need_password: false,
      info: '',
      createdAt: item.addDate || createdAt,
      updatedAt: createdAt,
    };
    tempToId.set(item.tempId, folder.id);
    state.folders.push(folder);
    summary.addedFolders += 1;
  }

  let fallbackFolderId = state.folders[0]?.id;
  if (!fallbackFolderId && parsed.links.length > 0) {
    const folder = createFolder(state, { name: '导入书签' });
    state.folders.push(folder);
    fallbackFolderId = folder.id;
    summary.addedFolders += 1;
  }

  for (const item of parsed.links) {
    const url = normalizeUrl(item.url);
    const key = url.toLowerCase();
    if (existingUrls.has(key)) {
      summary.skippedDuplicates += 1;
      continue;
    }
    const folderId = item.folderTempId ? tempToId.get(item.folderTempId) || fallbackFolderId : fallbackFolderId;
    state.links.push({
      id: nextId(state.links),
      folderId,
      name: item.name,
      url,
      icon: item.icon || '',
      description: '',
      sortOrder: nextSortOrder(state.links.filter((link) => link.folderId === folderId)),
      weight: 0,
      createdAt: item.addDate || createdAt,
      updatedAt: createdAt,
    });
    existingUrls.add(key);
    summary.addedLinks += 1;
  }

  return summary;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number.parseInt(process.env.PORT || '3000', 10);
  const server = await createServer();
  server.listen(port, '0.0.0.0', () => {
    console.log(`Nono listening on http://0.0.0.0:${port}`);
  });
}
