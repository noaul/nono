import { describe, expect, it, vi } from 'vitest';
import { createBackupModuleAdapters } from '../src/services/backup-module-adapters.js';

describe('backup module adapters', () => {
  it('exports and restores NoMoney and Yumi through protected product-scoped internal endpoints', async () => {
    const fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if ((init?.method || 'GET') === 'GET') {
        return new Response(JSON.stringify({ version: 2, product: url.includes(':2040') ? 'yumi' : 'nomoney', rows: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ ok: true, counts: {} }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const adapters = createBackupModuleAdapters({
      prisma: {} as never,
      encryptionKey: '1'.repeat(64),
      nodeskContentDir: 'unused',
      internalToken: 'internal-secret',
      noMoneyPort: 2030,
      yumiPort: 2040,
      fetch,
    });

    const noMoney = await adapters.nomoney.export(1);
    const yumi = await adapters.yumi.export(1);
    await adapters.nomoney.validate(noMoney);
    await adapters.yumi.restore(1, yumi);

    expect(JSON.parse(noMoney.toString())).toMatchObject({ kind: 'nono.product-backup', module: 'nomoney' });
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:2030/api/internal/backup', expect.objectContaining({
      headers: expect.objectContaining({ 'x-nono-internal-token': 'internal-secret' }),
    }));
    expect(fetch).toHaveBeenCalledWith('http://127.0.0.1:2040/api/internal/backup/restore', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('"product":"yumi"'),
    }));
  });

  it('rejects a product payload selected for the wrong module before issuing a restore request', async () => {
    const fetch = vi.fn();
    const adapters = createBackupModuleAdapters({
      prisma: {} as never,
      encryptionKey: '1'.repeat(64),
      nodeskContentDir: 'unused',
      internalToken: 'internal-secret',
      fetch,
    });
    const wrong = Buffer.from(JSON.stringify({
      kind: 'nono.product-backup',
      version: 1,
      module: 'yumi',
      payload: { version: 2, product: 'yumi' },
    }));

    await expect(adapters.nomoney.restore(1, wrong)).rejects.toThrow('NoMoney backup');
    expect(fetch).not.toHaveBeenCalled();
  });
});
