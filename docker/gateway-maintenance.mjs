import fs from 'node:fs';
import { timingSafeEqual } from 'node:crypto';

export function maintenanceAllowed(request, filename = process.env.NONO_MAINTENANCE_FILE || '/app/backups/.deployment-maintenance.json') {
  let state;
  try {
    state = JSON.parse(fs.readFileSync(filename, 'utf8'));
  } catch (error) {
    // Only absence releases ingress; unreadable or malformed state fails closed.
    return error?.code === 'ENOENT';
  }
  if (request.url === '/readyz' && ['GET', 'HEAD'].includes(request.method) && !request.headers.upgrade) return true;
  const supplied = request.headers['x-nono-maintenance-token'];
  if (typeof state?.token !== 'string' || state.token.length < 32 || typeof supplied !== 'string') return false;
  const expected = Buffer.from(state.token);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
