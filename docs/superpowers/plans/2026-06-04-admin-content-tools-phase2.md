# Admin Content Tools Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Nono admin from smooth single-item editing to practical content operations: bookmark import preview, duplicate detection, bulk link actions, and folder tree management.

**Architecture:** Build this phase on top of Phase 1 (`codex/admin-experience-phase1` or a branch where Phase 1 is already merged). Add small Fastify admin endpoints for preview, duplicate reporting, and bulk actions while keeping the existing Repository interface simple. On the web side, extend the Phase 1 admin pages with selection state, preview panels, duplicate panels, and folder hierarchy controls using the shared feedback primitives from Phase 1.

**Tech Stack:** Fastify, Prisma Repository abstraction, Vue 3, TypeScript, Vue Router, Pinia, lucide-vue-next, Vitest, Vue Test Utils, jsdom.

---

## Prerequisites

- Start from Phase 1 work, not plain `main`, because this plan expects these files to exist:
  - `packages/web/src/components/admin/ToastHost.vue`
  - `packages/web/src/components/admin/ConfirmDialog.vue`
  - `packages/web/src/components/admin/EmptyState.vue`
  - `packages/web/src/components/admin/LoadingOverlay.vue`
  - `packages/web/src/composables/useConfirm.ts`
  - `packages/web/src/composables/useToasts.ts`
- If Phase 1 is still in the isolated worktree, create Phase 2 from that branch:

```powershell
git worktree add C:/Users/aodo/.config/superpowers/worktrees/nono/codex-admin-content-tools-phase2 -b codex/admin-content-tools-phase2 codex/admin-experience-phase1
```

## Scope

This phase improves management capability without changing the database schema. It does not add link health checks, audit logs, recycle bin, Token scopes, or pagination. Those belong in Phase 3+ because they need stronger backend contracts and possibly schema changes.

## File Structure

- Modify: `packages/server/src/services/bookmark.service.ts`
  - Add import preview analysis and reusable duplicate/invalid classification.
- Modify: `packages/server/src/routes/admin/bookmarks.ts`
  - Add `POST /api/admin/bookmarks/preview`.
- Modify: `packages/server/src/routes/admin/links.ts`
  - Add `GET /api/admin/links/duplicates`.
  - Add `POST /api/admin/links/bulk-delete`.
  - Add `POST /api/admin/links/bulk-move`.
- Modify: `packages/server/src/routes/admin/folders.ts`
  - Add parent validation to prevent self-parent and descendant-parent cycles.
- Modify: `packages/server/test/app.test.ts`
  - Add API tests for preview, duplicate groups, bulk delete, bulk move, and folder parent validation.
- Modify: `packages/web/src/api/types.ts`
  - Add admin preview, duplicate, and bulk result types.
- Modify: `packages/web/src/views/admin/LinksView.vue`
  - Add row selection, bulk action bar, bulk move, bulk delete, and duplicate panel.
- Modify: `packages/web/src/views/admin/BookmarksView.vue`
  - Add preview-before-import flow and preview summary.
- Modify: `packages/web/src/views/admin/FoldersView.vue`
  - Add folder tree indentation and parent selector.
- Modify: `packages/web/src/styles.css`
  - Add bulk bar, preview panel, duplicate panel, and tree row styles.
- Modify: `packages/web/test/admin-links-view.test.ts`
  - Add bulk action and duplicate panel tests.
- Create: `packages/web/test/admin-bookmarks-view.test.ts`
  - Test preview-before-import flow.
- Modify: `packages/web/test/admin-folders-view.test.ts`
  - Test folder parent selector and tree indentation contracts.
- Modify: `packages/web/test/visual-contract.test.ts`
  - Lock in Phase 2 class contracts.

---

### Task 1: Bookmark Import Preview API

**Files:**
- Modify: `packages/server/src/services/bookmark.service.ts`
- Modify: `packages/server/src/routes/admin/bookmarks.ts`
- Modify: `packages/server/test/app.test.ts`

- [ ] **Step 1: Write failing server tests**

Add tests to `packages/server/test/app.test.ts`:

