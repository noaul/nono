# Shared UI contract

One visual language across the three operator-facing apps: **Nono admin** (`packages/web`),
**NoStar** (`apps/nostar`) and **NoMoney** (`apps/nomoney/frontend`). NoMoney is the approved
reference for structure and density; this document is the canonical definition of the tokens the
other two adopt.

## Why the tokens are duplicated

The `Dockerfile` builds each app from its own directory only — `COPY packages ./packages`,
`COPY apps/nomoney/ ./`, `COPY apps/nostar/ ./`. Nothing outside an app's own tree is available to
its build, so a shared npm workspace package importable by all three **cannot** exist without
breaking that isolation.

The contract is therefore duplicated as an identical `design-tokens.css` inside each app, and
`tests/ui-contract.test.mjs` fails if any copy drifts from the values below. Change the contract
here, update each copy, and the test confirms they agree.

## Tokens

Every value is exposed as a `--ui-*` custom property. Apps map their own names onto these rather
than hard-coding colours.

### Surfaces — neutral slate (light) / ink (dark)

| Token | Light | Dark |
| --- | --- | --- |
| `--ui-canvas` | `#f8fafc` | `#07080a` |
| `--ui-surface` | `#ffffff` | `#0f1216` |
| `--ui-surface-raised` | `#ffffff` | `#14181e` |
| `--ui-surface-sunken` | `#f1f5f9` | `rgba(255,255,255,0.03)` |
| `--ui-border` | `#e2e8f0` | `rgba(255,255,255,0.10)` |
| `--ui-border-strong` | `#cbd5e1` | `rgba(255,255,255,0.18)` |

### Ink

| Token | Light | Dark |
| --- | --- | --- |
| `--ui-text` | `#0f172a` | `#f1f5f9` |
| `--ui-text-muted` | `#475569` | `#94a3b8` |
| `--ui-text-subtle` | `#64748b` | `#7c8899` |

### Accent — one restrained teal

Teal, not blue and not purple, and used only for the active state, focus, primary action and links.
Never for decoration.

| Token | Light | Dark |
| --- | --- | --- |
| `--ui-accent` | `#0d9488` | `#2dd4bf` |
| `--ui-accent-hover` | `#0f766e` | `#5eead4` |
| `--ui-accent-ink` | `#ffffff` | `#042f2e` |
| `--ui-accent-soft` | `rgba(13,148,136,0.10)` | `rgba(45,212,191,0.14)` |
| `--ui-accent-ring` | `rgba(13,148,136,0.38)` | `rgba(45,212,191,0.42)` |

### Status

| Token | Light | Dark |
| --- | --- | --- |
| `--ui-success` | `#059669` | `#34d399` |
| `--ui-warning` | `#d97706` | `#fbbf24` |
| `--ui-danger` | `#e11d48` | `#fb7185` |
| `--ui-info` | `#0284c7` | `#38bdf8` |

Each has a `-soft` companion at 10% for badge and banner fills.

### Geometry

| Token | Value | Note |
| --- | --- | --- |
| `--ui-radius-sm` | `8px` | inputs, buttons, nav rows |
| `--ui-radius-md` | `10px` | cards, panels |
| `--ui-radius-lg` | `12px` | dialogs, drawers |
| `--ui-control-h` | `40px` | the standard control height |
| `--ui-control-h-sm` | `32px` | dense toolbars, table row actions |
| `--ui-icon-btn` | `36px` | square icon buttons |
| `--ui-sidebar-w` | `256px` | fixed desktop sidebar |
| `--ui-topbar-h` | `64px` | sticky topbar |
| `--ui-content-max` | `1280px` | centred content column |

Radii stay in the 8–12px band. No pill shapes except genuine badges and status dots.

### Spacing

`--ui-space-1: 4px` · `2: 8px` · `3: 12px` · `4: 16px` · `5: 24px` · `6: 32px`.

### Motion

| Token | Value |
| --- | --- |
| `--ui-dur-fast` | `120ms` |
| `--ui-dur-base` | `200ms` |
| `--ui-dur-slow` | `280ms` |
| `--ui-ease` | `cubic-bezier(0.22, 1, 0.36, 1)` |

All motion collapses under `prefers-reduced-motion: reduce`.

### Focus

`--ui-focus-ring: 0 0 0 2px var(--ui-accent-ring)` plus a 2px offset outline on `:focus-visible`.
Focus is never removed, only restyled.

### Shadows

`--ui-shadow-sm: 0 1px 2px rgba(15,23,42,0.06)` ·
`--ui-shadow-md: 0 8px 24px rgba(15,23,42,0.10)`.
Dark mode drops both to near-transparent and relies on borders instead.

### Breakpoints

`sm 640` · `md 768` · `lg 1024` · `xl 1280`. The sidebar collapses to a drawer below `md`.

## Shell

Desktop:

- fixed sidebar, `--ui-sidebar-w`, bordered right, brand block `--ui-topbar-h` tall
- sticky topbar, `--ui-topbar-h`, bordered bottom, page title left, actions right
- content centred at `--ui-content-max`
- nav rows `40px`, `--ui-radius-sm`, icon + label; **active row is a solid inverted block**
  (ink background, canvas text) rather than a tinted pill

Mobile (below `md`):

- sidebar becomes a drawer over a dimmed backdrop
- `role="dialog"`, `aria-modal="true"`, focus moves into the drawer on open
- Escape closes; navigating closes; focus returns to the trigger
- body scroll locked while open; no horizontal page overflow at any width

## Prohibited

Gradients, decorative glass/backdrop-blur skins, nested cards, oversized headings, pill-heavy
navigation, and per-app hard-coded palettes. A page has exactly one visible `h1`, in the topbar.

## How each app consumes the contract

Each app imports its `design-tokens.css` copy at boot, before its own stylesheet.

**Nono admin** (`packages/web`) — `admin.css` is one layer of primitives reading `--ui-*`
directly. The older `--admin-*` names survive as aliases declared once in `tokens.css`, pointing
at the contract; they hold no values of their own, so there is no second source of truth. View
scoped styles keep only page-specific grid, column and responsive rules.

**NoStar** (`apps/nostar`) — `AppShell.tsx` renders the sidebar/topbar/drawer and `index.css`
styles it from the tokens. The header-centric frame and `Header.tsx` are gone. Because the app
had ~56 files on a bespoke Linear palette, `tailwind.config.js` now resolves every themed colour
name through `rgb(var(--ui-*-rgb) / <alpha-value>)` instead of a literal. That re-skins the whole
app from one place and keeps `bg-brand-indigo/20`-style opacity modifiers working; the old names
(`brand.indigo`, `panel-dark`, `marketing-black`, `text-primary`, …) remain as aliases so no call
site had to change.

**NoMoney** (`apps/nomoney/frontend`) — imports the tokens and nothing else. The file declares
custom properties only, so it cannot alter a single Tailwind-generated rule; the app is byte-for-
byte the approved design. Its own `Layout.tsx`, `ui.tsx` and `styles.css` were not touched.

## Notes

**NoMoney's `brand` scale is still blue (`#2563eb`).** Its `Layout.tsx`, `ui.tsx` and
`styles.css` were deliberately left untouched, because the brief marked the app approved and
functionally unchanged. Its global `:focus-visible` outline and tap highlight already use teal, so
the app is internally inconsistent today. Nono admin and NoStar are both on the teal accent above;
aligning NoMoney is a one-line change to `brand` in its `tailwind.config.js` and the last step to
a genuinely single accent across all three — flagged rather than taken unilaterally, since it
would visibly restyle an app the brief froze.
