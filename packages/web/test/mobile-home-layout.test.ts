import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Responsive contracts for the phone homepage. Measured at 320/360/390/430 against the real scoped
 * styles, the pre-fix layout forced the desktop three-column bookmark grid onto a 320px screen
 * (~76px cells, 16 of 18 labels clipped), faded away the first and last notab with a 28px edge
 * mask, and left the inner bookmark list `overflow-y: hidden` unless a folder cleared a link count
 * tuned for three columns. These assertions keep those regressions from coming back.
 */

const WEB_ROOT = process.cwd();

function source(relative: string): string {
  return fs.readFileSync(path.resolve(WEB_ROOT, relative), 'utf8');
}

function scopedStyle(relative: string): string {
  const match = source(relative).match(/<style scoped>([\s\S]*?)<\/style>/);
  if (!match) throw new Error(`no scoped style block in ${relative}`);
  return match[1];
}

/** The body of the first `@media (max-width: <width>px)` block, for width-scoped assertions. */
function mediaBlock(css: string, width: number): string {
  const start = css.indexOf(`@media (max-width: ${width}px)`);
  expect(start, `missing @media (max-width: ${width}px)`).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated @media (max-width: ${width}px)`);
}

const navigationCss = scopedStyle('src/views/NavigationPage.vue');
const folderCss = scopedStyle('src/components/FolderCard.vue');
const navigationSource = source('src/views/NavigationPage.vue');
const navigationMobile = mediaBlock(navigationCss, 640);
const folderMobile = mediaBlock(folderCss, 640);

describe('mobile notab strip', () => {
  it('drops the edge mask on phones so the first and last tab stay readable', () => {
    // The mask is a visual hint only: it never blocked hit testing, so a faded tab was still
    // tappable. At 320px it hid 56px of a 280px strip.
    expect(navigationCss).toMatch(/\.folder-tabs\.tabs-scrollable \{[\s\S]*?mask-image: linear-gradient/);
    expect(navigationMobile).toMatch(/\.folder-tabs\.tabs-scrollable \{[\s\S]*?mask-image: none;/);
  });

  it('contains horizontal overscroll so a swipe is not read as browser back-navigation', () => {
    expect(navigationCss).toMatch(/\.folder-tabs\.tabs-scrollable \{[\s\S]*?overscroll-behavior-x: contain;/);
    expect(navigationCss).toMatch(/\.folder-tabs\.tabs-scrollable \{[\s\S]*?-webkit-overflow-scrolling: touch;/);
  });

  it('leaves touch-action alone so vertical page scrolling still starts on the strip', () => {
    // `pan-x` would make the horizontal gesture decisive but would trap vertical scrolling on a
    // full-width sticky bar, and `pan-x pan-y` would disable pinch zoom. Neither is worth it.
    expect(navigationCss).not.toMatch(/\.folder-tabs[^{]*\{[^}]*touch-action/);
  });

  it('scrolls the active tab back into view after a switch', () => {
    expect(navigationSource).toContain('function keepActiveTabVisible');
    expect(navigationSource).toMatch(/scrollIntoView\(\{[^}]*inline: 'nearest'/);
    // A no-op when nothing overflows, so desktop never scrolls.
    expect(navigationSource).toMatch(/keepActiveTabVisible[\s\S]*?scrollWidth <= nav\.clientWidth \+ 1\) return;/);
    expect(navigationSource).toMatch(/prefers-reduced-motion: reduce[\s\S]*?behavior: reduced \? 'auto' : 'smooth'/);
    expect(navigationCss).toMatch(/scroll-padding-inline: var\(--public-notab-scroll-padding, 12px\)/);
  });

  it('keeps notab labels visible on one line instead of hiding them', () => {
    expect(navigationMobile).toMatch(/\.notab-select \{[\s\S]*?white-space: nowrap;/);
    expect(navigationMobile).not.toMatch(/\.notab-select[^{]*\{[^}]*display:\s*none/);
    // Service links live in the same scroll container, so they stay reachable by the same swipe.
    expect(navigationSource).toContain('class="tab-service-link"');
  });
});

describe('mobile folder cards', () => {
  it('derives the bookmark column count from available width, not a fixed desktop three', () => {
    expect(folderCss).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(folderMobile).toMatch(
      /\.large-links \{[\s\S]*?grid-template-columns: repeat\(auto-fill, minmax\(var\(--public-bookmark-min-width, 132px\), 1fr\)\);/,
    );
    expect(folderMobile).not.toContain('repeat(3, minmax(0, 1fr))');
  });

  it('uses a token for the column floor rather than a device-specific width', () => {
    expect(folderMobile).toContain('var(--public-bookmark-min-width, 132px)');
    // No breakpoint keyed to a particular handset.
    expect(folderMobile).not.toMatch(/max-width:\s*(320|360|375|390|414|430)px/);
  });

  it('never hides overflowing links behind a count threshold', () => {
    expect(folderCss).toMatch(/\.large-links \{[\s\S]*?overflow-y: auto;/);
    expect(folderCss).not.toMatch(/\.large-links \{[\s\S]*?overflow-y: hidden;/);
  });

  it('lets the page keep scrolling when the inner list reaches its end on mobile', () => {
    // Containment is right on desktop pointers but reads as a scroll trap under a thumb.
    expect(folderCss).toMatch(/\.large-links\.is-scrollable \{[\s\S]*?overscroll-behavior: contain;/);
    expect(folderMobile).toMatch(/\.large-links\.is-scrollable \{[\s\S]*?overscroll-behavior: auto;/);
  });

  it('keeps a consistent expand affordance beside the scrollable list', () => {
    expect(navigationSource).toContain('@expand="expandedFolder = $event"');
    expect(source('src/components/FolderCard.vue')).toContain('data-testid="folder-expand"');
  });

  it('truncates long labels with an ellipsis instead of a bare clip', () => {
    expect(folderCss).toMatch(/\.large-link span \{[\s\S]*?text-overflow: ellipsis;/);
    // The full name stays available on the anchor.
    expect(source('src/components/FolderCard.vue')).toContain(':title="link.name"');
  });

  it('keeps cell contents inside the cell box', () => {
    expect(folderCss).toMatch(/\.bookmark-cell \{[\s\S]*?min-width: 0;/);
    expect(folderCss).toMatch(/\.large-link \{[\s\S]*?min-width: 0;[\s\S]*?overflow: hidden;/);
    expect(folderCss).toMatch(/\.large-link-icon \{[\s\S]*?flex-shrink: 0;/);
  });
});

describe('no mobile rule reintroduces horizontal clipping', () => {
  it('never sets overflow-x hidden on the page containers', () => {
    for (const block of [navigationMobile, folderMobile]) {
      expect(block).not.toMatch(/\.nav-page[^{]*\{[^}]*overflow-x:\s*hidden/);
      expect(block).not.toMatch(/\.nav-content[^{]*\{[^}]*overflow-x:\s*hidden/);
      expect(block).not.toMatch(/\.adaptive-folder-grid[^{]*\{[^}]*overflow-x:\s*hidden/);
    }
  });

  it('keeps the grid and its cells collapsible so nothing forces the page wider', () => {
    expect(navigationMobile).toMatch(
      /\.nav-header,[\s\S]*?\.adaptive-folder-grid \{[\s\S]*?min-width: 0;[\s\S]*?width: 100%;/,
    );
    expect(navigationCss).toMatch(/\.adaptive-folder-grid \{[\s\S]*?grid-template-columns: repeat\(var\(--public-folder-columns, 4\), minmax\(0, 1fr\)\);/);
    expect(navigationMobile).toMatch(/\.adaptive-folder-grid \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/);
  });

  it('declares no pixel width wide enough to overflow the narrowest phone', () => {
    // Only `width`/`min-width` can push a container past the viewport; `max-width` is a cap and a
    // small decorative size (an avatar, a label ceiling) is harmless. What matters is that no rule
    // asserts a width at or beyond the 320px baseline. Percentages, calc(), min()/max() and tokens
    // are all fine because they resolve against the viewport.
    const NARROWEST_VIEWPORT = 320;
    for (const [name, block] of [['navigation', navigationMobile], ['folder card', folderMobile]] as const) {
      const tooWide = [...block.matchAll(/(?:^|[;{])\s*(min-)?width:\s*(\d+)px/g)]
        .filter((match) => Number(match[2]) >= NARROWEST_VIEWPORT)
        .map((match) => match[0].trim());
      expect(tooWide, `${name} mobile block declares a viewport-breaking width`).toEqual([]);
    }
  });
});
