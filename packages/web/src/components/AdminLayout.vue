<script setup lang="ts">
import {
  Bookmark,
  Bot,
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

defineProps<{ title: string }>();

const auth = useAuthStore();
const router = useRouter();

const navItems = [
  { to: '/admin', label: '总览', icon: Home },
  { to: '/admin/site', label: '站点', icon: Settings },
  { to: '/admin/folders', label: '文件夹', icon: Folder },
  { to: '/admin/links', label: '链接', icon: Link2 },
  { to: '/admin/bookmarks', label: '导入导出', icon: Upload },
  { to: '/admin/llm', label: 'LLM', icon: Bot },
  { to: '/admin/tokens', label: 'Token', icon: KeyRound },
  { to: '/admin/account', label: '账户', icon: User },
  { to: '/admin/users', label: '用户', icon: Users, adminOnly: true },
];

async function logout() {
  await auth.logout();
  await router.push('/login');
}
</script>

<template>
  <div class="admin-shell">
    <aside class="admin-sidebar">
      <RouterLink class="admin-brand" to="/admin"><Bookmark :size="22" /> Nono</RouterLink>
      <nav class="admin-nav">
        <RouterLink v-for="item in navItems.filter((entry) => !entry.adminOnly || auth.isAdmin)" :key="item.to" :to="item.to">
          <component :is="item.icon" :size="17" />
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>
    </aside>
    <main class="admin-main">
      <header class="admin-topbar">
        <div>
          <h1>{{ title }}</h1>
          <div class="admin-user">{{ auth.user?.displayName || auth.user?.username }}</div>
        </div>
        <button class="icon-button secondary" title="退出登录" @click="logout"><LogOut :size="18" /></button>
      </header>
      <slot />
    </main>
  </div>
</template>
