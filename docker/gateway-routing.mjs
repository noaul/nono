const nodeskPublicPrefixes = ['/images/', '/live2d/', '/music/'];
const nodeskPublicFiles = new Set(['/favicon.png', '/manifest.json']);
const versionedAvatarPath = /^\/images\/avatar-[a-f0-9]{64}\.webp$/i;

export function targetFor(url = '/', ports) {
  const nomoneyPath = stripMountPath(url, '/nomoney');
  if (nomoneyPath !== null) {
    return { name: 'nomoney', port: ports.nomoney, path: nomoneyPath };
  }

  if (url === '/nodesk' || url.startsWith('/nodesk/') || url.startsWith('/nodesk?')) {
    return { name: 'nodesk', port: ports.nodesk, path: url };
  }

  const pathname = url.split('?', 1)[0];
  if (versionedAvatarPath.test(pathname)) {
    return { name: 'nono', port: ports.nono, path: url };
  }
  if (nodeskPublicFiles.has(pathname) || nodeskPublicPrefixes.some(prefix => pathname.startsWith(prefix))) {
    return { name: 'nodesk', port: ports.nodesk, path: `/nodesk${url}` };
  }

  return { name: 'nono', port: ports.nono, path: url };
}

export function isPublicInternalPath(url = '/') {
  let pathname = url.split('?', 1)[0].toLowerCase();
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    return true;
  }
  return ['/nomoney/api/internal', '/api/internal'].some(
    prefix => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Yumi (the VPS + domain manager that used to run as a second NoMoney process under /yumi) is
 * retired: domains moved back into NoMoney and VPS management was dropped. Old bookmarks keep
 * working: `/yumi/domains...` lands on the same NoMoney page (rest of path and query preserved),
 * every other `/yumi` URL — including `/yumi/api/...` — lands on the NoMoney home page.
 */
export function retiredYumiRedirect(url = '/') {
  const rest = stripMountPath(url, '/yumi');
  if (rest === null) return null;
  if (rest === '/domains' || rest.startsWith('/domains/') || rest.startsWith('/domains?')) {
    return `/nomoney${rest}`;
  }
  return '/nomoney/';
}

const signedInApps = ['/nomoney', '/nostar', '/admin'];

/**
 * A page load of an app that needs NoNo sign-in, made without even a session cookie, goes straight
 * to the login page instead of loading an app shell that would bounce anyway. The apps still check
 * the session themselves; this only saves a round trip and a flash of empty UI.
 */
export function loginRedirectFor({ method = 'GET', url = '/', headers = {} } = {}) {
  if (method !== 'GET' && method !== 'HEAD') return null;
  if (!String(headers.accept || '').includes('text/html')) return null;
  const pathname = url.split('?', 1)[0];
  const app = signedInApps.find(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (!app || pathname.startsWith(`${app}/api/`) || pathname.startsWith(`${app}/assets/`)) return null;
  if (/(?:^|;\s*)nono_session=[^;]+/.test(String(headers.cookie || ''))) return null;
  return `/login?next=${encodeURIComponent(url)}`;
}

function stripMountPath(url, mountPath) {
  if (url === mountPath) return '/';
  if (url.startsWith(`${mountPath}?`)) return `/${url.slice(mountPath.length)}`;
  if (url.startsWith(`${mountPath}/`)) return url.slice(mountPath.length) || '/';
  return null;
}

export function isRetiredNodeskPath(url = '/') {
  let pathname;
  try { pathname = decodeURIComponent(url.split('?', 1)[0]).toLowerCase(); }
  catch { return false; }
  return ['/blog', '/blogs', '/nodesk/blog', '/nodesk/blogs', '/nodesk/write', '/nodesk/rss.xml']
    .some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
