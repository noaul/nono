import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';
import MarkdownRenderer from './MarkdownRenderer';
import { ErrorBoundary } from './ErrorBoundary';
import { useAppStore } from '../store/useAppStore';

/**
 * NoStar used to be header-centric with its own purple/Linear visual language. These tests hold
 * the shared shell in place: the NoNo module bar on top, the page dock at the bottom (floating on
 * wide screens, a tab bar on phones), and geometry that comes from the shared UI contract.
 */

vi.mock('../hooks/useDialog', () => ({
  useDialog: () => ({ confirm: vi.fn().mockResolvedValue(true) }),
}));

// The store is mocked rather than seeded, matching the convention the other component tests use.
vi.mock('../store/useAppStore', () => ({ useAppStore: vi.fn() }));

const mockUseAppStore = vi.mocked(useAppStore);
const setTheme = vi.fn();
const setCurrentView = vi.fn();
const logout = vi.fn();

const read = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

const MENUS = [
  { id: 'repositories', visible: true, order: 0 },
  { id: 'gists', visible: true, order: 1 },
  { id: 'releases', visible: true, order: 2 },
  { id: 'forks', visible: true, order: 3 },
  { id: 'subscription', visible: true, order: 4 },
  { id: 'settings', visible: true, order: 5 },
];

function seedStore(overrides: Record<string, unknown> = {}) {
  const state = {
    user: { login: 'octocat', name: 'Octocat', avatar_url: 'https://example.com/a.png' },
    theme: 'light',
    currentView: 'repositories',
    headerMenuConfig: MENUS,
    language: 'zh',
    setTheme,
    setCurrentView,
    logout,
    ...overrides,
  };
  mockUseAppStore.mockImplementation(() => state as ReturnType<typeof useAppStore>);
  return state;
}

