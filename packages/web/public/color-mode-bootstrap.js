(() => {
  const storageKey = 'nono:color-mode';
  const root = document.documentElement;

  function normalize(value) {
    return value === 'light' || value === 'dark' ? value : 'system';
  }

  function resolve(preference) {
    if (preference !== 'system') return preference;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  let preference = 'system';
  try {
    preference = normalize(window.localStorage.getItem(storageKey));
  } catch {
    // Storage can be unavailable in hardened or private browsing contexts.
  }

  const mode = resolve(preference);
  root.dataset.colorMode = mode;
  root.dataset.colorModePreference = preference;
  root.style.colorScheme = mode;
})();
