# Admin Experience Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Nono admin console feel responsive and trustworthy by adding shared feedback primitives, safer destructive actions, empty/loading states, and smoother local state updates for folder and link management.

**Architecture:** Keep the current lightweight Vue 3 + Vite app and avoid backend schema changes in this phase. Add small admin UI primitives under `packages/web/src/components/admin/` and module-scoped composables under `packages/web/src/composables/`, then refactor `LinksView.vue` and `FoldersView.vue` to use them. Existing Fastify endpoints remain unchanged; successful mutations update local Vue state instead of reloading every list.

**Tech Stack:** Vue 3, TypeScript, Vue Router, Pinia, lucide-vue-next, Vitest, Vue Test Utils, jsdom.

---

## Scope

This first phase changes only the web admin experience. It does not add Prisma fields, pagination, link health checks, operation logs, recycle bin, or backend request validation. Those belong in later phases after the admin surface has reliable interaction primitives.

## File Structure

- Create: `packages/web/src/composables/useToasts.ts`
  - Owns a module-scoped toast queue.
  - Exposes `useToasts()`, `notifySuccess()`, `notifyError()`, and `clearToasts()`.
- Create: `packages/web/src/composables/useConfirm.ts`
  - Owns one active confirmation dialog at a time.
  - Exposes `useConfirm()` with `confirm(options)`, `accept()`, and `cancel()`.
- Create: `packages/web/src/components/admin/ToastHost.vue`
  - Renders global success/error/info messages.
  - Mounted once by `AdminLayout.vue`.
- Create: `packages/web/src/components/admin/ConfirmDialog.vue`
  - Renders global destructive-action confirmation.
  - Mounted once by `AdminLayout.vue`.
- Create: `packages/web/src/components/admin/EmptyState.vue`
  - Shared empty state for empty tables and filtered results.
- Create: `packages/web/src/components/admin/LoadingOverlay.vue`
  - Shared loading panel for initial fetches and busy sections.
- Modify: `packages/web/src/components/AdminLayout.vue`
  - Mounts `ToastHost` and `ConfirmDialog`.
- Modify: `packages/web/src/views/admin/LinksView.vue`
  - Adds initial loading, search, disabled busy states, confirmation before delete, toast feedback, and local state updates after save/delete/reorder.
- Modify: `packages/web/src/views/admin/FoldersView.vue`
  - Adds initial loading, disabled busy states, confirmation before delete with link impact count, toast feedback, and local state updates after save/delete/reorder.
- Modify: `packages/web/src/styles.css`
  - Adds shared admin primitives and responsive table/card rules.
- Create: `packages/web/test/admin-feedback.test.ts`
  - Tests toast and confirm primitives.
- Create: `packages/web/test/admin-links-view.test.ts`
  - Tests link page loading, filtering, delete confirmation, and local state update.
- Create: `packages/web/test/admin-folders-view.test.ts`
  - Tests folder page loading, delete impact text, and local state update.
- Modify: `packages/web/test/visual-contract.test.ts`
  - Locks in admin layout host and responsive table class contracts.

---

### Task 1: Add Toast Feedback Primitive

**Files:**
- Create: `packages/web/src/composables/useToasts.ts`
- Create: `packages/web/src/components/admin/ToastHost.vue`
- Modify: `packages/web/src/components/AdminLayout.vue`
- Create: `packages/web/test/admin-feedback.test.ts`

- [ ] **Step 1: Write the failing toast test**

Add this test to `packages/web/test/admin-feedback.test.ts`:

```ts
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ToastHost from '../src/components/admin/ToastHost.vue';
import { clearToasts, notifyError, notifySuccess } from '../src/composables/useToasts';

describe('admin feedback primitives', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearToasts();
  });

  it('renders success and error toasts and auto dismisses them', async () => {
    const wrapper = mount(ToastHost);

    notifySuccess('书签已新增');
    notifyError('保存失败');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('书签已新增');
    expect(wrapper.text()).toContain('保存失败');

    vi.advanceTimersByTime(4200);
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).not.toContain('书签已新增');
    expect(wrapper.text()).not.toContain('保存失败');
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
npm run test -w packages/web -- admin-feedback.test.ts
```

Expected: FAIL because `ToastHost.vue` and `useToasts.ts` do not exist.

- [ ] **Step 3: Implement `useToasts.ts`**

Create `packages/web/src/composables/useToasts.ts`:

```ts
import { readonly, ref } from 'vue';

export type ToastTone = 'success' | 'error' | 'info';

export interface AdminToast {
  id: number;
  tone: ToastTone;
  message: string;
}

const toasts = ref<AdminToast[]>([]);
let nextToastId = 1;

export function useToasts() {
  function dismiss(id: number) {
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  }

  function push(message: string, tone: ToastTone = 'info', duration = 4000) {
    const toast = { id: nextToastId, tone, message };
    nextToastId += 1;
    toasts.value = [...toasts.value, toast];
    if (duration > 0) window.setTimeout(() => dismiss(toast.id), duration);
    return toast.id;
  }

  return { toasts: readonly(toasts), push, dismiss };
}

export function notifySuccess(message: string) {
  return useToasts().push(message, 'success');
}

export function notifyError(message: string) {
  return useToasts().push(message, 'error');
}

export function clearToasts() {
  toasts.value = [];
}
```

