// Applies the shared NoNo colour mode (`nono:color-mode`) before first paint, so a dark-mode
// visitor never sees a light flash while NoStar boots. src/utils/colorMode.ts takes over once
// the app mounts. This is an external file because the NoNo CSP (script-src 'self') blocks
// inline scripts.
(() => {
  let preference = null;
  try {
    preference = window.localStorage.getItem('nono:color-mode');
  } catch {
    // Storage can be unavailable in hardened or private browsing contexts.
  }
  const dark = preference === 'dark'
    || (preference !== 'light' && !!window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const mode = dark ? 'dark' : 'light';
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.dataset.colorMode = mode;
  root.style.colorScheme = mode;
})();
