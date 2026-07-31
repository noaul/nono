import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Calendar, FileCode2, GitFork, LogOut, Menu, Moon, Search, Settings, Sun, TrendingUp, X } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { useDialog } from '../hooks/useDialog';
import { HeaderMenuId, AppState } from '../types';

/**
 * The application frame: a fixed 256px sidebar and a 64px sticky topbar on desktop, the same
 * sidebar as a drawer on mobile. This replaced the header-centric layout so NoStar, the Nono
 * admin and NoMoney all read as one product. Geometry and colour come from the shared UI
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

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const t = (zh: string, en: string) => (language === 'zh' ? zh : en);

  const visibleMenus = useMemo(
    () => [...headerMenuConfig].filter((item) => item.visible).sort((a, b) => a.order - b.order),
    [headerMenuConfig],
  );
  const activeMenu = visibleMenus.find((item) => item.id === currentView);

  // The drawer only exists below md; growing past it closes the drawer rather than stranding it.
  useEffect(() => {
    const closeAtDesktop = () => {
      if (window.innerWidth >= 768) setMobileOpen(false);
    };
    window.addEventListener('resize', closeAtDesktop);
    return () => window.removeEventListener('resize', closeAtDesktop);
  }, []);

  // Focus containment, Escape, body scroll lock, and focus return to the trigger.
  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    const drawer = drawerRef.current;
    // Captured now: by cleanup time the ref may point at a different node.
    const trigger = triggerRef.current;
    document.body.style.overflow = 'hidden';
    drawer?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !drawer) return;
      const focusable = Array.from(drawer.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!focusable.length) {
        event.preventDefault();
        drawer.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!drawer.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKeydown);
    return () => {
      window.removeEventListener('keydown', onKeydown);
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [mobileOpen]);

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

  const nav = (
    <nav className="nostar-nav" aria-label={t('主导航', 'Main navigation')}>
      {visibleMenus.map((menuItem) => {
        const meta = MENU_META[menuItem.id];
        const Icon = meta.icon;
        const isActive = currentView === menuItem.id;
        return (
          <button
            key={menuItem.id}
            type="button"
            data-testid={`nav-${menuItem.id}`}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => {
              setCurrentView(menuItem.id as AppState['currentView']);
              setMobileOpen(false);
            }}
            className={`nostar-nav-item${isActive ? ' is-active' : ''}`}
          >
            <Icon className="h-[17px] w-[17px] shrink-0" />
            <span className="nostar-nav-label">{t(meta.labelZh, meta.labelEn)}</span>
          </button>
        );
      })}
    </nav>
  );

  const brand = (
    <div className="nostar-brand">
      <img src="./icon.png" alt="" aria-hidden="true" className="nostar-brand-logo" />
      <span className="nostar-brand-name">NoStar</span>
    </div>
  );

  return (
    <div className="nostar-shell" data-testid="nostar-shell">
      <aside
        ref={drawerRef}
        className={`nostar-sidebar${mobileOpen ? ' is-mobile-open' : ''}`}
        data-testid="nostar-sidebar"
        role={mobileOpen ? 'dialog' : undefined}
        aria-modal={mobileOpen ? true : undefined}
        aria-label={mobileOpen ? t('主导航', 'Main navigation') : undefined}
        tabIndex={mobileOpen ? -1 : undefined}
      >
        {brand}
        <button
          type="button"
          className="nostar-drawer-close"
          data-testid="nostar-drawer-close"
          aria-label={t('关闭菜单', 'Close menu')}
          onClick={() => setMobileOpen(false)}
        >
          <X className="h-[18px] w-[18px]" />
        </button>
        {nav}
        {user && (
          <div className="nostar-operator">
            <img src={user.avatar_url} alt="" aria-hidden="true" className="nostar-operator-avatar" />
            <span className="nostar-operator-name">{user.name || user.login}</span>
          </div>
        )}
      </aside>

      {mobileOpen && (
        <button
          type="button"
          className="nostar-backdrop"
          data-testid="nostar-backdrop"
          aria-label={t('关闭菜单', 'Close menu')}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* While the drawer is open the rest of the app is inert and hidden from assistive tech,
          matching the Nono admin shell. React 18 does not type `inert`, so it is spread in. */}
      <div
        className="nostar-main"
        data-testid="nostar-main"
        aria-hidden={mobileOpen || undefined}
        {...(mobileOpen ? { inert: '' } : {})}
      >
        {/* `hd-drag` is the Electron window drag region the retired header owned. Interactive
            children opt out with `hd-btns`; both classes are inert in a browser. */}
        <header className="nostar-topbar hd-drag">
          <div className="nostar-topbar-title hd-btns">
            <button
              ref={triggerRef}
              type="button"
              className="nostar-menu-toggle"
              data-testid="nostar-menu-toggle"
              aria-label={t('菜单', 'Menu')}
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-[18px] w-[18px]" />
            </button>
            <h1 className="nostar-page-title">
              {activeMenu ? t(MENU_META[activeMenu.id].labelZh, MENU_META[activeMenu.id].labelEn) : 'NoStar'}
            </h1>
          </div>
          <div className="nostar-topbar-actions hd-btns">
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

        <main className="nostar-stage">{children}</main>
      </div>
    </div>
  );
};