- [ ] **Step 4: Implement `ToastHost.vue`**

Create `packages/web/src/components/admin/ToastHost.vue`:

```vue
<script setup lang="ts">
import { CheckCircle2, Info, X, XCircle } from 'lucide-vue-next';
import { useToasts } from '@/composables/useToasts';

const { toasts, dismiss } = useToasts();

function iconFor(tone: string) {
  if (tone === 'success') return CheckCircle2;
  if (tone === 'error') return XCircle;
  return Info;
}
</script>

<template>
  <div class="toast-stack" aria-live="polite" aria-atomic="true">
    <article v-for="toast in toasts" :key="toast.id" class="admin-toast" :class="`admin-toast-${toast.tone}`">
      <component :is="iconFor(toast.tone)" :size="18" />
      <span>{{ toast.message }}</span>
      <button class="toast-dismiss" type="button" aria-label="关闭提示" @click="dismiss(toast.id)">
        <X :size="15" />
      </button>
    </article>
  </div>
</template>
```

- [ ] **Step 5: Mount toasts in `AdminLayout.vue`**

Modify imports and template in `packages/web/src/components/AdminLayout.vue`:

```ts
import ToastHost from '@/components/admin/ToastHost.vue';
```

Add the host as the last child inside `.app-workbench`:

```vue
<ToastHost />
```

- [ ] **Step 6: Run the toast test**

Run:

```powershell
npm run test -w packages/web -- admin-feedback.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add packages/web/src/composables/useToasts.ts packages/web/src/components/admin/ToastHost.vue packages/web/src/components/AdminLayout.vue packages/web/test/admin-feedback.test.ts
git commit -m "feat(web): add admin toast feedback"
```

---

### Task 2: Add Confirmation Dialog Primitive

**Files:**
- Create: `packages/web/src/composables/useConfirm.ts`
- Create: `packages/web/src/components/admin/ConfirmDialog.vue`
- Modify: `packages/web/src/components/AdminLayout.vue`
- Modify: `packages/web/test/admin-feedback.test.ts`

- [ ] **Step 1: Add the failing confirmation test**

Append to `packages/web/test/admin-feedback.test.ts`:

```ts
import ConfirmDialog from '../src/components/admin/ConfirmDialog.vue';
import { clearConfirmState, useConfirm } from '../src/composables/useConfirm';

describe('admin confirmation primitive', () => {
  beforeEach(() => {
    clearConfirmState();
  });

  it('resolves true when accepted and false when cancelled', async () => {
    const wrapper = mount(ConfirmDialog);
    const confirmApi = useConfirm();

    const accepted = confirmApi.confirm({
      title: '删除书签',
      message: '确定删除 GitHub 吗？',
      confirmText: '删除',
      tone: 'danger',
    });

    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('删除书签');
    expect(wrapper.text()).toContain('确定删除 GitHub 吗？');

    await wrapper.get('[data-testid="confirm-accept"]').trigger('click');
    await expect(accepted).resolves.toBe(true);

    const cancelled = confirmApi.confirm({
      title: '删除文件夹',
      message: '确定删除 常用工具 吗？',
      confirmText: '删除',
      tone: 'danger',
    });

    await wrapper.vm.$nextTick();
    await wrapper.get('[data-testid="confirm-cancel"]').trigger('click');
    await expect(cancelled).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
npm run test -w packages/web -- admin-feedback.test.ts
```

Expected: FAIL because `ConfirmDialog.vue` and `useConfirm.ts` do not exist.

- [ ] **Step 3: Implement `useConfirm.ts`**

Create `packages/web/src/composables/useConfirm.ts`:

```ts
import { readonly, ref } from 'vue';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  tone?: 'danger' | 'primary';
}

interface ConfirmState extends Required<ConfirmOptions> {
  open: boolean;
}

const state = ref<ConfirmState>({
  open: false,
  title: '',
  message: '',
  confirmText: '确认',
  cancelText: '取消',
  tone: 'primary',
});

let resolver: ((value: boolean) => void) | null = null;

export function useConfirm() {
  function settle(value: boolean) {
    if (resolver) resolver(value);
    resolver = null;
    state.value = { ...state.value, open: false };
  }

  function confirm(options: ConfirmOptions) {
    if (resolver) resolver(false);
    state.value = {
      open: true,
      title: options.title,
      message: options.message,
      confirmText: options.confirmText || '确认',
      cancelText: options.cancelText || '取消',
      tone: options.tone || 'primary',
    };
    return new Promise<boolean>((resolve) => {
      resolver = resolve;
    });
  }

  return {
    state: readonly(state),
    confirm,
    accept: () => settle(true),
    cancel: () => settle(false),
  };
}

export function clearConfirmState() {
  if (resolver) resolver(false);
  resolver = null;
  state.value = {
    open: false,
    title: '',
    message: '',
    confirmText: '确认',
    cancelText: '取消',
    tone: 'primary',
  };
}
```

