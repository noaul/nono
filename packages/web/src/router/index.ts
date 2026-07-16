import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import NavigationPage from '@/views/NavigationPage.vue';

const LoginView = () => import('@/views/LoginView.vue');
const RegisterView = () => import('@/views/RegisterView.vue');
const SetupView = () => import('@/views/SetupView.vue');
const AdminShellView = () => import('@/views/admin/AdminShellView.vue');
const AdminDashboard = () => import('@/views/admin/AdminDashboard.vue');
const SiteConfigView = () => import('@/views/admin/SiteConfigView.vue');
const FoldersView = () => import('@/views/admin/FoldersView.vue');
const LinksView = () => import('@/views/admin/LinksView.vue');
const BookmarksView = () => import('@/views/admin/BookmarksView.vue');
const UsersView = () => import('@/views/admin/UsersView.vue');
const AccountView = () => import('@/views/admin/AccountView.vue');
const LlmView = () => import('@/views/admin/LlmView.vue');
const TokensView = () => import('@/views/admin/TokensView.vue');

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: NavigationPage },
    { path: '/login', component: LoginView },
    { path: '/register', component: RegisterView },
    { path: '/setup', component: SetupView },
    {
      path: '/admin',
      component: AdminShellView,
      meta: { requiresAuth: true },
      children: [
        { path: '', component: AdminDashboard, meta: { title: '控制台总览' } },
        { path: 'site', component: SiteConfigView, meta: { title: '站点配置' } },
        { path: 'folders', component: FoldersView, meta: { title: '文件夹' } },
        { path: 'links', component: LinksView, meta: { title: '书签管理' } },
        { path: 'bookmarks', component: BookmarksView, meta: { title: '浏览器书签' } },
        { path: 'users', component: UsersView, meta: { title: '用户管理', requiresAdmin: true } },
        { path: 'account', component: AccountView, meta: { title: '账户设置' } },
        { path: 'llm', component: LlmView, meta: { title: 'AI 智能收藏' } },
        { path: 'tokens', component: TokensView, meta: { title: 'API Token' } },
      ],
    },
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