```ts
it('previews bookmark imports without writing folders or links', async () => {
  const cookie = await setupAdmin();
  await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Existing' } });
  await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId: 1, name: 'GitHub', url: 'https://github.com/' } });
  const html = '<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p><DT><H3>Dev</H3><DL><p><DT><A HREF="https://github.com/">GitHub</A><DT><A HREF="https://example.com/">Example</A><DT><A HREF="chrome://bookmarks/">Chrome</A></DL><p></DL><p>';

  const preview = await app.inject({
    method: 'POST',
    url: '/api/admin/bookmarks/preview',
    headers: { cookie },
    payload: { html },
  });

  expect(preview.statusCode).toBe(200);
  expect(preview.json().data.summary).toMatchObject({
    parsedFolders: 1,
    parsedLinks: 3,
    newFolders: 1,
    newLinks: 1,
    duplicateLinks: 1,
    invalidLinks: 1,
  });
  expect(await repo.listFolders(1)).toHaveLength(1);
  expect(await repo.listLinks(1)).toHaveLength(1);
});
```

Run:

```powershell
npm.cmd run test -w packages/server -- app.test.ts
```

Expected: FAIL with `POST /api/admin/bookmarks/preview` returning 404.

- [ ] **Step 2: Add preview types and analysis**

In `packages/server/src/services/bookmark.service.ts`, export:

```ts
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

export async function previewBookmarksImport(repo: Repository, userId: number, html: string): Promise<BookmarkImportPreview> {
  const parsed = parseBookmarksHtml(html);
  const existingLinks = await repo.listLinks(userId);
  const existingUrls = new Set(existingLinks.map((link) => link.url.toLowerCase()));
  const links = parsed.links.map((item) => {
    const normalizedUrl = tryNormalizeUrl(item.url);
    if (!normalizedUrl) return { name: item.name, url: item.url, folderTempId: item.folderTempId, status: 'invalid' as const, reason: 'URL must start with http:// or https://' };
    if (existingUrls.has(normalizedUrl.toLowerCase())) return { name: item.name, url: normalizedUrl, folderTempId: item.folderTempId, status: 'duplicate' as const, reason: 'URL already exists' };
    return { name: item.name, url: normalizedUrl, folderTempId: item.folderTempId, status: 'new' as const };
  });

  return {
    summary: {
      parsedFolders: parsed.folders.length,
      parsedLinks: parsed.links.length,
      newFolders: parsed.folders.length,
      newLinks: links.filter((link) => link.status === 'new').length,
      duplicateLinks: links.filter((link) => link.status === 'duplicate').length,
      invalidLinks: links.filter((link) => link.status === 'invalid').length,
    },
    folders: parsed.folders.map((folder) => ({ ...folder, status: 'new' as const })),
    links,
  };
}
```

- [ ] **Step 3: Add preview route**

In `packages/server/src/routes/admin/bookmarks.ts`, import `previewBookmarksImport` and add:

```ts
app.post('/api/admin/bookmarks/preview', async (request, reply) => {
  const user = await requireAuth(request, reply, services);
  if (!user) return;
  const html = String((request.body as any)?.html || '');
  if (!html.trim()) throw Object.assign(new Error('Bookmark HTML is required'), { statusCode: 400 });
  return sendOk(reply, await previewBookmarksImport(services.repo, user.id, html));
});
```

- [ ] **Step 4: Run server tests**

Run:

```powershell
npm.cmd run test -w packages/server -- app.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/server/src/services/bookmark.service.ts packages/server/src/routes/admin/bookmarks.ts packages/server/test/app.test.ts
git commit -m "feat(server): preview bookmark imports"
```

---

### Task 2: Duplicate and Bulk Link APIs

**Files:**
- Modify: `packages/server/src/routes/admin/links.ts`
- Modify: `packages/server/test/app.test.ts`

- [ ] **Step 1: Write failing API tests**

Add tests to `packages/server/test/app.test.ts`:

