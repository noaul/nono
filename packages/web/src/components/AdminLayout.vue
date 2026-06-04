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
import ConfirmDialog from '@/components/admin/ConfirmDialog.vue';
import ToastHost from '@/components/admin/ToastHost.vue';

defineProps<{ title: string }>();

const auth = useAuthStore();
const router = useRouter();

const navItems = [
  { to: '/admin', label: '总览', icon: Home },
  { to: '/admin/site', label: '站点', icon: Settings },
  { to: '/admin/folders', label: '文件夹', icon: Folder },
  { to: '/admin/links', label: '书签管理', icon: Link2 },
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
  <div class="app-workbench">
    <header class="topbar">
      <RouterLink class="brand" to="/admin">
        <div class="brand-logo">N</div>
        <div>
          <h1>Nono 控制台</h1>
          <p>{{ auth.user?.displayName || auth.user?.username || 'Nono Admin' }} 的导航工作台</p>
        </div>
      </RouterLink>
      <div class="notice"><Bookmark :size="16" /><strong>公告</strong><span>大文件夹导航和浏览器书签导入导出已就绪</span></div>
      <div class="top-actions">
        <RouterLink class="button secondary" to="/">查看主页</RouterLink>
        <button class="button secondary" title="退出登录" @click="logout"><LogOut :size="18" /> 退出</button>
      </div>
    </header>
    <div class="workspace">
      <aside class="sidebar">
        <nav class="admin-nav">
          <RouterLink v-for="item in navItems.filter((entry) => !entry.adminOnly || auth.isAdmin)" :key="item.to" class="nav-button" :to="item.to">
            <component :is="item.icon" :size="17" />
            <span>{{ item.label }}</span>
          </RouterLink>
        </nav>
      </aside>
      <main class="content">
        <header class="page-head">
          <div class="page-title">
            <p><strong>Nono 工作台</strong></p>
            <h1>{{ title }}</h1>
          </div>
        </header>
        <section class="section">
          <slot />
        </section>
      </main>
    </div>
    <ToastHost />
    <ConfirmDialog />
  </div>
</template>
