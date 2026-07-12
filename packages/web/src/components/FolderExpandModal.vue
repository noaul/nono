<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { X } from 'lucide-vue-next';
import type { Folder } from '@/api/types';
import FaviconBadge from '@/components/FaviconBadge.vue';
import FolderGlyph from '@/components/FolderGlyph.vue';
import { getFaviconUrl } from '@/utils/favicon';
import { splitHighlight } from '@/utils/highlight';

const props = withDefaults(defineProps<{ folder: Folder; highlight?: string }>(), { highlight: '' });
const emit = defineEmits<{ close: [] }>();

const rootRef = ref<HTMLElement | null>(null);
const faviconErrors = ref<Record<string | number, boolean>>({});
const favicons = computed(() => new Map((props.folder.links || []).map((link) => [link.id, getFaviconUrl(link.url, link.icon)] as const)));

function handleFaviconError(linkId: string | number) {
  faviconErrors.value[linkId] = true;
}

function trapFocus(event: KeyboardEvent) {
  const modal = rootRef.value;
  if (!modal) return;
  const focusables = Array.from(
    modal.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'),
  );
  if (!focusables.length) {
    event.preventDefault();
    modal.focus();
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;
  if (event.shiftKey && (active === first || !modal.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !modal.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation();
    emit('close');
    return;
  }
  if (event.key === 'Tab') trapFocus(event);
}

let lastFocused: HTMLElement | null = null;

onMounted(() => {
  lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  window.addEventListener('keydown', onKeydown, true);
  const target = rootRef.value?.querySelector<HTMLElement>('button, a[href]');
  (target || rootRef.value)?.focus();
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown, true);
  lastFocused?.focus();
});
</script>

<template>
  <div class="folder-expand-backdrop" @click.self="emit('close')">
    <section ref="rootRef" class="folder-expand-modal" role="dialog" aria-modal="true" :aria-label="folder.name" tabindex="-1">
      <header class="folder-expand-head">
        <div class="expand-head-title">
          <FolderGlyph class="expand-folder-icon" :icon="folder.icon" :size="22" />
          <h2>{{ folder.name }}</h2>
        </div>
        <button class="folder-expand-close" type="button" title="关闭" @click="emit('close')">
          <X :size="20" />
        </button>
      </header>

      <div class="expanded-link-grid">
        <a v-for="link in folder.links || []" :key="link.id" class="expanded-link" :href="link.url" target="_blank" rel="noreferrer">
          <span class="expanded-link-icon">
            <img
              v-if="favicons.get(link.id) && !faviconErrors[link.id]"
              :src="favicons.get(link.id)"
              alt=""
              loading="lazy"
              decoding="async"
              @error="handleFaviconError(link.id)"
            />
            <FaviconBadge v-else :name="link.name" :url="link.url" :size="24" />
          </span>
          <span class="expanded-link-copy">
            <strong>
              <template v-for="(segment, index) in splitHighlight(link.name, props.highlight)" :key="index">
                <mark v-if="segment.hit">{{ segment.text }}</mark><template v-else>{{ segment.text }}</template>
              </template>
            </strong>
            <small v-if="link.description">{{ link.description }}</small>
          </span>
        </a>
        <p v-if="!(folder.links || []).length" class="expanded-empty">这个文件夹还没有可展示的书签。</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.folder-expand-backdrop {
  align-items: center;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  background: rgba(8, 10, 14, 0.75);
  display: grid;
  inset: 0;
  padding: 40px 36px;
  position: fixed;
  z-index: 100;
  animation: fadeIn 0.25s ease-out;
}

.folder-expand-modal {
  background: rgba(15, 18, 25, var(--public-modal-opacity, 0.85));
  backdrop-filter: blur(var(--public-modal-blur, 24px));
  -webkit-backdrop-filter: blur(var(--public-modal-blur, 24px));
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--public-modal-radius, 8px);
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.04);
  color: #f3f4f6;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 20px;
  margin: 0 auto;
  height: min(80vh, 760px);
  overflow: hidden;
  padding: 24px 32px;
  width: min(100%, 1200px);
  animation: scaleIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.folder-expand-head {
  align-items: center;
  display: flex;
  gap: 16px;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  padding-bottom: 16px;
}