```ts
it('reports duplicate admin links by normalized URL', async () => {
  const cookie = await setupAdmin();
  const folder = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Tools' } });
  const folderId = folder.json().data.id;
  await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId, name: 'GitHub A', url: 'https://github.com/' } });
  await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId, name: 'GitHub B', url: 'https://github.com' } });

  const duplicates = await app.inject({ method: 'GET', url: '/api/admin/links/duplicates', headers: { cookie } });

  expect(duplicates.statusCode).toBe(200);
  expect(duplicates.json().data.groups).toHaveLength(1);
  expect(duplicates.json().data.groups[0].links.map((link: any) => link.name)).toEqual(['GitHub A', 'GitHub B']);
});

it('bulk moves and bulk deletes admin links', async () => {
  const cookie = await setupAdmin();
  const firstFolder = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Inbox' } });
  const secondFolder = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Archive' } });
  const inboxId = firstFolder.json().data.id;
  const archiveId = secondFolder.json().data.id;
  const first = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId: inboxId, name: 'One', url: 'https://one.example/' } });
  const second = await app.inject({ method: 'POST', url: '/api/admin/links', headers: { cookie }, payload: { folderId: inboxId, name: 'Two', url: 'https://two.example/' } });

  const move = await app.inject({
    method: 'POST',
    url: '/api/admin/links/bulk-move',
    headers: { cookie },
    payload: { ids: [first.json().data.id, second.json().data.id], folderId: archiveId },
  });
  expect(move.statusCode).toBe(200);
  expect(move.json().data).toEqual({ moved: 2 });

  const deleteResult = await app.inject({
    method: 'POST',
    url: '/api/admin/links/bulk-delete',
    headers: { cookie },
    payload: { ids: [first.json().data.id, second.json().data.id] },
  });
  expect(deleteResult.statusCode).toBe(200);
  expect(deleteResult.json().data).toEqual({ deleted: 2 });
  expect(await repo.listLinks(1)).toHaveLength(0);
});
```

Run:

```powershell
npm.cmd run test -w packages/server -- app.test.ts
```

Expected: FAIL because the new routes are missing.

- [ ] **Step 2: Implement duplicate route**

In `packages/server/src/routes/admin/links.ts`, add before `/:id` routes:

```ts
app.get('/api/admin/links/duplicates', async (request, reply) => {
  const user = await requireAuth(request, reply, services);
  if (!user) return;
  const links = await services.repo.listLinks(user.id);
  const groups = new Map<string, typeof links>();
  for (const link of links) {
    const key = normalizeUrl(link.url).toLowerCase();
    groups.set(key, [...(groups.get(key) || []), link]);
  }
  return sendOk(reply, {
    groups: [...groups.entries()]
      .map(([url, items]) => ({ url, links: items }))
      .filter((group) => group.links.length > 1),
  });
});
```

- [ ] **Step 3: Implement bulk routes**

In `packages/server/src/routes/admin/links.ts`, add:

```ts
function uniqueNumericIds(value: unknown) {
  return [...new Set((Array.isArray(value) ? value : []).map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
}

app.post('/api/admin/links/bulk-move', async (request, reply) => {
  const user = await requireAuth(request, reply, services);
  if (!user) return;
  const body = request.body as any;
  const ids = uniqueNumericIds(body.ids);
  const folder = await services.repo.getFolder(user.id, Number(body.folderId));
  if (!folder) throw Object.assign(new Error('Folder not found'), { statusCode: 404 });
  for (const id of ids) await services.repo.updateLink(user.id, id, { folderId: folder.id });
  return sendOk(reply, { moved: ids.length });
});

app.post('/api/admin/links/bulk-delete', async (request, reply) => {
  const user = await requireAuth(request, reply, services);
  if (!user) return;
  const ids = uniqueNumericIds((request.body as any).ids);
  for (const id of ids) await services.repo.deleteLink(user.id, id);
  return sendOk(reply, { deleted: ids.length });
});
```

- [ ] **Step 4: Run server tests**

Run:

```powershell
npm.cmd run test -w packages/server -- app.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/server/src/routes/admin/links.ts packages/server/test/app.test.ts
git commit -m "feat(server): add duplicate and bulk link APIs"
```

---

### Task 3: Web API Types for Phase 2

**Files:**
- Modify: `packages/web/src/api/types.ts`
- Modify: `packages/web/test/api.test.ts`

- [ ] **Step 1: Add type contract test**

In `packages/web/test/api.test.ts`, add a file-content contract:

