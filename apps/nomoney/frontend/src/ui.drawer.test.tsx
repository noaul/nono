// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { I18nProvider } from './i18n';
import { Drawer } from './ui';

it('keeps the drawer viewport overlay outside page spacing and stacking containers', async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(
      <I18nProvider>
        <div className="space-y-5" style={{ transform: 'translateY(20px)' }}>
          <h1>Accounts</h1>
          <Drawer title="New account" open onClose={() => {}} footer={null}>
            <input aria-label="Account name" />
          </Drawer>
        </div>
      </I18nProvider>,
    ));
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    expect(host.contains(dialog)).toBe(false);
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(document.activeElement).toBe(dialog);
    expect(document.body.style.overflow).toBe('hidden');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(document.body.style.overflow).toBe('');
});
