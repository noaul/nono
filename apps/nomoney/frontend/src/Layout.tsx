import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ContactRound, Ellipsis, Globe2, Languages, LayoutDashboard, LogOut, Moon, ReceiptText, Repeat2, Server, Settings, Smartphone, Sun, Trash2 } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import clsx from 'clsx';
import type { User } from './types';
import { IconButton, StateBanner } from './ui';
import { connectMobileBridge, type MobileBridge } from './mobile/bridge';
import { logoutSharedSession } from './mobile/session';
import { useI18n } from './i18n';
import { product, productMeta } from './product';
import { COLOR_MODE_CHANGE_EVENT, currentColorMode, setColorModePreference, type ResolvedColorMode } from './color-mode';

const navItems = [
  { to: '/dashboard', labelZh: product === 'yumi' ? '总览' : '控制台', labelEn: product === 'yumi' ? 'Overview' : 'Dashboard', icon: LayoutDashboard },
  { to: '/phones', labelZh: '电话卡', labelEn: 'SIM cards', icon: Smartphone },
  { to: '/vps', labelZh: 'VPS', labelEn: 'VPS', icon: Server },
  { to: '/domains', labelZh: '域名', labelEn: 'Domains', icon: Globe2 },
  { to: '/subscriptions', labelZh: '订阅', labelEn: 'Subscriptions', icon: Repeat2 },
  { to: '/accounts', labelZh: '账号', labelEn: 'Accounts', icon: ContactRound },
  { to: '/expenses', labelZh: '费用', labelEn: 'Expenses', icon: ReceiptText },
  { to: '/trash', labelZh: '回收站', labelEn: 'Recycle bin', icon: Trash2 },
  { to: '/settings', labelZh: '设置', labelEn: 'Settings', icon: Settings }
];

// The dock lists the everyday pages first. Phones show those four and keep the rest above 更多.
const yumiNavOrder = ['/dashboard', '/vps', '/domains', '/expenses', '/trash', '/settings'];
const noMoneyNavOrder = ['/dashboard', '/subscriptions', '/phones', '/expenses', '/accounts', '/trash', '/settings'];
const productNavItems = (product === 'yumi' ? yumiNavOrder : noMoneyNavOrder).map((path) => navItems.find((item) => item.to === path)!);
const PHONE_DOCK_SIZE = 4;

// Every NoNo module shares this origin, outside this app's router base. The one being viewed is highlighted.
const nonoModules = [
  { id: 'nono', href: '/', label: 'NoNo' },
  { id: 'nodesk', href: '/nodesk', label: 'NoDesk' },
  { id: 'nomoney', href: '/nomoney/', label: 'NoMoney' },
  { id: 'yumi', href: '/yumi/', label: 'Yumi' },
  { id: 'nostar', href: '/nostar/', label: 'NoStar' }
];

export type LayoutOutletContext = {
  setTopbarActions: (actions: ReactNode | null) => void;
};

const LayoutActionsContext = createContext<LayoutOutletContext | null>(null);

export function useLayoutActions(): LayoutOutletContext {
  const value = useContext(LayoutActionsContext);
  if (!value) throw new Error('Layout actions are unavailable outside the authenticated layout');
  return value;
}

/**
 * The same frame at every width: the NoNo module switcher on top, then the page title and its
 * actions, and the page dock at the bottom (a tab bar on phones, a floating bar on wider screens).
 */
