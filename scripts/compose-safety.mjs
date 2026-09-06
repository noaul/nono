import { randomBytes } from 'node:crypto';

export const BACKUP_CLI = '/app/nono/packages/server/dist/cli/backup.js';
export const MAINTENANCE_FILE = '/app/backups/.deployment-maintenance.json';
export const BACKUP_ID_PATTERN = /^\d{8}T\d{6}Z(?:-[a-f0-9]{6})?$/;

export async function inspectImage(run, options) {
  const id = (await run('docker', ['compose', 'ps', '-a', '-q', 'app'], { ...options, capture: true })).stdout.trim();
  if (!id) return '';
  const image = (await run('docker', ['inspect', '--format', '{{.Image}}', id], { ...options, capture: true })).stdout.trim();
  if (!image.startsWith('sha256:')) throw new Error('Cannot determine immutable application image');
  return image;
}

export function backup(run, options, args, safety = false) {
  return run('docker', ['compose', 'run', '--rm', '--no-deps', '-T', ...(safety ? ['--env', 'BACKUP_DIR=/app/backups/deployment-safety'] : []), '--entrypoint', 'node', 'app', BACKUP_CLI, ...args], { ...options, capture: true });
}

export async function snapshot(run, options) {
  // The historical CLI's create command runs retention. Call the stable service
  // directly so producing a rollback snapshot never deletes older backups.
  const script = "import('/app/nono/packages/server/dist/services/backup.service.js').then(async ({createBackupServiceFromEnv}) => { const backup = await createBackupServiceFromEnv(process.env.NODESK_CONTENT_DIR || '/app/nodesk-content').create(); console.log(JSON.stringify(backup)); }).catch(error => { console.error(error); process.exitCode = 1; })";
  const output = await run('docker', ['compose', 'run', '--rm', '--no-deps', '-T', '--env', 'BACKUP_DIR=/app/backups/deployment-safety', '--entrypoint', 'node', 'app', '-e', script], { ...options, capture: true });
  let id;
  try { id = JSON.parse(output.stdout.trim().split(/\r?\n/).at(-1)).id; }
  catch { throw new Error('Safety backup returned invalid JSON'); }
  if (!BACKUP_ID_PATTERN.test(id || '')) throw new Error('Safety backup returned invalid identifier');
  await backup(run, options, ['verify', '--id', id], true);
  return id;
}

export function safetyContext({ cwd, baseUrl, run, image, commit }) {
  const token = randomBytes(32).toString('hex');
  const publicOptions = { cwd, env: { ...process.env, NONO_APP_IMAGE: image, ...(commit ? { NONO_BUILD_COMMIT: commit } : {}) } };
  const candidateUrl = new URL(baseUrl);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(candidateUrl.hostname)) throw new Error('Deployment base URL must be loopback');
  const candidatePort = candidateUrl.port === '18188' ? '18189' : '18188';
  candidateUrl.hostname = '127.0.0.1';
  candidateUrl.port = candidatePort;
  const offlineOptions = { ...publicOptions, env: { ...publicOptions.env, PORT: `127.0.0.1:${candidatePort}` } };
  const headers = { 'x-nono-maintenance-token': token };
  const file = async (remove, options = publicOptions) => {
    const script = remove
      ? `require('node:fs').unlinkSync(${JSON.stringify(MAINTENANCE_FILE)})`
      : `require('node:fs').writeFileSync(${JSON.stringify(MAINTENANCE_FILE)},${JSON.stringify(JSON.stringify({ token }))},{mode:0o600})`;
    await run('docker', ['compose', 'run', '--rm', '--no-deps', '-T', '--entrypoint', 'node', 'app', '-e', script], options);
  };
  const start = (options) => run('docker', ['compose', 'up', '-d', '--no-deps', '--force-recreate', 'app'], options);
  const stop = (options = publicOptions) => run('docker', ['compose', 'stop', 'app'], options);
  return { publicOptions, offlineOptions, candidateUrl: candidateUrl.origin, headers, file, start, stop };
}

export async function assertMaintenance(baseUrl, fetchImpl = fetch, { attempts = 1, wait } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(new URL('/healthz', baseUrl), { redirect: 'manual', signal: AbortSignal.timeout(10000) });
    } catch (error) {
      // Detached Compose recreation returns before the gateway is listening.
      // Only transport failures are retryable: an HTTP response proves startup.
      if (attempt === attempts) throw error;
      await wait(5000);
      continue;
    }
    if (response.status !== 503) throw new Error('Public ingress maintenance protection is not active');
    return;
  }
  throw new Error('Public ingress maintenance check exhausted without a response');
}
