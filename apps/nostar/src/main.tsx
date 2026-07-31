// Load polyfills first
import './polyfills.ts';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './design-tokens.css';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { DialogProvider } from './hooks/useDialog';
import { logger } from './services/logger';

logger.info('app', 'Main.tsx loading');

try {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error('Root element not found');
  }

  logger.info('app', 'Root element found, creating React root');

  const root = createRoot(rootElement);
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <DialogProvider>
          <App />
        </DialogProvider>
      </ErrorBoundary>
    </StrictMode>
  );

  logger.info('app', 'React app rendered');
} catch (error) {
  logger.error('app', 'Failed to render React app', error);
  const strings = (() => {
    const lang = navigator.language?.startsWith('zh') ? 'zh' : 'en';
    return {
      title: lang === 'zh' ? '应用加载失败' : 'Application Failed to Load',
      desc: lang === 'zh'
        ? '您的浏览器可能不支持运行此应用。请尝试使用最新版本的 Chrome、Firefox、Safari 或 Edge。'
        : 'Your browser may not support running this app. Please try using the latest version of Chrome, Firefox, Safari, or Edge.',
      button: lang === 'zh' ? '重新加载' : 'Reload',
    };
  })();
  const fallback = document.getElementById('root') || (() => {
    const el = document.createElement('div');
    el.id = 'root';
    document.body.appendChild(el);
    return el;
  })();
  // Tokens are imported above, so even this last-resort fallback follows the shared contract.
  fallback.innerHTML = `
    <div style="min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; background: var(--ui-canvas); color: var(--ui-text); font-family: system-ui, -apple-system, sans-serif;">
      <div style="max-width: 400px; text-align: center;">
        <div style="font-size: 48px; margin-bottom: 16px;">😵</div>
        <h1 style="font-size: 20px; font-weight: 650; letter-spacing: 0; margin-bottom: 8px; color: var(--ui-text);">${strings.title}</h1>
        <p style="color: var(--ui-text-muted); margin-bottom: 16px;">${strings.desc}</p>
        <button onclick="window.location.reload()" style="padding: 8px 16px; background: var(--ui-accent); color: var(--ui-accent-ink); border: none; border-radius: var(--ui-radius-sm); cursor: pointer;">${strings.button}</button>
      </div>
    </div>
  `;
}
