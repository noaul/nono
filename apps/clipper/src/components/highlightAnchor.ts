import type { HighlightAnchor, ClipHighlight } from '../services/api';

/**
 * Resolves a stored highlight against the current article text.
 *
 * Offsets alone are not enough: a refetch can rewrite the body, and an offset that still points
 * somewhere would silently mark the wrong sentence. Resolution therefore goes quote first, then
 * quote-with-context, and gives up rather than guessing.
 */

export interface ResolvedHighlight {
  highlight: ClipHighlight;
  start: number;
  end: number;
}

export interface StaleHighlight {
  highlight: ClipHighlight;
  reason: 'version' | 'not-found' | 'ambiguous';
}

export function buildAnchor(text: string, selected: string, startOffset: number): HighlightAnchor {
  return {
    quote: selected,
    prefix: text.slice(Math.max(0, startOffset - 40), startOffset),
    suffix: text.slice(startOffset + selected.length, startOffset + selected.length + 40),
    startOffset,
    endOffset: startOffset + selected.length,
  };
}

export function resolveHighlight(
  text: string,
  highlight: ClipHighlight,
  contentVersion: number,
): ResolvedHighlight | StaleHighlight {
  const anchor = highlight.anchor || ({} as HighlightAnchor);
  const quote = anchor.quote || highlight.text;
  if (!quote) return { highlight, reason: 'not-found' };

  const occurrences = allIndexesOf(text, quote);

  if (occurrences.length === 1) {
    return { highlight, start: occurrences[0], end: occurrences[0] + quote.length };
  }

  if (occurrences.length > 1) {
    // Several copies of the quote: the surrounding context decides which one.
    const byContext = occurrences.filter((index) => contextMatches(text, index, quote, anchor));
    if (byContext.length === 1) {
      return { highlight, start: byContext[0], end: byContext[0] + quote.length };
    }
    // Only fall back to the stored offset when it is still trustworthy, meaning the body has not
    // been rewritten since the highlight was made.
    if (highlight.contentVersion === contentVersion && typeof anchor.startOffset === 'number') {
      const exact = occurrences.find((index) => index === anchor.startOffset);
      if (exact !== undefined) return { highlight, start: exact, end: exact + quote.length };
    }
    return { highlight, reason: 'ambiguous' };
  }

  return {
    highlight,
    reason: highlight.contentVersion !== contentVersion ? 'version' : 'not-found',
  };
}

export function isStale(value: ResolvedHighlight | StaleHighlight): value is StaleHighlight {
  return 'reason' in value;
}

function allIndexesOf(haystack: string, needle: string): number[] {
  const found: number[] = [];
  let index = haystack.indexOf(needle);
  while (index !== -1 && found.length < 50) {
    found.push(index);
    index = haystack.indexOf(needle, index + 1);
  }
  return found;
}

function contextMatches(text: string, index: number, quote: string, anchor: HighlightAnchor) {
  const prefix = anchor.prefix || '';
  const suffix = anchor.suffix || '';
  const beforeOk = !prefix || text.slice(Math.max(0, index - prefix.length), index).endsWith(prefix);
  const afterStart = index + quote.length;
  const afterOk = !suffix || text.slice(afterStart, afterStart + suffix.length).startsWith(suffix);
  return beforeOk && afterOk;
}
