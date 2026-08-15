import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUIRED_ROUTES = ['/readyz', '/', '/nodesk', '/nomoney/api/readyz', '/yumi/api/readyz', '/yumi/', '/nostar/', '/clipper/'];
const REQUIRED_ASSETS = ['/nodesk/images/nodesk-ambient-wallpaper.png'];
const REQUIRED_NOSTAR_CHUNKS = ['RepositoriesView-', 'ReadmeModal-', 'RepositoryEditModal-'];

export async function acceptDeployment({
  baseUrl = 'http://127.0.0.1:8188',
  fetchImpl = fetch,
  log = console.log,
} = {}) {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  const routes = [];

  for (const routePath of REQUIRED_ROUTES) {
    const url = `${normalizedBaseUrl}${routePath}`;
    const response = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`${routePath} returned HTTP ${response.status}`);
    routes.push({ path: routePath, status: response.status });
    log(`accepted ${routePath} (${response.status})`);
  }

  const assets = [];
  for (const assetPath of REQUIRED_ASSETS) {
    const url = `${normalizedBaseUrl}${assetPath}`;
    const response = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`${assetPath} returned HTTP ${response.status}`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().startsWith('image/')) {
      throw new Error(`${assetPath} returned unexpected content type ${contentType || '(missing)'}`);
    }
    const signature = new Uint8Array(await response.arrayBuffer()).subarray(0, 8);
    if (!hasPngSignature(signature)) {
      throw new Error(`${assetPath} did not contain a valid PNG signature`);
    }
    assets.push({ path: assetPath, status: response.status });
    log(`accepted ${assetPath} (${response.status})`);
  }

  const nostarUrl = `${normalizedBaseUrl}/nostar/`;
  const htmlResponse = await fetchImpl(nostarUrl, { redirect: 'follow', signal: AbortSignal.timeout(30_000) });
  if (!htmlResponse.ok) throw new Error(`/nostar/ returned HTTP ${htmlResponse.status}`);
  const html = await htmlResponse.text();
  const entrySources = extractScriptSources(html).map((source) => new URL(source, nostarUrl).toString());
  if (entrySources.length === 0) throw new Error('NoStar HTML did not contain a JavaScript entry');

  const nostarAssets = await crawlJavaScriptAssets(entrySources, normalizedBaseUrl, fetchImpl, log);
  for (const requiredChunk of REQUIRED_NOSTAR_CHUNKS) {
    if (!nostarAssets.some((url) => path.basename(new URL(url).pathname).includes(requiredChunk))) {
      throw new Error(`NoStar lazy chunk was not reachable: ${requiredChunk}`);
    }
  }

  const clipperUrl = `${normalizedBaseUrl}/clipper/`;
  const clipperHtmlResponse = await fetchImpl(clipperUrl, { redirect: 'follow', signal: AbortSignal.timeout(30_000) });
  if (!clipperHtmlResponse.ok) throw new Error(`/clipper/ returned HTTP ${clipperHtmlResponse.status}`);
  const clipperHtml = await clipperHtmlResponse.text();
  const clipperEntries = extractScriptSources(clipperHtml).map((source) => new URL(source, clipperUrl).toString());
  if (clipperEntries.length === 0) throw new Error('Clipper HTML did not contain a JavaScript entry');

  // Clipper ships a single bundle, so a reachable entry is the whole contract here.
  const clipperAssets = await crawlJavaScriptAssets(clipperEntries, normalizedBaseUrl, fetchImpl, log, '/clipper/');

  return { routes, assets, nostarAssets, clipperAssets };
}

export function extractScriptSources(html) {
  return [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js(?:\?[^"']*)?)["'][^>]*>/gi)]
    .map((match) => match[1]);
}

function hasPngSignature(bytes) {
  const expected = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return bytes.length >= expected.length && expected.every((byte, index) => bytes[index] === byte);
}

async function crawlJavaScriptAssets(entryUrls, baseUrl, fetchImpl, log, prefix = '/nostar/') {
  const queue = entryUrls.map((url) => ({ url, entry: true }));
  const visited = new Set();
  const expectedOrigin = new URL(baseUrl).origin;

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || visited.has(next.url)) continue;
    const { url, entry } = next;
    if (visited.size >= 200) throw new Error(`${prefix} asset graph exceeded 200 JavaScript files`);

    const parsed = new URL(url);
    if (parsed.origin !== expectedOrigin || !parsed.pathname.startsWith(prefix)) continue;
    const response = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`${parsed.pathname} returned HTTP ${response.status}`);
    const source = await response.text();
    visited.add(url);
    log(`accepted ${parsed.pathname} (${response.status})`);

    const specifiers = extractJavaScriptSpecifiers(source)
      .filter((specifier) => !entry || isDefaultRouteDependency(specifier));
    for (const specifier of specifiers) {
      const resolved = new URL(specifier, url);
      if (resolved.origin === expectedOrigin && resolved.pathname.startsWith(prefix) && !visited.has(resolved.toString())) {
        queue.push({ url: resolved.toString(), entry: false });
      }
    }
  }

  return [...visited];
}

function isDefaultRouteDependency(specifier) {
  return !/(?:LoginScreen|GistView|ReleaseTimeline|ForkTimeline|DiscoveryView|SettingsPanel)-/.test(specifier);
}

function extractJavaScriptSpecifiers(source) {
  return [...source.matchAll(/["'`](\.\.?\/[^"'`]+\.js(?:\?[^"'`]*)?|\/(?:nostar|clipper)\/[^"'`]+\.js(?:\?[^"'`]*)?)["'`]/g)]
    .map((match) => match[1]);
}

function parseCliArgs(argv) {
  let baseUrl = 'http://127.0.0.1:8188';
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--base-url') baseUrl = argv[++index];
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return { baseUrl };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  acceptDeployment(parseCliArgs(process.argv.slice(2)))
    .then((result) => console.log(`deployment accepted: ${result.routes.length} routes, ${result.assets.length} required assets, ${result.nostarAssets.length} NoStar assets, ${result.clipperAssets.length} Clipper assets`))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
