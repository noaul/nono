import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('maintenance blocks traffic and upgrades, permits authenticated acceptance and read-only readiness', async () => {
  const { maintenanceAllowed } = await import('../docker/gateway-maintenance.mjs');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nono-maintenance-test-'));
  const file = path.join(directory, 'maintenance.json');
  const request = { url: '/api/admin/links', method: 'POST', headers: {} };
  try {
    assert.equal(maintenanceAllowed(request, file), true);
    fs.writeFileSync(file, JSON.stringify({ token: 'a'.repeat(64) }));
    assert.equal(maintenanceAllowed(request, file), false);
    assert.equal(maintenanceAllowed({ ...request, method: 'GET', url: '/readyz' }, file), true);
    assert.equal(maintenanceAllowed({ ...request, url: '/readyz' }, file), false);
    assert.equal(maintenanceAllowed({ ...request, method: 'GET', url: '/readyz', headers: { upgrade: 'websocket' } }, file), false);
    assert.equal(maintenanceAllowed({ ...request, headers: { 'x-nono-maintenance-token': 'bad' } }, file), false);
    assert.equal(maintenanceAllowed({ ...request, headers: { 'x-nono-maintenance-token': 'a'.repeat(64) } }, file), true);
    fs.writeFileSync(file, '{broken');
    assert.equal(maintenanceAllowed(request, file), false);
    fs.writeFileSync(file, '{}');
    assert.equal(maintenanceAllowed(request, file), false);
    fs.unlinkSync(file);
    assert.equal(maintenanceAllowed(request, file), true);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
