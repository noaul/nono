<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { BookOpen, Check, RotateCcw, X } from '@lucide/vue';
import AdminStateBanner from '@/components/admin/AdminStateBanner.vue';
import ContentManagementTabs from '@/components/admin/ContentManagementTabs.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { Link, ReadingPage, ReadingStatus } from '@/api/types';
import { useToasts } from '@/composables/useToasts';
import { useI18n } from '@/composables/useI18n';
import { formatShanghaiDateTime } from '@/utils/dateTime';

const { t } = useI18n();
const toasts = useToasts();

const PAGE_SIZE = 50;
const status = ref<ReadingStatus>('unread');
const items = ref<ReadingPage['items']>([]);
const total = ref(0);
const unread = ref(0);
const loading = ref(true);
const loadingMore = ref(false);
const workingIds = ref(new Set<number>());
const error = ref('');

function fetchPage(offset: number) {
  return apiRequest<ReadingPage>(`/api/admin/reading?status=${status.value}&limit=${PAGE_SIZE}&offset=${offset}`);
}

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const page = await fetchPage(0);
    items.value = page.items;
    total.value = page.total;
    unread.value = page.unread;
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('reading.loadFailed');
  } finally {
    loading.value = false;
  }
}

async function loadMore() {
  loadingMore.value = true;
  try {
    const page = await fetchPage(items.value.length);
    items.value = [...items.value, ...page.items];
    total.value = page.total;
    unread.value = page.unread;
  } catch (event) {
    toasts.push(event instanceof Error ? event.message : t('reading.loadFailed'), 'error');
  } finally {
    loadingMore.value = false;
  }
}

function switchStatus(next: ReadingStatus) {
  if (status.value === next) return;
  status.value = next;
  void load();
}

// Every action takes the link out of the current list: read moves it to "read", unread moves it
// back, and removing drops it from the inbox altogether.
async function change(link: Link, payload: { read?: boolean; readLater?: boolean }, message: string) {
  if (workingIds.value.has(link.id)) return;
  workingIds.value = new Set(workingIds.value).add(link.id);
  try {
    await apiRequest<Link>(`/api/admin/links/${link.id}`, { method: 'PUT', body: jsonBody(payload) });
    items.value = items.value.filter((item) => item.id !== link.id);
    total.value = Math.max(0, total.value - 1);
    if (status.value === 'unread' || payload.read === false) unread.value += status.value === 'unread' ? -1 : 1;
    toasts.push(message, 'success');
  } catch (event) {
    toasts.push(event instanceof Error ? event.message : t('reading.updateFailed'), 'error');
  } finally {
    const next = new Set(workingIds.value);
    next.delete(link.id);
    workingIds.value = next;
  }
}

