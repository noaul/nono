<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Folder as FolderIcon, Link2, Lock, Globe, ExternalLink, ArrowRight, Settings, ListPlus } from 'lucide-vue-next';
import AdminLayout from '@/components/AdminLayout.vue';
import { apiRequest } from '@/api/client';
import type { Folder, Link, Site } from '@/api/types';

const site = ref<Site | null>(null);
const folders = ref<Folder[]>([]);
const links = ref<Link[]>([]);

const lockedCount = computed(() => folders.value.filter((folder) => folder.locked).length);

onMounted(async () => {
  [site.value, folders.value, links.value] = await Promise.all([
    apiRequest<Site>('/api/admin/site'),
    apiRequest<Folder[]>('/api/admin/folders'),
    apiRequest<Link[]>('/api/admin/links'),
  ]);
});
</script>

<template>
  <AdminLayout title="控制台总览">
    <!-- Stat Cards Grid -->
    <div class="grid three">
      <section class="stat-card">
        <div class="stat-icon-wrapper">
          <FolderIcon :size="20" class="stat-icon" />
        </div>
        <div class="stat-content">
          <span class="stat-label">分类文件夹</span>
          <h2 class="stat-value">{{ folders.length }}</h2>
          <div class="stat-footer-text">
            已创建 {{ folders.length }} 个导航分组
          </div>
        </div>
        <RouterLink to="/admin/folders" class="stat-action-arrow" title="管理文件夹">
          <ArrowRight :size="16" />
        </RouterLink>
      </section>

      <section class="stat-card">
        <div class="stat-icon-wrapper blue">
          <Link2 :size="20" class="stat-icon" />
        </div>
        <div class="stat-content">
          <span class="stat-label">收录书签链接</span>
          <h2 class="stat-value">{{ links.length }}</h2>
          <div class="stat-footer-text">
            已收录 <span>{{ links.length }}</span> 个常用工具与链接
          </div>
        </div>
        <RouterLink to="/admin/links" class="stat-action-arrow" title="管理链接">
          <ArrowRight :size="16" />
        </RouterLink>
      </section>

      <section class="stat-card">
        <div class="stat-icon-wrapper orange">
          <Lock :size="20" class="stat-icon" />
        </div>
        <div class="stat-content">
          <span class="stat-label">加密分类文件夹</span>
          <h2 class="stat-value">{{ lockedCount }}</h2>
          <div class="stat-footer-text">
            其中 <span>{{ lockedCount }}</span> 个文件夹已设置密码保护
          </div>
        </div>
        <RouterLink to="/admin/folders" class="stat-action-arrow" title="查看加密文件夹">
          <ArrowRight :size="16" />
        </RouterLink>
      </section>
    </div>

    <!-- Details and Quick Links Grid -->
    <div class="grid two" style="margin-top: 20px;">
      <!-- Site configuration details card -->
      <section class="dashboard-details-card">
        <div class="card-title-header">
          <Globe :size="18" class="header-icon" />
          <h3>当前站点配置</h3>
        </div>
        <div class="details-body">
          <div class="detail-row">
            <span class="detail-label">站点名称</span>
            <span class="detail-value highlight">{{ site?.name || 'Nono' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">访问路径 (Slug)</span>
            <span class="detail-value font-mono">/{{ site?.slug || 'admin' }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">默认搜索引擎</span>
            <span class="detail-value url-text" :title="site?.searchUrlTemplate">
              {{ site?.searchUrlTemplate || 'Google' }}
            </span>
          </div>
          <div class="detail-row border-none">
            <span class="detail-label">主页浏览</span>
            <a href="/" target="_blank" class="detail-link">
              打开前台主页 <ExternalLink :size="13" />
            </a>
          </div>
        </div>
      </section>

      <!-- Quick Actions list -->
      <section class="dashboard-details-card">
        <div class="card-title-header">
          <Settings :size="18" class="header-icon" />
          <h3>快捷运营中心</h3>
        </div>
        <div class="quick-links-grid">
          <RouterLink to="/admin/site" class="quick-action-item">
            <Settings :size="16" />
            <div class="action-meta">
              <strong>修改站点信息</strong>
              <small>自定义背景、LOGO、描述</small>
            </div>
          </RouterLink>
          <RouterLink to="/admin/links" class="quick-action-item">
            <ListPlus :size="16" />
            <div class="action-meta">
              <strong>新增导航链接</strong>
              <small>一键添加常用网站与书签</small>
            </div>
          </RouterLink>
          <RouterLink to="/admin/bookmarks" class="quick-action-item">
            <Globe :size="16" />
            <div class="action-meta">
              <strong>批量导入书签</strong>
              <small>导入/导出浏览器 HTML 书签</small>
            </div>
          </RouterLink>
        </div>
      </section>
    </div>
  </AdminLayout>
</template>

<style scoped>
.stat-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 24px;
  display: flex;
  align-items: flex-start;
  gap: 16px;
  position: relative;
  transition: var(--transition-smooth);
}

.stat-card:hover {
  border-color: #cbd5e1;
  transform: translateY(-2px);
  box-shadow: 0 4px 20px rgba(15, 23, 42, 0.04);
}

.stat-icon-wrapper {
  background: rgba(37, 99, 235, 0.08);
  border: 1px solid rgba(37, 99, 235, 0.15);
  color: #2563eb;
  border-radius: 8px;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  flex-shrink: 0;
}

.stat-icon-wrapper.blue {
  background: rgba(16, 185, 129, 0.08);
  border-color: rgba(16, 185, 129, 0.15);
  color: #10b981;
}

.stat-icon-wrapper.orange {
  background: rgba(245, 158, 11, 0.08);
  border-color: rgba(245, 158, 11, 0.15);
  color: #d97706;
}

.stat-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.stat-label {
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.stat-value {
  font-size: 32px;
  font-weight: 800;
  margin: 6px 0 4px;
  color: var(--text);
  line-height: 1;
}

.stat-footer-text {
  font-size: 13px;
  color: var(--muted);
}

.stat-footer-text span {
  font-weight: 600;
  color: var(--text);
}

.stat-action-arrow {
  color: var(--muted);
  position: absolute;
  right: 18px;
  top: 18px;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  transition: var(--transition-smooth);
}

.stat-card:hover .stat-action-arrow {
  background: var(--line-soft);
  color: var(--text);
  transform: translateX(2px);
}

/* Details and lists styling */
.dashboard-details-card {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 24px;
}

.card-title-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--line-soft);
  padding-bottom: 12px;
}

.card-title-header h3 {
  font-size: 16px;
  font-weight: 800;
  margin: 0;
}

.header-icon {
  color: var(--muted);
}

.details-body {
  display: flex;
  flex-direction: column;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 44px;
  border-bottom: 1px solid var(--line-soft);
  gap: 16px;
}

.detail-row.border-none {
  border-bottom: none;
}

.detail-label {
  font-size: 13.5px;
  color: var(--muted);
  font-weight: 500;
}

.detail-value {
  font-size: 13.5px;
  color: var(--text);
  font-weight: 600;
}

.detail-value.highlight {
  color: var(--accent);
}

.detail-value.font-mono {
  font-family: monospace;
  background: var(--line-soft);
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 12.5px;
}

.url-text {
  font-family: monospace;
  font-size: 12.5px;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--accent);
  font-size: 13.5px;
  font-weight: 600;
  transition: var(--transition-smooth);
}

.detail-link:hover {
  text-decoration: underline;
}

/* Quick link grid */
.quick-links-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.quick-action-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  border-radius: 8px;
  border: 1px solid var(--line-soft);
  transition: var(--transition-smooth);
  background: var(--bg);
}

.quick-action-item:hover {
  border-color: var(--line);
  background: #ffffff;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.02);
  transform: translateY(-1px);
}

.quick-action-item svg {
  color: var(--accent);
  flex-shrink: 0;
}

.action-meta {
  display: flex;
  flex-direction: column;
}

.action-meta strong {
  font-size: 13.5px;
  color: var(--text);
  font-weight: 700;
}

.action-meta small {
  font-size: 12px;
  color: var(--muted);
  margin-top: 2px;
}
</style>
