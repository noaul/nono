import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import NavigationPage from '@/views/NavigationPage.vue';
import PrivacyView from '@/views/PrivacyView.vue';

const LoginView = () => import('@/views/LoginView.vue');
const RegisterView = () => import('@/views/RegisterView.vue');
const SetupView = () => import('@/views/SetupView.vue');
const AdminLayout = () => import('@/components/AdminLayout.vue');
const AdminDashboard = () => import('@/views/admin/AdminDashboard.vue');
const SiteConfigView = () => import('@/views/admin/SiteConfigView.vue');
const NotabsView = () => import('@/views/admin/NotabsView.vue');
const FoldersView = () => import('@/views/admin/FoldersView.vue');
const LinksView = () => import('@/views/admin/LinksView.vue');
const AutomationView = () => import('@/views/admin/AutomationView.vue');
const UsersView = () => import('@/views/admin/UsersView.vue');
const AccountView = () => import('@/views/admin/AccountView.vue');
const LlmView = () => import('@/views/admin/LlmView.vue');
const TokensView = () => import('@/views/admin/TokensView.vue');
const BackupsView = () => import('@/views/admin/BackupsView.vue');
const NotificationsView = () => import('@/views/admin/NotificationsView.vue');
const AuditLogsView = () => import('@/views/admin/AuditLogsView.vue');
const TrashView = () => import('@/views/admin/TrashView.vue');

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: NavigationPage },
    { path: '/login', component: LoginView },
    { path: '/register', component: RegisterView },
    { path: '/setup', component: SetupView },
    { path: '/privacy', component: PrivacyView },
    {
      path: '/admin',
      component: AdminLayout,
      meta: { requiresAuth: true },
      children: [
        { path: '', component: AdminDashboard, meta: { title: '控制台总览' } },
        { path: '/admin/site', component: SiteConfigView, meta: { title: '站点配置' } },
        { path: '/admin/notabs', component: NotabsView, meta: { title: 'Notab 管理' } },
        { path: '/admin/folders', component: FoldersView, meta: { title: '文件夹' } },
        { path: '/admin/add-bookmark', redirect: '/admin/links' },
        { path: '/admin/links', component: LinksView, meta: { title: '书签管理' } },
        { path: '/admin/bookmarks', redirect: '/admin/links' },
        { path: '/admin/automation', component: AutomationView, meta: { title: '导入导出' } },
        { path: '/admin/users', component: UsersView, meta: { title: '用户管理', requiresAdmin: true } },
        { path: '/admin/account', component: AccountView, meta: { title: '账户设置' } },
        { path: '/admin/trash', component: TrashView, meta: { title: '回收站' } },
        { path: '/admin/llm', component: LlmView, meta: { title: 'AI 智能收藏' } },
        { path: '/admin/tokens', component: TokensView, meta: { title: 'API Token' } },
        { path: '/admin/notifications', component: NotificationsView, meta: { title: '通知中心' } },
        { path: '/admin/audit', component: AuditLogsView, meta: { title: '操作审计', requiresAdmin: true } },
        { path: '/admin/backups', component: BackupsView, meta: { title: '备份与恢复', requiresAdmin: true } },
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
