import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildApp } from '../../packages/server/src/app.ts';
import { createPrismaClient } from '../../packages/server/src/services/prisma-client.ts';
import { createPrismaRepository } from '../../packages/server/src/services/prisma.repository.ts';
import { createPrismaMobileStore } from '../../packages/server/src/services/mobile-store.prisma.ts';
import { createMobileDeviceService } from '../../packages/server/src/services/mobile-devices.service.ts';
import { createMobilePushOutbox } from '../../packages/server/src/services/mobile-push-outbox.service.ts';
import { DISABLE_RESTORED_MOBILE_DEVICES_SQL } from '../../packages/server/src/services/backup.service.ts';

const integrationKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

// Explicit disposable targets only. This suite resets public in the selected database.
const connection = process.env.NONO_INTEGRATION_DATABASE_URL;
if (!connection || process.env.NONO_INTEGRATION_ALLOW_RESET !== '1') throw new Error('Set a disposable NONO_INTEGRATION_DATABASE_URL and NONO_INTEGRATION_ALLOW_RESET=1');
const url = new URL(connection);
if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || !/^\/nono_integration_[a-z0-9_]+$/.test(url.pathname) || url.search || url.hash) {
  throw new Error('Integration database must be loopback, named nono_integration_*, with no query or fragment');
}
process.env.DATABASE_URL = connection;
process.env.NODE_ENV = 'test';
const root = path.resolve(import.meta.dirname, '../..');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'nono-postgres-integration-'));
const schema = path.join(root, 'packages/server/prisma/schema.prisma');
const prisma = createPrismaClient(connection);
function command(executable: string, args: string[], env = process.env) {
  const result = spawnSync(executable, args, { cwd: root, env, encoding: 'utf8', timeout: 120_000 });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
}
function migrate(file = schema) {
  command(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy', '--config', 'packages/server/prisma.config.ts', '--schema', file]);
}
async function reset() {
  await prisma.$executeRawUnsafe('DROP SCHEMA public CASCADE');
  await prisma.$executeRawUnsafe('CREATE SCHEMA public');
}
async function assertRetired() {
  const tables = await prisma.$queryRawUnsafe<Array<{ name: string }>>(`SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('Clip','ClipTag','ClipTagOnClip','ClipHighlight')`);
  assert.deepEqual(tables, []);
}
try {
  await reset();
  migrate();
  await assertRetired();
  console.log('PASS fresh PostgreSQL migrations');

  await reset();
  await fs.copyFile(schema, path.join(temporary, 'schema.prisma'));
  await fs.cp(path.dirname(schema) + '/migrations', path.join(temporary, 'migrations'), { recursive: true, filter: source => !source.includes('20260906000000_retire_clipper') });
  migrate(path.join(temporary, 'schema.prisma'));
  const user = await prisma.user.create({ data: { username: 'historic', email: 'historic@example.test', displayName: 'Historic', passwordHash: 'not-a-login', role: 'user' } });
  const folder = await prisma.folder.create({ data: { userId: user.id, name: 'Keep' } });
  const bookmark = await prisma.link.create({ data: { folderId: folder.id, name: 'Keep', url: 'https://example.test/keep' } });
  await prisma.apiToken.create({ data: { userId: user.id, name: 'Legacy', tokenHash: 'integration-only', tokenPrefix: 'test', scopes: ['bookmarks:read', 'clips:read', 'clips:write'] } });
  await prisma.appConfig.upsert({ where: { id: 1 }, update: { settings: { keep: true, navigationEntries: [{ id: 'clipper', url: '/clipper/' }, { id: 'custom', url: 'https://example.test/' }] } }, create: { id: 1, settings: { keep: true, navigationEntries: [{ id: 'clipper', url: '/clipper/' }, { id: 'custom', url: 'https://example.test/' }] } } });
  await prisma.$executeRawUnsafe(`INSERT INTO "Clip" ("userId","linkId","url","canonicalUrl","title","domain","excerpt","contentHtml","contentMd","contentHash","extractor","updatedAt") VALUES (${user.id},${bookmark.id},'https://example.test/clip','https://example.test/clip','Delete','example.test','old','<p>old</p>','old','hash','test',NOW())`);
  await prisma.trashItem.create({ data: { userId: user.id, kind: 'clip', entityId: 1, label: 'Delete', payload: { clip: { contentMd: 'old' } } } });
  await prisma.trashItem.create({ data: { userId: user.id, kind: 'bookmark', entityId: bookmark.id, label: 'Keep', payload: { link: { id: bookmark.id }, linkedClipIds: [1] } } });
  migrate();
  await assertRetired();
  assert.equal(await prisma.link.count(), 1);
  assert.deepEqual((await prisma.apiToken.findFirstOrThrow()).scopes, ['bookmarks:read']);
  assert.equal(await prisma.trashItem.count({ where: { kind: 'clip' } }), 0);
  assert.deepEqual((await prisma.trashItem.findFirstOrThrow()).payload, { link: { id: bookmark.id } });
  assert.deepEqual((await prisma.appConfig.findUniqueOrThrow({ where: { id: 1 } })).settings, { keep: true, navigationEntries: [{ id: 'custom', url: 'https://example.test/' }] });
  console.log('PASS upgrade deletes only clipping tables, scopes and trash payloads');

  await reset();
  migrate();
  const app = await buildApp({ prisma, sessionSecret: 'integration-only-session-secret-long-enough', nodeskContentDir: temporary });
  app.addHook('onError', async (_request, _reply, error) => { if (!error.statusCode || error.statusCode >= 500) console.error(error); });
  try {
    const setup = await app.inject({ method: 'POST', url: '/api/auth/setup', payload: { username: 'owner', email: 'owner@example.test', displayName: 'Owner', password: 'IntegrationOnly2026!' } });
    assert.equal(setup.statusCode, 200, setup.body);
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'owner', password: 'IntegrationOnly2026!' } });
    assert.equal(login.statusCode, 200, login.body);
    const cookie = login.cookies.map(value => `${value.name}=${value.value}`).join('; ');
    assert.ok(cookie.includes('nono_session='));
    const headers = { cookie };
    const other = await prisma.user.create({ data: { username: 'other', email: 'other@example.test', displayName: 'Other', passwordHash: 'not-a-login', role: 'user' } });
    const foreignFolder = await prisma.folder.create({ data: { userId: other.id, name: 'Private' } });
    const foreignLink = await prisma.link.create({ data: { folderId: foreignFolder.id, name: 'Secret', url: 'https://example.test/private' } });
    const folderResponse = await app.inject({ method: 'POST', url: '/api/admin/folders', headers, payload: { name: 'Inbox' } });
    assert.equal(folderResponse.statusCode, 200, folderResponse.body);
    const link = await app.inject({ method: 'POST', url: '/api/admin/links', headers, payload: { folderId: folderResponse.json().data.id, name: 'Bookmark', url: 'https://example.test/saved' } });
    assert.equal(link.statusCode, 200, link.body);
    const denied = await app.inject({ method: 'DELETE', url: `/api/admin/links/${foreignLink.id}`, headers });
    assert.equal(denied.statusCode, 404, denied.body);
    assert.ok(await prisma.link.findUnique({ where: { id: foreignLink.id } }));
    const deleted = await app.inject({ method: 'DELETE', url: `/api/admin/links/${link.json().data.id}`, headers });
    assert.equal(deleted.statusCode, 200, deleted.body);
    const trash = (await app.inject({ method: 'GET', url: '/api/admin/trash', headers })).json().data;
    assert.equal(trash.items.length, 1);
    assert.equal(trash.total, 1);
    const restored = await app.inject({ method: 'POST', url: `/api/admin/trash/${trash.items[0].id}/restore`, headers });
    assert.equal(restored.statusCode, 200, restored.body);
    const token = await app.inject({ method: 'POST', url: '/api/admin/tokens', headers, payload: { name: 'Test' } });
    assert.equal(token.statusCode, 200, token.body);
    assert.deepEqual(token.json().data.scopes, ['bookmarks:read', 'bookmarks:write', 'ai:analyze']);
    const blocked = await app.inject({ method: 'GET', url: '/api/admin/backup-center/webdav/config', headers: { authorization: `Bearer ${token.json().data.token}` } });
    assert.equal(blocked.statusCode, 403);
    for (const url of ['/clipper/', '/api/clipper/clips', '/api/clipper/search?q=old']) {
      assert.equal((await app.inject({ method: 'GET', url, headers })).statusCode, 404);
    }
    console.log('PASS real database setup, cookie auth, tenant isolation, bookmark trash/restore, token scopes and retired APIs');

    {
      const folderId = folderResponse.json().data.id;
      const save = async (payload: Record<string, unknown>) => {
        const response = await app.inject({ method: 'POST', url: '/api/admin/links', headers, payload: { folderId, ...payload } });
        assert.equal(response.statusCode, 200, response.body);
        return response.json().data;
      };
      const upper = await save({ name: 'Upper', url: 'https://example.test/Case', tags: ['Rust', 'rust', ' Reading '], readLater: true });
      assert.deepEqual(upper.tags, ['Rust', 'Reading']);
      const lower = await save({ name: 'Lower', url: 'https://example.test/case', tags: ['Rust'] });
      assert.notEqual(lower.id, upper.id, 'path case makes a different bookmark');
      assert.equal((await save({ name: 'Again', url: 'https://EXAMPLE.test/Case' })).id, upper.id, 'host case does not');
      const tags = (await app.inject({ method: 'GET', url: '/api/admin/tags', headers })).json().data;
      assert.deepEqual(tags, [{ name: 'Rust', count: 2 }, { name: 'Reading', count: 1 }]);
      const renamed = await app.inject({ method: 'PUT', url: '/api/admin/tags/rename', headers, payload: { from: 'Rust', to: 'Reading' } });
      assert.equal(renamed.json().data.renamed, 2);
      assert.deepEqual((await prisma.link.findUniqueOrThrow({ where: { id: upper.id } })).tags, ['Reading'], 'rename merges into an existing tag');
      const reading = (await app.inject({ method: 'GET', url: '/api/admin/reading', headers })).json().data;
      assert.deepEqual([reading.total, reading.unread, reading.items[0].id], [1, 1, upper.id]);
      await app.inject({ method: 'DELETE', url: `/api/admin/links/${upper.id}`, headers });
      const trashed = (await app.inject({ method: 'GET', url: '/api/admin/trash', headers })).json().data.items[0];
      assert.equal((await app.inject({ method: 'POST', url: `/api/admin/trash/${trashed.id}/restore`, headers })).statusCode, 200);
      const back = await prisma.link.findUniqueOrThrow({ where: { id: upper.id } });
      assert.deepEqual(back.tags, ['Reading']);
      assert.ok(back.readLaterAt instanceof Date, 'reading state survives trash');
      const bearer = token.json().data.token;
      assert.equal((await app.inject({ method: 'GET', url: '/api/admin/tags', headers: { authorization: `Bearer ${bearer}` } })).statusCode, 200);
      assert.ok((await prisma.apiToken.findFirstOrThrow({ where: { id: token.json().data.id } })).lastUsedAt);
    }
    console.log('PASS tags, reading inbox, exact URL duplicates and token last-used on PostgreSQL');

    // Import runs as one transaction with createMany batches; prove it against real PostgreSQL.
    const before = { folders: await prisma.folder.count(), links: await prisma.link.count() };
    const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1><DL><p>
      <DT><H3>Imported</H3><DL><p>
        <DT><A HREF="https://import.example/one">One</A>
        <DT><H3>Nested</H3><DL><p><DT><A HREF="https://import.example/two">Two</A></DL><p>
      </DL><p>
    </DL><p>`;
    const imported = await app.inject({ method: 'POST', url: '/api/admin/bookmarks/import', headers, payload: { html } });
    assert.equal(imported.statusCode, 200, imported.body);
    assert.equal(await prisma.folder.count(), before.folders + 2);
    assert.equal(await prisma.link.count(), before.links + 2);
    const nested = await prisma.folder.findFirst({ where: { name: 'Nested' }, include: { parent: true } });
    assert.equal(nested?.parent?.name, 'Imported');
    console.log('PASS bookmark import commits nested folders and links in one transaction');

    // Mobile share saves: the (userId, requestId) unique key must hold under real concurrency.
    const shareFolder = folderResponse.json().data.id;
    const share = { requestId: 'c8d1e2f3-0a4b-4c5d-8e6f-7a8b9c0d1e2f', folderId: shareFolder, name: 'Shared', url: 'https://share.example/concurrent' };
    const linksBeforeShare = await prisma.link.count();
    const concurrent = await Promise.all(Array.from({ length: 6 }, () => app.inject({ method: 'POST', url: '/api/mobile/bookmarks', headers, payload: share })));
    for (const response of concurrent) assert.equal(response.statusCode, 200, response.body);
    assert.equal(new Set(concurrent.map(response => response.json().data.id)).size, 1);
    const retried = await app.inject({ method: 'POST', url: '/api/mobile/bookmarks', headers, payload: share });
    assert.equal(retried.json().data.id, concurrent[0].json().data.id);
    assert.equal(await prisma.link.count(), linksBeforeShare + 1);
    assert.equal(await prisma.mobileBookmarkRequest.count({ where: { requestId: share.requestId } }), 1);
    const conflict = await app.inject({ method: 'POST', url: '/api/mobile/bookmarks', headers, payload: { ...share, name: 'Changed' } });
    assert.equal(conflict.statusCode, 409, conflict.body);
    const foreign = await app.inject({ method: 'POST', url: '/api/mobile/bookmarks', headers, payload: { ...share, requestId: 'd9e2f3a4-1b5c-4d6e-9f7a-8b9c0d1e2f3a', folderId: foreignFolder.id } });
    assert.equal(foreign.statusCode, 404, foreign.body);
    assert.equal(await prisma.mobileBookmarkRequest.count(), 1);
    assert.equal(await prisma.link.count(), linksBeforeShare + 1);
    console.log('PASS concurrent mobile saves with one requestId create exactly one bookmark');
  } finally { await app.close(); }

  // Phone bindings: session deletion must reach push eligibility through the real foreign keys.
  {
    const repo = createPrismaRepository(prisma);
    const store = createPrismaMobileStore(prisma);
    const devices = createMobileDeviceService({ store, encryptionKey: integrationKey });
    const owner = await prisma.user.create({ data: { username: 'phone-owner', email: 'phone@example.test', displayName: 'Phone', passwordHash: 'not-a-login', role: 'user' } });
    const intruder = await prisma.user.create({ data: { username: 'phone-intruder', email: 'intruder@example.test', displayName: 'Intruder', passwordHash: 'not-a-login', role: 'user' } });
    const expiresAt = new Date(Date.now() + 86_400_000);
    const phone = await repo.createSession(owner.id, { expiresAt });
    const desktop = await repo.createSession(owner.id, { expiresAt });
    const input = { installationId: 'integration-install', provider: 'xiaomi' as const, registrationId: 'integration-regid', appVersion: '0.2.0' };
    const bound = await devices.register(owner.id, phone.id, input);
    const rotated = await devices.register(owner.id, phone.id, { ...input, registrationId: 'integration-regid-2' });
    assert.equal(rotated.deviceId, bound.deviceId);
    assert.equal(await prisma.mobileDevice.count(), 1);
    assert.equal(devices.decryptRegistration(await prisma.mobileDevice.findUniqueOrThrow({ where: { id: bound.deviceId } })), 'integration-regid-2');
    const intruderSession = await repo.createSession(intruder.id, { expiresAt });
    await assert.rejects(devices.register(intruder.id, intruderSession.id, { ...input, registrationId: 'integration-regid-2' }), (error: any) => error.statusCode === 409);
    assert.deepEqual((await devices.getEligibleDevices(owner.id, new Date())).map(item => item.id), [bound.deviceId]);

    await repo.deleteOtherSessions(owner.id, desktop.id);
    const orphaned = await prisma.mobileDevice.findUniqueOrThrow({ where: { id: bound.deviceId } });
    assert.equal(orphaned.sessionId, null, 'deleting the session sets MobileDevice.sessionId to NULL');
    assert.deepEqual(await devices.getEligibleDevices(owner.id, new Date()), []);
    assert.deepEqual(await store.eligibleDeviceUserIds(new Date()), []);

    const again = await repo.createSession(owner.id, { expiresAt });
    await devices.register(owner.id, again.id, input);
    assert.equal((await devices.getEligibleDevices(owner.id, new Date())).length, 1);
    assert.deepEqual(await devices.getEligibleDevices(owner.id, new Date(expiresAt.getTime() + 1)), [], 'an expired session is not eligible');
    const pendingEvent = (await store.upsertEvent({ userId: owner.id, source: 'links', eventId: 'restore-event', severity: 'warning', title: 'Restored', targetPath: '/admin/links', occurredAt: new Date(), expiresAt })).event;
    await store.createAttempts(pendingEvent, [bound.deviceId], new Date());
    await prisma.$executeRawUnsafe(DISABLE_RESTORED_MOBILE_DEVICES_SQL);
    assert.equal((await store.findAttempt(pendingEvent.id, bound.deviceId))?.status, 'canceled', 'restoring cancels stale outbox work');
    assert.equal((await prisma.mobileDevice.findUniqueOrThrow({ where: { id: bound.deviceId } })).disabledReason, 'restored');
    assert.deepEqual(await devices.getEligibleDevices(owner.id, new Date()), [], 'restored devices come back disabled');
    await devices.register(owner.id, again.id, input);
    assert.equal((await devices.getEligibleDevices(owner.id, new Date())).length, 1, 're-registering re-enables a restored device');

    assert.equal((await store.findAttempt(pendingEvent.id, bound.deviceId))?.status, 'canceled', 'rebind cannot revive restored queue');
    let sends = 0;
    const outbox = createMobilePushOutbox({ store, devices, provider: { name: 'fake', async send() { sends++; await new Promise(resolve => setTimeout(resolve, 20)); return { status: 'accepted', providerMessageId: 'integration' }; } } });
    const event = { userId: owner.id, source: 'links' as const, eventId: 'concurrent-event', severity: 'warning' as const, targetPath: '/admin/links', occurredAt: new Date(), expiresAt };
    await Promise.all(Array.from({ length: 8 }, () => outbox.enqueue(event)));
    assert.equal(await prisma.mobileEvent.count({ where: { eventId: event.eventId } }), 1);
    assert.equal(await prisma.mobilePushAttempt.count({ where: { event: { eventId: event.eventId } } }), 1);
    await Promise.all(Array.from({ length: 4 }, () => outbox.runBatch()));
    assert.equal(sends, 1, 'SKIP LOCKED must prevent concurrent duplicate sends');
    const leaseEvent = (await store.upsertEvent({ ...event, eventId: 'lease-event', title: '' })).event;
    await store.createAttempts(leaseEvent, [bound.deviceId], new Date());
    const leaseTime = new Date();
    const [first] = await store.leaseAttempts(leaseTime, 1, new Date(leaseTime.getTime() + 1000), 'old-owner');
    assert.equal(await store.finishAttempt(first.attempt.id, 'old-owner', { status: 'accepted', providerMessageId: 'late' }, new Date(leaseTime.getTime() + 1001)), false, 'expired lease rejects an outcome before reclamation');
    const [second] = await store.leaseAttempts(new Date(leaseTime.getTime() + 1001), 1, new Date(leaseTime.getTime() + 2000), 'new-owner');
    assert.equal(second.attempt.id, first.attempt.id);
    assert.equal(second.attempt.attempts, 2);
    assert.equal(await store.finishAttempt(first.attempt.id, 'old-owner', { status: 'accepted', providerMessageId: 'stale' }, new Date()), false);
    assert.equal(await store.finishAttempt(first.attempt.id, 'new-owner', { status: 'accepted', providerMessageId: 'current' }, new Date()), true);
    console.log('PASS PostgreSQL concurrent enqueue, SKIP LOCKED send, lease recovery, stale owner rejection and restored queue cancellation');

    await prisma.user.delete({ where: { id: owner.id } });
    assert.equal(await prisma.mobileDevice.count({ where: { userId: owner.id } }), 0);
    console.log('PASS phone bindings follow session deletion, expiry, restore and account deletion');
  }
} finally {
  await prisma.$disconnect();
  await fs.rm(temporary, { recursive: true, force: true });
}
