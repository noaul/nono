import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Router } from 'wouter';
import App from './App';
import { appBasePath } from './base-path';
import { I18nProvider } from './i18n';
import './design-tokens.css';
import './styles.css';

const savedTheme = localStorage.getItem('moneypulse-theme') ?? 'dark';
document.documentElement.classList.toggle('dark', savedTheme !== 'light');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider>
      <Router base={appBasePath || undefined}>
        <App />
      </Router>
    </I18nProvider>
  </React.StrictMode>
);
