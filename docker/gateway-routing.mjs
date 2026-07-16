const blogPublicPrefixes = ['/blogs/', '/images/', '/live2d/', '/music/'];
const blogPublicFiles = new Set(['/favicon.png', '/manifest.json']);

export function targetFor(url = '/', ports) {
  const nomoneyPath = stripMountPath(url, '/nomoney');
  if (nomoneyPath !== null) {
    return { name: 'nomoney', port: ports.nomoney, path: nomoneyPath };
  }

  if (url === '/nodesk' || url.startsWith('/nodesk/') || url.startsWith('/nodesk?')) {
    return { name: 'blog', port: ports.blog, path: url };
  }

  const pathname = url.split('?', 1)[0];
  if (blogPublicFiles.has(pathname) || blogPublicPrefixes.some(prefix => pathname.startsWith(prefix))) {
    return { name: 'blog', port: ports.blog, path: `/nodesk${url}` };
  }

  return { name: 'nono', port: ports.nono, path: url };
}

function stripMountPath(url, mountPath) {
  if (url === mountPath) return '/';
  if (url.startsWith(`${mountPath}?`)) return `/${url.slice(mountPath.length)}`;
  if (url.startsWith(`${mountPath}/`)) return url.slice(mountPath.length) || '/';
  return null;
}
