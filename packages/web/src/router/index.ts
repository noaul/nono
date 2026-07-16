import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import NavigationPage from '@/views/NavigationPage.vue';
import PrivacyView from '@/views/PrivacyView.vue';

const LoginView = () => import('@/views/LoginView.vue');
const RegisterView = () => import('@/views/RegisterView.vue');
const SetupView = () => import('@/views/SetupView.vue');
const AdminDashboard = () => import('@/views/admin/AdminDashboard.vue');
const SiteConfigView = () => import('@/views/admin/SiteConfigView.vue');
const NotabsView = () => import('@/views/admin/NotabsView.vue');
const FoldersView = () => import('@/views/admin/FoldersView.vue');
const LinksView = () => import('@/views/admin/LinksView.vue');
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
    { path: '/privacy', component: PrivacyView },
    { path: '/admin', component: AdminDashboard, meta: { requiresAuth: true } },
    { path: '/admin/site', component: SiteConfigView, meta: { requiresAuth: true } },
    { path: '/admin/notabs', component: NotabsView, meta: { requiresAuth: true } },
    { path: '/admin/folders', component: FoldersView, meta: { requiresAuth: true } },
    { path: '/admin/add-bookmark', component: LinksView, props: { mode: 'create' }, meta: { requiresAuth: true } },
    { path: '/admin/links', component: LinksView, meta: { requiresAuth: true } },
    { path: '/admin/bookmarks', redirect: '/admin/add-bookmark' },
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
