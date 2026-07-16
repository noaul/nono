<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { ArrowRight, Bot, ExternalLink, Folder as FolderIcon, Globe, KeyRound, Link2, ListChecks, Lock, Settings, Upload } from 'lucide-vue-next';
import FolderGlyph from '@/components/FolderGlyph.vue';
import { apiRequest } from '@/api/client';
import type { Folder, Link, Site } from '@/api/types';

const site = ref<Site | null>(null);
const folders = ref<Folder[]>([]);
const links = ref<Link[]>([]);

const lockedCount = computed(() => folders.value.filter((folder) => folder.locked).length);
const emptyFolderCount = computed(() => folders.value.filter((folder) => !links.value.some((link) => link.folderId === folder.id)).length);
const averageLinksPerFolder = computed(() => (folders.value.length ? Math.round((links.value.length / folders.value.length) * 10) / 10 : 0));
const localSearchMode = computed(() => (site.value?.localSearchFirst ? '站内优先' : '外部搜索'));
const folderHighlights = computed(() =>
  folders.value
    .map((folder) => ({ ...folder, linkCount: links.value.filter((link) => link.folderId === folder.id).length }))
    .sort((a, b) => b.linkCount - a.linkCount || b.sortOrder - a.sortOrder)
    .slice(0, 5),
);

onMounted(async () => {
  [site.value, folders.value, links.value] = await Promise.all([
    apiRequest<Site>('/api/admin/site'),
    apiRequest<Folder[]>('/api/admin/folders'),
    apiRequest<Link[]>('/api/admin/links'),
  ]);
});
</script>

<template>
    <section class="dashboard-hero">
      <div class="dashboard-hero-copy">
        <p>运营中枢</p>
        <h2>{{ site?.name || 'Nono' }}</h2>
        <span>{{ site?.description || '把分散的工具、资料和浏览器书签整理成一个稳定的个人导航入口。' }}</span>
        <div class="dashboard-hero-actions">
          <RouterLink class="button" to="/admin/links"><Link2 :size="17" /> 管理书签</RouterLink>
          <RouterLink class="button secondary" to="/admin/site"><Settings :size="17" /> 调整站点</RouterLink>
        </div>
      </div>
      <div class="dashboard-hero-panel">
        <div>
          <span>公开入口</span>
          <strong>/{{ site?.slug || 'admin' }}</strong>
        </div>
        <a href="/" target="_blank" rel="noreferrer">
          打开主页 <ExternalLink :size="14" />
        </a>
        <small>{{ localSearchMode }} · {{ site?.searchUrlTemplate || '默认搜索模板' }}</small>
      </div>
    </section>

    <div class="ops-metric-grid">
      <RouterLink to="/admin/folders" class="ops-metric-card tone-green">
        <FolderIcon :size="20" />
        <div>
          <span>分类文件夹</span>
          <strong>{{ folders.length }}</strong>
          <small>{{ emptyFolderCount }} 个待补内容</small>
        </div>
        <ArrowRight :size="16" />
      </RouterLink>

      <RouterLink to="/admin/links" class="ops-metric-card tone-blue">
        <Link2 :size="20" />
        <div>
          <span>收录书签</span>
          <strong>{{ links.length }}</strong>
          <small>平均 {{ averageLinksPerFolder }} 个/文件夹</small>
        </div>
        <ArrowRight :size="16" />
      </RouterLink>

      <RouterLink to="/admin/folders" class="ops-metric-card tone-amber">
        <Lock :size="20" />
        <div>
          <span>加密分类</span>
          <strong>{{ lockedCount }}</strong>
          <small>受控访问分组</small>
        </div>
        <ArrowRight :size="16" />
      </RouterLink>

      <RouterLink to="/admin/tokens" class="ops-metric-card tone-rose">
        <KeyRound :size="20" />
        <div>
          <span>扩展接入</span>
          <strong>Token</strong>
          <small>管理浏览器扩展授权</small>
        </div>
        <ArrowRight :size="16" />
      </RouterLink>
    </div>

    <div class="operations-grid">
      <section class="ops-panel folder-distribution">
        <div class="ops-panel-head">
          <div>
            <p>内容分布</p>
            <h3>高密度文件夹</h3>
          </div>
          <RouterLink to="/admin/folders">管理 <ArrowRight :size="14" /></RouterLink>
        </div>
        <div class="folder-rank-list">
          <article v-for="folder in folderHighlights" :key="folder.id">
            <span><FolderGlyph :icon="folder.icon" :size="18" /></span>
            <div>
              <strong>{{ folder.name }}</strong>
              <small>{{ folder.locked ? '加密' : '公开' }} · {{ folder.description || folder.passwordHint || '无说明' }}</small>
            </div>
            <em>{{ folder.linkCount }} 个</em>
          </article>
          <div v-if="!folderHighlights.length" class="folder-rank-empty">
            <strong>还没有可展示的文件夹</strong>
            <small>创建文件夹并添加书签后，这里会显示内容最密集的分类。</small>
          </div>
        </div>
      </section>

      <section class="ops-panel quick-ops-panel">
        <div class="ops-panel-head">
          <div>
            <p>快捷动作</p>
            <h3>常用运营入口</h3>
          </div>
        </div>
        <div class="quick-ops-list">
          <RouterLink to="/admin/links">
            <Link2 :size="17" />
            <div>
              <strong>新增链接</strong>
              <small>补充工具、资料和外部入口</small>
            </div>
          </RouterLink>
          <RouterLink to="/admin/add-bookmark">
            <Upload :size="17" />
            <div>
              <strong>导入浏览器书签</strong>
              <small>先预览，再批量导入</small>
            </div>
          </RouterLink>
          <RouterLink to="/admin/llm">
            <Bot :size="17" />
            <div>
              <strong>配置智能收藏</strong>
              <small>让扩展自动分析标题与说明</small>
            </div>
          </RouterLink>
        </div>
      </section>

      <section class="ops-panel governance-panel">
        <div class="ops-panel-head">
          <div>
            <p>治理队列</p>
            <h3>下一步建议</h3>
          </div>
        </div>
        <div class="governance-list">
          <RouterLink to="/admin/links">
            <ListChecks :size="17" />
            <div>
              <strong>检查重复与失效链接</strong>
              <small>在书签管理里运行查重和健康检查</small>
            </div>
          </RouterLink>
          <RouterLink to="/admin/folders">
            <FolderIcon :size="17" />
            <div>
              <strong>整理空文件夹</strong>
              <small>{{ emptyFolderCount }} 个文件夹暂时没有链接</small>
            </div>
          </RouterLink>
          <RouterLink to="/admin/site">
            <Globe :size="17" />
            <div>
              <strong>校准公开主页</strong>
              <small>{{ localSearchMode }} · 检查品牌、颜色和搜索模板</small>
            </div>
          </RouterLink>
        </div>
      </section>
    </div>
</template>

<style scoped>
.dashboard-hero h2,
.ops-panel h3,
.ops-metric-card strong {
  letter-spacing: 0;
}

.folder-rank-list article,
.quick-ops-list a,
.governance-list a {
  min-width: 0;
}

.folder-rank-list strong,
.folder-rank-list small,
.quick-ops-list strong,
.quick-ops-list small,
.governance-list strong,
.governance-list small {
  overflow-wrap: anywhere;
}
</style>
