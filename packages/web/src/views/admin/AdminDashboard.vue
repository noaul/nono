<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import {
  Activity,
  ArrowRight,
  Bot,
  BookOpen,
  CircleDollarSign,
  ExternalLink,
  Folder as FolderIcon,
  KeyRound,
  Layers,
  Link2,
  ListChecks,
  Lock,
  Plus,
  Settings,
  Upload,
} from 'lucide-vue-next';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import { apiRequest } from '@/api/client';
import type { Folder, Link } from '@/api/types';

const folders = ref<Folder[]>([]);
const links = ref<Link[]>([]);

const notabCount = computed(() => folders.value.filter((folder) => !folder.parentId).length);
const contentFolders = computed(() => folders.value.filter((folder) => folder.parentId));
const lockedCount = computed(() => contentFolders.value.filter((folder) => folder.locked).length);
const averageLinksPerFolder = computed(() => (
  contentFolders.value.length ? Math.round((links.value.length / contentFolders.value.length) * 10) / 10 : 0
));

const shortcuts = [
  { label: '新增书签', detail: '在列表底部快速创建', to: '/admin/links#new-bookmark', icon: Plus },
  { label: '导入书签', detail: '预览并导入浏览器书签', to: '/admin/links#bookmark-import', icon: Upload },
  { label: 'Notab 管理', detail: '新增、排序和管理入口', to: '/admin/notabs', icon: Layers },
  { label: '文件夹管理', detail: '整理分类与文件夹顺序', to: '/admin/folders', icon: FolderIcon },
  { label: '书签查重', detail: '检查重复收录的链接', to: '/admin/links#bookmark-tools', icon: ListChecks },
  { label: '健康检查', detail: '检测链接是否仍可访问', to: '/admin/links#bookmark-tools', icon: Activity },
  { label: 'LLM 设置', detail: '配置智能命名和归类', to: '/admin/llm', icon: Bot },
  { label: 'Token 管理', detail: '管理浏览器扩展授权', to: '/admin/tokens', icon: KeyRound },
  { label: 'Nodesk', detail: '进入内容与日程页面', to: '/nodesk', icon: BookOpen, external: true },
  { label: 'NoMoney', detail: '进入个人财务页面', to: '/nomoney', icon: CircleDollarSign, external: true },
];

onMounted(async () => {
  [folders.value, links.value] = await Promise.all([
    apiRequest<Folder[]>('/api/admin/folders'),
    apiRequest<Link[]>('/api/admin/links'),
  ]);
});
</script>

<template>
  <div class="admin-page-stack dashboard-workbench">
    <AdminPageHeader eyebrow="运营" title="控制台总览">
      <template #actions>
        <a class="button secondary" href="/" target="_blank" rel="noreferrer"><ExternalLink :size="17" /> 打开主页</a>
        <RouterLink class="button" to="/admin/site"><Settings :size="17" /> 站点设置</RouterLink>
      </template>
    </AdminPageHeader>

    <div class="ops-metric-grid" aria-label="内容概览">
      <RouterLink to="/admin/notabs" class="ops-metric-card tone-green">
        <Layers :size="20" />
        <div>
          <span>Notab</span>
          <strong>{{ notabCount }}</strong>
          <small>{{ notabCount }} 个 Notab</small>
        </div>
        <ArrowRight :size="16" />
      </RouterLink>

      <RouterLink to="/admin/folders" class="ops-metric-card tone-blue">
        <FolderIcon :size="20" />
        <div>
          <span>文件夹</span>
          <strong>{{ contentFolders.length }}</strong>
          <small>{{ contentFolders.length }} 个文件夹</small>
        </div>
        <ArrowRight :size="16" />
      </RouterLink>

      <RouterLink to="/admin/links" class="ops-metric-card tone-amber">
        <Link2 :size="20" />
        <div>
          <span>书签</span>
          <strong>{{ links.length }}</strong>
          <small>{{ links.length }} 个书签 · 平均 {{ averageLinksPerFolder }} 个/文件夹</small>
        </div>
        <ArrowRight :size="16" />
      </RouterLink>

      <RouterLink to="/admin/folders" class="ops-metric-card tone-rose">
        <Lock :size="20" />
        <div>
          <span>加密文件夹</span>
          <strong>{{ lockedCount }}</strong>
          <small>{{ lockedCount }} 个加密</small>
        </div>
        <ArrowRight :size="16" />
      </RouterLink>
    </div>

    <section class="dashboard-shortcuts-panel">
      <header class="dashboard-section-head">
        <h2>常用功能</h2>
      </header>
      <div class="dashboard-shortcut-grid">
        <template v-for="shortcut in shortcuts" :key="shortcut.label">
          <a v-if="shortcut.external" class="dashboard-shortcut" :href="shortcut.to">
            <span class="dashboard-shortcut-icon"><component :is="shortcut.icon" :size="19" /></span>
            <span class="dashboard-shortcut-copy">
              <strong>{{ shortcut.label }}</strong>
              <small>{{ shortcut.detail }}</small>
            </span>
            <ArrowRight :size="15" />
          </a>
          <RouterLink v-else class="dashboard-shortcut" :to="shortcut.to">
            <span class="dashboard-shortcut-icon"><component :is="shortcut.icon" :size="19" /></span>
            <span class="dashboard-shortcut-copy">
              <strong>{{ shortcut.label }}</strong>
              <small>{{ shortcut.detail }}</small>
            </span>
            <ArrowRight :size="15" />
          </RouterLink>
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ops-metric-card strong,
.dashboard-shortcut strong,
.dashboard-section-head h2 {
  letter-spacing: 0;
}

.dashboard-shortcut,
.dashboard-shortcut-copy {
  min-width: 0;
}

.dashboard-shortcut strong,
.dashboard-shortcut small {
  overflow-wrap: anywhere;
}
</style>
