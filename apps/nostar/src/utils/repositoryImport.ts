export interface RepositoryExtractionResult {
  fullNames: string[];
  duplicates: number;
  overflow: number;
  error?: string;
}

const reservedRoots = new Set('about account apps blog collections contact dashboard enterprise events explore features issues join login logout marketplace new notifications organizations orgs pricing projects pulls search security settings sponsors stars topics trending users'.split(' '));
const codeRoots = new Set('src app lib test tests docs dist build public assets config scripts node_modules server client packages components hooks utils api routes store styles types'.split(' '));
const proseWords = new Set('and or tcp ip http https read write input output yes no'.split(' '));

export function normalizeRepositoryFullName(owner: string, repo: string): string | null {
  const clean = repo.replace(/\.git$/i, '');
  if (!/^(?=.{1,39}$)[a-z\d]+(?:-[a-z\d]+)*$/i.test(owner)
    || !/^[a-z\d._-]{1,100}$/i.test(clean) || /^\.+$/.test(clean)
    || reservedRoots.has(owner.toLowerCase())) return null;
  return `${owner}/${clean}`;
}

/** URLs are masked before bare slugs are scanned to avoid extracting paths from foreign hosts. */
export function extractRepositoryCandidates(raw: string): RepositoryExtractionResult {
  if (raw.length > 512 * 1024) return {fullNames: [], duplicates: 0, overflow: 0, error: 'Input exceeds 512 KiB'};
  // Mask paired Markdown emphasis while retaining offsets and underscores inside names.
  const scanned = raw.replace(/(?<![a-z\d])(_{1,2})(?=\S)([^\s]+?)\1(?![a-z\d_])/gi,
    (_match, delimiter: string, body: string) => ' '.repeat(delimiter.length) + body + ' '.repeat(delimiter.length));
  const found: {index: number; fullName: string}[] = [];
  const urlPattern = /(?:https?:\/\/|(?<![a-z\d./-])(?:www\.)?github\.com\/)[^\s<>()[\]{}"'`,;|*]+/gi;
  const masked = scanned.replace(urlPattern, (text, index: number) => {
    try {
      const url = new URL(/^https?:/i.test(text) ? text : `https://${text}`);
      if (['github.com', 'www.github.com'].includes(url.hostname.toLowerCase()) && !url.username && !url.password) {
        const [owner, repo] = url.pathname.slice(1).split('/');
        if (owner && repo) {
          const fullName = normalizeRepositoryFullName(owner, /^\.+$/.test(repo) ? repo : repo.replace(/[.!?:;]+$/, ''));
          if (fullName) found.push({index, fullName});
        }
      }
    } catch { /* malformed URLs cannot be repository candidates */ }
    return ' '.repeat(text.length);
  });
  const barePattern = /(?<![a-z\d._/-])([a-z\d][a-z\d-]{0,38})\/([a-z\d._-]{1,100})(?![a-z\d_/-])/gi;
  for (const match of masked.matchAll(barePattern)) {
    const owner = match[1];
    const repo = match[2].replace(/[.!?:;]+$/, '');
    if (codeRoots.has(owner.toLowerCase()) || proseWords.has(owner.toLowerCase()) || proseWords.has(repo.toLowerCase())) continue;
    const fullName = normalizeRepositoryFullName(owner, repo);
    if (fullName) found.push({index: match.index, fullName});
  }
  found.sort((a, b) => a.index - b.index);
  const seen = new Set<string>();
  const fullNames: string[] = [];
  let duplicates = 0;
  for (const {fullName} of found) {
    const key = fullName.toLowerCase();
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    fullNames.push(fullName);
  }
  return {fullNames: fullNames.slice(0, 100), duplicates, overflow: Math.max(0, fullNames.length - 100)};
}