```ts
it('exposes phase 2 admin operation types', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const source = fs.readFileSync(path.resolve(process.cwd(), 'src/api/types.ts'), 'utf8');

  expect(source).toContain('export interface BookmarkImportPreview');
  expect(source).toContain('export interface DuplicateLinkGroup');
  expect(source).toContain('export interface BulkLinkResult');
});
```

Run:

```powershell
npm.cmd run test -w packages/web -- api.test.ts
```

Expected: FAIL because the interfaces are missing.

- [ ] **Step 2: Add interfaces**

Append to `packages/web/src/api/types.ts`:

```ts
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
```

- [ ] **Step 3: Run API tests**

Run:

```powershell
npm.cmd run test -w packages/web -- api.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add packages/web/src/api/types.ts packages/web/test/api.test.ts
git commit -m "feat(web): add phase 2 admin API types"
```

---

### Task 4: Link Bulk Actions and Duplicate Panel

**Files:**
- Modify: `packages/web/src/views/admin/LinksView.vue`
- Modify: `packages/web/test/admin-links-view.test.ts`
- Modify: `packages/web/src/styles.css`

- [ ] **Step 1: Add failing web tests**

Extend `packages/web/test/admin-links-view.test.ts` with:

```ts
it('selects links and bulk moves them to another folder', async () => {
  apiRequest
    .mockResolvedValueOnce([
      { id: 1, userId: 1, name: 'Inbox', sortOrder: 100 },
      { id: 2, userId: 1, name: 'Archive', sortOrder: 90 },
    ])
    .mockResolvedValueOnce([
      { id: 10, folderId: 1, name: 'One', url: 'https://one.example/', sortOrder: 100 },
      { id: 11, folderId: 1, name: 'Two', url: 'https://two.example/', sortOrder: 90 },
    ])
    .mockResolvedValueOnce({ moved: 2 });

  const wrapper = mountLinksView();
  await settle(wrapper);
  await wrapper.get('[data-testid="select-link-10"]').setValue(true);
  await wrapper.get('[data-testid="select-link-11"]').setValue(true);
  await wrapper.get('[data-testid="bulk-folder"]').setValue('2');
  await wrapper.get('[data-testid="bulk-move"]').trigger('click');
  await settle(wrapper);

  expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/links/bulk-move', expect.objectContaining({ method: 'POST' }));
  expect(wrapper.text()).toContain('Archive');
});

it('loads and displays duplicate link groups', async () => {
  apiRequest
    .mockResolvedValueOnce([{ id: 1, userId: 1, name: 'Tools', sortOrder: 100 }])
    .mockResolvedValueOnce([{ id: 10, folderId: 1, name: 'GitHub A', url: 'https://github.com/', sortOrder: 100 }])
    .mockResolvedValueOnce({ groups: [{ url: 'https://github.com/', links: [{ id: 10, folderId: 1, name: 'GitHub A', url: 'https://github.com/', sortOrder: 100 }, { id: 11, folderId: 1, name: 'GitHub B', url: 'https://github.com/', sortOrder: 90 }] }] });

  const wrapper = mountLinksView();
  await settle(wrapper);
  await wrapper.get('[data-testid="load-duplicates"]').trigger('click');
  await settle(wrapper);

  expect(wrapper.text()).toContain('重复链接');
  expect(wrapper.text()).toContain('GitHub B');
});
```

Run:

```powershell
npm.cmd run test -w packages/web -- admin-links-view.test.ts
```

Expected: FAIL because the selection controls and duplicate button are missing.

- [ ] **Step 2: Add selection state**

In `LinksView.vue`, add:

```ts
const selectedLinkIds = ref(new Set<number>());
const bulkFolderId = ref<number>(0);
const duplicateGroups = ref<DuplicateLinkGroup[]>([]);
const isBulkWorking = ref(false);
const isLoadingDuplicates = ref(false);

const selectedCount = computed(() => selectedLinkIds.value.size);

function toggleLinkSelection(id: number, checked: boolean) {
  const next = new Set(selectedLinkIds.value);
  if (checked) next.add(id);
  else next.delete(id);
  selectedLinkIds.value = next;
}
```

