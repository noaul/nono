import { describe, expect, setupAgent, test } from './test-utils.js';
import { createTestContext } from './test-utils.js';
import { getSettings } from './settings.js';

describe('settings APIs', () => {
  test('uses product-specific WebDAV backup filenames by default', async () => {
    const noMoney = await createTestContext('nomoney');
    const yumi = await createTestContext('yumi');

    expect(getSettings(noMoney).webdavPath).toBe('nomoney-backup.json.enc');
    expect(getSettings(yumi).webdavPath).toBe('yumi-backup.json.enc');
  });

  test('redacts stored WebDAV secrets and preserves them when secret fields are blank', async () => {
    const { agent, context } = await setupAgent();

    await agent.put('/api/settings').send({
      webdavUrl: 'https://dav.example.com/files/owner',
      webdavUsername: 'owner',
      webdavPassword: 'webdav-secret',
      webdavEncryptionKey: 'backup-secret'
    }).expect(200);

    const firstRead = await agent.get('/api/settings');
    expect(firstRead.body.settings).toMatchObject({
      webdavPassword: '',
      webdavPasswordSet: true,
      webdavEncryptionKey: '',
      webdavEncryptionKeySet: true
    });

    await agent.put('/api/settings').send({
      webdavUrl: 'https://dav.example.com/files/owner-renamed',
      webdavPassword: '',
      webdavEncryptionKey: ''
    }).expect(200);

    const rows = context.db.all<{ key: string; value: string }>(
      "SELECT key, value FROM settings WHERE key IN ('webdavPassword', 'webdavEncryptionKey') ORDER BY key"
    );
    const stored = Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value)]));
    expect(stored.webdavEncryptionKey).toMatch(/^enc:v1:/);
    expect(stored.webdavPassword).toMatch(/^enc:v1:/);
    expect(JSON.stringify(stored)).not.toContain('backup-secret');
    expect(JSON.stringify(stored)).not.toContain('webdav-secret');
  });

  test('rejects an unknown time zone and keeps working with one stored before validation', async () => {
    const { agent, context } = await setupAgent();

    const rejected = await agent.put('/api/settings').send({ timezone: 'Asia/Shangai' }).expect(400);
    expect(rejected.body.error).toMatchObject({ code: 'VALIDATION_ERROR', message: 'Invalid request body: timezone' });
    expect(rejected.body.error.details.fieldErrors.timezone[0]).toContain('Unknown time zone');
    expect(getSettings(context).timezone).toBe('Asia/Shanghai');

    await agent.put('/api/settings').send({ timezone: 'Europe/Berlin' }).expect(200);
    expect(getSettings(context).timezone).toBe('Europe/Berlin');

    context.db.run(`INSERT INTO settings (key, value) VALUES ('timezone', '"Asia/Shangai"')
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`);
    expect(getSettings(context).timezone).toBe('Asia/Shanghai');
    await agent.post('/api/reminders/run-now').expect(200);
  });
});
