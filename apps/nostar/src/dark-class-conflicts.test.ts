import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards against dark-mode class conflicts: repeated or competing utilities in one class string,
 * where the winner is decided by Tailwind's generation order rather than by intent. The visible
 * symptoms were light-grey hover flashes on dark surfaces and neutral fills overriding semantic
 * amber/red ones.
 */

const SOURCE_ROOT = path.resolve(process.cwd(), 'src');
const NEUTRAL_FILL = 'dark:bg-white/[0.04]';

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx$/.test(entry.name) ? [full] : [];
  });
}

type Branch = { file: string; line: number; classes: string[] };

/**
 * Splits one line of source into the static class sets Tailwind actually resolves together.
 *
 * Two kinds of branch come out of a line:
 *  - a plain quoted literal, which is one class set;
 *  - a template literal, which contributes its *static* text as a class set, because that text is
 *    applied on every render. Its `${...}` expressions are excised first and scanned separately,
 *    so the arms of `${cond ? 'a' : 'b'}` stay isolated: they never coexist on an element, and
 *    pairing classes across them was what produced false positives before.
 *
 * Scanning is per line so an unbalanced apostrophe in a comment cannot flip quote parity for the
 * rest of the file. The cost is that a className template spanning several lines only has its
 * first line's static text examined.
 */
function branchesInLine(line: string): string[] {
  const out: string[] = [];
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (ch === '`') {
      const end = line.indexOf('`', i + 1);
      const body = line.slice(i + 1, end === -1 ? line.length : end);
      // Static text always applies; `${...}` holes are scanned on their own below.
      out.push(body.replace(/\$\{[^}]*\}/g, ' ').replace(/\$\{.*$/, ' '));
      for (const expr of body.matchAll(/\$\{([^}]*)\}/g)) out.push(...branchesInLine(expr[1]));
      if (end === -1) break;
      i = end + 1;
      continue;
    }

    if (ch === '"' || ch === "'") {
      const end = line.indexOf(ch, i + 1);
      if (end === -1) break; // Unterminated on this line: discard rather than invent a class set.
      out.push(line.slice(i + 1, end));
      i = end + 1;
      continue;
    }

    i += 1;
  }

  return out;
}

function classBranches(): Branch[] {
  const branches: Branch[] = [];
  for (const file of sourceFiles(SOURCE_ROOT)) {
    const relative = path.relative(process.cwd(), file);
    fs.readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, index) => {
      for (const branch of branchesInLine(line)) {
        if (!branch.includes('dark:')) continue;
        if (!/(?:bg|text)-/.test(branch)) continue;
        branches.push({ file: relative, line: index + 1, classes: branch.split(/\s+/).filter(Boolean) });
      }
    });
  }
  return branches;
}

/** Utilities carrying exactly `prefix`, excluding longer variants such as `dark:hover:`. */
function withPrefix(classes: string[], prefix: string): string[] {
  return classes.filter((c) => c.startsWith(prefix) && !c.slice(prefix.length).includes(':'));
}

const branches = classBranches();

