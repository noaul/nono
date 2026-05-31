import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import NavigationPage from '@/views/NavigationPage.vue';
import LoginView from '@/views/LoginView.vue';
import RegisterView from '@/views/RegisterView.vue';
import SetupView from '@/views/SetupView.vue';
import AdminDashboard from '@/views/admin/AdminDashboard.vue';
import SiteConfigView from '@/views/admin/SiteConfigView.vue';
import FoldersView from '@/views/admin/FoldersView.vue';
import LinksView from '@/views/admin/LinksView.vue';
import BookmarksView from '@/views/admin/BookmarksView.vue';
import UsersView from '@/views/admin/UsersView.vue';
import AccountView from '@/views/admin/AccountView.vue';
import LlmView from '@/views/admin/LlmView.vue';
import TokensView from '@/views/admin/TokensView.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: NavigationPage },
    { path: '/login', component: LoginView },
    { path: '/register', component: RegisterView },
    { path: '/setup', component: SetupView },
    { path: '/admin', component: AdminDashboard, meta: { requiresAuth: true } },
    { path: '/admin/site', component: SiteConfigView, meta: { requiresAuth: true } },
    { path: '/admin/folders', component: FoldersView, meta: { requiresAuth: true } },
    { path: '/admin/links', component: LinksView, meta: { requiresAuth: true } },
    { path: '/admin/bookmarks', component: BookmarksView, meta: { requiresAuth: true } },
    { path: '/admin/users', component: UsersView, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/admin/account', component: AccountView, meta: { requiresAuth: true } },
    { path: '/admin/llm', component: LlmView, meta: { requiresAuth: true } },
    { path: '/admin/tokens', component: TokensView, meta: { requiresAuth: true } },
    { path: '/:username', component: NavigationPage },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (!auth.loaded) await auth.loadSession().catch(() => undefined);
  if (to.meta.requiresAuth && !auth.authenticated) return auth.setupRequired ? '/setup' : '/login';
  if (to.meta.requiresAdmin && !auth.isAdmin) return '/admin';
  if ((to.path === '/login' || to.path === '/register' || to.path === '/setup') && auth.authenticated) return '/admin';
  return true;
});
