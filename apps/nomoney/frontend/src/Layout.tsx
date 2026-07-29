import { createContext, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ContactRound, Globe2, Languages, LayoutDashboard, LogOut, Menu, Moon, ReceiptText, Repeat2, Server, Settings, Smartphone, Sun, Trash2, X } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import clsx from 'clsx';
import type { User } from './types';
import { api } from './api';
import { IconButton } from './ui';
import { useI18n } from './i18n';

const navItems = [
  { to: '/dashboard', labelZh: '控制台', labelEn: 'Dashboard', icon: LayoutDashboard, hint: 'Overview' },
  { to: '/phones', labelZh: '电话卡', labelEn: 'SIM cards', icon: Smartphone, hint: 'SIM' },
  { to: '/vps', labelZh: 'VPS', labelEn: 'VPS', icon: Server, hint: 'Compute' },
  { to: '/domains', labelZh: '域名', labelEn: 'Domains', icon: Globe2, hint: 'DNS' },
  { to: '/subscriptions', labelZh: '订阅', labelEn: 'Subscriptions', icon: Repeat2, hint: 'SaaS' },
  { to: '/accounts', labelZh: '账号', labelEn: 'Accounts', icon: ContactRound, hint: 'Apps' },
  { to: '/expenses', labelZh: '费用流水', labelEn: 'Expenses', icon: ReceiptText, hint: 'Ledger' },
  { to: '/trash', labelZh: '回收站', labelEn: 'Recycle bin', icon: Trash2, hint: 'Deleted' },
  { to: '/settings', labelZh: '设置', labelEn: 'Settings', icon: Settings, hint: 'System' }
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

export function Layout({ user, onLogout, children }: { user: User; onLogout: () => void; children: ReactNode }) {
  const [location] = useLocation();
  const { copy, language, toggleLanguage } = useI18n();
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileDrawerRef = useRef<HTMLElement | null>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [topbarActions, setTopbarActions] = useState<ReactNode | null>(null);
  const [theme, setTheme] = useState(() => (document.documentElement.classList.contains('dark') ? 'dark' : 'light'));
  const current = useMemo(() => navItems.find((item) => location.startsWith(item.to)), [location]);
  const outletContext = useMemo<LayoutOutletContext>(() => ({ setTopbarActions }), []);

  useEffect(() => {
    const closeMobileNavigationAtDesktop = () => {
      if (window.innerWidth >= 768) setMobileOpen(false);
    };

    window.addEventListener('resize', closeMobileNavigationAtDesktop);
    return () => window.removeEventListener('resize', closeMobileNavigationAtDesktop);
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    const drawer = mobileDrawerRef.current;
    const focusableSelector = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';
    document.body.style.overflow = 'hidden';
    drawer?.querySelector<HTMLElement>(focusableSelector)?.focus();

    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !drawer) return;
      const focusable = Array.from(drawer.querySelectorAll<HTMLElement>(focusableSelector));
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
      mobileTriggerRef.current?.focus();
    };
  }, [mobileOpen]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    localStorage.setItem('moneypulse-theme', next);
    setTheme(next);
  };

  const logout = async () => {
    await api.post('/api/auth/logout');
    onLogout();
  };

  const navContent = (
    <nav className="space-y-1 px-3 py-3">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            href={item.to}
            onClick={() => setMobileOpen(false)}
            className={clsx(
                'group flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium transition',
                location.startsWith(item.to)
                  ? 'bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-white/[0.06] dark:hover:text-white'
              )}
          >
            <Icon size={17} />
            <span className="flex-1">{language === 'zh' ? item.labelZh : item.labelEn}</span>
            <span className="hidden text-[11px] font-normal text-slate-400 lg:inline">{item.hint}</span>
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50 dark:bg-ink-950">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-200 bg-white dark:border-white/10 dark:bg-ink-900 md:block">
        <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5 dark:border-white/10">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-slate-200 bg-slate-950 text-xs font-semibold text-white dark:border-white/10 dark:bg-white dark:text-slate-950">
            NM
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight text-slate-950 dark:text-white">NoMoney</div>
            <div className="font-mono text-[11px] text-slate-400">{copy('单用户资产账本', 'single-user ledger')}</div>
          </div>
        </div>
        {navContent}
        <div className="absolute bottom-0 left-0 right-0 border-t border-slate-200 p-3 dark:border-white/10">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="text-xs text-slate-500 dark:text-slate-400">{copy('当前登录', 'Signed in as')}</div>
            <div className="mt-1 truncate text-sm font-medium text-slate-900 dark:text-white">{user.username}</div>
            <div className="truncate text-xs text-slate-400">{user.email}</div>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <div className="nomoney-mobile-overlay fixed inset-0 z-50 md:hidden">
          <button aria-label={copy('关闭', 'Close')} className="absolute inset-0 bg-slate-950/65 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside ref={mobileDrawerRef} className="nomoney-mobile-drawer absolute inset-y-0 left-0 w-72 border-r border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-ink-900" role="dialog" aria-modal="true" aria-label={copy('主导航', 'Main navigation')} tabIndex={-1}>
            <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5 dark:border-white/10">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-950 text-xs font-semibold text-white dark:bg-white dark:text-slate-950">
                  NM
                </div>
                <span className="text-sm font-semibold">NoMoney</span>
              </div>
              <IconButton onClick={() => setMobileOpen(false)} title={copy('关闭', 'Close')}>
                <X size={16} />
              </IconButton>
            </div>
            {navContent}
          </aside>
        </div>
      )}

      <div className="min-w-0 md:pl-64">
        <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white/85 px-4 py-2 backdrop-blur-xl dark:border-white/10 dark:bg-ink-950/85 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button ref={mobileTriggerRef} className="rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.06] md:hidden" onClick={() => setMobileOpen(true)} aria-label={copy('菜单', 'Menu')}>
              <Menu size={20} />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight text-slate-950 dark:text-white">{current ? (language === 'zh' ? current.labelZh : current.labelEn) : 'NoMoney'}</h1>
              <p className="hidden text-xs text-slate-500 dark:text-slate-400 sm:block">{copy('个人资产费用工作台', 'Personal finance operations workspace')}</p>
            </div>
          </div>
          <div className="flex min-w-0 items-center justify-end gap-2">
            {topbarActions && <div className="hidden min-w-0 flex-wrap items-center justify-end gap-2 sm:flex">{topbarActions}</div>}
            <IconButton onClick={toggleLanguage} title={copy('切换语言', 'Switch language')}>
              <Languages size={16} />
              <span className="sr-only">{language === 'zh' ? '中文' : 'English'}</span>
            </IconButton>
            <IconButton onClick={toggleTheme} title={copy('切换主题', 'Toggle theme')}>
              {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
            </IconButton>
            <IconButton onClick={logout} title={copy('登出', 'Log out')}>
              <LogOut size={16} />
            </IconButton>
          </div>
        </header>
        <main className="nomoney-page-main mx-auto min-w-0 max-w-7xl px-4 pb-6 pt-3 sm:px-6 lg:pb-7 lg:pt-4">
          <LayoutActionsContext.Provider value={outletContext}>{children}</LayoutActionsContext.Provider>
        </main>
      </div>
    </div>
  );
}