describe('NoStar application shell', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedStore();
  });
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('renders the module bar, page title, stage and dock', () => {
    render(<AppShell><div>content</div></AppShell>);

    expect(screen.getByTestId('nostar-shell')).toBeTruthy();
    expect(document.querySelector('.nostar-topbar')).toBeTruthy();
    expect(document.querySelector('.nostar-stage')).toBeTruthy();
    expect(screen.getByTestId('nostar-dock')).toBeTruthy();
    expect(document.querySelector('aside')).toBeNull();
  });

  it('drives the dock from the configurable visible menus, in order', () => {
    seedStore({
      headerMenuConfig: [
        { id: 'settings', visible: true, order: 0 },
        { id: 'gists', visible: false, order: 1 },
        { id: 'repositories', visible: true, order: 2 },
      ],
    });
    render(<AppShell><div /></AppShell>);

    const items = Array.from(screen.getByTestId('nostar-dock').querySelectorAll('[data-testid^="nav-"]')).map((n) => n.getAttribute('data-testid'));
    // Hidden menus stay hidden; the configured order is respected; two pages need no 更多.
    expect(items).toEqual(['nav-settings', 'nav-repositories']);
    expect(screen.queryByTestId('nostar-more')).toBeNull();
  });

  it('marks the current view and switches on selection', () => {
    render(<AppShell><div /></AppShell>);

    expect(screen.getByTestId('nav-repositories').getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByTestId('nav-releases'));
    expect(setCurrentView).toHaveBeenCalledWith('releases');
  });

  it('renders one h1, above the stage, tracking the active view', () => {
    render(<AppShell><div /></AppShell>);

    const headings = document.querySelectorAll('h1');
    expect(headings).toHaveLength(1);
    expect(headings[0].className).toContain('nostar-page-title');
    expect(headings[0].textContent).toBe('仓库');
  });

  it('keeps four preferred pages on phones and moves the rest behind 更多', () => {
    render(<AppShell><div /></AppShell>);

    const overflow = Array.from(document.querySelectorAll('.nostar-tab.is-overflow')).map((n) => n.getAttribute('data-testid'));
    expect(overflow).toEqual(['nav-forks', 'nav-settings']);
    expect(screen.getByTestId('nav-releases').style.getPropertyValue('--nostar-phone-order')).toBe('1');
  });

  it('opens 更多 as a menu right above the button and closes it on Escape, outside taps and selection', async () => {
    render(<AppShell><div /></AppShell>);
    const more = screen.getByTestId('nostar-more');

    fireEvent.click(more);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    const menu = screen.getByTestId('nostar-more-menu');
    expect(menu.getAttribute('role')).toBe('menu');
    expect(menu.parentElement?.contains(more)).toBe(true);
    expect(Array.from(menu.querySelectorAll('[role="menuitem"]')).map((n) => n.textContent)).toEqual(['复刻', '设置']);

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('nostar-more-menu')).toBeNull());

    fireEvent.click(more);
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(screen.queryByTestId('nostar-more-menu')).toBeNull());

    fireEvent.click(more);
    fireEvent.click(screen.getByRole('menuitem', { name: '设置' }));
    expect(setCurrentView).toHaveBeenCalledWith('settings');
    await waitFor(() => expect(screen.queryByTestId('nostar-more-menu')).toBeNull());
  });

  it('still renders only one h1 when real markdown is composed into it', async () => {
    // A `# heading` used to render as a second h1, competing with the topbar's.
    render(
      <AppShell>
        <MarkdownRenderer content={'# Top level\n\n## Second level\n\nBody text.'} />
      </AppShell>,
    );

    await waitFor(() => expect(screen.getByText('Top level')).toBeTruthy());
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(document.querySelector('h1')!.className).toContain('nostar-page-title');
    // Levels are shifted down by one, not flattened: the hierarchy is preserved beneath the
    // shell's h1.
    expect(screen.getByText('Top level').tagName).toBe('H2');
    expect(screen.getByText('Second level').tagName).toBe('H3');
  });

  it('still renders only one h1 when a nested error boundary trips', () => {
    const Boom = () => { throw new Error('boom'); };
    // React and jsdom both log the caught error; this failure is deliberate, so the noise is
    // suppressed and the spy restored afterwards.
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      render(
        <AppShell>
          <ErrorBoundary headingLevel="h2"><Boom /></ErrorBoundary>
        </AppShell>,
      );

      expect(document.querySelectorAll('h1')).toHaveLength(1);
      expect(document.querySelector('h1')!.className).toContain('nostar-page-title');
      // The boundary's own title renders below the page heading level.
      expect(document.querySelectorAll('h2').length).toBeGreaterThan(0);
    } finally {
      consoleError.mockRestore();
    }
  });

  it('leaves the root error boundary owning the page h1', () => {
    const Boom = () => { throw new Error('boom'); };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      // Standalone, as main.tsx mounts it: the failure page is the whole page, so it keeps h1.
      render(<ErrorBoundary><Boom /></ErrorBoundary>);

      const headings = document.querySelectorAll('h1');
      expect(headings).toHaveLength(1);
      expect(headings[0].textContent).toBeTruthy();
    } finally {
      consoleError.mockRestore();
    }
  });

  it('lists every NoNo module at the top and highlights NoStar', () => {
    render(<AppShell><div /></AppShell>);
    const apps = screen.getByTestId('nostar-apps');
    const links = Array.from(apps.querySelectorAll('a')).map((a) => [a.getAttribute('href'), a.textContent]);

    expect(apps.getAttribute('aria-label')).toBe('NoNo 应用');
    expect(links).toEqual([['/', 'NoNo'], ['/nodesk', 'NoDesk'], ['/nomoney/', 'NoMoney'], ['/yumi/', 'Yumi'], ['/nostar/', 'NoStar']]);
    expect(apps.querySelector('[aria-current="page"]')?.textContent).toBe('NoStar');
    expect(apps.closest('header')).toBeTruthy();
  });

  it('keeps the theme toggle and logout in the topbar', () => {
    render(<AppShell><div /></AppShell>);
    const actions = document.querySelector('.nostar-topbar-actions');

    expect(actions?.querySelectorAll('.nostar-icon-button')).toHaveLength(2);
    fireEvent.click(screen.getByLabelText('切换主题'));
    expect(setTheme).toHaveBeenCalledWith('dark');
  });
});

