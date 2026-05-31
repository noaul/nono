import type { AppServices, AuthUser } from '../types.js';
import { decryptSecret } from '../utils/crypto.js';
import { createSortOrder } from '../utils/sort-order.js';
import { normalizeUrl } from './bookmark.service.js';

export interface AnalyzeInput {
  url: string;
  title?: string;
  content?: string;
  meta?: Record<string, unknown>;
}

export async function analyzeBookmark(services: AppServices, user: AuthUser, input: AnalyzeInput) {
  const account = await services.repo.findUserById(user.id);
  const folders = await services.repo.listFolders(user.id);
  const fallback = {
    suggestedFolderId: folders[0]?.id || null,
    suggestedFolderName: folders[0]?.name || '未分类',
    suggestedName: input.title || new URL(normalizeUrl(input.url)).hostname,
    suggestedDescription: String(input.content || '').slice(0, 120),
    createFolder: false,
  };
  if (!account?.llmProvider || !account.llmApiKey || !services.llmClient) return fallback;
  const apiKey = decryptSecret(account.llmApiKey, services.encryptionKey);
  if (!apiKey) throw Object.assign(new Error('LLM API key is not configured'), { statusCode: 400 });
  const prompt = [
    'You classify browser bookmarks for Nono. Return JSON only.',
    `Folders: ${folders.map((folder) => `${folder.id}:${folder.name}`).join(', ')}`,
    `URL: ${input.url}`,
    `Title: ${input.title || ''}`,
    `Content: ${String(input.content || '').slice(0, 1000)}`,
    'JSON shape: {"suggestedFolderId":number|null,"suggestedFolderName":string,"suggestedName":string,"suggestedDescription":string,"createFolder":boolean}',
  ].join('\n');
  try {
    const raw = await services.llmClient.complete({ provider: account.llmProvider as any, apiKey, model: account.llmModel || defaultModel(account.llmProvider), prompt });
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

export async function saveAnalyzedBookmark(services: AppServices, user: AuthUser, input: AnalyzeInput & { folderId?: number; folderName?: string; name?: string; description?: string }) {
  let folderId = input.folderId;
  if (!folderId && input.folderName) {
    const folder = await services.repo.createFolder({ userId: user.id, parentId: null, name: input.folderName, icon: 'sparkles', description: 'AI 自动创建', sortOrder: createSortOrder(), passwordHash: null, passwordHint: null });
    folderId = folder.id;
  }
  if (!folderId) {
    const folders = await services.repo.listFolders(user.id);
    folderId = folders[0]?.id;
  }
  if (!folderId) throw Object.assign(new Error('No folder available'), { statusCode: 400 });
  return services.repo.createLink({
    folderId,
    name: input.name || input.title || new URL(normalizeUrl(input.url)).hostname,
    url: normalizeUrl(input.url),
    icon: '',
    description: input.description || String(input.content || '').slice(0, 120),
    sortOrder: createSortOrder(),
  });
}

function defaultModel(provider: string) {
  return provider === 'claude' ? 'claude-sonnet-4-5' : 'gpt-4o-mini';
}
