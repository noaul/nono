import tls from 'node:tls';
import type { Router } from 'express';
import { assetConfigs, getAssetOrThrow } from './assets.js';
import { asyncHandler } from './http.js';
import { requestOutbound, resolvePublicAddress } from './outbound-request.js';
import type { AppContext } from './types.js';
import { toIsoDate, toIsoDateTime } from './utils.js';

const domainConfig = assetConfigs.find((config) => config.type === 'domain')!;
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

type DomainRow = {
  id: number;
  domain_name: string;
  expire_date: string | null;
  next_due_date: string | null;
  rdap_checked_at: string | null;
  ssl_checked_at: string | null;
};

export function registerDomainCheckRoutes(router: Router, context: AppContext): void {
  router.post('/domains/:id/check', asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    getAssetOrThrow(context, domainConfig, id);
    const [rdap, certificate] = await Promise.all([syncDomainRdap(context, id), checkDomainCertificate(context, id)]);
    res.json({ item: getAssetOrThrow(context, domainConfig, id), rdap, certificate });
  }));

  router.post('/domains/check-all', asyncHandler(async (_req, res) => {
    res.json(await runDomainChecks(context, { force: true }));
  }));
}

/**
 * Daily maintenance: refresh certificates every day and registry expiry dates
 * weekly. Bounded so a large portfolio is spread over several runs.
 */
export async function runDomainChecks(context: AppContext, options: { force?: boolean; limit?: number } = {}) {
  const limit = options.limit ?? 40;
  const now = context.now().getTime();
  const rows = context.db.all<DomainRow>(
    "SELECT id, domain_name, expire_date, next_due_date, rdap_checked_at, ssl_checked_at FROM domains WHERE archived_at IS NULL AND status IN ('active', 'paused', 'expired') ORDER BY id"
  );
  const stale = (checkedAt: string | null, maxAgeMs: number) => options.force || !checkedAt || now - Date.parse(checkedAt) > maxAgeMs;
  const rdapTargets = rows.filter((row) => stale(row.rdap_checked_at, 6.5 * 86_400_000)).slice(0, limit);
  const sslTargets = rows.filter((row) => stale(row.ssl_checked_at, 20 * 3_600_000)).slice(0, limit);
  const rdap = [];
  for (const row of rdapTargets) rdap.push({ id: row.id, ...await syncDomainRdap(context, row.id) });
  const certificates = [];
  for (let index = 0; index < sslTargets.length; index += 6) {
    certificates.push(...await Promise.all(sslTargets.slice(index, index + 6).map(async (row) => ({ id: row.id, ...await checkDomainCertificate(context, row.id) }))));
  }
  return { rdap, certificates };
}

/**
 * Reads the registry expiry date over RDAP (via the rdap.org bootstrap
 * redirector) and moves the local expiry forward when the registry is ahead,
 * e.g. after the registrar auto-renewed. It never moves a date backwards.
 */
export async function syncDomainRdap(context: AppContext, id: number) {
  const row = context.db.get<DomainRow>('SELECT * FROM domains WHERE id = ?', [id]);
  if (!row) return { ok: false, error: 'Domain not found' };
  const checkedAt = toIsoDateTime(context.now());
  try {
    const response = await requestOutbound(
      context,
      `https://rdap.org/domain/${encodeURIComponent(row.domain_name.trim().toLowerCase())}`,
      { headers: { Accept: 'application/rdap+json, application/json' } },
      { timeoutMs: 8_000, maxBytes: 512 * 1024, maxRedirects: 3 }
    );
    if (response.status === 404) throw new Error('Not found in the registry (RDAP)');
    if (!response.ok) throw new Error(`RDAP returned HTTP ${response.status}`);
    const payload = await response.json() as { events?: Array<{ eventAction?: string; eventDate?: string }> };
    const expiration = payload.events?.find((event) => event.eventAction === 'expiration')?.eventDate;
    const registryDate = expiration ? toIsoDate(new Date(expiration), 'UTC') : null;
    if (!registryDate || !isoDate.test(registryDate)) throw new Error('The registry did not publish an expiry date');
    const localDate = row.expire_date || row.next_due_date;
    const updated = !localDate || registryDate > localDate;
    if (updated) {
      context.db.run(
        'UPDATE domains SET expire_date = ?, next_due_date = ?, rdap_expire_date = ?, rdap_checked_at = ?, rdap_error = NULL, updated_at = ? WHERE id = ?',
        [registryDate, registryDate, registryDate, checkedAt, checkedAt, id]
      );
    } else {
      context.db.run('UPDATE domains SET rdap_expire_date = ?, rdap_checked_at = ?, rdap_error = NULL WHERE id = ?', [registryDate, checkedAt, id]);
    }
    return { ok: true, registryExpireDate: registryDate, previousExpireDate: localDate ?? null, updated };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'RDAP lookup failed';
    context.db.run('UPDATE domains SET rdap_checked_at = ?, rdap_error = ? WHERE id = ?', [checkedAt, message, id]);
    return { ok: false, error: message };
  }
}

export async function checkDomainCertificate(context: AppContext, id: number) {
  const row = context.db.get<DomainRow>('SELECT * FROM domains WHERE id = ?', [id]);
  if (!row) return { ok: false, error: 'Domain not found' };
  const checkedAt = toIsoDateTime(context.now());
  try {
    const probe = context.certificateProbe ?? ((hostname: string) => readCertificate(hostname, context.privateOutboundHosts ?? []));
    const certificate = await probe(row.domain_name.trim().toLowerCase());
    const expiresAt = toIsoDate(new Date(certificate.validTo), 'UTC');
    context.db.run(
      'UPDATE domains SET ssl_expires_at = ?, ssl_issuer = ?, ssl_checked_at = ?, ssl_error = NULL WHERE id = ?',
      [expiresAt, certificate.issuer, checkedAt, id]
    );
    return { ok: true, expiresAt, issuer: certificate.issuer };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Certificate check failed';
    context.db.run('UPDATE domains SET ssl_checked_at = ?, ssl_error = ? WHERE id = ?', [checkedAt, message.slice(0, 200), id]);
    return { ok: false, error: message };
  }
}

async function readCertificate(hostname: string, allowPrivateHosts: string[]): Promise<{ validTo: string; issuer: string | null }> {
  const address = await resolvePublicAddress(hostname, allowPrivateHosts);
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: address.address,
      port: 443,
      servername: hostname,
      // Expired or mismatched certificates are exactly what we want to report.
      rejectUnauthorized: false,
      timeout: 6_000
    }, () => {
      const certificate = socket.getPeerCertificate();
      socket.end();
      if (!certificate?.valid_to) {
        reject(new Error('No certificate presented'));
        return;
      }
      const issuer = certificate.issuer?.O || certificate.issuer?.CN || null;
      resolve({ validTo: certificate.valid_to, issuer: Array.isArray(issuer) ? issuer[0] ?? null : issuer });
    });
    socket.on('timeout', () => socket.destroy(new Error('TLS connection timed out')));
    socket.on('error', reject);
  });
}
