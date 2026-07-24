<script setup lang="ts">
import '@/styles/admin.css';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  Archive,
  ArrowUpDown,
  Bell,
  Bot,
  Compass,
  Folder,
  Home,
  KeyRound,
  Layers,
  Link2,
  LogOut,
  Menu,
  Settings,
  ScrollText,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-vue-next';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import ConfirmDialog from '@/components/admin/ConfirmDialog.vue';
import ToastHost from '@/components/admin/ToastHost.vue';
import NotificationBell from '@/components/admin/NotificationBell.vue';
import ColorModeControl from '@/components/ColorModeControl.vue';

const props = withDefaults(defineProps<{ title?: string }>(), {
  title: '',
});

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const userMenuOpen = ref(false);
const mobileNavOpen = ref(false);
const userMenuRef = ref<HTMLElement | null>(null);

const navSections = [
  {
    label: '运营',
    items: [
      { to: '/admin', label: '总览', title: '控制台总览', icon: Home },
      { to: '/admin/site', label: '站点', title: '站点配置', icon: Settings },
      { to: '/admin/notabs', label: 'Notab 管理', title: 'Notab 管理', icon: Layers },
      { to: '/admin/folders', label: '文件夹', title: '文件夹', icon: Folder },
      { to: '/admin/links', label: '书签管理', title: '书签管理', icon: Link2 },
    ],
  },
  {
    label: '自动化',
    items: [
      { to: '/admin/automation', label: '导入导出', title: '书签导入导出', icon: ArrowUpDown },
      { to: '/admin/llm', label: 'LLM', title: 'AI 智能收藏', icon: Bot },
      { to: '/admin/tokens', label: 'Token', title: 'API Token', icon: KeyRound },
    ],
  },
  {
    label: '系统',
    items: [
      { to: '/admin/notifications', label: '通知中心', title: '通知中心', icon: Bell },
      { to: '/admin/account', label: '账户', title: '账户设置', icon: User },
      { to: '/admin/trash', label: '回收站', title: '回收站', icon: Trash2 },
      { to: '/admin/backups', label: '备份', title: '备份与恢复', icon: Archive, adminOnly: true },
      { to: '/admin/audit', label: '审计日志', title: '操作审计', icon: ScrollText, adminOnly: true },
      { to: '/admin/users', label: '用户', title: '用户管理', icon: Users, adminOnly: true },
    ],
  },
];

const visibleNavSections = computed(() =>
  navSections
    .map((section) => ({ ...section, items: section.items.filter((entry) => !entry.adminOnly || auth.isAdmin) }))
    .filter((section) => section.items.length),
);
const flatNavItems = computed(() => visibleNavSections.value.flatMap((section) => section.items.map((item) => ({ ...item, sectionLabel: section.label }))));
const pageTitle = computed(() => props.title || String(route?.meta?.title || '控制台总览'));
const activeNavItem = computed(() => flatNavItems.value.find((item) => item.to === route?.path || item.title === pageTitle.value || item.label === pageTitle.value) || flatNavItems.value[0]);
const operatorName = computed(() => auth.user?.displayName || auth.user?.username || 'Nono Admin');
const operatorRole = computed(() => (auth.isAdmin ? '管理员' : '成员'));
const operatorInitial = computed(() => operatorName.value.trim().charAt(0).toUpperCase() || 'N');

function onDocumentClick(event: MouseEvent) {
  if (!userMenuOpen.value) return;
  if (userMenuRef.value && event.target instanceof Node && !userMenuRef.value.contains(event.target)) {
    userMenuOpen.value = false;
  }
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') userMenuOpen.value = false;
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onDocumentKeydown);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('keydown', onDocumentKeydown);
});

watch(() => route?.path, () => {
  mobileNavOpen.value = false;
  userMenuOpen.value = false;
});

async function logout() {
  userMenuOpen.value = false;
  await auth.logout();
  await router.push('/login');
}
</script>

<template>
  <div class="app-workbench glass-workbench admin-glass-enabled figma-admin-shell chatgpt-admin-shell">
    <aside class="workbench-sidebar glass-surface" :class="{ 'is-mobile-open': mobileNavOpen }">
      <RouterLink class="sidebar-brand" to="/">
        <div class="brand-logo">N</div>
        <div>
          <h1>Nono</h1>
        </div>
      </RouterLink>

      <nav class="admin-nav workbench-nav" aria-label="后台导航">
        <section v-for="section in visibleNavSections" :key="section.label" class="nav-section">
          <p>{{ section.label }}</p>
          <RouterLink
            v-for="item in section.items"
            :key="item.to"
            class="nav-button nav-button-plain"
            :class="{ 'router-link-active': route?.path === item.to }"
            :to="item.to"
            active-class="nav-route-match"
            exact-active-class="nav-route-exact"
          >
            <span class="nav-icon"><component :is="item.icon" :size="17" /></span>
            <span class="nav-label">{{ item.label }}</span>
          </RouterLink>
        </section>
      </nav>

      <section class="operator-card operator-row glass-surface">
        <span class="operator-avatar" aria-hidden="true">{{ operatorInitial }}</span>
        <strong>{{ operatorName }}</strong>
        <small class="operator-role-badge">{{ operatorRole }}</small>
      </section>
    </aside>

    <div class="workbench-main">
      <header class="workbench-topbar glass-surface">
        <div class="topbar-title-group">
          <button
            class="mobile-nav-toggle"
            type="button"
            title="打开后台导航"
            aria-label="打开后台导航"
            :aria-expanded="mobileNavOpen"
            @click="mobileNavOpen = !mobileNavOpen"
          >
            <X v-if="mobileNavOpen" :size="18" />
            <Menu v-else :size="18" />
          </button>
          <div class="page-title">
            <p><strong>{{ activeNavItem?.sectionLabel || '运营' }}</strong></p>
            <h1>{{ pageTitle }}</h1>
          </div>
        </div>
        <div class="topbar-actions">
          <ColorModeControl class="admin-color-mode" />
          <NotificationBell />
          <div ref="userMenuRef" class="topbar-user">
            <button
              class="topbar-avatar"
              type="button"
              :title="operatorName"
              aria-haspopup="menu"
              :aria-expanded="userMenuOpen"
              @click="userMenuOpen = !userMenuOpen"
            >
              {{ operatorInitial }}
            </button>
            <div v-if="userMenuOpen" class="user-menu glass-surface" role="menu">
              <div class="user-menu-head">
                <strong>{{ operatorName }}</strong>
                <small>{{ operatorRole }} · {{ auth.user?.username || 'admin' }}</small>
              </div>
              <RouterLink class="user-menu-item" role="menuitem" to="/" @click="userMenuOpen = false">
                <Compass :size="16" /> 查看主页
              </RouterLink>
              <button class="user-menu-item" role="menuitem" type="button" @click="logout">
                <LogOut :size="16" /> 退出登录
              </button>
            </div>
          </div>
        </div>
      </header>

      <main class="workbench-stage">
        <slot><RouterView /></slot>
      </main>
    </div>

    <button
      v-if="mobileNavOpen"
      class="mobile-nav-backdrop"
      type="button"
      aria-label="关闭后台导航"
      @click="mobileNavOpen = false"
    ></button>

    <ToastHost />
    <ConfirmDialog />
  </div>
</template>