describe('dark-mode class conflicts', () => {
  it('actually finds class branches to check', () => {
    // Without this the whole suite could pass vacuously if the scan stopped matching.
    expect(branches.length).toBeGreaterThan(100);
  });

  it('scans the static text of template literals, not just quoted strings', () => {
    // The blind spot that let RepositoryCard's conflicting fills through: the class string lives in
    // a template literal, and whole templates used to be skipped to keep ternary arms apart.
    const templates = branches.filter((branch) => branch.file.endsWith('RepositoryCard.tsx'));
    expect(templates.length).toBeGreaterThan(0);
  });

  it('never paints a light-grey hover onto a dark surface', () => {
    const offenders = branches
      .filter((branch) => branch.classes.includes('dark:hover:bg-gray-100'))
      .map((branch) => `${branch.file}:${branch.line}`);
    expect(offenders).toEqual([]);
  });

  it('gives every neutral dark control the unified neutral hover', () => {
    // A `dark:bg-white/[0.04]` surface hovering to an opaque grey jumps shade and weight at once.
    // The contract's neutral hover is `dark:hover:bg-white/[0.08]`.
    const offenders: string[] = [];
    for (const branch of branches) {
      if (!branch.classes.includes(NEUTRAL_FILL)) continue;
      const greyHovers = branch.classes.filter((c) => /^dark:hover:bg-gray-\d+$/.test(c));
      if (greyHovers.length) offenders.push(`${branch.file}:${branch.line} -> ${NEUTRAL_FILL} + ${greyHovers.join(' ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('never hovers dark text toward the light-mode ink', () => {
    // The gray scale is not remapped, so hovering dark text toward gray-900 really lands on
    // #111827 against the #07080a canvas and the label vanishes. Primary ink is the shared token.
    // (Written without the literal class name: Tailwind scans this file and would emit the rule.)
    const offenders: string[] = [];
    for (const branch of branches) {
      const inverted = branch.classes.filter((c) => /^dark:hover:text-gray-(700|900)$/.test(c));
      if (inverted.length) offenders.push(`${branch.file}:${branch.line} -> ${inverted.join(' ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('has no competing dark background or text utilities in one branch', () => {
    const offenders: string[] = [];
    for (const branch of branches) {
      for (const prefix of ['dark:bg-', 'dark:text-', 'dark:hover:bg-', 'dark:hover:text-']) {
        const hits = withPrefix(branch.classes, prefix);
        if (hits.length > 1) offenders.push(`${branch.file}:${branch.line} -> ${hits.join(' ')}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never leaves the neutral dark fill fighting a semantic one', () => {
    // Amber/red/accent controls keep their own fill; the neutral surface must not compete.
    const offenders: string[] = [];
    for (const branch of branches) {
      const fills = withPrefix(branch.classes, 'dark:bg-');
      if (fills.length > 1 && fills.includes(NEUTRAL_FILL)) {
        offenders.push(`${branch.file}:${branch.line} -> ${fills.join(' ')}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('never sets a dark hover identical to its dark base', () => {
    // A hover equal to the base is a no-op: the control looks dead under the cursor.
    const offenders: string[] = [];
    for (const branch of branches) {
      const base = withPrefix(branch.classes, 'dark:bg-')[0];
      const hover = withPrefix(branch.classes, 'dark:hover:bg-')[0];
      if (!base || !hover) continue;
      if (base.slice('dark:bg-'.length) === hover.slice('dark:hover:bg-'.length)) {
        offenders.push(`${branch.file}:${branch.line} -> ${base} + ${hover}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('treats the two arms of a ternary as separate branches', () => {
    // Regression for the scan itself: these are mutually exclusive and must not be reported.
    const found = branchesInLine(
      "const c = cond ? 'dark:bg-status-amber/20 dark:text-status-amber' : 'dark:bg-white/[0.04] dark:text-text-secondary';",
    ).filter((branch) => branch.includes('dark:'));

    expect(found).toHaveLength(2);
    for (const branch of found) {
      const classes = branch.split(/\s+/).filter(Boolean);
      expect(withPrefix(classes, 'dark:bg-')).toHaveLength(1);
      expect(withPrefix(classes, 'dark:text-')).toHaveLength(1);
    }
  });

  it('keeps ternary arms apart inside a template literal while still reading its static text', () => {
    // The shape RepositoryCard uses: static classes plus an interpolated ternary on one line.
    const found = branchesInLine(
      'className={`rounded-lg dark:bg-white/[0.04] ${on ? \'dark:bg-brand-indigo/20\' : \'dark:bg-transparent\'}`}',
    ).filter((branch) => branch.includes('dark:'));

    expect(found).toEqual([
      'rounded-lg dark:bg-white/[0.04]  ',
      'dark:bg-brand-indigo/20',
      'dark:bg-transparent',
    ]);
    for (const branch of found) {
      expect(withPrefix(branch.split(/\s+/).filter(Boolean), 'dark:bg-')).toHaveLength(1);
    }
  });
});