function openLink(link: Link) {
  if (status.value === 'unread') void change(link, { read: true }, t('reading.markedRead'));
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function formatDate(value?: string | null) {
  return value ? formatShanghaiDateTime(value, 'zh-CN', { dateStyle: 'medium', timeStyle: 'short' }) : '';
}

onMounted(load);
</script>

<template>
  <div class="admin-page-stack reading-page">
    <ContentManagementTabs active="reading" />
    <AdminStateBanner v-if="error" :message="error" tone="error" />

    <section class="admin-card admin-section reading-section">
      <header class="reading-toolbar">
        <div class="reading-filters" :aria-label="t('reading.filters')">
          <button type="button" data-testid="reading-unread" :class="{ active: status === 'unread' }" :aria-pressed="status === 'unread'" @click="switchStatus('unread')">
            {{ t('reading.unread') }}<span v-if="unread" class="reading-badge">{{ unread }}</span>
          </button>
          <button type="button" data-testid="reading-read" :class="{ active: status === 'read' }" :aria-pressed="status === 'read'" @click="switchStatus('read')">
            {{ t('reading.read') }}
          </button>
        </div>
        <span class="reading-count">{{ t('trash.itemCount', { count: total }) }}</span>
      </header>

      <p v-if="loading" class="reading-empty">{{ t('common.loading') }}</p>
      <p v-else-if="!items.length" class="reading-empty">{{ status === 'unread' ? t('reading.emptyUnread') : t('reading.emptyRead') }}</p>
      <div v-else class="reading-list">
        <article v-for="link in items" :key="link.id" class="reading-row" :data-testid="`reading-item-${link.id}`">
          <span class="reading-icon"><BookOpen :size="18" /></span>
          <div class="reading-main">
            <a :href="link.url" target="_blank" rel="noreferrer" :data-testid="`reading-open-${link.id}`" @click="openLink(link)">{{ link.name || link.url }}</a>
            <span>
              {{ hostOf(link.url) }} · {{ link.folderPath.join(' / ') }} ·
              {{ status === 'unread' ? t('reading.queuedAt', { date: formatDate(link.readLaterAt) }) : t('reading.readAt', { date: formatDate(link.readAt) }) }}
            </span>
          </div>
          <div class="reading-actions">
            <button
              v-if="status === 'unread'"
              class="icon-button success"
              type="button"
              :title="t('reading.markRead')"
              :aria-label="t('reading.markRead')"
              :data-testid="`reading-mark-read-${link.id}`"
              :disabled="workingIds.has(link.id)"
              @click="change(link, { read: true }, t('reading.markedRead'))"
            ><Check :size="16" /></button>
            <button
              v-else
              class="icon-button secondary"
              type="button"
              :title="t('reading.markUnread')"
              :aria-label="t('reading.markUnread')"
              :disabled="workingIds.has(link.id)"
              @click="change(link, { read: false }, t('reading.markedUnread'))"
            ><RotateCcw :size="16" /></button>
            <button
              class="icon-button secondary"
              type="button"
              :title="t('reading.remove')"
              :aria-label="t('reading.remove')"
              :data-testid="`reading-remove-${link.id}`"
              :disabled="workingIds.has(link.id)"
              @click="change(link, { readLater: false }, t('reading.removed'))"
            ><X :size="16" /></button>
          </div>
        </article>
      </div>
      <div v-if="!loading && items.length < total" class="reading-more">
        <button class="button secondary" type="button" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? t('trash.loadingMore') : t('trash.loadMore') }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.reading-section { min-width: 0; }
.reading-toolbar { align-items: center; display: flex; gap: 12px; justify-content: space-between; }
.reading-filters { background: var(--admin-control-bg); border: 1px solid var(--admin-border); border-radius: 8px; display: inline-flex; gap: 2px; padding: 3px; }
.reading-filters button { align-items: center; border-radius: 6px; color: var(--admin-text-muted); display: inline-flex; font-size: 13px; gap: 6px; min-height: 32px; padding: 0 12px; }
.reading-filters button.active { background: var(--admin-surface-elevated); color: var(--admin-text); }
.reading-badge { background: var(--admin-accent); border-radius: 999px; color: #fff; font-size: 11px; font-weight: 700; line-height: 1; padding: 3px 6px; }
.reading-count { color: var(--admin-text-muted); font-size: 12px; }
.reading-list { border: 1px solid var(--admin-border); border-radius: var(--admin-radius-control); overflow: hidden; }
.reading-row { align-items: center; background: var(--admin-surface-elevated); display: grid; gap: 12px; grid-template-columns: 38px minmax(0, 1fr) auto; min-height: 66px; padding: 10px 12px; }
.reading-row + .reading-row { border-top: 1px solid var(--admin-border); }
.reading-icon { align-items: center; background: var(--admin-control-bg); border: 1px solid var(--admin-border); border-radius: 8px; color: var(--admin-accent); display: inline-flex; height: 36px; justify-content: center; width: 36px; }
.reading-main { display: grid; gap: 5px; min-width: 0; }
.reading-main a { color: var(--admin-text); font-weight: 600; overflow: hidden; text-decoration: none; text-overflow: ellipsis; white-space: nowrap; }
.reading-main a:hover { color: var(--admin-accent); text-decoration: underline; }
.reading-main span, .reading-empty { color: var(--admin-text-muted); font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.reading-actions { display: flex; gap: 6px; }
.reading-empty { margin: 0; padding: 28px 4px; text-align: center; white-space: normal; }
.reading-more { display: flex; justify-content: center; }
@media (max-width: 640px) {
  .reading-row { grid-template-columns: 36px minmax(0, 1fr); }
  .reading-actions { grid-column: 2; }
}
</style>
