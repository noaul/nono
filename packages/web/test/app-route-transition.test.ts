import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('App route transitions', () => {
  it('does not fade the entire workbench between admin menu routes', () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), 'src/App.vue'), 'utf8');

    expect(source).toContain("const isAdminRoute = computed(() => route.path === '/admin' || route.path.startsWith('/admin/'))");
    expect(source).toContain('<component v-if="isAdminRoute" :is="Component" />');
    expect(source).toContain('<transition v-else name="page" mode="out-in">');
  });
});
