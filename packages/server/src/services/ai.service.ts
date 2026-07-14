import type { AppServices, AuthUser } from '../types.js';
import { decryptSecret } from '../utils/crypto.js';
import { createSortOrder } from '../utils/sort-order.js';
import { normalizeUrl } from './bookmark.service.js';
import { shortenBookmarkName } from './bookmark-name.service.js';

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
    suggestedName: shortenBookmarkName(input.title, input.url),
    suggestedDescription: String(input.content || '').slice(0, 120),
    createFolder: false,
  };
  if (!account?.llmProvider || !account.llmApiKey || !services.llmClient) return fallback;
  const apiKey = decryptSecret(account.llmApiKey, services.encryptionKey);
  if (!apiKey) throw Object.assign(new Error('LLM API key is not configured'), { statusCode: 400 });
  const prompt = [
    'You classify browser bookmarks for Nono. Return JSON only.',
    'Choose suggestedFolderId only from the listed folder IDs. A folder prompt is a routing rule; a child folder inherits its category prompt and its own prompt has priority.',
    `Folders:\n${formatFoldersForPrompt(folders)}`,
    `URL: ${input.url}`,
    `Title: ${input.title || ''}`,
    `Content: ${String(input.content || '').slice(0, 1000)}`,
    'SuggestedName must be a memorable bookmark label, preferably 2-20 characters. Keep the product, site, or page topic; remove articles, SEO suffixes, dates, and long taglines.',
    'JSON shape: {"suggestedFolderId":number|null,"suggestedFolderName":string,"suggestedName":string,"suggestedDescription":string,"createFolder":boolean}',
  ].join('\n');
  try {
    const raw = await services.llmClient.complete({
      provider: account.llmProvider as any,
      apiKey,
      model: account.llmModel || defaultModel(account.llmProvider),
      baseUrl: account.llmBaseUrl,
      reasoningEffort: account.llmReasoningEffort as any,
      prompt,
    });
    const result = JSON.parse(raw);
    return { ...fallback, ...result, suggestedName: shortenBookmarkName(result.suggestedName || fallback.suggestedName, input.url) };
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

function formatFoldersForPrompt(folders: Array<{ id: number; parentId?: number | null; name: string; description?: string | null }>) {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  return folders
    .map((folder) => {
      const lineage = [folder];
      let parentId = folder.parentId || null;
      const visited = new Set<number>([folder.id]);
      while (parentId && !visited.has(parentId)) {
        visited.add(parentId);
        const parent = byId.get(parentId);
        if (!parent) break;
        lineage.unshift(parent);
        parentId = parent.parentId || null;
      }
      const path = lineage.map((item) => item.name).join(' > ');
      const prompts = lineage.map((item) => item.description?.trim()).filter(Boolean);
      return `- ${folder.id}: ${path}${prompts.length ? ` | Routing rules: ${prompts.join(' / ')}` : ''}`;
    })
    .join('\n');
}
