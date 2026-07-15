<script setup lang="ts">
import {
  BookOpenText,
  ExternalLink,
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
  { href: '/blog', label: '站点与主页', description: '打开 Nodesk 首页并调整站点、布局和视觉配置。', icon: Settings },
  { href: '/blog/write', label: '新增文章', description: '撰写、预览并发布新的文章。', icon: FilePenLine },
  { href: '/blog/blog', label: '文章管理', description: '编辑文章索引、分类、封面和批量删除。', icon: BookOpenText },
  { href: '/blog/projects', label: '项目管理', description: '维护项目列表、介绍和项目图片。', icon: FolderKanban },
  { href: '/blog/share', label: '分享管理', description: '维护推荐分享内容和图标。', icon: MessageSquareShare },
  { href: '/blog/bloggers', label: '博主管理', description: '维护优秀博客、头像和状态。', icon: Users },
  { href: '/blog/pictures', label: '图集管理', description: '上传、整理和发布图片内容。', icon: Image },
  { href: '/blog/snippets', label: '片段管理', description: '维护代码片段与常用内容。', icon: LayoutDashboard },
  { href: '/blog/about', label: '关于页管理', description: '编辑 Nodesk 的关于页面。', icon: Info },
];
</script>

<template>
  <AdminLayout title="Nodesk">
    <section class="admin-card nodesk-manager">
      <div class="admin-card-head">
        <div>
          <h2>Nodesk 管理</h2>
          <p>博客的内容、页面与站点设置统一从这里进入。</p>
        </div>
        <a class="button secondary" href="/blog"><ExternalLink :size="17" /> 查看 Nodesk</a>
      </div>

      <div class="nodesk-management-list">
        <a v-for="item in managementItems" :key="item.href" class="nodesk-management-row" :href="item.href">
          <span class="nodesk-management-icon"><component :is="item.icon" :size="19" /></span>
          <span>
            <strong>{{ item.label }}</strong>
            <small>{{ item.description }}</small>
          </span>
          <ExternalLink :size="17" />
        </a>
      </div>
    </section>
  </AdminLayout>
</template>

<style scoped>
.nodesk-manager {
  display: grid;
  gap: 18px;
}

.nodesk-management-list {
  border: 1px solid rgba(148, 163, 184, 0.28);
  border-radius: 8px;
  overflow: hidden;
}

.nodesk-management-row {
  align-items: center;
  color: var(--text);
  display: grid;
  gap: 14px;
  grid-template-columns: 40px minmax(0, 1fr) 20px;
  min-height: 68px;
  padding: 10px 14px;
  text-decoration: none;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.nodesk-management-row + .nodesk-management-row {
  border-top: 1px solid rgba(148, 163, 184, 0.22);
}

.nodesk-management-row:hover,
.nodesk-management-row:focus-visible {
  background: rgba(var(--accent-rgb), 0.08);
  color: var(--accent);
  outline: none;
}

.nodesk-management-icon {
  align-items: center;
  background: rgba(var(--accent-rgb), 0.1);
  border: 1px solid rgba(var(--accent-rgb), 0.18);
  border-radius: 8px;
  display: inline-flex;
  height: 38px;
  justify-content: center;
  width: 38px;
}

.nodesk-management-row span:nth-child(2) {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.nodesk-management-row strong {
  font-size: 14px;
}

.nodesk-management-row small {
  color: var(--muted);
  font-size: 12px;
}

@media (max-width: 640px) {
  .nodesk-management-row {
    grid-template-columns: 38px minmax(0, 1fr);
  }

  .nodesk-management-row > svg {
    display: none;
  }
}
</style>
