<script setup lang="ts">
import '@/styles/admin.css';
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  Archive,
  ArrowUpDown,
  Bell,
  Bot,
  Compass,
  Home,
  KeyRound,
  Layers,
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
import LanguageControl from '@/components/LanguageControl.vue';
import { useModalBehavior } from '@/composables/useModalBehavior';
import type { Component } from 'vue';
import { useI18n } from '@/composables/useI18n';
import type { MessageKey } from '@/locales';

const props = withDefaults(defineProps<{ title?: string }>(), {
  title: '',
});

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const userMenuOpen = ref(false);
const { t } = useI18n();

const mobileNavOpen = ref(false);
const userMenuRef = ref<HTMLElement | null>(null);
const mobileNavRef = ref<HTMLElement | null>(null);
const mobileNavCloseRef = ref<HTMLButtonElement | null>(null);

// Nav entries carry catalogue keys; labels/titles resolve per render so switching language
// updates the sidebar without a reload.
type NavItem = { to: string; labelKey: MessageKey; titleKey: MessageKey; icon: Component; matches?: string[]; adminOnly?: boolean };
type NavSection = { labelKey: MessageKey; items: NavItem[] };

const navSections: NavSection[] = [
  {
    labelKey: 'admin.sectionOperations',
    items: [
      { to: '/admin', labelKey: 'admin.navDashboard', titleKey: 'admin.titleDashboard', icon: Home },
      { to: '/admin/site', labelKey: 'admin.navSite', titleKey: 'admin.titleSite', icon: Settings },
      {
        to: '/admin/notabs',
        labelKey: 'admin.navContentManagement',
        titleKey: 'admin.titleNotabs',
        icon: Layers,
        matches: ['/admin/notabs', '/admin/folders', '/admin/links'],
      },
    ],
  },
  {
    labelKey: 'admin.sectionAutomation',
    items: [
      { to: '/admin/automation', labelKey: 'admin.navAutomation', titleKey: 'admin.titleAutomation', icon: ArrowUpDown },
      { to: '/admin/llm', labelKey: 'admin.navLlm', titleKey: 'admin.titleLlm', icon: Bot },
      { to: '/admin/tokens', labelKey: 'admin.navTokens', titleKey: 'admin.titleTokens', icon: KeyRound },
    ],
  },
  {
    labelKey: 'admin.sectionSystem',
    items: [
      { to: '/admin/notifications', labelKey: 'admin.navNotifications', titleKey: 'admin.titleNotifications', icon: Bell },
      { to: '/admin/account', labelKey: 'admin.navAccount', titleKey: 'admin.titleAccount', icon: User },
      { to: '/admin/trash', labelKey: 'admin.navTrash', titleKey: 'admin.titleTrash', icon: Trash2 },
      { to: '/admin/backups', labelKey: 'admin.navBackups', titleKey: 'admin.titleBackups', icon: Archive, adminOnly: true },
      { to: '/admin/audit', labelKey: 'admin.navAudit', titleKey: 'admin.titleAudit', icon: ScrollText, adminOnly: true },
      { to: '/admin/users', labelKey: 'admin.navUsers', titleKey: 'admin.titleUsers', icon: Users, adminOnly: true },
    ],
  },
];

const visibleNavSections = computed(() =>
  navSections
    .map((section) => ({ ...section, items: section.items.filter((entry) => !entry.adminOnly || auth.isAdmin) }))
    .filter((section) => section.items.length),
);
const flatNavItems = computed(() => visibleNavSections.value.flatMap((section) => section.items.map((item) => ({ ...item, sectionLabelKey: section.labelKey }))));
const routeTitleKey = computed(() => (route?.meta?.titleKey as MessageKey | undefined) || 'admin.titleDashboard');
const pageTitle = computed(() => props.title || t(routeTitleKey.value));
const activeNavItem = computed(() => flatNavItems.value.find((item) => item.to === route?.path || item.matches?.includes(route?.path || '') || item.titleKey === routeTitleKey.value) || flatNavItems.value[0]);
const operatorName = computed(() => auth.user?.displayName || auth.user?.username || 'NoNo Admin');
const operatorRole = computed(() => t(auth.isAdmin ? 'admin.roleAdmin' : 'admin.roleMember'));
const operatorInitial = computed(() => operatorName.value.trim().charAt(0).toUpperCase() || 'N');

useModalBehavior({
  open: mobileNavOpen,
  container: mobileNavRef,
  close: () => { mobileNavOpen.value = false; },
  initialFocus: () => mobileNavCloseRef.value,
});

function onDocumentClick(event: MouseEvent) {
  if (!userMenuOpen.value) return;
  if (userMenuRef.value && event.target instanceof Node && !userMenuRef.value.contains(event.target)) {
    userMenuOpen.value = false;
  }
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') userMenuOpen.value = false;
}