- [ ] **Step 4: Implement `ConfirmDialog.vue`**

Create `packages/web/src/components/admin/ConfirmDialog.vue`:

```vue
<script setup lang="ts">
import { AlertTriangle, X } from 'lucide-vue-next';
import { useConfirm } from '@/composables/useConfirm';

const confirmApi = useConfirm();
</script>

<template>
  <Teleport to="body">
    <div v-if="confirmApi.state.value.open" class="confirm-backdrop" role="presentation">
      <section class="confirm-dialog" role="dialog" aria-modal="true" :aria-label="confirmApi.state.value.title">
        <div class="confirm-icon" :class="{ danger: confirmApi.state.value.tone === 'danger' }">
          <AlertTriangle :size="20" />
        </div>
        <div class="confirm-copy">
          <h2>{{ confirmApi.state.value.title }}</h2>
          <p>{{ confirmApi.state.value.message }}</p>
        </div>
        <button class="icon-button secondary confirm-close" type="button" aria-label="关闭" @click="confirmApi.cancel">
          <X :size="16" />
        </button>
        <div class="confirm-actions">
          <button data-testid="confirm-cancel" class="button secondary" type="button" @click="confirmApi.cancel">
            {{ confirmApi.state.value.cancelText }}
          </button>
          <button data-testid="confirm-accept" class="button" :class="{ danger: confirmApi.state.value.tone === 'danger' }" type="button" @click="confirmApi.accept">
            {{ confirmApi.state.value.confirmText }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
```

- [ ] **Step 5: Mount confirm dialog in `AdminLayout.vue`**

Modify imports:

```ts
import ConfirmDialog from '@/components/admin/ConfirmDialog.vue';
```

Add the host near `ToastHost`:

```vue
<ToastHost />
<ConfirmDialog />
```

- [ ] **Step 6: Run feedback tests**

Run:

```powershell
npm run test -w packages/web -- admin-feedback.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add packages/web/src/composables/useConfirm.ts packages/web/src/components/admin/ConfirmDialog.vue packages/web/src/components/AdminLayout.vue packages/web/test/admin-feedback.test.ts
git commit -m "feat(web): add admin confirmation dialog"
```

---

### Task 3: Add Empty and Loading States

**Files:**
- Create: `packages/web/src/components/admin/EmptyState.vue`
- Create: `packages/web/src/components/admin/LoadingOverlay.vue`
- Modify: `packages/web/src/styles.css`
- Modify: `packages/web/test/visual-contract.test.ts`

- [ ] **Step 1: Add visual contract assertions**

Append this test to `packages/web/test/visual-contract.test.ts`:

```ts
it('defines shared admin feedback, empty, loading, and responsive table classes', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const css = fs.readFileSync(path.resolve(process.cwd(), 'src/styles.css'), 'utf8');

  expect(css).toContain('.toast-stack');
  expect(css).toContain('.confirm-backdrop');
  expect(css).toContain('.admin-empty-state');
  expect(css).toContain('.loading-overlay');
  expect(css).toContain('@media (max-width: 720px)');
  expect(css).toContain('.admin-table.mobile-card-table');
});
```

- [ ] **Step 2: Run the failing visual test**

Run:

```powershell
npm run test -w packages/web -- visual-contract.test.ts
```

Expected: FAIL because the new class names are missing from `styles.css`.

- [ ] **Step 3: Implement `EmptyState.vue`**

Create `packages/web/src/components/admin/EmptyState.vue`:

```vue
<script setup lang="ts">
import { Inbox } from 'lucide-vue-next';

defineProps<{
  title: string;
  description: string;
}>();
</script>

<template>
  <div class="admin-empty-state">
    <Inbox :size="24" />
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
    <div v-if="$slots.action" class="admin-empty-action">
      <slot name="action" />
    </div>
  </div>
</template>
```

- [ ] **Step 4: Implement `LoadingOverlay.vue`**

Create `packages/web/src/components/admin/LoadingOverlay.vue`:

```vue
<script setup lang="ts">
defineProps<{
  label?: string;
}>();
</script>

<template>
  <div class="loading-overlay" role="status" aria-live="polite">
    <span class="loading-spinner" aria-hidden="true"></span>
    <span>{{ label || '正在加载' }}</span>
  </div>
</template>
```

- [ ] **Step 5: Add shared styles**

Append these styles to `packages/web/src/styles.css` after the existing admin workbench section:

