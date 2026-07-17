import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUIRED_ROUTES = ['/healthz', '/', '/nodesk', '/nomoney/api/health', '/nostar/'];
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

  return { routes, nostarAssets };
}

export function extractScriptSources(html) {
  return [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js(?:\?[^"']*)?)["'][^>]*>/gi)]
    .map((match) => match[1]);
}

async function crawlJavaScriptAssets(entryUrls, baseUrl, fetchImpl, log) {
  const queue = entryUrls.map((url) => ({ url, entry: true }));
  const visited = new Set();
  const expectedOrigin = new URL(baseUrl).origin;

  while (queue.length > 0) {
    const next = queue.shift();
    if (!next || visited.has(next.url)) continue;
    const { url, entry } = next;
    if (visited.size >= 200) throw new Error('NoStar asset graph exceeded 200 JavaScript files');

    const parsed = new URL(url);
    if (parsed.origin !== expectedOrigin || !parsed.pathname.startsWith('/nostar/')) continue;
    const response = await fetchImpl(url, { redirect: 'follow', signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`${parsed.pathname} returned HTTP ${response.status}`);
    const source = await response.text();
    visited.add(url);
    log(`accepted ${parsed.pathname} (${response.status})`);

    const specifiers = extractJavaScriptSpecifiers(source)
      .filter((specifier) => !entry || isDefaultRouteDependency(specifier));
    for (const specifier of specifiers) {
      const resolved = new URL(specifier, url);
      if (resolved.origin === expectedOrigin && resolved.pathname.startsWith('/nostar/') && !visited.has(resolved.toString())) {
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
  return [...source.matchAll(/["'`](\.\.?\/[^"'`]+\.js(?:\?[^"'`]*)?|\/nostar\/[^"'`]+\.js(?:\?[^"'`]*)?)["'`]/g)]
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
    .then((result) => console.log(`deployment accepted: ${result.routes.length} routes, ${result.nostarAssets.length} NoStar assets`))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
