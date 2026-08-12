import { lazy, Suspense, useEffect, useState } from 'react';
import { Redirect, Route, Switch, useLocation } from 'wouter';
import type { User } from './types';
import { api, ApiError } from './api';
import { assetPageConfigs } from './assetConfig';
import { product, productMeta } from './product';

const LoginPage = lazy(() => import('./AuthPages').then((module) => ({ default: module.LoginPage })));
const SetupPage = lazy(() => import('./AuthPages').then((module) => ({ default: module.SetupPage })));
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
  | { status: 'needsSetup'; user: null }
  | { status: 'anonymous'; user: null }
  | { status: 'authenticated'; user: User };

export default function App() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading', user: null });
  const [, navigate] = useLocation();

  useEffect(() => {
    async function loadAuth() {
      const setup = await api.get<{ needsSetup: boolean }>('/api/auth/setup-status');
      if (setup.needsSetup) { setAuth({ status: 'needsSetup', user: null }); return; }
      try {
        const me = await api.get<{ user: User }>('/api/auth/me');
        setAuth({ status: 'authenticated', user: me.user });
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) { setAuth({ status: 'anonymous', user: null }); return; }
        throw error;
      }
    }
    loadAuth().catch(() => setAuth({ status: 'anonymous', user: null }));
  }, []);

  const onAuthenticated = (user: User) => { setAuth({ status: 'authenticated', user }); navigate('/dashboard'); };

  if (auth.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-950 dark:bg-ink-950 dark:text-white">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400">
          {productMeta.name} loading
        </div>
      </div>
    );
  }

  if (auth.status === 'needsSetup') {
    return (
      <Suspense fallback={<RouteLoading />}>
        <Switch><Route path="/setup"><SetupPage onAuthenticated={onAuthenticated} /></Route><Route><Redirect to="/setup" replace /></Route></Switch>
      </Suspense>
    );
  }

  if (auth.status === 'anonymous') {
    return (
      <Suspense fallback={<RouteLoading />}>
        <Switch><Route path="/login"><LoginPage onAuthenticated={onAuthenticated} /></Route><Route><Redirect to="/login" replace /></Route></Switch>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<RouteLoading />}>
      <Layout user={auth.user} onLogout={() => { setAuth({ status: 'anonymous', user: null }); navigate('/login'); }}>
        <Switch>
          <Route path="/"><Redirect to="/dashboard" replace /></Route>
          <Route path="/dashboard">{product === 'yumi' ? <YumiOverview /> : <Dashboard />}</Route>
          {assetPageConfigs.filter((config) => product === 'yumi' ? ['vps', 'domains'].includes(config.endpoint) : ['phones', 'subscriptions'].includes(config.endpoint)).map((config) => (
            <Route key={config.endpoint} path={`/${config.endpoint}`}><AssetPage config={config} /></Route>
          ))}
          {product === 'nomoney' && <Route path="/accounts"><AccountPage /></Route>}
          <Route path="/trash"><TrashPage /></Route>
          {product === 'yumi' && <Route path="/expenses"><Expenses /></Route>}
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
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm text-slate-500 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400">
        Loading workspace
      </div>
    </div>
  );
}
