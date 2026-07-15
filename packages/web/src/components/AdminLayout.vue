<script setup lang="ts">
import '@/styles/admin.css';
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import {
  Bot,
  BookOpenText,
  Compass,
  FilePlus2,
  Folder,
  Home,
  KeyRound,
  Link2,
  LogOut,
  Settings,
  User,
  Users,
} from 'lucide-vue-next';
import { useRouter } from 'vue-router';
import { apiRequest } from '@/api/client';
import type { Site } from '@/api/types';
import { useAuthStore } from '@/stores/auth';
import { getAppearanceSettings, toAppearanceCssVars } from '@/utils/appearance';
import ConfirmDialog from '@/components/admin/ConfirmDialog.vue';
import ToastHost from '@/components/admin/ToastHost.vue';

const props = defineProps<{ title: string }>();

const auth = useAuthStore();
const router = useRouter();
const siteSettings = ref<Record<string, unknown>>({});
const appearanceStyle = computed(() => toAppearanceCssVars(getAppearanceSettings(siteSettings.value)));
const userMenuOpen = ref(false);
const userMenuRef = ref<HTMLElement | null>(null);

const navSections = [
  {
    label: '运营',
    items: [
      { to: '/admin', label: '总览', title: '控制台总览', icon: Home },
      { to: '/admin/site', label: '站点', title: '站点配置', icon: Settings },
      { to: '/admin/folders', label: '文件夹', title: '文件夹', icon: Folder },
      { to: '/admin/add-bookmark', label: '新增书签', title: '新增书签', icon: FilePlus2 },
      { to: '/admin/links', label: '书签管理', title: '书签管理', icon: Link2 },
      { to: '/admin/nodesk', label: 'Nodesk', title: 'Nodesk', icon: BookOpenText },
    ],
  },
  {
    label: '自动化',
    items: [
      { to: '/admin/llm', label: 'LLM', title: 'AI 智能收藏', icon: Bot },
      { to: '/admin/tokens', label: 'Token', title: 'API Token', icon: KeyRound },
    ],
  },
  {
    label: '系统',
    items: [
      { to: '/admin/account', label: '账户', title: '账户设置', icon: User },
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
const activeNavItem = computed(() => flatNavItems.value.find((item) => item.title === props.title || item.label === props.title) || flatNavItems.value[0]);
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

onMounted(async () => {
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onDocumentKeydown);
  try {
    const site = await apiRequest<Site>('/api/admin/site');
    siteSettings.value = site.settings || {};
  } catch {
    siteSettings.value = {};
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('keydown', onDocumentKeydown);
});

async function logout() {
  userMenuOpen.value = false;
  await auth.logout();
  await router.push('/login');
}
</script>

<template>
  <div class="app-workbench glass-workbench admin-glass-enabled figma-admin-shell" :style="appearanceStyle">
    <aside class="workbench-sidebar glass-surface">
      <RouterLink class="sidebar-brand" to="/">
        <div class="brand-logo">N</div>
        <div>
          <h1>Nono 控制台</h1>
          <p>导航运营后台</p>
        </div>
      </RouterLink>

      <nav class="admin-nav workbench-nav" aria-label="后台导航">
        <section v-for="section in visibleNavSections" :key="section.label" class="nav-section">
          <p>{{ section.label }}</p>
          <RouterLink v-for="item in section.items" :key="item.to" class="nav-button nav-button-plain" :to="item.to">
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
        <div class="page-title">
          <p><strong>{{ activeNavItem?.sectionLabel || '运营' }}</strong></p>
          <h1>{{ title }}</h1>
        </div>
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
      </header>

      <main class="workbench-stage">
        <slot />
      </main>
    </div>

    <ToastHost />
    <ConfirmDialog />
  </div>
</template>
