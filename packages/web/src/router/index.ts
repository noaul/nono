import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

// 导航页体积较大（约 86 kB JS + 85 kB CSS），改为动态导入后 /login、/setup、/admin/*
// 不再下载用不到的导航页代码；首屏多一次并行请求，但总字节数不变且缓存粒度更细。
const NavigationPage = () => import('@/views/NavigationPage.vue');
const PrivacyView = () => import('@/views/PrivacyView.vue');
const LoginView = () => import('@/views/LoginView.vue');
const SetupView = () => import('@/views/SetupView.vue');
const AdminLayout = () => import('@/components/AdminLayout.vue');
const AdminDashboard = () => import('@/views/admin/AdminDashboard.vue');
const SiteConfigView = () => import('@/views/admin/SiteConfigView.vue');
const NotabsView = () => import('@/views/admin/NotabsView.vue');
const LinksView = () => import('@/views/admin/LinksView.vue');
const AutomationView = () => import('@/views/admin/AutomationView.vue');
const AccountView = () => import('@/views/admin/AccountView.vue');
const LlmView = () => import('@/views/admin/LlmView.vue');
const NotificationsView = () => import('@/views/admin/NotificationsView.vue');
const AuditLogsView = () => import('@/views/admin/AuditLogsView.vue');
const TrashView = () => import('@/views/admin/TrashView.vue');

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(to) {
    if (to.hash) return { el: to.hash, top: 16 };
    return { top: 0 };
  },
  routes: [
    { path: '/', component: NavigationPage },
    { path: '/login', component: LoginView },
    { path: '/setup', component: SetupView },
    { path: '/privacy', component: PrivacyView },
    {
      path: '/admin',
      component: AdminLayout,
      meta: { requiresAuth: true },
      children: [
        { path: '', component: AdminDashboard, meta: { titleKey: 'admin.titleDashboard' } },
        { path: '/admin/site', component: SiteConfigView, meta: { titleKey: 'admin.titleSite' } },
        { path: '/admin/notabs', component: NotabsView, meta: { titleKey: 'admin.titleNotabs' } },
        { path: '/admin/folders', redirect: '/admin/links#folder-management' },
        { path: '/admin/add-bookmark', redirect: '/admin/links' },
        { path: '/admin/links', component: LinksView, meta: { titleKey: 'admin.titleLinks' } },
        { path: '/admin/bookmarks', redirect: '/admin/links' },
        { path: '/admin/automation', component: AutomationView, meta: { titleKey: 'admin.titleAutomation' } },
        { path: '/admin/users', redirect: '/admin/account' },
        { path: '/admin/account', component: AccountView, meta: { titleKey: 'admin.titleAccount' } },
        { path: '/admin/trash', component: TrashView, meta: { titleKey: 'admin.titleTrash' } },
        { path: '/admin/llm', component: LlmView, meta: { titleKey: 'admin.titleLlm' } },
        { path: '/admin/tokens', redirect: '/admin/account#api-tokens' },
        { path: '/admin/notifications', component: NotificationsView, meta: { titleKey: 'admin.titleNotifications' } },
        { path: '/admin/audit', component: AuditLogsView, meta: { titleKey: 'admin.titleAudit', requiresAdmin: true } },
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
  if ((to.path === '/login' || to.path === '/setup') && auth.authenticated) return '/admin';
  return true;
});
