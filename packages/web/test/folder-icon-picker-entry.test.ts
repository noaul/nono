import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Folder icon picker integration', () => {
  it('replaces both inline icon grids with one compact shared picker', () => {
    const foldersSource = fs.readFileSync(path.resolve(process.cwd(), 'src/views/admin/FoldersView.vue'), 'utf8');
    const pickerPath = path.resolve(process.cwd(), 'src/components/admin/FolderIconPicker.vue');

    expect(fs.existsSync(pickerPath)).toBe(true);
    expect(foldersSource).toContain("import FolderIconPicker from '@/components/admin/FolderIconPicker.vue'");
    expect(foldersSource).toContain('<FolderIconPicker v-model="form.icon"');
    expect(foldersSource).toContain('<FolderIconPicker v-model="inlineForm.icon"');
    expect(foldersSource).not.toContain('folderIconOptions');
    expect(foldersSource).not.toContain('class="inline-folder-icon-picker"');
    expect(foldersSource).not.toContain('.inline-folder-icon-picker');
  });
});
