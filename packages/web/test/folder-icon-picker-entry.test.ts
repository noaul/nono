import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Folder icon picker integration', () => {
  it('uses the compact shared picker in the folder editor', () => {
    const linksSource = fs.readFileSync(path.resolve(process.cwd(), 'src/views/admin/LinksView.vue'), 'utf8');
    const pickerPath = path.resolve(process.cwd(), 'src/components/admin/FolderIconPicker.vue');

    expect(fs.existsSync(pickerPath)).toBe(true);
    expect(linksSource).toContain("import FolderIconPicker from '@/components/admin/FolderIconPicker.vue'");
    expect(linksSource).toContain('<FolderIconPicker v-model="folderEditor.icon"');
    expect(linksSource).not.toContain('folderIconOptions');
    expect(linksSource).not.toContain('class="inline-folder-icon-picker"');
  });
});
