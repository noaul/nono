// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Layout } from './Layout';
import { I18nProvider } from './i18n';
import type { User } from './types';

let root: Root;
let host: HTMLDivElement;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<I18nProvider><Layout user={{ username: 'operator' } as User}><input aria-label="Page field" /></Layout></I18nProvider>));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});
const trigger = () => host.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
const openMenu = async () => { await act(async () => trigger().click()); };

it('closes More when keyboard focus leaves and leaves page arrow keys alone', async () => {
  await openMenu();
  expect(host.querySelector('[role="menu"]')?.contains(document.activeElement)).toBe(true);
  const field = host.querySelector<HTMLInputElement>('[aria-label="Page field"]')!;
  await act(async () => field.focus());
  const arrow = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
  await act(async () => field.dispatchEvent(arrow));
  expect(document.activeElement).toBe(field);
  expect(arrow.defaultPrevented).toBe(false);
  expect(host.querySelector('[role="menu"]')).toBeNull();
});

it('returns focus to More after Escape or changing the language', async () => {
  await openMenu();
  await act(async () => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(document.activeElement).toBe(trigger());
  await openMenu();
  const language = host.querySelector<HTMLButtonElement>('button[role="menuitem"]')!;
  await act(async () => language.click());
  expect(host.querySelector('[role="menu"]')).toBeNull();
  expect(document.activeElement).toBe(trigger());
});
