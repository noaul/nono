import { describe, expect, it } from 'vitest';
import { MemoryMobileStore } from '../src/services/mobile-store.js';
import { createMobileDeviceService } from '../src/services/mobile-devices.service.js';
import { createMobilePushOutbox } from '../src/services/mobile-push-outbox.service.js';
import type { MobileEvent, PushEnvelope, PushResult } from '../src/services/mobile-events.service.js';

const key = '0123456789abcdef'.repeat(4);
async function setup(send: (token: string, message: PushEnvelope) => Promise<PushResult> = async () => ({ status: 'accepted', providerMessageId: 'vendor-id' })) {
  let clock = new Date('2026-10-03T12:00:00Z');
  const auth = { users: [{ id: 1 }], sessions: [{ id: 's', userId: 1, expiresAt: new Date('2026-10-05') }] } as any;
  const store = new MemoryMobileStore(auth);
  const devices = createMobileDeviceService({ store, encryptionKey: key, now: () => clock });
  const binding = await devices.register(1, 's', { installationId: 'phone-123', provider: 'xiaomi', registrationId: 'secret-token', appVersion: '0.2' });
  const outbox = createMobilePushOutbox({ store, devices, provider: { name: 'fake', send }, now: () => clock });
  const event: MobileEvent = { userId: 1, eventId: 'links:123', source: 'links', severity: 'warning', title: 'Private account details', targetPath: '/admin/links', occurredAt: clock, expiresAt: new Date(clock.getTime() + 86_400_000) };
  return { auth, store, devices, binding, outbox, event, advance: (ms: number) => { clock = new Date(clock.getTime() + ms); }, now: () => clock };
}

