import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { migrateNodeskFriends } from '../docker/migrate-nodesk-content.mjs';

test('upgrades persisted friends without deleting old content or overwriting newer edits', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nodesk-upgrade-'));
  try {
    await migrateNodeskFriends(root);
    await fs.mkdir(path.join(root, 'src/app/bloggers'), { recursive: true });
    await fs.mkdir(path.join(root, 'public/images/blogger'), { recursive: true });
    await fs.writeFile(path.join(root, 'src/app/bloggers/list.json'), '[{"name":"friend"}]');
    await fs.writeFile(path.join(root, 'public/images/blogger/avatar.png'), 'avatar');
    await migrateNodeskFriends(root);
    assert.equal(await fs.readFile(path.join(root, 'src/app/friends/list.json'), 'utf8'), '[{"name":"friend"}]');
    assert.equal(await fs.readFile(path.join(root, 'public/images/friends/avatar.png'), 'utf8'), 'avatar');
    await fs.writeFile(path.join(root, 'src/app/friends/list.json'), '[]');
    await fs.writeFile(path.join(root, 'public/images/friends/avatar.png'), 'new-avatar');
    await migrateNodeskFriends(root);
    assert.equal(await fs.readFile(path.join(root, 'src/app/friends/list.json'), 'utf8'), '[]');
    assert.equal(await fs.readFile(path.join(root, 'public/images/friends/avatar.png'), 'utf8'), 'new-avatar');
    assert.equal(await fs.readFile(path.join(root, 'public/images/blogger/avatar.png'), 'utf8'), 'avatar');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
