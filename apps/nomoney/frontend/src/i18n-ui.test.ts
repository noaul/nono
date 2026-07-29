import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('NoMoney bilingual UI contract', () => {
  it('localizes asset controls, tables, forms, and paging', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/AssetPage.tsx'), 'utf8');

    for (const literal of [
      "header: '名称'",
      "header: '供应商'",
      "header: '金额'",
      "header: '周期'",
      "header: '剩余'",
      "header: '状态'",
      '<option value="">未归档</option>',
      '<option value="">全部币种</option>',
      '<option value="">全部周期</option>',
      '<Section title="基础信息">',
      '<Section title="费用信息">',
      '<Section title="状态与备注">',
      '>上一页</Button>',
      '>下一页</Button>',
    ]) {
      expect(source).not.toContain(literal);
    }
  });

  it('localizes mobile navigation labels and updates the document language', () => {
    const layout = fs.readFileSync(path.resolve(process.cwd(), 'src/Layout.tsx'), 'utf8');
    const i18n = fs.readFileSync(path.resolve(process.cwd(), 'src/i18n.tsx'), 'utf8');

    expect(layout).not.toContain('aria-label="关闭"');
    expect(layout).not.toContain('aria-label="主导航"');
    expect(layout).not.toContain('aria-label="菜单"');
    expect(i18n).toContain('document.documentElement.lang');
  });
});
