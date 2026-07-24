<script setup lang="ts">
import { computed, ref } from 'vue';
import { X } from 'lucide-vue-next';
import type { Folder } from '@/api/types';
import FaviconBadge from '@/components/FaviconBadge.vue';
import FolderGlyph from '@/components/FolderGlyph.vue';
import { getFaviconUrl } from '@/utils/favicon';
import { splitHighlight } from '@/utils/highlight';
import { useModalBehavior } from '@/composables/useModalBehavior';

const props = withDefaults(defineProps<{ folder: Folder; highlight?: string }>(), { highlight: '' });
const emit = defineEmits<{ close: [] }>();

const rootRef = ref<HTMLElement | null>(null);
const faviconErrors = ref<Record<string | number, boolean>>({});
const favicons = computed(() => new Map((props.folder.links || []).map((link) => [link.id, getFaviconUrl(link.url, link.icon)] as const)));

function handleFaviconError(linkId: string | number) {
  faviconErrors.value[linkId] = true;
}

const open = ref(true);
useModalBehavior({
  open,
  container: rootRef,
  close: () => emit('close'),
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
        <button class="folder-expand-close" type="button" title="关闭" aria-label="关闭文件夹" @click="emit('close')">
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
  background: rgba(var(--public-overlay-rgb, 8, 16, 18), 0.42);
  display: grid;
  inset: 0;
  padding: 40px 36px;
  position: fixed;
  overscroll-behavior: contain;
  z-index: 100;
  animation: fadeIn 0.25s ease-out;
}

.folder-expand-modal {
  background: rgba(var(--public-card-color-rgb, 247, 248, 251), var(--public-card-opacity, 0.26));
  backdrop-filter: blur(var(--public-card-blur, 18px));
  -webkit-backdrop-filter: blur(var(--public-card-blur, 18px));
  border: 1px solid rgba(var(--public-border-rgb, 255, 255, 255), 0.52);
  border-radius: var(--public-card-radius, 8px);
  box-shadow:
    0 32px 80px rgba(var(--public-shadow-rgb, 5, 15, 18), 0.28),
    inset 0 1px 0 rgba(var(--public-highlight-rgb, 255, 255, 255), 0.62);
  color: var(--public-bookmark-text, #ffffff);
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 20px;
  margin: 0 auto;
  height: min(80vh, 760px);
  overflow: hidden;
  overscroll-behavior: contain;
  padding: 24px 32px;
  width: min(100%, 1200px);
  animation: modal-pop 0.36s var(--nono-ease-spring, cubic-bezier(0.34, 1.36, 0.44, 1));
}

.folder-expand-head {
  align-items: center;
  display: flex;
  gap: 16px;
  justify-content: space-between;
  border-bottom: 1px solid rgba(var(--public-border-rgb, 51, 65, 61), 0.22);
  padding-bottom: 16px;
}

.expand-head-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.expand-folder-icon {
  color: rgba(var(--public-folder-text-rgb, 255, 255, 255), 0.9);
  font-size: 22px;
  filter: drop-shadow(0 2px 4px rgba(var(--public-shadow-rgb, 0, 0, 0), 0.15));
}

.folder-expand-head h2 {
  font-size: var(--public-folder-text-size, 18px);
  font-weight: 800;
  letter-spacing: 0;
  margin: 0;
  color: var(--public-folder-text, #ffffff);
}

.folder-expand-close {
  align-items: center;
  background: rgba(var(--public-hover-rgb, 255, 255, 255), 0.34);
  border: 1px solid rgba(var(--public-border-rgb, 51, 65, 61), 0.3);
  border-radius: 8px;
  color: rgba(var(--public-bookmark-text-rgb, 82, 97, 92), 0.76);
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
  background: rgba(var(--public-hover-rgb, 255, 255, 255), 0.54);
  border-color: rgba(var(--accent-rgb), 0.34);
  color: var(--accent);
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
  scrollbar-color: rgba(var(--public-border-rgb, 51, 65, 61), 0.3) transparent;
  scrollbar-width: thin;
}

.expanded-link-grid::-webkit-scrollbar {
  width: 5px;
}

.expanded-link-grid::-webkit-scrollbar-thumb {
  background: rgba(var(--public-border-rgb, 51, 65, 61), 0.3);
  border-radius: 99px;
}

.expanded-link {
  align-items: center;
  background: rgba(var(--public-hover-rgb, 255, 255, 255), 0.14);
  border: 1px solid rgba(var(--public-border-rgb, 255, 255, 255), 0.22);
  border-radius: 8px;
  color: var(--public-bookmark-text, #ffffff);
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
  background: rgba(var(--public-hover-rgb, 255, 255, 255), 0.34);
  border-color: rgba(var(--accent-rgb), 0.25);
  color: var(--accent);
  outline: none;
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(var(--public-shadow-rgb, 5, 15, 18), 0.12);
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
  background: rgba(var(--public-hover-rgb, 255, 255, 255), 0.16);
  border: 1px solid rgba(var(--public-border-rgb, 255, 255, 255), 0.22);
  border-radius: 8px;
  display: inline-flex;
  height: 44px;
  justify-content: center;
  width: 44px;
  color: rgba(var(--public-bookmark-text-rgb, 255, 255, 255), 0.78);
  transition:
    background-color 0.2s cubic-bezier(0.16, 1, 0.3, 1),
    border-color 0.2s cubic-bezier(0.16, 1, 0.3, 1),
    color 0.2s cubic-bezier(0.16, 1, 0.3, 1),
    transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
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
  font-size: var(--public-bookmark-text-size, 14px);
  font-weight: 700;
  letter-spacing: 0;
}

.expanded-link small {
  color: rgba(var(--public-bookmark-text-rgb, 255, 255, 255), 0.68);
  font-size: calc(var(--public-bookmark-text-size, 14px) - 2px);
  font-weight: 500;
}

mark {
  background: rgba(var(--accent-rgb), 0.28);
  border-radius: 3px;
  color: inherit;
  padding: 0 1px;
}

.expanded-empty {
  color: rgba(var(--public-bookmark-text-rgb, 255, 255, 255), 0.72);
  grid-column: 1 / -1;
  text-align: center;
  padding: 60px 0;
  font-size: var(--public-bookmark-text-size, 14px);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes modal-pop {
  from { transform: translateY(18px) scale(0.94); opacity: 0; }
  to { transform: translateY(0) scale(1); opacity: 1; }
}

@media (max-width: 640px) {
  .folder-expand-backdrop {
    padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
  }

  .folder-expand-modal {
    height: 100%;
    padding: 16px;
    gap: 16px;
  }

  .folder-expand-head h2 {
    font-size: var(--public-folder-text-size, 18px);
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
