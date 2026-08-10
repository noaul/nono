<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Bell, CalendarDays, Check, CheckCheck, WalletCards, X } from 'lucide-vue-next';
import type { AdminNotification } from '@/api/types';
import { useI18n } from '@/composables/useI18n';

const props = defineProps<{
  items: AdminNotification[];
  unreadCount: number;
  loading: boolean;
}>();

const emit = defineEmits<{
  'mark-read': [item: AdminNotification];
  dismiss: [item: AdminNotification];
  'mark-all-read': [];
}>();

const { t } = useI18n();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLElement | null>(null);
const mobileDrawer = ref(false);
const badgeLabel = computed(() => props.unreadCount > 99 ? '99+' : String(props.unreadCount));
let previousBodyOverflow = '';
let bodyScrollLocked = false;

function togglePanel() {
  open.value = !open.value;
}

function closePanel() {
  open.value = false;
}

function select(item: AdminNotification) {
  if (!item.read) emit('mark-read', item);
  closePanel();
}

function onDocumentClick(event: MouseEvent) {
  if (open.value && root.value && event.target instanceof Node && !root.value.contains(event.target)) closePanel();
}

function onKeydown(event: KeyboardEvent) {
  if (!open.value) return;
  if (event.key === 'Escape') {
    closePanel();
    return;
  }
  if (event.key !== 'Tab' || !mobileDrawer.value || !panel.value) return;
  const focusable = Array.from(panel.value.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'));
  if (!focusable.length) {
    event.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!panel.value.contains(document.activeElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return;
  }
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function updateMobileDrawer() {
  const next = window.innerWidth <= 640;
  if (next === mobileDrawer.value) return;
  mobileDrawer.value = next;
  if (!open.value) return;
  if (next) lockBodyScroll();
  else restoreBodyScroll();
}

function lockBodyScroll() {
  if (bodyScrollLocked) return;
  previousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  bodyScrollLocked = true;
}

function restoreBodyScroll() {
  if (!bodyScrollLocked) return;
  document.body.style.overflow = previousBodyOverflow;
  bodyScrollLocked = false;
}

function formatTime(item: AdminNotification) {
  const value = item.dueAt || item.occurredAt;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

onMounted(() => {
  updateMobileDrawer();
  document.addEventListener('click', onDocumentClick);
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('resize', updateMobileDrawer);
});

watch(open, async (opened) => {
  if (opened) {
    updateMobileDrawer();
    if (mobileDrawer.value) lockBodyScroll();
    await nextTick();
    panel.value?.querySelector<HTMLElement>('button, a[href]')?.focus();
    return;
  }
  restoreBodyScroll();
  await nextTick();
  trigger.value?.focus();
});

onBeforeUnmount(() => {
  restoreBodyScroll();
  document.removeEventListener('click', onDocumentClick);
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('resize', updateMobileDrawer);
});
</script>

<template>
  <div ref="root" class="home-notification-bell">
    <button
      ref="trigger"
      class="home-notification-trigger"
      type="button"
      :aria-label="t('notify.homeAria')"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @click.stop="togglePanel"
    >
      <Bell :size="18" />
      <span v-if="unreadCount" class="home-notification-badge">{{ badgeLabel }}</span>
    </button>

    <button v-if="open" class="home-notification-backdrop" type="button" :aria-label="t('notify.closeAria')" @click="closePanel"></button>
    <Transition name="home-notification-panel">
      <section
        v-if="open"
        ref="panel"
        class="home-notification-panel"
        role="dialog"
        :aria-label="t('notify.recentAria')"
        :aria-modal="mobileDrawer ? 'true' : undefined"
      >
        <header class="home-notification-header">
          <div>
            <strong>{{ t('notify.recentTitle') }}</strong>
            <span>{{ unreadCount ? t('notify.unreadCount', { count: unreadCount }) : t('notify.allRead') }}</span>
          </div>
          <button
            v-if="unreadCount"
            class="home-notification-icon-button"
            type="button"
            :aria-label="t('notify.markAllAria')"
            :title="t('notify.markAllAria')"
            @click="$emit('mark-all-read')"
          ><CheckCheck :size="16" /></button>
        </header>

        <div v-if="loading && !items.length" class="home-notification-empty">{{ t('notify.loading') }}</div>
        <div v-else-if="!items.length" class="home-notification-empty">
          <Bell :size="20" />
          <span>{{ t('notify.empty') }}</span>
        </div>
        <div v-else class="home-notification-list">
          <article
            v-for="item in items"
            :key="item.key"
            class="home-notification-item"
            :class="[{ 'is-unread': !item.read }, `severity-${item.severity}`]"
          >
            <span class="home-notification-source" aria-hidden="true">
              <CalendarDays v-if="item.source === 'nodesk'" :size="17" />
              <WalletCards v-else :size="17" />
            </span>
            <RouterLink class="home-notification-copy" :to="item.href" @click="select(item)">
              <strong>{{ item.title }}</strong>
              <span>{{ item.description }}</span>
              <small>{{ item.source === 'nodesk' ? 'NoDesk' : 'NoMoney' }} · {{ formatTime(item) }}</small>
            </RouterLink>
            <div class="home-notification-actions">
              <button
                v-if="!item.read"
                class="home-notification-icon-button"
                type="button"
                :aria-label="t('notify.markReadAria')"
                :title="t('notify.markReadAria')"
                @click="$emit('mark-read', item)"
              ><Check :size="15" /></button>
              <button
                class="home-notification-icon-button"
                type="button"
                :aria-label="t('notify.dismissAria')"
                :title="t('notify.dismissAria')"
                @click="$emit('dismiss', item)"
              ><X :size="15" /></button>
            </div>
          </article>
        </div>

        <RouterLink class="home-notification-footer" to="/admin/notifications" @click="closePanel">
          {{ t('notify.viewAll') }}
        </RouterLink>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.home-notification-bell { position: relative; }

.home-notification-trigger {
  align-items: center;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  background: rgba(var(--public-search-color-rgb, 247, 248, 251), var(--public-search-opacity, 0.34));
  border: 1px solid rgba(var(--public-border-rgb, 255, 255, 255), 0.3);
  border-radius: 8px;
  box-shadow: 0 12px 34px rgba(var(--public-shadow-rgb, 0, 0, 0), 0.18), inset 0 1px 0 rgba(var(--public-highlight-rgb, 255, 255, 255), 0.24);
  color: rgba(var(--public-page-text-rgb, 243, 244, 246), 0.92);
  cursor: pointer;
  display: inline-flex;
  height: 42px;
  justify-content: center;
  padding: 0;
  position: relative;
  transition: background-color 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
  width: 42px;
}

.home-notification-trigger:hover,
.home-notification-trigger:focus-visible {
  background: rgba(var(--accent-rgb), 0.28);
  border-color: rgba(var(--accent-soft-rgb), 0.56);
  outline: none;
  transform: translateY(-2px);
}

.home-notification-badge {
  align-items: center;
  background: #e11d48;
  border: 2px solid var(--public-notification-surface, rgba(8, 12, 18, 0.92));
  border-radius: 999px;
  color: #ffffff;
  display: inline-flex;
  font-size: 9px;
  font-weight: 800;
  height: 18px;
  justify-content: center;
  min-width: 18px;
  padding: 0 3px;
  position: absolute;
  right: -5px;
  top: -5px;
}

.home-notification-panel {
  backdrop-filter: blur(26px);
  -webkit-backdrop-filter: blur(26px);
  background: var(--public-notification-surface, rgba(8, 12, 18, 0.92));
  border: 1px solid rgba(var(--public-notification-border-rgb, 255, 255, 255), 0.2);
  border-radius: 8px;
  box-shadow: 0 22px 60px rgba(var(--public-shadow-rgb, 0, 0, 0), 0.32), inset 0 1px 0 rgba(var(--public-highlight-rgb, 255, 255, 255), 0.16);
  color: var(--public-notification-text, #f3f4f6);
  overflow: hidden;
  position: absolute;
  right: 0;
  top: calc(100% + 10px);
  width: min(370px, calc(100vw - 24px));
  z-index: 92;
}

.home-notification-header {
  align-items: center;
  border-bottom: 1px solid rgba(var(--public-notification-border-rgb, 255, 255, 255), 0.14);
  display: flex;
  justify-content: space-between;
  min-height: 58px;
  padding: 8px 12px 8px 15px;
}

.home-notification-header > div { display: grid; gap: 2px; }
.home-notification-header strong { font-size: 14px; }
.home-notification-header span { color: rgba(var(--public-notification-text-rgb, 243, 244, 246), 0.62); font-size: 11px; }

.home-notification-list { max-height: min(430px, calc(100dvh - 190px)); overflow-y: auto; padding: 5px; }
.home-notification-item {
  align-items: start;
  border-radius: 7px;
  display: grid;
  gap: 10px;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  padding: 10px 8px;
  position: relative;
}
.home-notification-item:hover { background: rgba(var(--public-notification-hover-rgb, 255, 255, 255), 0.09); }

.home-notification-source {
  align-items: center;
  background: rgba(var(--accent-rgb), 0.2);
  border: 1px solid rgba(var(--accent-bright-rgb), 0.24);
  border-radius: 7px;
  color: var(--accent-bright, #34d399);
  display: inline-flex;
  height: 34px;
  justify-content: center;
  width: 34px;
}
.severity-critical .home-notification-source { background: rgba(225, 29, 72, 0.16); border-color: rgba(251, 113, 133, 0.3); color: #fb7185; }
.severity-warning .home-notification-source { background: rgba(217, 119, 6, 0.16); border-color: rgba(251, 191, 36, 0.3); color: #fbbf24; }

.home-notification-copy { color: inherit; display: grid; gap: 3px; min-width: 0; text-decoration: none; }
.home-notification-copy strong { font-size: 12.5px; font-weight: 650; line-height: 1.4; overflow-wrap: anywhere; }
.is-unread .home-notification-copy strong { font-weight: 800; }
.home-notification-copy span { color: rgba(var(--public-notification-text-rgb, 243, 244, 246), 0.7); font-size: 11px; line-height: 1.4; overflow-wrap: anywhere; }
.home-notification-copy small { color: rgba(var(--public-notification-text-rgb, 243, 244, 246), 0.5); font-size: 10px; }
.home-notification-actions { display: flex; gap: 3px; }

.home-notification-icon-button {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 7px;
  color: rgba(var(--public-notification-text-rgb, 243, 244, 246), 0.68);
  cursor: pointer;
  display: inline-flex;
  height: 30px;
  justify-content: center;
  padding: 0;
  width: 30px;
}
.home-notification-icon-button:hover,
.home-notification-icon-button:focus-visible { background: rgba(var(--public-notification-hover-rgb, 255, 255, 255), 0.12); color: var(--public-notification-text, #f3f4f6); outline: none; }

.home-notification-empty {
  align-items: center;
  color: rgba(var(--public-notification-text-rgb, 243, 244, 246), 0.62);
  display: flex;
  flex-direction: column;
  font-size: 12px;
  gap: 8px;
  justify-content: center;
  min-height: 150px;
  padding: 20px;
}

.home-notification-footer {
  align-items: center;
  border-top: 1px solid rgba(var(--public-notification-border-rgb, 255, 255, 255), 0.14);
  color: rgba(var(--public-notification-text-rgb, 243, 244, 246), 0.76);
  display: flex;
  font-size: 11px;
  font-weight: 700;
  justify-content: center;
  min-height: 42px;
  text-decoration: none;
}
.home-notification-footer:hover { background: rgba(var(--public-notification-hover-rgb, 255, 255, 255), 0.09); color: var(--public-notification-text, #f3f4f6); }
.home-notification-backdrop { display: none; }

.home-notification-panel-enter-active,
.home-notification-panel-leave-active { transition: opacity 0.2s ease, transform 0.24s ease; transform-origin: top right; }
.home-notification-panel-enter-from,
.home-notification-panel-leave-to { opacity: 0; transform: translateY(-6px) scale(0.98); }

@media (max-width: 640px) {
  .home-notification-panel {
    border-bottom: 0;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    bottom: 0;
    left: 0;
    max-height: min(78dvh, 620px);
    position: fixed;
    right: 0;
    top: auto;
    width: 100%;
    z-index: 102;
  }

  .home-notification-list { max-height: calc(min(78dvh, 620px) - 100px); }
  .home-notification-backdrop {
    background: rgba(0, 0, 0, 0.46);
    border: 0;
    display: block;
    inset: 0;
    padding: 0;
    position: fixed;
    z-index: 101;
  }

  .home-notification-panel-enter-active,
  .home-notification-panel-leave-active { transform-origin: bottom center; }
  .home-notification-panel-enter-from,
  .home-notification-panel-leave-to { transform: translateY(24px); }
}

@media (prefers-reduced-motion: reduce) {
  .home-notification-panel-enter-active,
  .home-notification-panel-leave-active,
  .home-notification-trigger { transition: none; }
}
</style>
