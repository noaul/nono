import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import * as renewals from './renewals';
import type { DueItem } from './types';

test('overview renewals use the expiry anchor while displaying a separate payment due date', () => {
  const due = { kind: 'renewal', assetType: 'domain', assetId: 7, dueDate: '2026-05-25', expireDate: '2026-06-01', nextDueDate: '2026-05-25', billingCycle: 'annual', status: 'active' } as DueItem;
  // The adapter must carry the actual expiry, including a missing expiry (which needs setup).
  const asset = renewals.renewalAssetFromDueItem?.(due);
  expect(asset).toMatchObject({ id: 7, expireDate: '2026-06-01', nextDueDate: '2026-05-25' });
  expect(renewals.renewalDueDate('domains', asset!)).toBe('2026-06-01');
  expect(renewals.renewalDueDate('domains', renewals.renewalAssetFromDueItem({ ...due, expireDate: null }))).toBe('');
  const source = readFileSync(new URL('./YumiOverview.tsx', import.meta.url), 'utf8');
  expect(source).toContain('item={renewalAssetFromDueItem(item)}');
});

test('Bark settings exposes an explicit remove action with a null clear payload', () => {
  const source = readFileSync(new URL('./SettingsPage.tsx', import.meta.url), 'utf8');
  expect(source).toContain('onClick={clearBark}');
  expect(source).toContain("'/api/settings', { barkUrl: null }");
  expect(source).toContain("'Remove Bark'");
});
