/**
 * Tailwind v4 moved its default palette from sRGB hex to OKLCH, which shifts every shade slightly
 * (and visibly on wide-gamut screens). These are the v3 values the UI was designed against, pinned
 * so the upgrade changes no colour. `gray` is Tailwind's slate: the contract's cool neutral.
 */
const palette = {
  slate: { 50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8', 500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a', 950: '#020617' },
  red: { 50: '#fef2f2', 100: '#fee2e2', 200: '#fecaca', 300: '#fca5a5', 400: '#f87171', 500: '#ef4444', 600: '#dc2626', 700: '#b91c1c', 800: '#991b1b', 900: '#7f1d1d', 950: '#450a0a' },
  green: { 50: '#f0fdf4', 100: '#dcfce7', 200: '#bbf7d0', 300: '#86efac', 400: '#4ade80', 500: '#22c55e', 600: '#16a34a', 700: '#15803d', 800: '#166534', 900: '#14532d', 950: '#052e16' },
  amber: { 50: '#fffbeb', 100: '#fef3c7', 200: '#fde68a', 300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b', 600: '#d97706', 700: '#b45309', 800: '#92400e', 900: '#78350f', 950: '#451a03' },
  yellow: { 50: '#fefce8', 100: '#fef9c3', 200: '#fef08a', 300: '#fde047', 400: '#facc15', 500: '#eab308', 600: '#ca8a04', 700: '#a16207', 800: '#854d0e', 900: '#713f12', 950: '#422006' },
  teal: { 50: '#f0fdfa', 100: '#ccfbf1', 200: '#99f6e4', 300: '#5eead4', 400: '#2dd4bf', 500: '#14b8a6', 600: '#0d9488', 700: '#0f766e', 800: '#115e59', 900: '#134e4a', 950: '#042f2e' },
  cyan: { 50: '#ecfeff', 100: '#cffafe', 200: '#a5f3fc', 300: '#67e8f9', 400: '#22d3ee', 500: '#06b6d4', 600: '#0891b2', 700: '#0e7490', 800: '#155e75', 900: '#164e63', 950: '#083344' },
  blue: { 50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a', 950: '#172554' },
  violet: { 50: '#f5f3ff', 100: '#ede9fe', 200: '#ddd6fe', 300: '#c4b5fd', 400: '#a78bfa', 500: '#8b5cf6', 600: '#7c3aed', 700: '#6d28d9', 800: '#5b21b6', 900: '#4c1d95', 950: '#2e1065' },
};

/**
 * Resolves a shared UI contract token as a Tailwind colour.
 *
 * The token itself is always the value, so an unmodified utility keeps its built-in alpha. Several
 * tokens carry one in dark mode — `--ui-surface-sunken` is `rgba(255,255,255,0.03)` and
 * `--ui-border` is `rgba(255,255,255,0.10)` — so resolving them through their bare `-rgb` triplet
 * would paint solid white.
 *
 * An opacity modifier such as `bg-brand-indigo/20` is applied by Tailwind v4 itself, as
 * `color-mix(in oklab, var(--ui-accent) 20%, transparent)`. (v4 no longer calls colour functions
 * with `{ opacityValue }`.) For an opaque token that is the same colour the old
 * `rgb(var(--ui-accent-rgb) / 0.2)` produced.
 */
const ui = (name) => `var(--ui-${name})`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    // The contract's breakpoints (sm 640 · md 768 · lg 1024 · xl 1280), plus Tailwind's own 2xl.
    screens: {
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1280px',
      '2xl': '1536px',
    },
    // Only the contract's weights exist, so `font-extrabold` / `font-black` cannot creep back in:
    // headings top out at 700, buttons and labels sit at 600.
    fontWeight: {
      light: '300',
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    },
    extend: {
      // Typography ships its own palette; retain the v3 content colours as well.
      typography: { DEFAULT: { css: {
          '--tw-prose-body': '#374151',
          '--tw-prose-headings': '#111827',
          '--tw-prose-lead': '#4b5563',
          '--tw-prose-links': '#111827',
          '--tw-prose-bold': '#111827',
          '--tw-prose-counters': '#6b7280',
          '--tw-prose-bullets': '#d1d5db',
          '--tw-prose-hr': '#e5e7eb',
          '--tw-prose-quotes': '#111827',
          '--tw-prose-quote-borders': '#e5e7eb',
          '--tw-prose-captions': '#6b7280',
          '--tw-prose-kbd': '#111827',
          '--tw-prose-kbd-shadows': '#1118271a',
          '--tw-prose-code': '#111827',
          '--tw-prose-pre-code': '#e5e7eb',
          '--tw-prose-pre-bg': '#1f2937',
          '--tw-prose-th-borders': '#d1d5db',
          '--tw-prose-td-borders': '#e5e7eb',
          '--tw-prose-invert-body': '#d1d5db',
          '--tw-prose-invert-headings': '#fff',
          '--tw-prose-invert-lead': '#9ca3af',
          '--tw-prose-invert-links': '#fff',
          '--tw-prose-invert-bold': '#fff',
          '--tw-prose-invert-counters': '#9ca3af',
          '--tw-prose-invert-bullets': '#4b5563',
          '--tw-prose-invert-hr': '#374151',
          '--tw-prose-invert-quotes': '#f3f4f6',
          '--tw-prose-invert-quote-borders': '#374151',
          '--tw-prose-invert-captions': '#9ca3af',
          '--tw-prose-invert-kbd': '#fff',
          '--tw-prose-invert-kbd-shadows': '#ffffff1a',
          '--tw-prose-invert-code': '#fff',
          '--tw-prose-invert-pre-code': '#d1d5db',
          '--tw-prose-invert-pre-bg': '#00000080',
          '--tw-prose-invert-th-borders': '#4b5563',
          '--tw-prose-invert-td-borders': '#374151',
      } } },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', 'sans-serif'],
        mono: ['Berkeley Mono', 'ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
      },
      colors: {
        // Tailwind's default `gray` is a cool grey, not the contract's slate neutral. Remapping the
        // scale here moves every `gray-*` utility in the app onto slate in one place.
        gray: palette.slate,
        red: palette.red,
        green: palette.green,
        amber: palette.amber,
        yellow: palette.yellow,
        teal: palette.teal,
        cyan: palette.cyan,
        blue: palette.blue,
        violet: palette.violet,

        // Every themed colour resolves to the shared UI contract (design-tokens.css).
        // The old Linear palette — purple brand, marketing-black, Linear text ramp — is gone;
        // these names survive only so the existing class usage across the app keeps working.
        'marketing-black': ui('canvas'),
        'panel-dark': ui('surface'),
        'surface-3': ui('surface-raised'),
        'surface-sec': ui('surface-raised'),

        'text-primary': ui('text'),
        'text-secondary': ui('text-muted'),
        'text-tertiary': ui('text-subtle'),
        'text-quaternary': ui('text-subtle'),

        // One restrained teal. `violet` and `hover` are aliases so no call site breaks.
        brand: {
          indigo: ui('accent'),
          violet: ui('accent'),
          hover: ui('accent-hover'),
        },
        'security-lavender': ui('text-subtle'),

        'status-green': ui('success'),
        'status-emerald': ui('success'),
        'status-red': ui('danger'),
        'status-amber': ui('warning'),

        'border-primary': ui('border'),
        'border-secondary': ui('border-strong'),
        'border-tertiary': ui('border-strong'),
        'line-tint': ui('border'),
        'line-tertiary': ui('border'),

        'light-bg': ui('canvas'),
        'light-surface': ui('surface-sunken'),
        'light-border': ui('border'),
        'light-border-alt': ui('border'),

        // Legacy ramps, collapsed onto the contract rather than kept as a second palette.
        primary: {
          50: ui('accent'), 100: ui('accent'), 200: ui('accent'),
          300: ui('accent'), 400: ui('accent'), 500: ui('accent'),
          600: ui('accent'), 700: ui('accent-hover'), 800: ui('accent-hover'), 900: ui('accent-hover'),
        },
        secondary: {
          50: ui('surface-sunken'), 100: ui('surface-sunken'), 200: ui('border'),
          300: ui('border-strong'), 400: ui('text-subtle'), 500: ui('text-muted'),
          600: ui('text-muted'), 700: ui('text'), 800: ui('text'), 900: ui('text'),
        },
      },
      // The contract sets letter-spacing to 0 everywhere; these names are kept so the existing
      // `tracking-*` call sites keep resolving, but they no longer tighten anything.
      letterSpacing: {
        'display-xl': '0',
        'display-lg': '0',
        'display': '0',
        'h1': '0',
        'h2': '0',
        'h3': '0',
        'body-lg': '0',
        'caption': '0',
        'tiny': '0',
      },
      boxShadow: {
        'subtle': '0px 1.2px 0px rgba(0,0,0,0.03)',
        'ring': '0px 0px 0px 1px rgba(0,0,0,0.2)',
        'elevated': '0px 2px 4px rgba(0,0,0,0.4)',
        'dialog': '0px 8px 2px rgba(0,0,0,0), 0px 5px 2px rgba(0,0,0,0.01), 0px 3px 2px rgba(0,0,0,0.04), 0px 1px 1px rgba(0,0,0,0.07), 0px 0px 1px rgba(0,0,0,0.08)',
        'focus': '0px 4px 12px rgba(0,0,0,0.1)',
        'inset-panel': '0px 0px 12px 0px rgba(0,0,0,0.2) inset',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s ease-in forwards',
        'bounce-gentle': 'bounceGentle 2s ease-in-out infinite',
        'shake': 'shake 0.5s ease-in-out',
        'bounce-twice': 'bounceTwice 0.6s ease-in-out',
        'selection-exit': 'selectionExit 0.25s ease-out forwards',
        'expand-fade': 'expandFade 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(0)', opacity: '1' },
          '100%': { transform: 'translateY(100%)', opacity: '0' },
        },
        bounceGentle: {
          '0%, 20%, 50%, 80%, 100%': { transform: 'translateY(0)' },
          '40%': { transform: 'translateY(-4px)' },
          '60%': { transform: 'translateY(-2px)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '10%, 30%, 50%, 70%, 90%': { transform: 'translateX(-4px)' },
          '20%, 40%, 60%, 80%': { transform: 'translateX(4px)' },
        },
        bounceTwice: {
          '0%, 100%': { transform: 'translateY(0)' },
          '25%': { transform: 'translateY(-12px)' },
          '50%': { transform: 'translateY(0)' },
          '75%': { transform: 'translateY(-8px)' },
        },
        selectionExit: {
          '0%': { transform: 'scale(1)', boxShadow: '0 0 0 2px var(--ui-accent-ring)' },
          '50%': { transform: 'scale(1.01)', boxShadow: '0 0 0 3px var(--ui-accent-ring)' },
          '100%': { transform: 'scale(1)', boxShadow: '0 0 0 0 transparent' },
        },
        expandFade: {
          '0%': { opacity: '0', transform: 'translateY(-8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      }
    },
  },
  // @tailwindcss/typography is registered in src/index.css with `@plugin`.
  plugins: [],
};
