import { Repository } from '../types';

export function exportAsMarkdown(repos: Repository[]): string {
  const lines = ['# GitHub Stars\n'];
  for (const r of repos) {
    lines.push(`- [${r.full_name}](${r.html_url}) - ${r.description || 'No description'} ⭐${r.stargazers_count} \`${r.language || 'N/A'}\``);
  }
  return lines.join('\n');
}

export function exportAsCsv(repos: Repository[]): string {
  const esc = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
  const header = 'name,url,description,language,stars,topics';
  const rows = repos.map(r =>
    [esc(r.full_name), esc(r.html_url), esc(r.description || ''), esc(r.language || ''), r.stargazers_count, esc((r.topics || []).join(';'))].join(',')
  );
  return [header, ...rows].join('\n');
}

export function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