describe('durable mobile outbox', () => {
  it('deduplicates an event and each device, including after a service restart', async () => {
    const s = await setup();
    expect(await s.outbox.enqueue(s.event)).toEqual({ created: 1 });
    const restarted = createMobilePushOutbox({ store: s.store, devices: s.devices });
    expect(await restarted.enqueue(s.event)).toEqual({ created: 0 });
    expect(s.store.events).toHaveLength(1);
    expect(s.store.attempts).toHaveLength(1);
  });
  it('sends only generic content and keeps accepted separate from opened or received', async () => {
    const messages: PushEnvelope[] = [];
    const s = await setup(async (token, message) => { expect(token).toBe('secret-token'); messages.push(message); return { status: 'accepted', providerMessageId: 'vendor-id' }; });
    await s.outbox.enqueue(s.event);
    expect(await s.outbox.runBatch()).toMatchObject({ accepted: 1, failed: 0 });
    expect(messages[0]).toMatchObject({ title: 'NoNo', body: '有一条新的提醒，点击查看', channel: 'reminders' });
    expect(JSON.stringify(messages)).not.toContain('Private account details');
    expect(s.store.attempts[0]).toMatchObject({ status: 'accepted', openedAt: null });
  });
  it('retries temporary failures with stable dedupe and bounded backoff', async () => {
    const keys: string[] = [];
    const s = await setup(async (_, message) => { keys.push(message.dedupeKey); return keys.length === 1 ? { status: 'retryable', code: 'rate-limit' } : { status: 'accepted', providerMessageId: 'ok' }; });
    await s.outbox.enqueue(s.event);
    await s.outbox.runBatch();
    expect(s.store.attempts[0].nextAttemptAt.getTime() - s.now().getTime()).toBe(30_000);
    expect((await s.outbox.runBatch()).accepted).toBe(0);
    s.advance(30_000);
    expect((await s.outbox.runBatch()).accepted).toBe(1);
    expect(keys[0]).toBe(keys[1]);
  });
  it.each(['revoked', 'deleted-session', 'expired-session', 'expired-event', 'resolved'])('does not send %s work', async (reason) => {
    let sends = 0;
    const s = await setup(async () => { sends++; return { status: 'accepted', providerMessageId: 'bad' }; });
    await s.outbox.enqueue(s.event);
    if (reason === 'revoked') await s.devices.revoke(s.binding.deviceId, s.binding.revokeToken);
    if (reason === 'deleted-session') s.auth.sessions.length = 0;
    if (reason === 'expired-session') s.auth.sessions[0].expiresAt = s.now();
    if (reason === 'expired-event') s.advance(86_400_001);
    if (reason === 'resolved') await s.store.cancelInactiveEvents(1, ['links'], [], s.now(), 'resolved');
    await s.outbox.runBatch();
    expect(sends).toBe(0);
    expect(['canceled', 'expired']).toContain(s.store.attempts[0].status);
  });
  it('invalid registration disables the device and configuration errors do not retry', async () => {
    for (const status of ['invalid-token', 'configuration-error'] as const) {
      const s = await setup(async () => ({ status, code: 'vendor-code' }));
      await s.outbox.enqueue(s.event);
      expect((await s.outbox.runBatch()).failed).toBe(1);
      expect(s.store.attempts[0].status).toBe('failed');
      expect(s.store.devices[0].enabled).toBe(status !== 'invalid-token');
    }
  });
  it('two workers send a due attempt only once', async () => {
    let sends = 0;
    const s = await setup(async () => { sends++; await new Promise(resolve => setTimeout(resolve, 10)); return { status: 'accepted', providerMessageId: 'ok' }; });
    await s.outbox.enqueue(s.event);
    await Promise.all([s.outbox.runBatch(), s.outbox.runBatch()]);
    expect(sends).toBe(1);
  });
  it('default disabled provider leaves pending work untouched', async () => {
    const s = await setup();
    await s.outbox.enqueue(s.event);
    const disabled = createMobilePushOutbox({ store: s.store, devices: s.devices, now: s.now });
    expect(disabled.enabled).toBe(false);
    await disabled.runBatch();
    expect(s.store.attempts[0]).toMatchObject({ status: 'pending', attempts: 0 });
  });
  it('rejects unsafe paths, invalid event IDs and caps source expiry', async () => {
    const s = await setup();
    await expect(s.outbox.enqueue({ ...s.event, eventId: 'bad?query' })).rejects.toThrow();
    await s.outbox.enqueue({ ...s.event, severity: 'critical', targetPath: '//evil.test' });
    expect(s.store.events[0].targetPath).toBe('/admin/links');
    expect(s.store.events[0].expiresAt.getTime() - s.event.occurredAt.getTime()).toBe(3_600_000);
  });
  it('resolved events cannot be revived by redelivery or a newly bound phone', async () => {
    const s = await setup();
    await s.outbox.enqueue(s.event);
    await s.store.cancelInactiveEvents(1, ['links'], [], s.now(), 'resolved');
    await s.devices.register(1, 's', { installationId: 'phone-456', provider: 'xiaomi', registrationId: 'other-token', appVersion: '0.2' });
    expect(await s.outbox.enqueue(s.event)).toEqual({ created: 0 });
  });
  it('lease recovery retains dedupe identity and rejects a stale owner outcome', async () => {
    const s = await setup();
    await s.outbox.enqueue(s.event);
    const [first] = await s.store.leaseAttempts(s.now(), 1, new Date(s.now().getTime() + 1000), 'old');
    s.advance(1001);
    await s.store.leaseAttempts(s.now(), 1, new Date(s.now().getTime() + 1000), 'new');
    expect(await s.store.finishAttempt(first.attempt.id, 'old', { status: 'accepted', providerMessageId: 'old' }, s.now())).toBe(false);
    expect(await s.store.finishAttempt(first.attempt.id, 'new', { status: 'accepted', providerMessageId: 'new' }, s.now())).toBe(true);
  });

  it('rejects an outcome after the lease expired even before another worker claims it', async () => {
    const s = await setup();
    await s.outbox.enqueue(s.event);
    const [leased] = await s.store.leaseAttempts(s.now(), 1, new Date(s.now().getTime() + 1000), 'expired-owner');
    s.advance(1001);
    expect(await s.store.finishAttempt(leased.attempt.id, 'expired-owner', { status: 'accepted', providerMessageId: 'late' }, s.now())).toBe(false);
  });

});
