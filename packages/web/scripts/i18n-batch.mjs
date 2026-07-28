// Temporary migration helper: applies literal->t() replacements per file and makes sure the
// component pulls in useI18n. Deleted once the migration is done.
import { readFileSync, writeFileSync } from 'node:fs';

const CJK = /[一-鿿]/;

function ensure(source) {
  if (source.includes('useI18n')) return source;
  const imp = "import { useI18n } from '@/composables/useI18n';";
  let lines = source.split('\n');
  const importLines = lines.map((l, i) => (l.startsWith('import ') ? i : -1)).filter((i) => i >= 0);
  if (importLines.length) lines.splice(importLines[importLines.length - 1] + 1, 0, imp);
  else lines.splice(lines.findIndex((l) => l.startsWith('<script')) + 1, 0, imp);
  let text = lines.join('\n');

  // Declare t after the LAST `}>();` — the terminator of defineProps/defineEmits generics.
  const ends = [...text.matchAll(/^\}>\(\);$/gm)].map((m) => m.index + m[0].length);
  if (ends.length) {
    const at = ends[ends.length - 1];
    return text.slice(0, at) + '\n\nconst { t } = useI18n();' + text.slice(at);
  }
  lines = text.split('\n');
  const last = lines.map((l, i) => (l.startsWith('import ') ? i : -1)).filter((i) => i >= 0).pop();
  lines.splice(last + 1, 0, '\nconst { t } = useI18n();');
  return lines.join('\n');
}

export function applyEdits(edits) {
  for (const [path, subs] of Object.entries(edits)) {
    let source = readFileSync(path, 'utf8');
    for (const [from, to] of subs) {
      if (!source.includes(from)) {
        console.log(`MISS ${path} :: ${from.slice(0, 60)}`);
        continue;
      }
      source = source.split(from).join(to);
    }
    source = ensure(source);
    writeFileSync(path, source);
    const left = source.split('\n').filter((l) => CJK.test(l)).map((l) => l.trim().slice(0, 70));
    if (left.length) console.log(`${path} -> ${left.length} left`, left);
  }
  console.log('done');
}
