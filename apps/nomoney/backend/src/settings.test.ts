import { describe, expect, setupAgent, test } from './test-utils.js';

describe('settings APIs', () => {
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
    expect(Object.fromEntries(rows.map((row) => [row.key, JSON.parse(row.value)]))).toEqual({
      webdavEncryptionKey: 'backup-secret',
      webdavPassword: 'webdav-secret'
    });
  });
});