export function Layout({ user, children }: { user: User; children: ReactNode }) {
  const [location] = useLocation();
  const { copy, language, toggleLanguage } = useI18n();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const mobileBridge = useRef<MobileBridge | null>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  useEffect(() => {
    const bridge = connectMobileBridge({ onBack: () => false });
    mobileBridge.current = bridge;
    return () => { bridge?.dispose(); mobileBridge.current = null; };
  }, []);
  const [topbarActions, setTopbarActions] = useState<ReactNode | null>(null);
  const [theme, setTheme] = useState<ResolvedColorMode>(currentColorMode);
  const current = useMemo(() => productNavItems.find((item) => location.startsWith(item.to)), [location]);
  const outletContext = useMemo<LayoutOutletContext>(() => ({ setTopbarActions }), []);
  const label = (item: (typeof navItems)[number]) => (language === 'zh' ? item.labelZh : item.labelEn);
  const overflowItems = productNavItems.slice(PHONE_DOCK_SIZE);
  const overflowActive = overflowItems.some((item) => location.startsWith(item.to));

  useEffect(() => {
    const syncTheme = (event: Event) => setTheme((event as CustomEvent<ResolvedColorMode>).detail);
    window.addEventListener(COLOR_MODE_CHANGE_EVENT, syncTheme);
    return () => window.removeEventListener(COLOR_MODE_CHANGE_EVENT, syncTheme);
  }, []);

  useEffect(() => setMoreOpen(false), [location]);

  // The 更多 menu closes on an outside tap, Escape, or when the dock widens enough to show everything.
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

  const toggleTheme = () => {
    setTheme(setColorModePreference(theme === 'dark' ? 'light' : 'dark'));
  };

  // Logging out ends the shared NoNo session, which signs out every product at once.
  const logout = async () => {
    if (logoutPending) return;
    setLogoutPending(true);
    setLogoutError('');
    try {
      await logoutSharedSession({
        bridge: mobileBridge.current,
        navigate: url => window.location.assign(url),
        confirmLocalLogout: () => window.confirm(copy(
          '无法连接服务器，远端会话未确认撤销。是否仅退出此设备并清除本机数据？联网后请在账户设置中撤销远端会话。',
          'The server could not be reached, so remote session revocation is unconfirmed. Sign out of this device and clear local data only? Revoke the remote session in account settings when connected.'
        )),
      });
    } catch {
      setLogoutError(copy('退出失败，当前页面已保留。请检查网络后重试。', 'Could not sign out. This page is still open; check the connection and try again.'));
    } finally {
      setLogoutPending(false);
    }
  };

  const dockItemClass = (active: boolean) => clsx(
    'nomoney-dock-item flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-[11px] font-medium transition-colors',
    active ? 'text-brand-600 dark:text-brand-400 md:bg-brand-500/10' : 'text-slate-500 hover:text-slate-950 dark:text-slate-400 dark:hover:text-white'
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-ink-950">
      <header className="nomoney-topbar sticky top-0 z-30 border-b border-[color:var(--ui-border)] bg-[var(--ui-surface)]">
        <div className="mx-auto flex h-12 max-w-7xl items-center gap-1 px-2 sm:gap-2 sm:px-6">
          <nav aria-label={copy('NoNo 应用', 'NoNo apps')} className="nomoney-modules flex min-w-0 flex-1 items-center overflow-x-auto sm:gap-0.5">
            {nonoModules.map((module) => {
              const active = module.id === product;
              return (
                <a
                  key={module.id}
                  href={module.href}
                  aria-current={active ? 'page' : undefined}
                  className={clsx(
                    'shrink-0 rounded-lg px-[7px] py-1.5 text-xs transition-colors sm:px-2.5 sm:text-[13px]',
                    active
                      ? 'bg-slate-950 font-semibold text-white dark:bg-white dark:text-slate-950'
                      : 'font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white'
                  )}
                >
                  {module.label}
                </a>
              );
            })}
          </nav>
          <div className="flex shrink-0 items-center sm:gap-1">
            <IconButton className="nomoney-topbar-button max-sm:hidden" onClick={toggleLanguage} title={copy('切换语言', 'Switch language')}>
              <Languages size={16} />
              <span className="sr-only">{language === 'zh' ? '中文' : 'English'}</span>
            </IconButton>
            <IconButton className="nomoney-topbar-button" onClick={toggleTheme} title={copy('切换主题', 'Toggle theme')}>
              {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
            </IconButton>
            <IconButton className="nomoney-topbar-button" onClick={logout} disabled={logoutPending} title={copy(`登出 ${user.username}`, `Log out ${user.username}`)}>
              <LogOut size={16} />
            </IconButton>
          </div>
        </div>
      </header>

      <main className="nomoney-page-main mx-auto min-w-0 max-w-7xl px-4 pt-3 sm:px-6 lg:pt-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight text-slate-950 dark:text-white">{current ? label(current) : productMeta.name}</h1>
            <p className="hidden text-xs text-slate-500 dark:text-slate-400 sm:block">{copy(productMeta.subtitleZh, productMeta.subtitleEn)}</p>
          </div>
          {topbarActions && <div className="flex min-w-0 flex-wrap items-center gap-2">{topbarActions}</div>}
        </div>
        {logoutError && <StateBanner tone="danger">{logoutError}</StateBanner>}
        <LayoutActionsContext.Provider value={outletContext}>{children}</LayoutActionsContext.Provider>
      </main>

      <nav className="nomoney-dock" aria-label={copy('主导航', 'Main navigation')}>
        {productNavItems.map((item, index) => {
          const Icon = item.icon;
          const active = location.startsWith(item.to);
          return (
            <Link key={item.to} href={item.to} aria-current={active ? 'page' : undefined} className={clsx(dockItemClass(active), index >= PHONE_DOCK_SIZE && 'max-md:hidden')}>
              <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
              <span className="max-w-full truncate">{label(item)}</span>
            </Link>
          );
        })}
        {overflowItems.length > 0 && (
          <div ref={moreRef} className="relative flex md:hidden">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
              onClick={() => setMoreOpen((open) => !open)}
              className={clsx(dockItemClass(overflowActive || moreOpen), 'w-full')}
            >
              <Ellipsis size={20} />
              <span>{copy('更多', 'More')}</span>
            </button>
            {moreOpen && (
              <div role="menu" className="nomoney-more-menu motion-fade-in absolute bottom-full right-1.5 mb-2 w-44 rounded-2xl border border-[color:var(--ui-border)] bg-[var(--ui-surface)] p-1.5 shadow-lg">
                {overflowItems.map((item) => {
                  const Icon = item.icon;
                  const active = location.startsWith(item.to);
                  return (
                    <Link
                      key={item.to}
                      href={item.to}
                      role="menuitem"
                      aria-current={active ? 'page' : undefined}
                      className={clsx(
                        'flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium',
                        active ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.06]'
                      )}
                    >
                      <Icon size={17} />
                      {label(item)}
                    </Link>
                  );
                })}
                {/* Phones have no room for the language switch in the module bar; it lives here. */}
                <div className="my-1 border-t border-[color:var(--ui-border)] sm:hidden" />
                <button type="button" role="menuitem" onClick={() => { toggleLanguage(); setMoreOpen(false); }} className="flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/[0.06] sm:hidden">
                  <Languages size={17} />
                  {language === 'zh' ? 'English' : '中文'}
                </button>
              </div>
            )}
          </div>
        )}
      </nav>
    </div>
  );
}
