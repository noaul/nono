// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { AccountPage } from './AccountPage';
import { I18nProvider } from './i18n';
import { api } from './api';

it('Escape dismisses the country popup before dismissing its account drawer', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  // The account list is an external boundary; the rendered drawer and combobox stay real.
  vi.spyOn(api, 'get').mockResolvedValue({ items: [] });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<I18nProvider><AccountPage /></I18nProvider>));
    const opener = Array.from(host.querySelectorAll('button')).find(button => button.textContent === '新增账号')!;
    opener.focus();
    await act(async () => opener.click());
    const country = document.querySelector<HTMLInputElement>('[role="combobox"]')!;
    await act(async () => country.focus());
    expect(document.querySelector('[role="listbox"]')).not.toBeNull();
    await act(async () => country.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(document.querySelector('[role="listbox"]')).toBeNull();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(document.activeElement).toBe(country);
    await act(async () => country.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  }
});
