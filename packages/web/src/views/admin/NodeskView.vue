<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  BookOpenText,
  FilePenLine,
  FolderKanban,
  Image,
  Info,
  LayoutDashboard,
  MessageSquareShare,
  Settings,
  Users,
} from 'lucide-vue-next';
import AdminLayout from '@/components/AdminLayout.vue';

const managementItems = [
  { path: '/nodesk', label: '站点与主页', icon: Settings },
  { path: '/nodesk/write', label: '新增文章', icon: FilePenLine },
  { path: '/nodesk/blog', label: '文章管理', icon: BookOpenText },
  { path: '/nodesk/projects', label: '项目管理', icon: FolderKanban },
  { path: '/nodesk/share', label: '分享管理', icon: MessageSquareShare },
  { path: '/nodesk/bloggers', label: '博主管理', icon: Users },
  { path: '/nodesk/pictures', label: '图集管理', icon: Image },
  { path: '/nodesk/snippets', label: '片段管理', icon: LayoutDashboard },
  { path: '/nodesk/about', label: '关于页管理', icon: Info },
] as const;

const activePath = ref<(typeof managementItems)[number]['path']>(managementItems[0].path);
const activeItem = computed(() => managementItems.find((item) => item.path === activePath.value) || managementItems[0]);
</script>

<template>
  <AdminLayout title="Nodesk">
    <section class="nodesk-manager">
      <header class="nodesk-manager-head">
        <div>
          <h2>Nodesk 管理</h2>
          <p>内容、页面和站点设置都在当前后台中完成。</p>
        </div>
      </header>

      <div class="nodesk-segmented-control" role="tablist" aria-label="Nodesk 管理页面">
        <button
          v-for="item in managementItems"
          :key="item.path"
          class="nodesk-segment"
          :class="{ active: item.path === activePath }"
          role="tab"
          type="button"
          :aria-selected="item.path === activePath"
          :tabindex="item.path === activePath ? 0 : -1"
          @click="activePath = item.path"
        >
          <component :is="item.icon" :size="16" />
          <span>{{ item.label }}</span>
        </button>
      </div>

      <div class="nodesk-frame-shell">
        <iframe
          :key="activeItem.path"
          class="nodesk-admin-frame"
          :src="activeItem.path"
          :title="`Nodesk · ${activeItem.label}`"
          referrerpolicy="same-origin"
        />
      </div>
    </section>
  </AdminLayout>
</template>

<style scoped>
.nodesk-manager {
  display: grid;
  gap: 14px;
  min-height: calc(100vh - 132px);
}

.nodesk-manager-head {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.nodesk-manager-head h2 {
  color: var(--text);
  font-size: 18px;
  margin: 0;
}

.nodesk-manager-head p {
  color: var(--muted);
  font-size: 13px;
  margin: 5px 0 0;
}

.nodesk-segmented-control {
  align-items: center;
  background: rgba(255, 255, 255, 0.58);
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 8px;
  display: flex;
  gap: 4px;
  overflow-x: auto;
  padding: 4px;
  scrollbar-width: thin;
}

.nodesk-segment {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 6px;
  color: var(--muted);
  cursor: pointer;
  display: inline-flex;
  flex: 0 0 auto;
  font: inherit;
  font-size: 13px;
  font-weight: 700;
  gap: 7px;
  min-height: 38px;
  padding: 0 12px;
  transition: background-color 0.16s ease, box-shadow 0.16s ease, color 0.16s ease;
}

.nodesk-segment:hover {
  background: rgba(var(--accent-rgb), 0.07);
  color: var(--text);
}

.nodesk-segment.active {
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 1px 5px rgba(15, 23, 42, 0.1);
  color: var(--accent);
}

.nodesk-segment:focus-visible {
  box-shadow: 0 0 0 3px rgba(var(--accent-rgb), 0.16);
  outline: none;
}

.nodesk-frame-shell {
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: var(--admin-surface-radius, 12px);
  box-shadow: 0 12px 34px rgba(15, 23, 42, 0.08);
  min-height: 720px;
  overflow: hidden;
}

.nodesk-admin-frame {
  background: #fff;
  border: 0;
  display: block;
  height: max(720px, calc(100vh - 236px));
  width: 100%;
}

@media (max-width: 720px) {
  .nodesk-manager {
    min-height: calc(100vh - 108px);
  }

  .nodesk-manager-head p {
    max-width: 44ch;
  }

  .nodesk-segment {
    min-height: 36px;
    padding: 0 10px;
  }

  .nodesk-frame-shell {
    min-height: 640px;
  }

  .nodesk-admin-frame {
    height: max(640px, calc(100vh - 220px));
  }
}
</style>
