import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import type { User } from './types';
import { api, ApiError } from './api';
import { assetPageConfigs } from './assetConfig';

const LoginPage = lazy(() => import('./AuthPages').then((module) => ({ default: module.LoginPage })));
const SetupPage = lazy(() => import('./AuthPages').then((module) => ({ default: module.SetupPage })));
const Layout = lazy(() => import('./Layout').then((module) => ({ default: module.Layout })));
const Dashboard = lazy(() => import('./Dashboard').then((module) => ({ default: module.Dashboard })));
const AssetPage = lazy(() => import('./AssetPage').then((module) => ({ default: module.AssetPage })));
const AccountPage = lazy(() => import('./AccountPage').then((module) => ({ default: module.AccountPage })));
const Expenses = lazy(() => import('./Expenses').then((module) => ({ default: module.Expenses })));
const SettingsPage = lazy(() => import('./SettingsPage').then((module) => ({ default: module.SettingsPage })));

type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'needsSetup'; user: null }
  | { status: 'anonymous'; user: null }
  | { status: 'authenticated'; user: User };

export default function App() {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading', user: null });
  const navigate = useNavigate();

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
          NoMoney loading
        </div>
      </div>
    );
  }

  if (auth.status === 'needsSetup') {
    return (
      <Suspense fallback={<RouteLoading />}>
        <Routes><Route path="/setup" element={<SetupPage onAuthenticated={onAuthenticated} />} /><Route path="*" element={<Navigate to="/setup" replace />} /></Routes>
      </Suspense>
    );
  }

  if (auth.status === 'anonymous') {
    return (
      <Suspense fallback={<RouteLoading />}>
        <Routes><Route path="/login" element={<LoginPage onAuthenticated={onAuthenticated} />} /><Route path="*" element={<Navigate to="/login" replace />} /></Routes>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<RouteLoading />}>
      <Routes>
        <Route element={<Layout user={auth.user} onLogout={() => { setAuth({ status: 'anonymous', user: null }); navigate('/login'); }} />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          {assetPageConfigs.map((config) => (
            <Route key={config.endpoint} path={`/${config.endpoint}`} element={<AssetPage config={config} />} />
          ))}
          <Route path="/accounts" element={<AccountPage />} />
          <Route path="/expenses" element={<Expenses />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
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
