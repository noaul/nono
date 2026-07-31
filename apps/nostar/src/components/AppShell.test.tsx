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
 * the shared shell in place: a fixed sidebar and sticky topbar on desktop, the same accessible
 * drawer on mobile, and geometry that comes from the shared UI contract.
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

  it('renders the sidebar, topbar and stage instead of a page header', () => {
    render(<AppShell><div>content</div></AppShell>);

    expect(screen.getByTestId('nostar-shell')).toBeTruthy();
    expect(screen.getByTestId('nostar-sidebar')).toBeTruthy();
    expect(document.querySelector('.nostar-topbar')).toBeTruthy();
    expect(document.querySelector('.nostar-stage')).toBeTruthy();
  });

  it('drives the sidebar from the configurable visible menus, in order', () => {
    seedStore({
      headerMenuConfig: [
        { id: 'settings', visible: true, order: 0 },
        { id: 'gists', visible: false, order: 1 },
        { id: 'repositories', visible: true, order: 2 },
      ],
    });
    render(<AppShell><div /></AppShell>);

    const items = Array.from(document.querySelectorAll('.nostar-nav-item')).map((n) => n.getAttribute('data-testid'));
    // Hidden menus stay hidden; the configured order is respected.
    expect(items).toEqual(['nav-settings', 'nav-repositories']);
  });

  it('marks the current view and switches on selection', () => {
    render(<AppShell><div /></AppShell>);

    expect(screen.getByTestId('nav-repositories').getAttribute('aria-current')).toBe('page');
    fireEvent.click(screen.getByTestId('nav-releases'));
    expect(setCurrentView).toHaveBeenCalledWith('releases');
  });

  it('renders one h1, in the topbar, tracking the active view', () => {
    render(<AppShell><div /></AppShell>);

    const headings = document.querySelectorAll('h1');
    expect(headings).toHaveLength(1);
    expect(headings[0].className).toContain('nostar-page-title');
    expect(headings[0].textContent).toBe('仓库');
  });

  it('opens the drawer with dialog semantics and locks body scroll', async () => {
    render(<AppShell><div /></AppShell>);
    const sidebar = screen.getByTestId('nostar-sidebar');

    expect(sidebar.getAttribute('role')).toBeNull();
    fireEvent.click(screen.getByTestId('nostar-menu-toggle'));

    expect(sidebar.getAttribute('role')).toBe('dialog');
    expect(sidebar.getAttribute('aria-modal')).toBe('true');
    expect(sidebar.className).toContain('is-mobile-open');
    expect(screen.getByTestId('nostar-backdrop')).toBeTruthy();
    await waitFor(() => expect(document.body.style.overflow).toBe('hidden'));
  });

  it('closes the drawer on Escape, backdrop, and menu selection', async () => {
    render(<AppShell><div /></AppShell>);
    const sidebar = screen.getByTestId('nostar-sidebar');
    const open = () => fireEvent.click(screen.getByTestId('nostar-menu-toggle'));

    open();
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(sidebar.className).not.toContain('is-mobile-open'));

    open();
    fireEvent.click(screen.getByTestId('nostar-backdrop'));
    await waitFor(() => expect(sidebar.className).not.toContain('is-mobile-open'));

    open();
    fireEvent.click(screen.getByTestId('nav-gists'));
    await waitFor(() => expect(sidebar.className).not.toContain('is-mobile-open'));
    // Body scroll is released once the drawer is closed.
    await waitFor(() => expect(document.body.style.overflow).not.toBe('hidden'));
  });

  it('makes the rest of the app inert and hidden while the drawer is open', async () => {
    render(<AppShell><div /></AppShell>);
    const main = screen.getByTestId('nostar-main');

    expect(main.hasAttribute('inert')).toBe(false);
    expect(main.getAttribute('aria-hidden')).toBeNull();

    fireEvent.click(screen.getByTestId('nostar-menu-toggle'));
    expect(main.hasAttribute('inert')).toBe(true);
    expect(main.getAttribute('aria-hidden')).toBe('true');

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(main.hasAttribute('inert')).toBe(false));
    expect(main.getAttribute('aria-hidden')).toBeNull();
  });

  it('returns focus to the trigger when the drawer closes', async () => {
    render(<AppShell><div /></AppShell>);
    const trigger = screen.getByTestId('nostar-menu-toggle');

    fireEvent.click(trigger);
    await waitFor(() => expect(document.activeElement).not.toBe(trigger));
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(trigger));
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

  it('keeps the theme toggle and logout in the topbar', () => {
    render(<AppShell><div /></AppShell>);
    const actions = document.querySelector('.nostar-topbar-actions');

    expect(actions?.querySelectorAll('.nostar-icon-button')).toHaveLength(2);
    fireEvent.click(screen.getByLabelText('切换主题'));
    expect(setTheme).toHaveBeenCalledWith('dark');
  });
});

describe('NoStar visual contract', () => {
  it('takes every shell dimension from the shared tokens', () => {
    const css = read('src/index.css');

    expect(css).toMatch(/\.nostar-sidebar \{[\s\S]*?width:\s*var\(--ui-sidebar-w\)/);
    expect(css).toMatch(/\.nostar-main \{[\s\S]*?padding-left:\s*var\(--ui-sidebar-w\)/);
    expect(css).toMatch(/\.nostar-topbar \{[\s\S]*?min-height:\s*var\(--ui-topbar-h\)/);
    expect(css).toMatch(/\.nostar-topbar \{[\s\S]*?position:\s*sticky/);
    expect(css).toMatch(/\.nostar-stage \{[\s\S]*?max-width:\s*var\(--ui-content-max\)/);
    expect(css).toMatch(/\.nostar-nav-item \{[\s\S]*?height:\s*var\(--ui-control-h\)/);
  });

  it('becomes a drawer only below the md breakpoint', () => {
    const css = read('src/index.css');

    expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*?\.nostar-sidebar \{[\s\S]*?transform:\s*translateX\(-100%\)/);
    expect(css).toMatch(/@media \(max-width: 767px\)[\s\S]*?\.nostar-main \{[\s\S]*?padding-left:\s*0/);
    expect(css).toMatch(/\.nostar-shell \{[\s\S]*?overflow-x:\s*hidden/);
    expect(read('src/components/AppShell.tsx')).toContain('window.innerWidth >= 768');
  });

  it('resolves the Tailwind palette through the contract, with no purple left', () => {
    const config = read('tailwind.config.js');

    // Unmodified utilities must resolve to the token itself, so dark-mode tokens keep their
    // built-in alpha; only an explicit modifier falls back to the channel triplet.
    expect(config).toContain('`var(--ui-${name})`');
    expect(config).toContain('`rgb(var(--ui-${name}-rgb) / ${opacityValue})`');
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

  it('keeps the NoStar identity', () => {
    const shell = read('src/components/AppShell.tsx');
    expect(shell).toContain('./icon.png');
    expect(shell).toContain('NoStar');
  });
});
