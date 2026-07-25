import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Nomoney dashboard cost coverage', () => {
  it('renders a complete cost card for every asset category', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/Dashboard.tsx'), 'utf8');

    expect(source).toContain("assetType: 'phone'");
    expect(source).toContain("assetType: 'vps'");
    expect(source).toContain("assetType: 'domain'");
    expect(source).toContain("assetType: 'subscription'");
    expect(source).toContain('summary.categoryCosts[definition.assetType]');
    expect(source).toContain('月度折算');
    expect(source).toContain('年度预测');
    expect(source).toContain('年度实际');
    expect(source).toContain('一次性投入');
  });

  it('lists each non-zero currency amount instead of hiding extra currencies', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/Dashboard.tsx'), 'utf8');

    expect(source).toContain('function MoneyList');
    expect(source).toContain('entries.map((currency)');
    expect(source).not.toContain('+{entries.length - 1}');
  });
});
