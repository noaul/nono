import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('subscription purchase types', () => {
  it('uses the active subscription or buyout segment when creating entries', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/AssetPage.tsx'), 'utf8');

    expect(source).toContain("{ value: 'subscription', label: copy('订阅制', 'Subscription') }");
    expect(source).toContain("{ value: 'buyout', label: copy('买断制', 'Buyout') }");
    expect(source).toContain("nextForm.purchaseType = purchaseType === 'buyout' ? 'buyout' : 'subscription'");
    expect(source).toContain("params.set('purchaseType', purchaseType)");
  });

  it('shows optional buyout details and removes recurring renewal values', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/AssetPage.tsx'), 'utf8');
    const start = source.indexOf('function SubscriptionFormSections');
    const end = source.indexOf('function VpsFormSections', start);
    const form = source.slice(start, end);

    expect(form).toContain('form.email');
    expect(form).toContain('form.phoneNumber');
    expect(form).toContain('form.licenseKey');
    expect(form).toContain('type="text"');
    expect(form).not.toContain('hasLicenseKey');
    expect(form).toContain('form.deviceLimit');
    expect(form).toContain('form.content');
    expect(source).toContain("if (payload.purchaseType === 'buyout')");
    expect(source).toContain("payload.billingCycle = 'annual';");
    expect(source).toContain('payload.nextDueDate = null;');
    expect(source).toContain('payload.autoRenew = false;');
    expect(source).not.toContain("result.licenseKey = '';");
    expect(source).not.toContain("if (!stringValue(payload.licenseKey)) delete payload.licenseKey;");
  });
});
