import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const views = [
  'AdminDashboard.vue',
  'SiteConfigView.vue',
  'TokensView.vue',
  'LlmView.vue',
  'AccountView.vue',
  'UsersView.vue',
];

describe('compact admin page copy', () => {
  it.each(views)('removes page and section helper descriptions from %s', (file) => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/views/admin', file), 'utf8');
    expect(source).not.toMatch(/<AdminPageHeader[^>]*\sdescription=/);
    const sectionHeads = source.match(/<(?:header|div) class="admin-(?:section|card)-head">[\s\S]*?<\/(?:header|div)>/g) || [];
    sectionHeads.forEach((block) => expect(block).not.toContain('<p>'));
  });

  it('removes the appearance editor helper description from the site page', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/components/admin/AppearanceEditor.vue'), 'utf8');
    expect(source).not.toContain('所有调整都会即时显示在右侧预览');
  });
});
