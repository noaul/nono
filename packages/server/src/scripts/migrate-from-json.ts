import fs from 'node:fs/promises';
import { createPrismaRepository } from '../services/prisma.repository.js';
import { hashPassword } from '../utils/crypto.js';
import { requiredEnv } from '../utils/required-env.js';

const file = process.argv[2] || 'data/nono.json';
const repo = createPrismaRepository();

const raw = JSON.parse(await fs.readFile(file, 'utf8'));
const password = requiredEnv('MIGRATED_ADMIN_PASSWORD');

for (const oldUser of raw.users || []) {
  const existing = await repo.findUserByUsername(oldUser.username || oldUser.name);
  if (existing) continue;
  await repo.createUser({
    username: oldUser.username || oldUser.name || 'admin',
    email: oldUser.email || `${oldUser.username || oldUser.name || 'admin'}@nono.local`,
    displayName: oldUser.displayName || oldUser.name || oldUser.username || 'NoNo User',
    passwordHash: await hashPassword(password),
    role: oldUser.level >= 2 ? 'admin' : 'user',
    llmProvider: null,
    llmApiKey: null,
    llmModel: null,
  });
}

const admin = (await repo.listUsers()).find((user) => user.role === 'admin' && user.passwordHash);
if (!admin) throw new Error('No migrated user was created');

if (raw.site) {
  await repo.updateSite(admin.id, {
    name: raw.site.name || 'NoNo',
    description: raw.site.description || raw.site.info || '',
    slug: raw.site.slug || admin.username,
    backgroundImage: raw.site.backgroundImage || raw.site.bg || null,
    backgroundColor: raw.site.backgroundColor || raw.site.bg_color || '#000000',
    fontColor: raw.site.fontColor || raw.site.font_color || '#ffffff',
    searchUrlTemplate: raw.site.searchUrlTemplate || 'https://www.google.com/search?q={query}',
    localSearchFirst: raw.site.localSearchFirst ?? true,
    settings: { migratedFrom: file },
  });
}

const folderMap = new Map<number, number>();
for (const folder of raw.folders || []) {
  const created = await repo.createFolder({
    userId: admin.id,
    parentId: folder.parentId ? folderMap.get(folder.parentId) || null : null,
    name: folder.name || '未命名文件夹',
    icon: folder.icon || '',
    description: folder.description || folder.info || '',
    sortOrder: Number(folder.sortOrder ?? folder.weight ?? 0),
    passwordHash: folder.passwordHash || null,
    passwordHint: folder.passwordHint || '',
  });
  folderMap.set(folder.id, created.id);
}

for (const link of raw.links || []) {
  const folderId = folderMap.get(link.folderId);
  if (!folderId) continue;
  await repo.createLink({
    folderId,
    name: link.name || link.url,
    url: link.url,
    icon: link.icon || '',
    description: link.description || '',
    sortOrder: Number(link.sortOrder ?? link.weight ?? 0),
  });
}

await repo.updateConfig({ initializedAt: new Date() });

console.log(`Migrated ${(raw.folders || []).length} folders and ${(raw.links || []).length} links.`);