.expand-head-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.expand-folder-icon {
  color: rgba(255, 255, 255, 0.92);
  font-size: 22px;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.15));
}

.folder-expand-head h2 {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0;
  margin: 0;
  color: #ffffff;
}

.folder-expand-close {
  align-items: center;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  display: inline-flex;
  height: 36px;
  justify-content: center;
  padding: 0;
  transform: translateZ(0);
  transition:
    background-color 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
    border-color 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
    color 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
    transform 0.34s cubic-bezier(0.2, 0.8, 0.2, 1);
  width: 36px;
}

.folder-expand-close:hover,
.folder-expand-close:focus-visible {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.15);
  color: #ffffff;
  transform: translateY(-1px) scale(1.03);
}

.folder-expand-close:active {
  transform: translateY(1px) scale(0.94);
  transition-duration: 0.12s;
}

.expanded-link-grid {
  align-content: start;
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  overflow-y: auto;
  padding-right: 6px;
  scrollbar-color: rgba(255, 255, 255, 0.1) transparent;
  scrollbar-width: thin;
}

.expanded-link-grid::-webkit-scrollbar {
  width: 5px;
}

.expanded-link-grid::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 99px;
}

.expanded-link {
  align-items: center;
  background: rgba(255, 255, 255, 0.01);
  border: 1px solid rgba(255, 255, 255, 0.03);
  border-radius: 8px;
  color: rgba(243, 244, 246, 0.9);
  display: grid;
  gap: 12px;
  grid-template-columns: 46px minmax(0, 1fr);
  min-height: 72px;
  padding: 12px;
  transition:
    background-color 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
    border-color 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
    box-shadow 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
    color 0.28s cubic-bezier(0.2, 0.8, 0.2, 1),
    transform 0.34s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.expanded-link:hover,
.expanded-link:focus-visible {
  background: rgba(var(--accent-rgb), 0.06);
  border-color: rgba(var(--accent-rgb), 0.25);
  color: var(--accent);
  outline: none;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(var(--accent-rgb), 0.08);
}

.expanded-link:active {
  transform: translateY(1px) scale(0.985);
  transition-duration: 0.12s;
}

.expanded-link:hover small,
.expanded-link:focus-visible small {
  color: rgba(var(--accent-rgb), 0.6);
}

.expanded-link-icon {
  align-items: center;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  display: inline-flex;
  height: 44px;
  justify-content: center;
  width: 44px;
  color: rgba(255, 255, 255, 0.3);
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.expanded-link-icon img {
  border-radius: 6px;
  height: 24px;
  object-fit: contain;
  width: 24px;
}

.expanded-link:hover .expanded-link-icon {
  background: rgba(var(--accent-rgb), 0.1);
  border-color: rgba(var(--accent-rgb), 0.2);
  color: var(--accent);
  transform: scale(1.04);
}

.expanded-link-copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.expanded-link strong,
.expanded-link small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.expanded-link strong {
  font-size: 14.5px;
  font-weight: 700;
  letter-spacing: 0;
}

.expanded-link small {
  color: rgba(255, 255, 255, 0.4);
  font-size: 12px;
  font-weight: 500;
}

mark {
  background: rgba(var(--accent-rgb), 0.28);
  border-radius: 3px;
  color: inherit;
  padding: 0 1px;
}

.expanded-empty {
  color: rgba(255, 255, 255, 0.45);
  grid-column: 1 / -1;
  text-align: center;
  padding: 60px 0;
  font-size: 14px;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scaleIn {
  from { transform: scale(0.96); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

@media (max-width: 640px) {
  .folder-expand-backdrop {
    padding: 20px 12px;
  }

  .folder-expand-modal {
    height: calc(100dvh - 40px);
    padding: 16px;
    gap: 16px;
  }

  .folder-expand-head h2 {
    font-size: 18px;
  }

  .expanded-link-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .expanded-link {
    min-height: 64px;
    padding: 8px 10px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .folder-expand-backdrop,
  .folder-expand-modal {
    animation: none;
  }
}
</style>
