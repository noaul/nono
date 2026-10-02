import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, Ellipsis, FileCode2, GitFork, LogOut, Moon, Search, Settings, Sun, TrendingUp } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useDialog } from '../hooks/useDialog';
import { HeaderMenuId, AppState } from '../types';

/**
 * The application frame, the same at every width: the NoNo module switcher across the top, the
 * page title, and the page dock at the bottom — a tab bar on phones, a floating bar on wider
 * screens. NoMoney and Yumi use the same frame. Geometry and colour come from the shared UI
 * contract (see docs/design/ui-contract.md); nothing here carries a NoStar-specific palette.
 */

const MENU_META: Record<HeaderMenuId, {
  icon: React.ComponentType<{ className?: string }>;
  labelZh: string;
  labelEn: string;
}> = {
  repositories: { icon: Search, labelZh: '仓库', labelEn: 'Repositories' },
  gists: { icon: FileCode2, labelZh: 'Gist', labelEn: 'Gist' },
  releases: { icon: Calendar, labelZh: '发布', labelEn: 'Releases' },
  forks: { icon: GitFork, labelZh: '复刻', labelEn: 'Forks' },
  subscription: { icon: TrendingUp, labelZh: '趋势', labelEn: 'Trending' },
  settings: { icon: Settings, labelZh: '设置', labelEn: 'Settings' },
};

/** Every NoNo module. They share this origin, so plain links are enough; NoStar is highlighted. */
const NONO_MODULES = [
  { id: 'nono', href: '/', label: 'NoNo' },
  { id: 'nodesk', href: '/nodesk', label: 'NoDesk' },
  { id: 'nomoney', href: '/nomoney/', label: 'NoMoney' },
  { id: 'yumi', href: '/yumi/', label: 'Yumi' },
  { id: 'nostar', href: '/nostar/', label: 'NoStar' },
];