- [ ] **Step 3: Add bulk move/delete and duplicate load**

Add:

```ts
async function bulkMoveSelected() {
  if (!bulkFolderId.value || selectedLinkIds.value.size === 0) return;
  isBulkWorking.value = true;
  const ids = [...selectedLinkIds.value];
  try {
    await apiRequest<BulkLinkResult>('/api/admin/links/bulk-move', { method: 'POST', body: jsonBody({ ids, folderId: bulkFolderId.value }) });
    links.value = links.value.map((link) => (selectedLinkIds.value.has(link.id) ? { ...link, folderId: bulkFolderId.value } : link));
    selectedLinkIds.value = new Set();
    notifySuccess(`已移动 ${ids.length} 个书签`);
  } catch (event) {
    notifyError(event instanceof Error ? event.message : '批量移动失败');
  } finally {
    isBulkWorking.value = false;
  }
}

async function bulkDeleteSelected() {
  const ids = [...selectedLinkIds.value];
  if (!ids.length) return;
  const confirmed = await confirmApi.confirm({ title: '批量删除书签', message: `确定删除选中的 ${ids.length} 个书签吗？`, confirmText: '删除', tone: 'danger' });
  if (!confirmed) return;
  isBulkWorking.value = true;
  try {
    await apiRequest<BulkLinkResult>('/api/admin/links/bulk-delete', { method: 'POST', body: jsonBody({ ids }) });
    links.value = links.value.filter((link) => !selectedLinkIds.value.has(link.id));
    selectedLinkIds.value = new Set();
    notifySuccess(`已删除 ${ids.length} 个书签`);
  } catch (event) {
    notifyError(event instanceof Error ? event.message : '批量删除失败');
  } finally {
    isBulkWorking.value = false;
  }
}

async function loadDuplicates() {
  isLoadingDuplicates.value = true;
  try {
    const result = await apiRequest<{ groups: DuplicateLinkGroup[] }>('/api/admin/links/duplicates');
    duplicateGroups.value = result.groups;
  } catch (event) {
    notifyError(event instanceof Error ? event.message : '重复链接加载失败');
  } finally {
    isLoadingDuplicates.value = false;
  }
}
```

- [ ] **Step 4: Add template controls**

In `LinksView.vue`:

- Add a checkbox column to the table.
- Add per-row checkbox with `data-testid="select-link-${link.id}"`.
- Add a bulk action bar shown when `selectedCount > 0`.
- Add a duplicate panel button with `data-testid="load-duplicates"`.

The bulk bar must include:

```vue
<div v-if="selectedCount" class="bulk-action-bar">
  <strong>已选择 {{ selectedCount }} 个书签</strong>
  <select data-testid="bulk-folder" v-model.number="bulkFolderId">
    <option :value="0">选择目标文件夹</option>
    <option v-for="folder in folders" :key="folder.id" :value="folder.id">{{ folder.name }}</option>
  </select>
  <button data-testid="bulk-move" class="button" type="button" :disabled="!bulkFolderId || isBulkWorking" @click="bulkMoveSelected">移动</button>
  <button class="button danger" type="button" :disabled="isBulkWorking" @click="bulkDeleteSelected">删除</button>
</div>
```

- [ ] **Step 5: Add styles**

In `packages/web/src/styles.css`, add:

```css
.app-workbench .bulk-action-bar,
.app-workbench .duplicate-panel {
  align-items: center;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin: 12px 0;
  padding: 12px 14px;
}
```

- [ ] **Step 6: Run web tests**

Run:

```powershell
npm.cmd run test -w packages/web -- admin-links-view.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add packages/web/src/views/admin/LinksView.vue packages/web/src/styles.css packages/web/test/admin-links-view.test.ts
git commit -m "feat(web): add bulk link management"
```

---

### Task 5: Bookmark Import Preview UI

**Files:**
- Modify: `packages/web/src/views/admin/BookmarksView.vue`
- Create: `packages/web/test/admin-bookmarks-view.test.ts`
- Modify: `packages/web/src/styles.css`

- [ ] **Step 1: Write failing UI test**

Create `packages/web/test/admin-bookmarks-view.test.ts`:

