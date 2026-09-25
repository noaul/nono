import { computed, onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import type { Site } from '@/api/types';
import { getAppearanceSettings, toAppearanceCssVars, toSceneTuning } from '@/utils/appearance';
import type { ResolvedColorMode } from '@/utils/colorMode';
import { getSceneIntensity, getTheme, getThemeAccentVars, pageTextCssVars, themeCssVars } from '@/utils/themes';

/**
 * Everything the homepage paints behind its content: the theme, the colour mode, the appearance
 * settings as CSS variables, and the user's own background image with its preloading.
 *
 * `visualSite` is what to render (the drawer's unsaved preview when there is one); `savedSite` is
 * what the server holds, which is where the background image is fetched from.
 */
export function useHomeAppearance(options: {
  visualSite: Ref<Site | null>;
  savedSite: Ref<Site | undefined>;
  username: Ref<string>;
}) {
  const { visualSite, savedSite, username } = options;
  const visibleBackgroundImage = ref('');
  const loadedBackgroundImage = ref('');
  let backgroundPreloadVersion = 0;

  const resolvedMode = ref<ResolvedColorMode>(
    typeof document !== 'undefined' && document.documentElement.dataset.colorMode === 'dark' ? 'dark' : 'light',
  );

  function syncResolvedMode() {
    resolvedMode.value = document.documentElement.dataset.colorMode === 'dark' ? 'dark' : 'light';
  }

  const activeTheme = computed(() => {
    const settings = visualSite.value?.settings as { theme?: { id?: string } } | null | undefined;
    return getTheme(settings?.theme?.id);
  });
  const sceneIntensity = computed(() => getSceneIntensity(visualSite.value?.settings));
  const appearance = computed(() => getAppearanceSettings(visualSite.value?.settings));
  const sceneTuning = computed(() => toSceneTuning(appearance.value));

  const modeCssVars = computed<Record<string, string>>((): Record<string, string> => {
    if (resolvedMode.value !== 'dark') {
      return {
        '--public-mode-scrim': 'rgba(8, 12, 18, 0.02)',
        '--public-notification-surface': '#ffffff',
        '--public-notification-text': '#111827',
        '--public-notification-text-rgb': '17, 24, 39',
        '--public-notification-border-rgb': '15, 23, 42',
        '--public-notification-hover-rgb': '15, 23, 42',
      };
    }
    return {
      '--public-mode-scrim': 'rgba(5, 8, 14, 0.378)',
      '--public-card-color-rgb': '22, 25, 33',
      '--public-card-opacity': '0.52',
      '--public-search-color-rgb': '20, 23, 31',
      '--public-search-opacity': '0.58',
      '--public-page-text': '#f4f6f8',
      '--public-page-text-rgb': '244, 246, 248',
      '--public-bookmark-text': '#ffffff',
      '--public-bookmark-text-rgb': '255, 255, 255',
      '--public-notab-text': '#ffffff',
      '--public-notab-text-rgb': '255, 255, 255',
      // Light themes ship dark search text, which vanished on the dark-mode search bar.
      '--public-search-text': '#ffffff',
      '--public-search-text-rgb': '255, 255, 255',
      '--public-placeholder-text': '#ffffff',
      '--public-placeholder-text-rgb': '255, 255, 255',
      '--public-folder-text': '#ffffff',
      '--public-folder-text-rgb': '255, 255, 255',
      '--public-border-rgb': '226, 231, 238',
      '--public-highlight-rgb': '241, 244, 248',
      '--public-hover-rgb': '226, 231, 238',
      '--public-shadow-rgb': '0, 0, 0',
      '--public-overlay-rgb': '5, 8, 14',
      '--public-notification-surface': 'rgba(5, 8, 14, 0.94)',
      '--public-notification-text': '#ffffff',
      '--public-notification-text-rgb': '255, 255, 255',
      '--public-notification-border-rgb': '226, 231, 238',
      '--public-notification-hover-rgb': '226, 231, 238',
    };
  });

  /** The user's own homepage background, honouring the on/off switch. */
  const activeBackgroundImage = computed(() => (
    appearance.value.backgroundImageEnabled ? visibleBackgroundImage.value : ''
  ));

  /** Scrim over the background image: the chosen strength, plus a fixed extra 30% in dark mode. */
  const backgroundOverlayTotal = computed(() => {
    const darkModeExtra = resolvedMode.value === 'dark' ? 30 : 0;
    return Math.min(1, (appearance.value.backgroundOverlay + darkModeExtra) / 100);
  });

  const backgroundScrim = computed(() => (
    `rgba(var(--public-overlay-rgb, 8, 12, 18), ${backgroundOverlayTotal.value.toFixed(3)})`
  ));

  const backgroundStyle = computed(() => {
    const appearanceVars = toAppearanceCssVars(appearance.value);
    const publicThemeVars = activeTheme.value ? themeCssVars(activeTheme.value) : {};
    const site = visualSite.value;
    const accentVars = getThemeAccentVars(site?.settings);
    if (!site) {
      return {
        ...appearanceVars,
        ...pageTextCssVars('#f3f4f6'),
        '--nav-bg-color': '#090a0f',
        '--nav-bg-image': 'none',
        ...modeCssVars.value,
        color: '#f3f4f6',
      };
    }

    return {
      ...appearanceVars,
      ...publicThemeVars,
      ...accentVars,
      ...pageTextCssVars(site.fontColor || activeTheme.value?.fontColor || '#f3f4f6'),
      '--nav-bg-color': site.backgroundColor || '#090a0f',
      // The scrim rides on the image layer as a flat gradient rather than a pseudo-element:
      // `.nav-page` and `.public-glass-page` are the same element, so an `::after` here would
      // replace the mode scrim that rule already owns.
      '--nav-bg-image': activeBackgroundImage.value
        ? `linear-gradient(${backgroundScrim.value}, ${backgroundScrim.value}), url(${JSON.stringify(activeBackgroundImage.value)})`
        : 'none',
      ...modeCssVars.value,
      color: resolvedMode.value === 'dark' ? '#f4f6f8' : site.fontColor || '#f3f4f6',
    };
  });

  const savedBackgroundImageUrl = computed(() => savedSite.value?.backgroundImage || '');
  const backgroundImageUrl = computed(() => {
    if (!savedBackgroundImageUrl.value) return '';
    const endpoint = `/api/navigation/${encodeURIComponent(username.value)}/background`;
    return savedSite.value?.updatedAt ? `${endpoint}?v=${encodeURIComponent(savedSite.value.updatedAt)}` : endpoint;
  });

  function removeBackgroundHints() {
    if (typeof document === 'undefined') return;
    document.head.querySelectorAll('[data-nono-background-preload]').forEach((node) => node.remove());
  }

  function addBackgroundHint(rel: 'dns-prefetch' | 'preconnect' | 'preload', href: string, as?: string) {
    const link = document.createElement('link');
    link.rel = rel;
    link.href = href;
    link.dataset.nonoBackgroundPreload = 'true';
    if (as) {
      link.as = as;
      link.setAttribute('as', as);
    }
    if (rel === 'preload') link.setAttribute('fetchpriority', 'high');
    document.head.appendChild(link);
  }

  function preloadPublicBackground(url?: string | null) {
    const requestVersion = ++backgroundPreloadVersion;
    visibleBackgroundImage.value = url || '';
    loadedBackgroundImage.value = '';
    removeBackgroundHints();
    if (!url || typeof document === 'undefined') return;

    try {
      const origin = new URL(url, window.location.href).origin;
      if (origin !== window.location.origin) {
        addBackgroundHint('dns-prefetch', origin);
        addBackgroundHint('preconnect', origin);
      }
    } catch {
      // Invalid URLs fall back to the stable color layer.
    }

    addBackgroundHint('preload', url, 'image');
    preloadBackgroundCandidate(url, requestVersion, savedBackgroundImageUrl.value);
  }

  function preloadBackgroundCandidate(url: string, requestVersion: number, fallbackUrl = '') {
    const image = new Image();
    image.decoding = 'async';
    image.fetchPriority = 'high';
    image.onload = () => {
      if (requestVersion === backgroundPreloadVersion) loadedBackgroundImage.value = url;
    };
    image.onerror = () => {
      if (requestVersion !== backgroundPreloadVersion) return;
      if (fallbackUrl && fallbackUrl !== url) {
        visibleBackgroundImage.value = fallbackUrl;
        loadedBackgroundImage.value = '';
        try {
          const origin = new URL(fallbackUrl, window.location.href).origin;
          if (origin !== window.location.origin) {
            addBackgroundHint('dns-prefetch', origin);
            addBackgroundHint('preconnect', origin);
          }
        } catch {
          // The second image load below is the final validity check.
        }
        preloadBackgroundCandidate(fallbackUrl, requestVersion);
        return;
      }
      visibleBackgroundImage.value = '';
      loadedBackgroundImage.value = '';
    };
    image.src = url;
  }

  watch(backgroundImageUrl, preloadPublicBackground, { immediate: true });
  onMounted(() => window.addEventListener('nono-color-mode-change', syncResolvedMode));
  onUnmounted(() => {
    window.removeEventListener('nono-color-mode-change', syncResolvedMode);
    removeBackgroundHints();
  });

  return {
    resolvedMode,
    activeTheme,
    sceneIntensity,
    appearance,
    sceneTuning,
    activeBackgroundImage,
    loadedBackgroundImage,
    backgroundStyle,
  };
}
