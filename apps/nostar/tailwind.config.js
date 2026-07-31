import typography from '@tailwindcss/typography';

/**
 * Resolves a shared UI contract token as a Tailwind colour.
 *
 * Two forms are needed, and picking the wrong one is a real bug rather than a nicety. Several
 * tokens carry their own alpha in dark mode — `--ui-surface-sunken` is `rgba(255,255,255,0.03)`
 * and `--ui-border` is `rgba(255,255,255,0.10)` — while their `-rgb` channel triplets are bare
 * `255 255 255`. Always using the triplet meant an unmodified `bg-light-surface` resolved to
 * `rgb(255 255 255 / 1)`, i.e. solid white, in dark mode.
 *
 * So: with no opacity modifier, return the token itself and keep its built-in alpha. With a
 * modifier, fall back to the triplet so `bg-brand-indigo/20` still composes.
 *
 * Tailwind does not pass `undefined` for an unmodified utility — it passes its own
 * `var(--tw-bg-opacity, 1)` placeholder — so the modifier is detected by the value being a plain
 * number instead.
 */
const ui = (name) => ({ opacityValue }) => {
  const hasExplicitModifier = opacityValue !== undefined && !String(opacityValue).startsWith('var(');
  return hasExplicitModifier
    ? `rgb(var(--ui-${name}-rgb) / ${opacityValue})`
    : `var(--ui-${name})`;
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    screens: {
      'sm': '640px',
      'md': '768px',
      'lg': '1024px',
      'xl': '1300px',
      '2xl': '1536px',
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', 'sans-serif'],
        mono: ['Berkeley Mono', 'ui-monospace', 'SF Mono', 'Menlo', 'monospace'],
      },
      colors: {
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
        accent: {
          50: ui('warning'), 100: ui('warning'), 200: ui('warning'),
          300: ui('warning'), 400: ui('warning'), 500: ui('warning'),
          600: ui('warning'), 700: ui('warning'), 800: ui('warning'), 900: ui('warning'),
        }
      },
      fontWeight: {
        'light': '300',
        'normal': '400',
        'medium': '510',
        'semibold': '590',
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
  plugins: [
    typography,
  ],
};