```ts
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import BookmarksView from '../src/views/admin/BookmarksView.vue';

const apiRequest = vi.fn();

vi.mock('@/api/client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  jsonBody: (value: unknown) => JSON.stringify(value),
}));

function mountBookmarksView() {
  return mount(BookmarksView, {
    global: {
      stubs: { AdminLayout: { template: '<main><slot /></main>', props: ['title'] } },
    },
  });
}

describe('BookmarksView import preview', () => {
  beforeEach(() => apiRequest.mockReset());

  it('previews bookmark HTML before importing', async () => {
    apiRequest
      .mockResolvedValueOnce({
        summary: { parsedFolders: 1, parsedLinks: 2, newFolders: 1, newLinks: 1, duplicateLinks: 1, invalidLinks: 0 },
        folders: [{ tempId: 'folder-1', parentTempId: null, name: 'Dev', status: 'new' }],
        links: [
          { name: 'Example', url: 'https://example.com/', folderTempId: 'folder-1', status: 'new' },
          { name: 'GitHub', url: 'https://github.com/', folderTempId: 'folder-1', status: 'duplicate', reason: 'URL already exists' },
        ],
      })
      .mockResolvedValueOnce({ addedFolders: 1, addedLinks: 1, skippedDuplicates: 1, skippedInvalid: 0 });

    const wrapper = mountBookmarksView();
    await wrapper.get('textarea').setValue('<DL><p></DL><p>');
    await wrapper.get('[data-testid="preview-import"]').trigger('click');
    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('预览结果');
    expect(wrapper.text()).toContain('新增链接 1');
    expect(wrapper.text()).toContain('重复链接 1');

    await wrapper.get('[data-testid="confirm-import"]').trigger('click');
    await vi.dynamicImportSettled();
    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/bookmarks/import', expect.objectContaining({ method: 'POST' }));
  });
});
```

Run:

```powershell
npm.cmd run test -w packages/web -- admin-bookmarks-view.test.ts
```

Expected: FAIL because preview controls are missing.

- [ ] **Step 2: Add preview state and actions**

In `BookmarksView.vue`, import `BookmarkImportPreview`, `LoadingOverlay`, `EmptyState`, `notifyError`, and `notifySuccess`.

Add:

```ts
const preview = ref<BookmarkImportPreview | null>(null);
const isPreviewing = ref(false);
const isImporting = ref(false);

async function previewImport() {
  error.value = '';
  message.value = '';
  preview.value = null;
  if (!html.value.trim()) {
    error.value = '请先选择或粘贴浏览器书签 HTML。';
    return;
  }
  isPreviewing.value = true;
  try {
    preview.value = await apiRequest<BookmarkImportPreview>('/api/admin/bookmarks/preview', { method: 'POST', body: jsonBody({ html: html.value }) });
  } catch (event) {
    const text = event instanceof Error ? event.message : '预览失败';
    error.value = text;
    notifyError(text);
  } finally {
    isPreviewing.value = false;
  }
}
```

Change `importBookmarks()` so it sets `isImporting`, calls the existing import endpoint, clears `preview` after success, and calls `notifySuccess(message.value)`.

- [ ] **Step 3: Add preview template**

Add buttons:

```vue
<button data-testid="preview-import" class="button secondary" type="button" :disabled="isPreviewing || isImporting" @click="previewImport">预览</button>
<button data-testid="confirm-import" class="button" type="button" :disabled="!preview || isImporting" @click="importBookmarks">确认导入</button>
```

Add preview panel:

```vue
<section v-if="preview" class="import-preview-panel">
  <h3>预览结果</h3>
  <div class="preview-stats">
    <span>新增文件夹 {{ preview.summary.newFolders }}</span>
    <span>新增链接 {{ preview.summary.newLinks }}</span>
    <span>重复链接 {{ preview.summary.duplicateLinks }}</span>
    <span>不可导入 {{ preview.summary.invalidLinks }}</span>
  </div>
  <article v-for="link in preview.links.slice(0, 12)" :key="`${link.status}-${link.url}-${link.name}`" class="preview-row" :class="`preview-${link.status}`">
    <strong>{{ link.name }}</strong>
    <span>{{ link.url }}</span>
    <small>{{ link.status }}{{ link.reason ? ` · ${link.reason}` : '' }}</small>
  </article>
</section>
```