```css
.toast-stack {
  bottom: 24px;
  display: grid;
  gap: 10px;
  position: fixed;
  right: 24px;
  width: min(360px, calc(100vw - 32px));
  z-index: 80;
}

.admin-toast {
  align-items: center;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.14);
  color: #0f172a;
  display: grid;
  gap: 10px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  min-height: 44px;
  padding: 10px 12px;
}

.admin-toast-success {
  border-color: #bbf7d0;
}

.admin-toast-error {
  border-color: #fecdd3;
}

.toast-dismiss {
  align-items: center;
  border-radius: 6px;
  color: #64748b;
  display: inline-flex;
  height: 28px;
  justify-content: center;
  width: 28px;
}

.toast-dismiss:hover {
  background: #f1f5f9;
  color: #0f172a;
}

.confirm-backdrop {
  align-items: center;
  background: rgba(15, 23, 42, 0.34);
  display: grid;
  inset: 0;
  padding: 20px;
  position: fixed;
  z-index: 90;
}

.confirm-dialog {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.22);
  display: grid;
  gap: 16px;
  grid-template-columns: auto minmax(0, 1fr) auto;
  margin: 0 auto;
  max-width: 460px;
  padding: 20px;
  width: 100%;
}

.confirm-icon {
  align-items: center;
  background: #eff6ff;
  border-radius: 8px;
  color: #2563eb;
  display: inline-flex;
  height: 40px;
  justify-content: center;
  width: 40px;
}

.confirm-icon.danger {
  background: #fef2f2;
  color: #dc2626;
}

.confirm-copy h2 {
  font-size: 18px;
  margin: 0 0 6px;
}

.confirm-copy p {
  color: #475569;
  font-size: 14px;
  line-height: 1.5;
  margin: 0;
}

.confirm-actions {
  display: flex;
  gap: 10px;
  grid-column: 1 / -1;
  justify-content: flex-end;
}

.admin-empty-state {
  align-items: center;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
  color: #64748b;
  display: grid;
  justify-items: center;
  min-height: 180px;
  padding: 32px 20px;
  text-align: center;
}

.admin-empty-state h3 {
  color: #0f172a;
  font-size: 16px;
  margin: 10px 0 4px;
}

.admin-empty-state p {
  margin: 0;
}

.admin-empty-action {
  margin-top: 16px;
}

.loading-overlay {
  align-items: center;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  color: #475569;
  display: inline-flex;
  gap: 10px;
  min-height: 64px;
  padding: 18px 20px;
  width: 100%;
}

.loading-spinner {
  animation: admin-spin 0.8s linear infinite;
  border: 2px solid #dbeafe;
  border-top-color: #2563eb;
  border-radius: 999px;
  height: 18px;
  width: 18px;
}

@keyframes admin-spin {
  to {
    transform: rotate(360deg);
  }
}

.app-workbench .button:disabled,
.app-workbench .icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
  transform: none;
}

@media (max-width: 720px) {
  .app-workbench .admin-table.mobile-card-table {
    border: 0;
    gap: 12px;
  }

  .app-workbench .admin-table.mobile-card-table .admin-table-head {
    display: none;
  }

  .app-workbench .admin-table.mobile-card-table .admin-table-row {
    border: 1px solid var(--line);
    border-radius: 8px;
    display: grid;
    gap: 10px;
    min-width: 0;
  }
}
```

- [ ] **Step 6: Run the visual test**

Run:

```powershell
npm run test -w packages/web -- visual-contract.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```powershell
git add packages/web/src/components/admin/EmptyState.vue packages/web/src/components/admin/LoadingOverlay.vue packages/web/src/styles.css packages/web/test/visual-contract.test.ts
git commit -m "feat(web): add admin empty and loading states"
```

---

### Task 4: Refactor Link Management for Smooth Local Updates

**Files:**
- Modify: `packages/web/src/views/admin/LinksView.vue`
- Create: `packages/web/test/admin-links-view.test.ts`

- [ ] **Step 1: Write failing link-management tests**

Create `packages/web/test/admin-links-view.test.ts`:

```ts
import { mount, RouterLinkStub } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LinksView from '../src/views/admin/LinksView.vue';

const apiRequest = vi.fn();

vi.mock('@/api/client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  jsonBody: (value: unknown) => JSON.stringify(value),
}));

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => ({ confirm: vi.fn().mockResolvedValue(true) }),
}));

vi.mock('@/composables/useToasts', () => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));

function mountLinksView() {
  return mount(LinksView, {
    global: {
      stubs: {
        AdminLayout: { template: '<main><slot /></main>', props: ['title'] },
        RouterLink: RouterLinkStub,
      },
    },
  });
}

