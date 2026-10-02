import { lazy, Suspense, useEffect, useState } from 'react';
import { Redirect, Route, Switch } from 'wouter';
import type { User } from './types';
import { api, ApiError } from './api';
import { assetPageConfigs } from './assetConfig';
import { product, productMeta } from './product';
import { loadPreferences } from './preferences';

const Layout = lazy(() => import('./Layout').then((module) => ({ default: module.Layout })));
const Dashboard = lazy(() => import('./Dashboard').then((module) => ({ default: module.Dashboard })));
const AssetPage = lazy(() => import('./AssetPage').then((module) => ({ default: module.AssetPage })));
const AccountPage = lazy(() => import('./AccountPage').then((module) => ({ default: module.AccountPage })));
const TrashPage = lazy(() => import('./TrashPage'));
const Expenses = lazy(() => import('./Expenses').then((module) => ({ default: module.Expenses })));
const SettingsPage = lazy(() => import('./SettingsPage').then((module) => ({ default: module.SettingsPage })));
const YumiOverview = lazy(() => import('./YumiOverview').then((module) => ({ default: module.YumiOverview })));

type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'forbidden'; user: null }
  | { status: 'unavailable'; user: null }
  | { status: 'authenticated'; user: User };

/** Signing in happens once, in NoNo; this product only reads the shared NoNo session. */
export function nonoLoginUrl(location: Pick<Location, 'pathname' | 'search'> = window.location): string {
  return `/login?next=${encodeURIComponent(`${location.pathname}${location.search}`)}`;
}

export default function App() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading', user: null });

  useEffect(() => {
    api.get<{ user: User }>('/api/auth/me').then((me) => {
      setAuth({ status: 'authenticated', user: me.user });
      loadPreferences().catch(() => undefined);
    }).catch((error) => {
      if (error instanceof ApiError && error.status === 401) { window.location.replace(nonoLoginUrl()); return; }
      if (error instanceof ApiError && error.status === 403) { setAuth({ status: 'forbidden', user: null }); return; }
      setAuth({ status: 'unavailable', user: null });
    });
  }, []);

  if (auth.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-950 dark:bg-ink-950 dark:text-white">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm text-slate-500 shadow-xs dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400">
          {productMeta.name} loading
        </div>
      </div>
    );
  }

  if (auth.status !== 'authenticated') {
    const forbidden = auth.status === 'forbidden';
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-950 dark:bg-ink-950 dark:text-white">
        <div className="max-w-sm rounded-xl border border-slate-200 bg-white p-6 text-sm shadow-xs dark:border-white/10 dark:bg-white/[0.04]">
          <h1 className="text-base font-semibold">{forbidden ? `${productMeta.name} 仅限管理员使用` : `${productMeta.name} 暂时无法验证登录`}</h1>
          <p className="mt-2 text-slate-500 dark:text-slate-400">
            {forbidden ? '当前 NoNo 账户不是管理员。请切换到管理员账户后再打开。' : 'NoNo 登录服务没有响应，请稍后重试。'}
          </p>
          <div className="mt-4 flex gap-3">
            <a className="font-medium text-brand-600 hover:underline" href="/">返回 NoNo</a>
            {forbidden
              ? <a className="font-medium text-brand-600 hover:underline" href={nonoLoginUrl()}>切换账户</a>
              : <button type="button" className="font-medium text-brand-600 hover:underline" onClick={() => window.location.reload()}>重试</button>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Suspense fallback={<RouteLoading />}>
      <Layout user={auth.user}>
        <Switch>
          <Route path="/"><Redirect to="/dashboard" replace /></Route>
          <Route path="/dashboard">{product === 'yumi' ? <YumiOverview /> : <Dashboard />}</Route>
          {assetPageConfigs.filter((config) => product === 'yumi' ? ['vps', 'domains'].includes(config.endpoint) : ['phones', 'subscriptions'].includes(config.endpoint)).map((config) => (
            <Route key={config.endpoint} path={`/${config.endpoint}`}><AssetPage config={config} /></Route>
          ))}
          {product === 'nomoney' && <Route path="/accounts"><AccountPage /></Route>}
          <Route path="/trash"><TrashPage /></Route>
          <Route path="/expenses"><Expenses /></Route>
          <Route path="/settings"><SettingsPage /></Route>
          <Route><Redirect to="/dashboard" replace /></Route>
        </Switch>
      </Layout>
    </Suspense>
  );
}

function RouteLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-950 dark:bg-ink-950 dark:text-white">
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm text-slate-500 shadow-xs dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400">
        Loading workspace
      </div>
    </div>
  );
}