/** On phones the dock holds four pages, preferring these; the rest open above 更多. */
const TAB_BAR_ORDER: HeaderMenuId[] = ['repositories', 'releases', 'subscription', 'gists'];
const PHONE_DOCK_SIZE = 4;

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    user,
    theme,
    currentView,
    headerMenuConfig,
    setTheme,
    setCurrentView,
    logout,
    language,
  } = useAppStore();

  const { confirm } = useDialog();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  const t = (zh: string, en: string) => (language === 'zh' ? zh : en);

  const visibleMenus = useMemo(
    () => [...headerMenuConfig].filter((item) => item.visible).sort((a, b) => a.order - b.order),
    [headerMenuConfig],
  );
  const activeMenu = visibleMenus.find((item) => item.id === currentView);
  // Five cells fit a phone: with five pages or fewer there is no 更多 at all.
  const phoneIds = useMemo(() => {
    const ids = visibleMenus.map((item) => item.id);
    if (ids.length <= PHONE_DOCK_SIZE + 1) return ids;
    const preferred = TAB_BAR_ORDER.filter((id) => ids.includes(id));
    return [...preferred, ...ids.filter((id) => !preferred.includes(id))].slice(0, PHONE_DOCK_SIZE);
  }, [visibleMenus]);
  const overflowIds = visibleMenus.map((item) => item.id).filter((id) => !phoneIds.includes(id));

  // The 更多 menu closes on an outside tap, Escape, or once the dock is wide enough to show everything.
  useEffect(() => {
    if (!moreOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false);
    };
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth >= 768) setMoreOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeydown);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('resize', onResize);
    };
  }, [moreOpen]);

  const selectView = (id: HeaderMenuId) => {
    setCurrentView(id as AppState['currentView']);
    setMoreOpen(false);
  };

  const onLogout = async () => {
    const confirmed = await confirm(
      t('退出登录确认', 'Logout Confirmation'),
      language === 'zh'
        ? '退出后您的 AI 配置、WebDAV 设置、自定义分类等数据仍会保留。如需完全清除所有数据，请前往「设置 → 数据管理」。'
        : 'Your AI configs, WebDAV settings, custom categories and other data will be preserved. To completely clear all data, please go to "Settings → Data Management".',
      { type: 'warning' },
    );
    if (confirmed) logout();
  };

  return (
    <div className="nostar-shell" data-testid="nostar-shell">
      {/* `hd-drag` is the Electron window drag region the retired header owned. Interactive
          children opt out with `hd-btns`; both classes are inert in a browser. */}
      <header className="nostar-topbar hd-drag">
        <nav className="nostar-topbar-title hd-btns" data-testid="nostar-apps" aria-label={t('NoNo 应用', 'NoNo apps')}>
          {NONO_MODULES.map(({ id, href, label }) => (
            <a key={id} href={href} aria-current={id === 'nostar' ? 'page' : undefined} className={`nostar-module${id === 'nostar' ? ' is-active' : ''}`}>
              {label}
            </a>
          ))}
        </nav>
        <div className="nostar-topbar-actions hd-btns">
          {user && <img src={user.avatar_url} alt="" title={user.name || user.login} className="nostar-operator-avatar" />}
          <button
            type="button"
            className="nostar-icon-button"
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            title={t('切换主题', 'Toggle theme')}
            aria-label={t('切换主题', 'Toggle theme')}
          >
            {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
          </button>
          {user && (
            <button
              type="button"
              className="nostar-icon-button"
              onClick={onLogout}
              title={t('退出登录', 'Logout')}
              aria-label={t('退出登录', 'Logout')}
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <div className="nostar-main" data-testid="nostar-main">
        <div className="nostar-page-head">
          {/* The page's only h1. */}
          <h1 className="nostar-page-title">
            {activeMenu ? t(MENU_META[activeMenu.id].labelZh, MENU_META[activeMenu.id].labelEn) : 'NoStar'}
          </h1>
        </div>
        <main className="nostar-stage">{children}</main>
      </div>

      <nav className="nostar-dock" data-testid="nostar-dock" aria-label={t('主导航', 'Main navigation')}>
        {visibleMenus.map(({ id }) => {
          const meta = MENU_META[id];
          const Icon = meta.icon;
          const isActive = currentView === id;
          return (
            <button
              key={id}
              type="button"
              data-testid={`nav-${id}`}
              aria-current={isActive ? 'page' : undefined}
              className={`nostar-tab${isActive ? ' is-active' : ''}${overflowIds.includes(id) ? ' is-overflow' : ''}`}
              style={{ '--nostar-phone-order': phoneIds.indexOf(id) } as React.CSSProperties}
              onClick={() => selectView(id)}
            >
              <Icon className="h-5 w-5" />
              <span className="nostar-tab-label">{t(meta.labelZh, meta.labelEn)}</span>
            </button>
          );
        })}
        {overflowIds.length > 0 && (
          <div ref={moreRef} className="nostar-more">
            <button
              type="button"
              data-testid="nostar-more"
              className={`nostar-tab${moreOpen || overflowIds.includes(currentView as HeaderMenuId) ? ' is-active' : ''}`}
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((open) => !open)}
            >
              <Ellipsis className="h-5 w-5" />
              <span className="nostar-tab-label">{t('更多', 'More')}</span>
            </button>
            {moreOpen && (
              <div role="menu" className="nostar-more-menu" data-testid="nostar-more-menu">
                {overflowIds.map((id) => {
                  const meta = MENU_META[id];
                  const Icon = meta.icon;
                  const isActive = currentView === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="menuitem"
                      aria-current={isActive ? 'page' : undefined}
                      className={`nostar-more-item${isActive ? ' is-active' : ''}`}
                      onClick={() => selectView(id)}
                    >
                      <Icon className="h-[17px] w-[17px] shrink-0" />
                      {t(meta.labelZh, meta.labelEn)}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </nav>
    </div>
  );
};
