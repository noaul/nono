import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('NoMoney VPS renewal UI', () => {
  it('offers one-click renewal beside the VPS due date without a confirmation dialog', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/AssetPage.tsx'), 'utf8');

    expect(source).toContain("copy('标记已续费', 'Mark renewed')");
    expect(source).toContain('onRenew(item)');
    expect(source).toContain('expectedExpireDate: dueDate');
    expect(source).toContain('crypto.randomUUID()');
    expect(source).not.toContain("confirm(copy('确认续费'");
  });

  it('shows the renewed date with undo and quick amount correction actions', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/AssetPage.tsx'), 'utf8');

    expect(source).toContain("copy(`已续费至 ${toast.renewal.renewedExpireDate}`, `Renewed until ${toast.renewal.renewedExpireDate}`)");
    expect(source).toContain("copy('撤销', 'Undo')");
    expect(source).toContain("copy('修改金额', 'Edit amount')");
    expect(source).toContain('`/api/vps/${toast.itemId}/renewals/${toast.renewal.id}/undo`');
    expect(source).toContain('`/api/vps/${toast.itemId}/renewals/${toast.renewal.id}/expense`');
  });

  it('does not expose renewal for cancelled or archived VPS entries', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/AssetPage.tsx'), 'utf8');

    expect(source).toContain("!['cancelled', 'archived'].includes(item.status)");
  });
});