describe('LinksView admin workflow', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('shows loaded links and filters within the active folder', async () => {
    apiRequest
      .mockResolvedValueOnce([
        { id: 1, userId: 1, name: '工具', sortOrder: 100 },
        { id: 2, userId: 1, name: '文档', sortOrder: 90 },
      ])
      .mockResolvedValueOnce([
        { id: 10, folderId: 1, name: 'GitHub', url: 'https://github.com/', sortOrder: 100 },
        { id: 11, folderId: 1, name: 'MDN', url: 'https://developer.mozilla.org/', description: 'Web docs', sortOrder: 90 },
        { id: 12, folderId: 2, name: 'Vue', url: 'https://vuejs.org/', sortOrder: 80 },
      ]);

    const wrapper = mountLinksView();
    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('GitHub');
    expect(wrapper.text()).toContain('MDN');
    expect(wrapper.text()).not.toContain('Vue');

    await wrapper.get('[data-testid="link-search"]').setValue('docs');
    expect(wrapper.text()).not.toContain('GitHub');
    expect(wrapper.text()).toContain('MDN');
  });

  it('removes a deleted link from local state without reloading every list', async () => {
    apiRequest
      .mockResolvedValueOnce([{ id: 1, userId: 1, name: '工具', sortOrder: 100 }])
      .mockResolvedValueOnce([{ id: 10, folderId: 1, name: 'GitHub', url: 'https://github.com/', sortOrder: 100 }])
      .mockResolvedValueOnce({ ok: true });

    const wrapper = mountLinksView();
    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    await wrapper.get('[data-testid="delete-link-10"]').trigger('click');
    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    expect(apiRequest).toHaveBeenCalledTimes(3);
    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/links/10', { method: 'DELETE' });
    expect(wrapper.text()).not.toContain('GitHub');
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```powershell
npm run test -w packages/web -- admin-links-view.test.ts
```

Expected: FAIL because `LinksView.vue` has no search input, no `data-testid="delete-link-10"`, and still reloads folders and links after delete.

- [ ] **Step 3: Update `LinksView.vue` state**

Modify the script in `packages/web/src/views/admin/LinksView.vue` to include:

```ts
import EmptyState from '@/components/admin/EmptyState.vue';
import LoadingOverlay from '@/components/admin/LoadingOverlay.vue';
import { useConfirm } from '@/composables/useConfirm';
import { notifyError, notifySuccess } from '@/composables/useToasts';

const confirmApi = useConfirm();
const isInitialLoading = ref(true);
const isSaving = ref(false);
const isSavingSort = ref(false);
const deletingIds = ref(new Set<number>());
const searchTerm = ref('');

const filteredLinks = computed(() => {
  const query = searchTerm.value.trim().toLowerCase();
  const base = sortMode.value ? draftLinks.value : links.value
    .filter((link) => link.folderId === activeFolder.value?.id)
    .sort((a, b) => b.sortOrder - a.sortOrder || a.id - b.id);
  if (!query) return base;
  return base.filter((link) => [link.name, link.url, link.description || ''].join(' ').toLowerCase().includes(query));
});
```

Replace references to `shownLinks` with `filteredLinks`.

- [ ] **Step 4: Update link loading and save behavior**

Change `load()` and `save()` to:

```ts
async function load() {
  isInitialLoading.value = true;
  try {
    [folders.value, links.value] = await Promise.all([apiRequest<Folder[]>('/api/admin/folders'), apiRequest<Link[]>('/api/admin/links')]);
    if (!selectedFolderId.value && folders.value[0]) selectedFolderId.value = folders.value[0].id;
    if (!form.folderId && folders.value[0]) form.folderId = folders.value[0].id;
  } catch (event) {
    notifyError(event instanceof Error ? event.message : '加载书签失败');
  } finally {
    isInitialLoading.value = false;
  }
}

async function save() {
  error.value = '';
  message.value = '';
  isSaving.value = true;
  try {
    const saved = form.id
      ? await apiRequest<Link>(`/api/admin/links/${form.id}`, { method: 'PUT', body: jsonBody(form) })
      : await apiRequest<Link>('/api/admin/links', { method: 'POST', body: jsonBody(form) });
    links.value = form.id ? links.value.map((link) => (link.id === saved.id ? saved : link)) : [saved, ...links.value];
    notifySuccess(form.id ? '书签已更新' : '书签已新增');
    reset();
  } catch (event) {
    const text = event instanceof Error ? event.message : '保存失败';
    error.value = text;
    notifyError(text);
  } finally {
    isSaving.value = false;
  }
}
```

- [ ] **Step 5: Update delete and sorting behavior**

Change `remove()` and `saveSorting()` to:

```ts
async function remove(link: Link) {
  const confirmed = await confirmApi.confirm({
    title: '删除书签',
    message: `确定删除「${link.name}」吗？这个操作会立即从公开导航页移除该链接。`,
    confirmText: '删除',
    tone: 'danger',
  });
  if (!confirmed) return;

  deletingIds.value = new Set([...deletingIds.value, link.id]);
  try {
    await apiRequest(`/api/admin/links/${link.id}`, { method: 'DELETE' });
    links.value = links.value.filter((item) => item.id !== link.id);
    notifySuccess('书签已删除');
  } catch (event) {
    notifyError(event instanceof Error ? event.message : '删除失败');
  } finally {
    const next = new Set(deletingIds.value);
    next.delete(link.id);
    deletingIds.value = next;
  }
}

async function saveSorting() {
  isSavingSort.value = true;
  try {
    await apiRequest('/api/admin/links/reorder', { method: 'PUT', body: jsonBody({ ids: draftLinks.value.map((link) => link.id) }) });
    const orderMap = new Map(draftLinks.value.map((link, index) => [link.id, (draftLinks.value.length - index) * 10]));
    links.value = links.value.map((link) => (orderMap.has(link.id) ? { ...link, sortOrder: orderMap.get(link.id)! } : link));
    notifySuccess('书签顺序已保存');
    stopSorting();
  } catch (event) {
    notifyError(event instanceof Error ? event.message : '排序保存失败');
  } finally {
    isSavingSort.value = false;
  }
}
```

- [ ] **Step 6: Update the `LinksView.vue` template**

Add a toolbar search input in the second card header:

```vue
<input data-testid="link-search" v-model="searchTerm" class="admin-search-input" placeholder="搜索名称、链接或介绍" />
```

Render loading and empty states:

```vue
<LoadingOverlay v-if="isInitialLoading" label="正在加载书签" />
<EmptyState v-else-if="!filteredLinks.length" title="没有匹配的书签" description="换一个关键词或选择其他文件夹。" />
<div v-else class="admin-table bookmark-table mobile-card-table">
```

Add delete test id and disabled state:

```vue
<button class="icon-button danger" :data-testid="`delete-link-${link.id}`" title="删除" :disabled="deletingIds.has(link.id)" @click="remove(link)">
  <Trash2 :size="16" />
</button>
```

Disable save buttons while saving:

```vue
<button class="button" type="button" :disabled="isSaving" @click="save">
  <Plus :size="18" /> {{ isSaving ? '保存中' : form.id ? '保存书签' : '新增书签' }}
</button>
```

- [ ] **Step 7: Run link tests**

Run:

```powershell
npm run test -w packages/web -- admin-links-view.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```powershell
git add packages/web/src/views/admin/LinksView.vue packages/web/test/admin-links-view.test.ts
git commit -m "feat(web): smooth link admin workflow"
```

---

### Task 5: Refactor Folder Management for Safer Actions

**Files:**
- Modify: `packages/web/src/views/admin/FoldersView.vue`
- Create: `packages/web/test/admin-folders-view.test.ts`

- [ ] **Step 1: Write failing folder-management tests**

Create `packages/web/test/admin-folders-view.test.ts`:

```ts
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FoldersView from '../src/views/admin/FoldersView.vue';

const apiRequest = vi.fn();

vi.mock('@/api/client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  jsonBody: (value: unknown) => JSON.stringify(value),
}));

vi.mock('@/composables/useConfirm', () => ({
  useConfirm: () => ({ confirm: vi.fn().mockResolvedValue(true) }),
}));

vi.mock('@/composables/useToasts', () => ({
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));

function mountFoldersView() {
  return mount(FoldersView, {
    global: {
      stubs: {
        AdminLayout: { template: '<main><slot /></main>', props: ['title'] },
      },
    },
  });
}

describe('FoldersView admin workflow', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('shows folder link impact counts before deletion and removes locally', async () => {
    apiRequest
      .mockResolvedValueOnce([
        { id: 1, userId: 1, name: '工具', sortOrder: 100, passwordHint: '' },
        { id: 2, userId: 1, name: '文档', sortOrder: 90, passwordHint: '' },
      ])
      .mockResolvedValueOnce([
        { id: 10, folderId: 1, name: 'GitHub', url: 'https://github.com/', sortOrder: 100 },
        { id: 11, folderId: 1, name: 'MDN', url: 'https://developer.mozilla.org/', sortOrder: 90 },
      ])
      .mockResolvedValueOnce({ ok: true });

    const wrapper = mountFoldersView();
    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('2 个书签');

    await wrapper.get('[data-testid="delete-folder-1"]').trigger('click');
    await vi.dynamicImportSettled();
    await wrapper.vm.$nextTick();

    expect(apiRequest).toHaveBeenCalledTimes(3);
    expect(apiRequest).toHaveBeenLastCalledWith('/api/admin/folders/1', { method: 'DELETE' });
    expect(wrapper.text()).not.toContain('工具');
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
npm run test -w packages/web -- admin-folders-view.test.ts
```

Expected: FAIL because `FoldersView.vue` does not load links, does not show link counts, and still reloads after delete.

- [ ] **Step 3: Update `FoldersView.vue` state**

Modify the script in `packages/web/src/views/admin/FoldersView.vue`:

```ts
import EmptyState from '@/components/admin/EmptyState.vue';
import LoadingOverlay from '@/components/admin/LoadingOverlay.vue';
import { useConfirm } from '@/composables/useConfirm';
import { notifyError, notifySuccess } from '@/composables/useToasts';
import type { Folder, Link } from '@/api/types';

const confirmApi = useConfirm();
const links = ref<Link[]>([]);
const isInitialLoading = ref(true);
const isSaving = ref(false);
const movingFolderId = ref<number | null>(null);
const deletingIds = ref(new Set<number>());

const linkCountsByFolder = computed(() => {
  const counts = new Map<number, number>();
  for (const link of links.value) counts.set(link.folderId, (counts.get(link.folderId) || 0) + 1);
  return counts;
});

function folderLinkCount(folderId: number) {
  return linkCountsByFolder.value.get(folderId) || 0;
}
```

- [ ] **Step 4: Update folder loading and save behavior**

Change `load()` and `save()`:

```ts
async function load() {
  isInitialLoading.value = true;
  try {
    [folders.value, links.value] = await Promise.all([
      apiRequest<Folder[]>('/api/admin/folders'),
      apiRequest<Link[]>('/api/admin/links'),
    ]);
  } catch (event) {
    notifyError(event instanceof Error ? event.message : '加载文件夹失败');
  } finally {
    isInitialLoading.value = false;
  }
}

async function save() {
  error.value = '';
  message.value = '';
  isSaving.value = true;
  try {
    const saved = form.id
      ? await apiRequest<Folder>(`/api/admin/folders/${form.id}`, { method: 'PUT', body: jsonBody(form) })
      : await apiRequest<Folder>('/api/admin/folders', { method: 'POST', body: jsonBody(form) });
    folders.value = form.id ? folders.value.map((folder) => (folder.id === saved.id ? saved : folder)) : [saved, ...folders.value];
    notifySuccess(form.id ? '文件夹已更新' : '文件夹已新增');
    reset();
  } catch (event) {
    const text = event instanceof Error ? event.message : '保存失败';
    error.value = text;
    notifyError(text);
  } finally {
    isSaving.value = false;
  }
}
```

- [ ] **Step 5: Update folder delete and move behavior**

Change `remove()` and `move()`:

```ts
async function remove(folder: Folder) {
  const linkCount = folderLinkCount(folder.id);
  const confirmed = await confirmApi.confirm({
    title: '删除文件夹',
    message: `确定删除「${folder.name}」吗？该文件夹内的 ${linkCount} 个书签会一起删除。`,
    confirmText: '删除',
    tone: 'danger',
  });
  if (!confirmed) return;

  deletingIds.value = new Set([...deletingIds.value, folder.id]);
  try {
    await apiRequest(`/api/admin/folders/${folder.id}`, { method: 'DELETE' });
    folders.value = folders.value.filter((item) => item.id !== folder.id);
    links.value = links.value.filter((link) => link.folderId !== folder.id);
    notifySuccess('文件夹已删除');
  } catch (event) {
    notifyError(event instanceof Error ? event.message : '删除失败');
  } finally {
    const next = new Set(deletingIds.value);
    next.delete(folder.id);
    deletingIds.value = next;
  }
}

async function move(folder: Folder, direction: -1 | 1) {
  const ids = sortedFolders.value.map((item) => item.id);
  const index = ids.indexOf(folder.id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= ids.length) return;
  [ids[index], ids[next]] = [ids[next], ids[index]];
  movingFolderId.value = folder.id;
  try {
    await apiRequest('/api/admin/folders/reorder', { method: 'PUT', body: jsonBody({ ids }) });
    const orderMap = new Map(ids.map((id, orderIndex) => [id, (ids.length - orderIndex) * 10]));
    folders.value = folders.value.map((item) => ({ ...item, sortOrder: orderMap.get(item.id) || item.sortOrder }));
    notifySuccess('文件夹顺序已保存');
  } catch (event) {
    notifyError(event instanceof Error ? event.message : '排序保存失败');
  } finally {
    movingFolderId.value = null;
  }
}
```

- [ ] **Step 6: Update `FoldersView.vue` template**

Render loading and empty states:

```vue
<LoadingOverlay v-if="isInitialLoading" label="正在加载文件夹" />
<EmptyState v-else-if="!sortedFolders.length" title="还没有文件夹" description="先创建一个文件夹，再添加导航链接。">
  <template #action>
    <button class="button" type="button" @click="reset">创建文件夹</button>
  </template>
</EmptyState>
<div v-else class="admin-table folder-table mobile-card-table">
```

Add the link count column:

```vue
<span>书签数</span>
```

Add row value:

```vue
<span>{{ folderLinkCount(folder.id) }} 个书签</span>
```

Update row actions:

```vue
<button class="icon-button secondary" title="上移" :disabled="index === 0 || movingFolderId === folder.id" @click="move(folder, -1)">
  <MoveUp :size="16" />
</button>
<button class="icon-button secondary" title="下移" :disabled="index === sortedFolders.length - 1 || movingFolderId === folder.id" @click="move(folder, 1)">
  <MoveDown :size="16" />
</button>
<button class="icon-button danger" :data-testid="`delete-folder-${folder.id}`" title="删除" :disabled="deletingIds.has(folder.id)" @click="remove(folder)">
  <Trash2 :size="16" />
</button>
```

Disable the primary save button:

```vue
<button class="button" type="button" :disabled="isSaving" @click="save">
  <FolderPlus :size="18" /> {{ isSaving ? '保存中' : form.id ? '保存文件夹' : '新增文件夹' }}
</button>
```

- [ ] **Step 7: Run folder tests**

Run:

```powershell
npm run test -w packages/web -- admin-folders-view.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

Run:

```powershell
git add packages/web/src/views/admin/FoldersView.vue packages/web/test/admin-folders-view.test.ts
git commit -m "feat(web): smooth folder admin workflow"
```

---

### Task 6: Polish Admin Table Responsiveness and Busy States

**Files:**
- Modify: `packages/web/src/styles.css`
- Modify: `packages/web/test/visual-contract.test.ts`

- [ ] **Step 1: Add visual contract assertions for busy and mobile labels**

Append to the admin visual contract test:

```ts
expect(css).toContain('[data-label]::before');
expect(css).toContain('.admin-search-input');
expect(css).toContain('.row-actions .icon-button');
```

- [ ] **Step 2: Run the failing visual test**

Run:

```powershell
npm run test -w packages/web -- visual-contract.test.ts
```

Expected: FAIL until the CSS additions are present.

- [ ] **Step 3: Add CSS for search and mobile labels**

Append to `packages/web/src/styles.css`:

```css
.app-workbench .admin-search-input {
  background: #ffffff;
  border: 1px solid var(--line);
  border-radius: 8px;
  color: var(--text);
  min-height: 38px;
  min-width: min(280px, 100%);
  padding: 8px 12px;
}

.app-workbench .admin-search-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.app-workbench .row-actions .icon-button {
  flex: 0 0 auto;
}

@media (max-width: 720px) {
  .app-workbench .admin-table.mobile-card-table .admin-table-row > span,
  .app-workbench .admin-table.mobile-card-table .admin-table-row > button,
  .app-workbench .admin-table.mobile-card-table .admin-table-row > a {
    align-items: center;
    display: grid;
    gap: 6px;
    grid-template-columns: 86px minmax(0, 1fr);
  }

  .app-workbench .admin-table.mobile-card-table [data-label]::before {
    color: #64748b;
    content: attr(data-label);
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
  }

  .app-workbench .admin-table.mobile-card-table .row-actions {
    display: flex;
    justify-content: flex-start;
  }
}
```

- [ ] **Step 4: Add `data-label` attributes in admin rows**

In `LinksView.vue`, add:

```vue
<span class="sort-cell" data-label="排序">...</span>
<button class="text-button" data-label="名称" type="button" @click="edit(link)">{{ link.name }}</button>
<span class="url-cell" data-label="链接">{{ link.url }}</span>
<span data-label="文件夹">{{ folders.find((folder) => folder.id === link.folderId)?.name || '-' }}</span>
<span class="row-actions" data-label="操作">...</span>
```

In `FoldersView.vue`, add:

```vue
<span data-label="图标">{{ folder.icon || '□' }}</span>
<button class="text-button" data-label="名称" type="button" @click="edit(folder)">{{ folder.name }}</button>
<span data-label="书签数">{{ folderLinkCount(folder.id) }} 个书签</span>
<span data-label="引导语">{{ folder.passwordHint || folder.description || '-' }}</span>
<span class="row-actions" data-label="操作">...</span>
```

- [ ] **Step 5: Run visual tests**

Run:

```powershell
npm run test -w packages/web -- visual-contract.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

Run:

```powershell
git add packages/web/src/styles.css packages/web/src/views/admin/LinksView.vue packages/web/src/views/admin/FoldersView.vue packages/web/test/visual-contract.test.ts
git commit -m "style(web): polish admin responsive tables"
```

---

### Task 7: Full Verification

**Files:**
- No source files changed in this task.

- [ ] **Step 1: Run web tests**

Run:

```powershell
npm run test -w packages/web
```

Expected: PASS.

- [ ] **Step 2: Run full workspace tests**

Run:

```powershell
npm test
```

Expected: PASS for server, web, and extension tests.

- [ ] **Step 3: Run production build**

Run:

```powershell
npm run build
```

Expected: server, web, and extension builds complete successfully.

- [ ] **Step 4: Manual browser smoke test**

Run:

```powershell
npm run dev
```

In another terminal:

```powershell
npm run dev:web
```

Open:

```text
http://127.0.0.1:5173/admin
```

Verify these flows:

- Link page loads with a loading state, then shows links.
- Link search filters name, URL, and description.
- Link delete opens a confirmation dialog before the API call.
- After deleting a link, the row disappears without a full list reload.
- Folder page shows link counts.
- Folder delete confirmation includes the affected link count.
- On a viewport near 390px wide, link and folder rows render as readable cards.

- [ ] **Step 5: Commit verification-only changes if tests required fixture updates**

If test fixtures changed during verification, run:

```powershell
git add packages/web/test
git commit -m "test(web): update admin workflow fixtures"
```

If no files changed, skip this commit.

---

## Self-Review

- Spec coverage: The plan covers the first-stage goals: shared feedback, confirmation, loading, empty states, smoother link workflow, smoother folder workflow, and responsive admin table behavior.
- Placeholder scan: The plan contains concrete files, commands, assertions, and code snippets. It does not rely on unspecified backend work.
- Type consistency: New composables use `ToastTone`, `AdminToast`, `ConfirmOptions`, and existing `Folder`/`Link` types from `packages/web/src/api/types.ts`. The same `filteredLinks`, `isInitialLoading`, `isSaving`, `deletingIds`, and `folderLinkCount` names are used consistently across test and implementation steps.

## Execution Order

1. Task 1: Toast feedback.
2. Task 2: Confirmation dialog.
3. Task 3: Empty and loading states.
4. Task 4: Link management workflow.
5. Task 5: Folder management workflow.
6. Task 6: Responsive and busy-state polish.
7. Task 7: Full verification.