- [ ] **Step 4: Add styles**

In `packages/web/src/styles.css`, add:

```css
.app-workbench .import-preview-panel {
  border: 1px solid var(--line);
  border-radius: 8px;
  display: grid;
  gap: 10px;
  margin: 16px 0;
  padding: 16px;
}

.app-workbench .preview-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.app-workbench .preview-stats span,
.app-workbench .preview-row {
  background: #f8fafc;
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 8px 10px;
}
```

- [ ] **Step 5: Run bookmarks UI test**

Run:

```powershell
npm.cmd run test -w packages/web -- admin-bookmarks-view.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add packages/web/src/views/admin/BookmarksView.vue packages/web/src/styles.css packages/web/test/admin-bookmarks-view.test.ts
git commit -m "feat(web): preview bookmark imports"
```

---

### Task 6: Folder Tree Parent Management

**Files:**
- Modify: `packages/server/src/routes/admin/folders.ts`
- Modify: `packages/server/test/app.test.ts`
- Modify: `packages/web/src/views/admin/FoldersView.vue`
- Modify: `packages/web/test/admin-folders-view.test.ts`

- [ ] **Step 1: Write failing server validation test**

Add:

```ts
it('rejects folder parent cycles', async () => {
  const cookie = await setupAdmin();
  const parent = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Parent' } });
  const child = await app.inject({ method: 'POST', url: '/api/admin/folders', headers: { cookie }, payload: { name: 'Child', parentId: parent.json().data.id } });

  const selfParent = await app.inject({
    method: 'PUT',
    url: `/api/admin/folders/${parent.json().data.id}`,
    headers: { cookie },
    payload: { parentId: parent.json().data.id },
  });
  expect(selfParent.statusCode).toBe(400);

  const descendantParent = await app.inject({
    method: 'PUT',
    url: `/api/admin/folders/${parent.json().data.id}`,
    headers: { cookie },
    payload: { parentId: child.json().data.id },
  });
  expect(descendantParent.statusCode).toBe(400);
});
```

Run:

```powershell
npm.cmd run test -w packages/server -- app.test.ts
```

Expected: FAIL because cycles are currently accepted.

- [ ] **Step 2: Add parent validation**

In `packages/server/src/routes/admin/folders.ts`, add:

```ts
async function assertValidParent(services: AppServices, userId: number, folderId: number, parentId: number | null) {
  if (!parentId) return;
  if (parentId === folderId) throw Object.assign(new Error('Folder cannot be its own parent'), { statusCode: 400 });
  const folders = await services.repo.listFolders(userId);
  let cursor = folders.find((folder) => folder.id === parentId);
  while (cursor?.parentId) {
    if (cursor.parentId === folderId) throw Object.assign(new Error('Folder cannot use a descendant as parent'), { statusCode: 400 });
    cursor = folders.find((folder) => folder.id === cursor?.parentId);
  }
}
```

Call it in `PUT /api/admin/folders/:id` before `updateFolder`.

- [ ] **Step 3: Add folder tree UI test**

Extend `packages/web/test/admin-folders-view.test.ts`:

```ts
it('renders parent selector and indents child folders', async () => {
  apiRequest
    .mockResolvedValueOnce([
      { id: 1, userId: 1, name: 'Parent', parentId: null, sortOrder: 100 },
      { id: 2, userId: 1, name: 'Child', parentId: 1, sortOrder: 90 },
    ])
    .mockResolvedValueOnce([]);

  const wrapper = mountFoldersView();
  await settle(wrapper);

  expect(wrapper.get('[data-testid="folder-parent"]').exists()).toBe(true);
  expect(wrapper.get('[data-testid="folder-row-2"]').attributes('style')).toContain('--folder-depth: 1');
});
```

Run:

```powershell
npm.cmd run test -w packages/web -- admin-folders-view.test.ts
```

Expected: FAIL because parent selector and row depth are missing.

- [ ] **Step 4: Add tree helpers in `FoldersView.vue`**

Add:

```ts
function folderDepth(folder: Folder) {
  let depth = 0;
  let parentId = folder.parentId;
  while (parentId) {
    const parent = folders.value.find((item) => item.id === parentId);
    if (!parent) break;
    depth += 1;
    parentId = parent.parentId || null;
  }
  return depth;
}

function selectableParents() {
  return folders.value.filter((folder) => folder.id !== form.id);
}
```

Add a parent field to the form:

```vue
<div class="field">
  <label>上级文件夹</label>
  <select data-testid="folder-parent" v-model.number="form.parentId">
    <option :value="null">顶级文件夹</option>
    <option v-for="folder in selectableParents()" :key="folder.id" :value="folder.id">{{ folder.name }}</option>
  </select>
</div>
```

Add row depth:

```vue
<article :data-testid="`folder-row-${folder.id}`" :style="{ '--folder-depth': folderDepth(folder) }" ...>
```

- [ ] **Step 5: Add tree styles**

In `packages/web/src/styles.css`:

```css
.app-workbench .folder-table .text-button {
  padding-left: calc(var(--folder-depth, 0) * 18px);
}
```

- [ ] **Step 6: Run server and web tests**

Run:

```powershell
npm.cmd run test -w packages/server -- app.test.ts
npm.cmd run test -w packages/web -- admin-folders-view.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add packages/server/src/routes/admin/folders.ts packages/server/test/app.test.ts packages/web/src/views/admin/FoldersView.vue packages/web/src/styles.css packages/web/test/admin-folders-view.test.ts
git commit -m "feat(admin): add folder tree parent management"
```

---

### Task 7: Visual Contracts and Full Verification

**Files:**
- Modify: `packages/web/test/visual-contract.test.ts`

- [ ] **Step 1: Add Phase 2 visual contract**

Add:

```ts
it('defines phase 2 admin operation styles', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const css = fs.readFileSync(path.resolve(process.cwd(), 'src/styles.css'), 'utf8');

  expect(css).toContain('.bulk-action-bar');
  expect(css).toContain('.duplicate-panel');
  expect(css).toContain('.import-preview-panel');
  expect(css).toContain('--folder-depth');
});
```

- [ ] **Step 2: Run web tests**

Run:

```powershell
npm.cmd run test -w packages/web
```

Expected: PASS.

- [ ] **Step 3: Run full tests**

Run:

```powershell
npm.cmd test
```

Expected: PASS for server, web, and extension.

- [ ] **Step 4: Run production build**

Run:

```powershell
npm.cmd run build
```

Expected: server build, web `vue-tsc` + Vite build, and extension build all complete with exit code 0.

- [ ] **Step 5: Manual smoke test**

If `.env` and PostgreSQL are available:

```powershell
npm.cmd run dev
npm.cmd run dev:web
```

Open:

```text
http://127.0.0.1:5173/admin
```

Verify:

- Bookmarks page can preview import before import.
- Preview shows duplicate and invalid counts.
- Links page can select multiple links.
- Bulk move changes folder names in the list without a full page reload.
- Bulk delete removes selected rows after confirmation.
- Duplicate panel displays duplicate URL groups.
- Folders page shows parent selector and child indentation.

- [ ] **Step 6: Commit visual test**

```powershell
git add packages/web/test/visual-contract.test.ts
git commit -m "test(web): cover phase 2 admin operation styles"
```

---

## Self-Review

- Spec coverage: This plan covers Phase 2 management improvements: import preview, duplicate detection, bulk move/delete, folder tree management, and UI tests.
- Scope control: No database schema changes, no health checks, no audit log, no pagination, no recycle bin.
- Type consistency: Server preview shape and web `BookmarkImportPreview` match. Bulk route result names are `moved` and `deleted`. Duplicate response shape is `{ groups: DuplicateLinkGroup[] }`.
- Dependency control: No new third-party UI or drag library is introduced.

## Execution Order

1. Task 1: Bookmark import preview API.
2. Task 2: Duplicate and bulk link APIs.
3. Task 3: Web API types.
4. Task 4: Link bulk actions and duplicate panel.
5. Task 5: Bookmark import preview UI.
6. Task 6: Folder tree parent management.
7. Task 7: Full verification.