describe('NoStar visual contract', () => {
  it('takes the shell dimensions from the shared tokens', () => {
    const css = read('src/index.css');

    expect(css).toMatch(/\.nostar-topbar \{[\s\S]*?position:\s*sticky/);
    expect(css).toMatch(/\.nostar-main \{[\s\S]*?max-width:\s*var\(--ui-content-max\)/);
    expect(css).toMatch(/\.nostar-icon-button \{[\s\S]*?height:\s*var\(--ui-icon-btn\)/);
    expect(css).not.toContain('--ui-sidebar-w');
  });

  it('floats the dock on wide screens and pins it full width below the md breakpoint', () => {
    const css = read('src/index.css');

    expect(css).toMatch(/\.nostar-dock \{[\s\S]*?position:\s*fixed[\s\S]*?transform:\s*translateX\(-50%\)/);
    expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*?\.nostar-dock \{[\s\S]*?left:\s*0[\s\S]*?right:\s*0/);
    expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*?\.nostar-tab\.is-overflow \{[\s\S]*?display:\s*none/);
    expect(css).toMatch(/\.nostar-shell \{[\s\S]*?overflow-x:\s*hidden/);
    expect(read('src/components/AppShell.tsx')).toContain('window.innerWidth >= 768');
  });

  it('resolves the Tailwind palette through the contract, with no purple left', () => {
    const config = read('tailwind.config.js');

    // Unmodified utilities must resolve to the token itself, so dark-mode tokens keep their
    // built-in alpha; Tailwind v4 applies explicit opacity modifiers with color-mix.
    expect(config).toContain('`var(--ui-${name})`');
    expect(config).toContain('color-mix(in oklab, var(--ui-accent) 20%, transparent)');
    expect(config).toContain("indigo: ui('accent')");
    // The Linear palette's literals must not come back.
    for (const banned of ['#5e6ad2', '#7170ff', '#828fff', '#08090a', '#0f1011']) {
      expect(config.toLowerCase()).not.toContain(banned);
    }
  });

  it('no longer ships the header-centric frame or decorative treatments', () => {
    expect(fs.existsSync(path.resolve(process.cwd(), 'src/components/Header.tsx'))).toBe(false);
    expect(read('src/App.tsx')).toContain('AppShell');
    expect(read('src/App.tsx')).not.toContain('components/Header');

    const sources = ['src/index.css', 'src/components/AppShell.tsx'];
    for (const file of sources) {
      const text = read(file);
      expect(text, file).not.toContain('linear-gradient');
      expect(text, file).not.toContain('backdrop-blur');
    }
  });

  it('keeps the NoStar mark but at a size that fits where it is shown', () => {
    const shell = read('src/components/AppShell.tsx');
    expect(shell).toContain('NoStar');
    // The same artwork was a 1.1MB 1024px raster while only ever shown at 30px.
    expect(fs.statSync(path.resolve(process.cwd(), 'public/icon.png')).size).toBeLessThan(32 * 1024);
    expect(fs.existsSync(path.resolve(process.cwd(), 'public/icon.svg'))).toBe(false);
  });

  it('boots in Chinese, titled NoStar, with its favicon and the shared colour mode', () => {
    const html = read('index.html');
    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain('<title>NoStar</title>');
    expect(html).toContain('<link rel="icon" type="image/png" href="/icon.png" />');
    expect(html).not.toContain('icon.svg');
    // External, not inline: the NoNo CSP only allows same-origin scripts.
    expect(html).toContain('<script src="/color-mode-bootstrap.js"></script>');
    expect(read('public/color-mode-bootstrap.js')).toContain("'nono:color-mode'");
  });
});
