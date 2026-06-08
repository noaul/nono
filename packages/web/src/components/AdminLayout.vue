<script setup lang="ts">
import { computed } from 'vue';
import {
  Activity,
  Bookmark,
  Bot,
  ChevronRight,
  Compass,
  Folder,
  Home,
  KeyRound,
  Link2,
  LogOut,
  Settings,
  Upload,
  User,
  Users,
} from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import ConfirmDialog from '@/components/admin/ConfirmDialog.vue';
import ToastHost from '@/components/admin/ToastHost.vue';

const props = defineProps<{ title: string }>();

const auth = useAuthStore();
const router = useRouter();

const navSections = [
  {
    label: '运营',
    items: [
      { to: '/admin', label: '总览', title: '控制台总览', hint: '关键数据', icon: Home, command: '查看内容规模、站点状态和下一步运营动作。' },
      { to: '/admin/site', label: '站点', title: '站点配置', hint: '前台外观', icon: Settings, command: '调整公开导航页的品牌信息、搜索和视觉配置。' },
      { to: '/admin/folders', label: '文件夹', title: '文件夹', hint: '分类结构', icon: Folder, command: '维护导航分类、层级、密码和排序。' },
      { to: '/admin/links', label: '书签管理', title: '书签管理', hint: '链接资产', icon: Link2, command: '新增、迁移、排序、查重和检查链接健康度。' },
    ],
  },
  {
    label: '自动化',
    items: [
      { to: '/admin/bookmarks', label: '导入导出', title: '浏览器书签', hint: '批量处理', icon: Upload, command: '预览浏览器书签文件并安全导入或导出。' },
      { to: '/admin/llm', label: 'LLM', title: 'AI 智能收藏', hint: '智能分析', icon: Bot, command: '配置智能收藏所需的模型服务。' },
      { to: '/admin/tokens', label: 'Token', title: 'API Token', hint: '扩展接入', icon: KeyRound, command: '管理浏览器扩展和接口访问凭证。' },
    ],
  },
  {
    label: '系统',
    items: [
      { to: '/admin/account', label: '账户', title: '账户设置', hint: '安全', icon: User, command: '更新当前账户的安全凭据。' },
      { to: '/admin/users', label: '用户', title: '用户管理', hint: '权限', icon: Users, adminOnly: true, command: '管理成员资料、角色和注册策略。' },
    ],
  },
];

const visibleNavSections = computed(() =>
  navSections
    .map((section) => ({ ...section, items: section.items.filter((entry) => !entry.adminOnly || auth.isAdmin) }))
    .filter((section) => section.items.length),
);
const flatNavItems = computed(() => visibleNavSections.value.flatMap((section) => section.items.map((item) => ({ ...item, sectionLabel: section.label }))));
const activeNavItem = computed(() => flatNavItems.value.find((item) => item.title === props.title || item.label === props.title) || flatNavItems.value[0]);
const operatorName = computed(() => auth.user?.displayName || auth.user?.username || 'Nono Admin');
const operatorRole = computed(() => (auth.isAdmin ? '管理员' : '成员'));

async function logout() {
  await auth.logout();
  await router.push('/login');
}
</script>

<template>
  <div class="app-workbench glass-workbench figma-admin-shell">
    <aside class="workbench-sidebar glass-surface">
      <RouterLink class="sidebar-brand" to="/admin">
        <div class="brand-logo">N</div>
        <div>
          <h1>Nono 控制台</h1>
          <p>导航运营后台</p>
        </div>
      </RouterLink>

      <section class="operator-card glass-surface">
        <div class="operator-status">
          <span class="status-dot"></span>
          <span>在线</span>
        </div>
        <strong>{{ operatorName }}</strong>
        <small>{{ operatorRole }} · {{ auth.user?.username || 'admin' }}</small>
      </section>

      <nav class="admin-nav workbench-nav" aria-label="后台导航">
        <section v-for="section in visibleNavSections" :key="section.label" class="nav-section">
          <p>{{ section.label }}</p>
          <RouterLink v-for="item in section.items" :key="item.to" class="nav-button" :to="item.to">
            <span class="nav-icon"><component :is="item.icon" :size="17" /></span>
            <span class="nav-copy">
              <strong>{{ item.label }}</strong>
              <small>{{ item.hint }}</small>
            </span>
            <ChevronRight class="nav-chevron" :size="15" />
          </RouterLink>
        </section>
      </nav>

      <div class="sidebar-footer">
        <RouterLink class="button secondary compact" to="/"><Compass :size="17" /> 主页</RouterLink>
        <button class="icon-button secondary" title="退出登录" @click="logout"><LogOut :size="17" /></button>
      </div>
    </aside>

    <div class="workbench-main">
      <header class="workbench-topbar glass-surface">
        <div class="page-title">
          <p><strong>{{ activeNavItem?.sectionLabel || '运营' }}</strong></p>
          <h1>{{ title }}</h1>
        </div>
        <div class="page-command-card glass-surface">
          <Activity :size="18" />
          <div>
            <span>当前任务</span>
            <strong>{{ activeNavItem?.command || '维护导航数据和站点配置。' }}</strong>
          </div>
        </div>
        <div class="top-actions">
          <RouterLink class="button secondary" to="/"><Bookmark :size="17" /> 查看主页</RouterLink>
          <button class="button secondary" title="退出登录" @click="logout"><LogOut :size="18" /> 退出</button>
        </div>
      </header>

      <section class="figma-control-strip glass-surface" aria-label="后台区域">
        <RouterLink v-for="section in visibleNavSections" :key="section.label" class="figma-section-chip" :to="section.items[0]?.to || '/admin'">
          <span>{{ section.label }}</span>
          <strong>{{ section.items.length }}</strong>
        </RouterLink>
      </section>

      <main class="workbench-stage">
        <slot />
      </main>
    </div>

    <ToastHost />
    <ConfirmDialog />
  </div>
</template>
