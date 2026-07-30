import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('NoMoney recycle bin UI', () => {
  it('registers a unified recycle bin with restore and permanent-delete actions', () => {
    const app = fs.readFileSync(path.resolve(process.cwd(), 'src/App.tsx'), 'utf8');
    const layout = fs.readFileSync(path.resolve(process.cwd(), 'src/Layout.tsx'), 'utf8');
    const trashPath = path.resolve(process.cwd(), 'src/TrashPage.tsx');

    expect(app).toContain("const TrashPage = lazy(() => import('./TrashPage')");
    expect(app).toContain('<Route path="/trash"><TrashPage /></Route>');
    expect(layout).toContain("to: '/trash'");
    expect(layout).toContain("labelZh: '回收站'");
    expect(fs.existsSync(trashPath)).toBe(true);

    const trash = fs.readFileSync(trashPath, 'utf8');
    expect(trash).toContain("api.get<ListResponse<CommunicationAccount>>('/api/accounts?trashed=true')");
    expect(trash).toContain('status=archived');
    expect(trash).toContain('`/api/${item.endpoint}/${item.id}/restore`');
    expect(trash).toContain('`/api/${item.endpoint}/${item.id}/permanent`');
    expect(trash).toContain("copy('恢复', 'Restore')");
    expect(trash).toContain("copy('永久删除', 'Delete permanently')");
  });
});