function closeMobileNavigationAtDesktop() {
  if (window.innerWidth >= 768) mobileNavOpen.value = false;
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
  document.addEventListener('keydown', onDocumentKeydown);
  window.addEventListener('resize', closeMobileNavigationAtDesktop);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick);
  document.removeEventListener('keydown', onDocumentKeydown);
  window.removeEventListener('resize', closeMobileNavigationAtDesktop);
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
  <!-- One shell class. The five stacked skins this replaced fought each other by specificity;
       every primitive now has a single definition in admin.css, driven by the UI contract. -->
  <div class="admin-shell">
    <aside
      ref="mobileNavRef"
      class="workbench-sidebar"
      :class="{ 'is-mobile-open': mobileNavOpen }"
      :role="mobileNavOpen ? 'dialog' : undefined"
      :aria-modal="mobileNavOpen ? 'true' : undefined"
      :aria-label="mobileNavOpen ? t('admin.nav') : undefined"
      :tabindex="mobileNavOpen ? -1 : undefined"
    >
      <!-- The brand is not a heading: the topbar owns the page's single h1. -->
      <RouterLink class="sidebar-brand" to="/">
        <div class="brand-logo">N</div>
        <span class="brand-name">NoNo</span>
      </RouterLink>
      <button ref="mobileNavCloseRef" class="sidebar-mobile-close" type="button" :aria-label="t('admin.closeNav')" @click="mobileNavOpen = false">
        <X :size="18" />
      </button>

      <nav class="admin-nav workbench-nav" :aria-label="t('admin.nav')">
        <section v-for="section in visibleNavSections" :key="section.labelKey" class="nav-section">
          <p>{{ t(section.labelKey) }}</p>
          <RouterLink
            v-for="item in section.items"
            :key="item.to"
            class="nav-button nav-button-plain"
            :class="{ 'router-link-active': route?.path === item.to || item.matches?.includes(route?.path || '') }"
            :to="item.to"
            active-class="nav-route-match"
            exact-active-class="nav-route-exact"
          >
            <span class="nav-icon"><component :is="item.icon" :size="17" /></span>
            <span class="nav-label">{{ t(item.labelKey) }}</span>
          </RouterLink>
        </section>
      </nav>

      <section class="operator-card operator-row">
        <span class="operator-avatar" aria-hidden="true">{{ operatorInitial }}</span>
        <strong>{{ operatorName }}</strong>
        <small class="operator-role-badge">{{ operatorRole }}</small>
      </section>
    </aside>

    <div class="workbench-main" :inert="mobileNavOpen ? true : undefined" :aria-hidden="mobileNavOpen ? 'true' : undefined">
      <header class="workbench-topbar">
        <div class="topbar-title-group">
          <button
            class="mobile-nav-toggle"
            type="button"
            :title="t('admin.openNav')"
            :aria-label="t('admin.openNav')"
            :aria-expanded="mobileNavOpen"
            @click="mobileNavOpen = !mobileNavOpen"
          >
            <X v-if="mobileNavOpen" :size="18" />
            <Menu v-else :size="18" />
          </button>
          <div class="page-title">
            <p><strong>{{ t(activeNavItem?.sectionLabelKey || 'admin.sectionOperations') }}</strong></p>
            <h1>{{ pageTitle }}</h1>
          </div>
        </div>
        <div class="topbar-actions">
          <LanguageControl class="admin-language" />
          <ColorModeControl class="admin-color-mode" />
          <NotificationBell />
          <div ref="userMenuRef" class="topbar-user">
            <button
              class="topbar-avatar"
              type="button"
              :title="operatorName"
              :aria-label="t('admin.userMenu', { name: operatorName })"
              aria-haspopup="menu"
              :aria-expanded="userMenuOpen"
              @click="userMenuOpen = !userMenuOpen"
            >
              {{ operatorInitial }}
            </button>
            <div v-if="userMenuOpen" class="user-menu" role="menu">
              <div class="user-menu-head">
                <strong>{{ operatorName }}</strong>
                <small>{{ operatorRole }} · {{ auth.user?.username || 'admin' }}</small>
              </div>
              <RouterLink class="user-menu-item" role="menuitem" to="/" @click="userMenuOpen = false">
                <Compass :size="16" /> {{ t('admin.viewHome') }}
              </RouterLink>
              <button class="user-menu-item" role="menuitem" type="button" @click="logout">
                <LogOut :size="16" /> {{ t('admin.signOut') }}
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
      :aria-label="t('admin.closeNav')"
      @click="mobileNavOpen = false"
    ></button>

    <ToastHost />
    <ConfirmDialog />
  </div>
</template>
