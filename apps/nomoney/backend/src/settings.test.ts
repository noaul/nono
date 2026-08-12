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

  test('brands test email with the active product', async () => {
    const { agent, context } = await setupAgent('yumi');

    await agent.post('/api/settings/test-email').expect(204);

    expect(context.mailer.sent).toEqual([
      expect.objectContaining({
        subject: 'Yumi test email',
        text: 'Yumi email delivery is configured.'
      })
    ]);
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
});
