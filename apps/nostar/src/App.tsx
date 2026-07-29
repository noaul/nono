import React, { useEffect, useMemo, useCallback, useState } from 'react';
import { Header } from './components/Header';
import { DebugModeIndicator } from './components/DebugModeIndicator';
import { BackToTop } from './components/BackToTop';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useAppStore } from './store/useAppStore';
import { copy } from './i18n';
import { useAutoUpdateCheck } from './hooks/useAutoUpdateCheck';
import { logger } from './services/logger';
import { UpdateNotificationBanner } from './components/UpdateNotificationBanner';
import { backend } from './services/backendAdapter';
import { syncFromBackend, startAutoSync, stopAutoSync } from './services/autoSync';
import { getStorageScope, setStorageScope } from './services/storageScope';

const LoginScreen = React.lazy(() => import('./components/LoginScreen').then((module) => ({ default: module.LoginScreen })));
const RepositoriesView = React.lazy(() => import('./views/RepositoriesView'));
const GistView = React.lazy(() => import('./components/GistView').then((module) => ({ default: module.GistView })));
const ReleaseTimeline = React.lazy(() => import('./components/ReleaseTimeline').then((module) => ({ default: module.ReleaseTimeline })));
const ForkTimeline = React.lazy(() => import('./components/ForkTimeline').then((module) => ({ default: module.ForkTimeline })));
const DiscoveryView = React.lazy(() => import('./components/DiscoveryView').then((module) => ({ default: module.DiscoveryView })));
const SettingsPanel = React.lazy(() => import('./components/SettingsPanel').then((module) => ({ default: module.SettingsPanel })));

function ViewFallback() {
  return (
    <div className="flex min-h-[520px] items-center justify-center" aria-label="Loading view">
      <div className="h-7 w-7 animate-spin rounded-full border-2 border-gray-300 border-t-brand-indigo dark:border-gray-700 dark:border-t-brand-indigo" />
    </div>
  );
}

function App() {
  const [nonoSession, setNonoSession] = useState<'loading' | 'authenticated' | 'redirecting' | 'error'>('loading');
  const {
    isAuthenticated,
    currentView,
    selectedCategory,
    theme,
    hasHydrated,
    searchResults,
    searchFilters,
    repositories,
    setSelectedCategory,
  } = useAppStore();

  useAutoUpdateCheck();

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      try {
        const response = await fetch('/api/auth/session', { credentials: 'same-origin' });
        if (!response.ok) throw new Error(`Session request failed: ${response.status}`);
        const payload = await response.json() as { data?: { authenticated?: boolean; user?: { id?: number } } };
        if (cancelled) return;
        if (payload.data?.authenticated) {
          const userId = payload.data.user?.id;
          if (userId && getStorageScope() !== String(userId)) {
            if (setStorageScope(userId)) {
              window.location.reload();
              return;
            }
            useAppStore.getState().logout();
          }
          setNonoSession('authenticated');
          return;
        }
        setNonoSession('redirecting');
        window.location.replace(`/login?next=${encodeURIComponent('/nostar/')}`);
      } catch (error) {
        logger.error('app', 'Failed to load Nono session', error);
        if (!cancelled) setNonoSession('error');
      }
    };

    loadSession();
    return () => {
      cancelled = true;
    };
  }, []);

  // Restore persisted frontend debug level at startup so capture is active
  // app-wide, not only after DiagnosticLogsPanel mounts.
  useEffect(() => {
    if (sessionStorage.getItem('gsm:frontend-debug') === 'true') {
      logger.setLevel('debug');
    }
  }, []);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    const initBackend = async () => {
      try {
        await backend.init();
        if (backend.isAvailable && !cancelled) {
          await syncFromBackend();
          if (!cancelled) {
            unsubscribe = startAutoSync();
          }
        }
      } catch (err) {
        logger.errorFromError('app', 'Failed to initialize backend', err);
      }
    };

    initBackend();

    return () => {
      cancelled = true;
      if (unsubscribe) {
        stopAutoSync(unsubscribe);
      }
    };
  }, []);

  const handleCategorySelect = useCallback((category: string) => {
    // 相似仓库视图下点击分类 = 离开相似视图并切换到该分类，避免交互歧义
    if (useAppStore.getState().similarView?.active) {
      useAppStore.getState().exitSimilarView();
    }
    setSelectedCategory(category);
  }, [setSelectedCategory]);

  const currentViewContent = useMemo(() => {
    switch (currentView) {
      case 'repositories':
        return (
          <RepositoriesView
            repositories={repositories}
            searchResults={searchResults}
            searchFilters={searchFilters}
            selectedCategory={selectedCategory}
            onCategorySelect={handleCategorySelect}
          />
        );
      case 'gists':
        return <GistView />;
      case 'releases':
        return <ReleaseTimeline />;
      case 'forks':
        return <ForkTimeline />;
      case 'subscription':
        return (
          <ErrorBoundary>
            <DiscoveryView />
          </ErrorBoundary>
        );
      case 'settings':
        return <SettingsPanel />;
      default:
        return null;
    }
  }, [currentView, repositories, searchResults, searchFilters, selectedCategory, handleCategorySelect]);

  if (nonoSession === 'error') {
    return (
      <div className="min-h-screen bg-light-bg dark:bg-marketing-black flex items-center justify-center p-6">
        <button
          type="button"
          className="rounded-lg bg-brand-indigo px-4 py-2 font-medium text-white"
          onClick={() => window.location.reload()}
        >
          {copy('重新连接', 'Reconnect')}
        </button>
      </div>
    );
  }

  // Wait for both the Nono session and the local NoStar store before rendering private data.
  if (nonoSession !== 'authenticated' || !hasHydrated) {
    return (
      <div className="min-h-screen bg-light-bg dark:bg-marketing-black flex items-center justify-center">
        <div className="text-gray-900 dark:text-text-primary text-lg font-medium animate-pulse">
          Loading...
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <React.Suspense fallback={<ViewFallback />}>
        <LoginScreen />
      </React.Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-light-bg dark:bg-marketing-black text-gray-900 dark:text-text-primary transition-colors duration-200">
      <UpdateNotificationBanner />
      <Header />
      <main className="max-w-[1280px] mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        <React.Suspense fallback={<ViewFallback />}>
          {currentViewContent}
        </React.Suspense>
      </main>
      <BackToTop />
      <DebugModeIndicator />
    </div>
  );
}

export default App;
