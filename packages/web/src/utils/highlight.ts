export type HighlightSegment = { text: string; hit: boolean };

/** Splits text into segments so matched substrings can be wrapped in <mark>. Case-insensitive. */
export function splitHighlight(text: string, query: string): HighlightSegment[] {
  const q = query.trim().toLocaleLowerCase();
  if (!q || !text) return [{ text, hit: false }];

  const lower = text.toLocaleLowerCase();
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const index = lower.indexOf(q, cursor);
    if (index === -1) {
      segments.push({ text: text.slice(cursor), hit: false });
      break;
    }
    if (index > cursor) segments.push({ text: text.slice(cursor, index), hit: false });
    segments.push({ text: text.slice(index, index + q.length), hit: true });
    cursor = index + q.length;
  }
  return segments.length ? segments : [{ text, hit: false }];
}
