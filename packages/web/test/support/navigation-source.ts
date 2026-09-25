import fs from 'node:fs';
import path from 'node:path';

const read = (relative: string) => fs.readFileSync(path.resolve(process.cwd(), relative), 'utf8');

/** The homepage's scoped stylesheet, which lives beside the component. */
export function readNavigationPageCss() {
  return read('src/views/NavigationPage.css');
}

/**
 * Everything that makes up the homepage: the component, its stylesheet, and the composables it
 * was split into. Source contracts assert against this, so moving code between them is free.
 */
export function readNavigationPageSource() {
  return [
    'src/views/NavigationPage.vue',
    'src/views/NavigationPage.css',
    'src/composables/useHomeAppearance.ts',
    'src/composables/useHomeFolders.ts',
    'src/composables/useHomeOrganize.ts',
  ]
    .filter((relative) => fs.existsSync(path.resolve(process.cwd(), relative)))
    .map(read)
    .join('\n');
}
