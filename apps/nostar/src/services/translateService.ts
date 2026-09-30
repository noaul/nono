import { useAppStore } from '../store/useAppStore';
import type { TranslationEngine } from '../types';

export interface TranslateResult {
  translatedText: string;
  detectedLanguage: string;
}
export interface TranslateOptions {
  from?: string;
  to: string;
  text: string;
  signal?: AbortSignal;
  textType?: 'html' | 'plain';
}

// Endpoint contracts verified against NoStar upstream; authentication is no longer required.
const MICROSOFT_URL = 'https://edge.microsoft.com/translate/translatetext';
const GOOGLE_URL = 'https://clients5.google.com/translate_a/t';
const REQUEST_TIMEOUT_MS = 20_000;
const LANGUAGE_CODES = {
  microsoft: { zh: 'zh-Hans', 'zh-TW': 'zh-Hant' },
  google: { zh: 'zh-CN', 'zh-TW': 'zh-TW' },
};
class TranslationHttpError extends Error {
  constructor(readonly status: number) { super(`Translation failed: ${status}`); }
}
const abortError = () => new DOMException('Aborted', 'AbortError');
const checkAborted = (signal?: AbortSignal) => { if (signal?.aborted) throw abortError(); };

const waitForRetry = (ms: number, signal?: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  checkAborted(signal);
  const onAbort = () => { clearTimeout(timer); reject(abortError()); };
  const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
  signal?.addEventListener('abort', onAbort, { once: true });
});

// Race the complete operation so an unresponsive fetch/body also has a bounded lifetime.
const requestJson = async (url: string, init: RequestInit, signal?: AbortSignal): Promise<unknown> => {
  checkAborted(signal);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  const stopped = new Promise<never>((_, reject) => {
    onAbort = () => { reject(abortError()); controller.abort(); };
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => {
      reject(new Error(`Translation request timed out after ${REQUEST_TIMEOUT_MS}ms`));
      controller.abort();
    }, REQUEST_TIMEOUT_MS);
  });
  try {
    const operation = async () => {
      const response = await fetch(url, { ...init, credentials: 'omit', signal: controller.signal });
      if (!response.ok) throw new TranslationHttpError(response.status);
      return await response.json() as unknown;
    };
    return await Promise.race([operation(), stopped]);
  } finally {
    clearTimeout(timer);
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  }
};
const withRetry = async <T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    checkAborted(signal);
    try { return await operation(); } catch (error) {
      checkAborted(signal);
      const name = (error as { name?: string } | null)?.name;
      if (name === 'AbortError' || name === 'CanceledError') throw error;
      const permanent = error instanceof TranslationHttpError && error.status !== 429 && error.status < 500;
      if (attempt === 2 || permanent) throw error;
      await waitForRetry(1000 * 2 ** attempt, signal);
    }
  }
};
interface PreparedText { payload: string; restore: (translated: string) => string }
const prepareText = (text: string, html: boolean): PreparedText => {
  if (!html) return { payload: text, restore: (translated) => translated };
  const fragments = new Map<string, string>();
  let index = 0;
  // Protect whole code spans and every tag, including quoted attributes containing >.
  const payload = text.replace(/<code\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/code\s*>|<(?:[^>"']|"[^"]*"|'[^']*')*>/gi, (fragment) => {
    while (text.includes(`{${index}}`)) index++;
    const token = `{${index++}}`;
    fragments.set(token, fragment);
    return token;
  });
  return {
    payload,
    restore: (translated) => {
      let previous = -1;
      for (const token of fragments.keys()) {
        const position = translated.indexOf(token);
        // Dropped, duplicated or reordered tags can break nesting and link destinations.
        if (position <= previous || translated.indexOf(token, position + token.length) !== -1) return text;
        previous = position;
      }
      return translated.replace(/\{\d+\}/g, (token) => fragments.get(token) ?? token);
    },
  };
};

// Preserve every source character, surrogate pair, HTML tag and protected code token.
const splitText = (text: string, limit: number, html: boolean): string[] => {
  const atomic = html ? [...text.matchAll(/<[^>]*>|\{\d+\}/g)].map((match) => ({ start: match.index, end: match.index + match[0].length })) : [];
  const chunks: string[] = [];
  let offset = 0;
  while (offset < text.length) {
    let end = Math.min(offset + limit, text.length);
    if (end < text.length) {
      const boundary = Math.max(text.lastIndexOf('\n', end - 1), text.lastIndexOf(' ', end - 1)) + 1;
      if (boundary > offset + limit / 2) end = boundary;
      const tag = atomic.find((part) => part.start < end && part.end > end);
      if (tag) end = tag.start;
      const previous = text.charCodeAt(end - 1);
      if (previous >= 0xD800 && previous <= 0xDBFF) end--;
    }
    // A single tag exceeding the engine limit cannot safely be translated.
    if (end <= offset) return [];
    chunks.push(text.slice(offset, end));
    offset = end;
  }
  return chunks;
};
const mapLanguage = (engine: TranslationEngine, language: string) =>
  (LANGUAGE_CODES[engine] as Record<string, string>)[language] ?? language;

const translateRequest = async (
  texts: string[], engine: TranslationEngine, to: string, from?: string, signal?: AbortSignal, textType?: 'html' | 'plain',
): Promise<TranslateResult[]> => withRetry(async () => {
  let url: string;
  let init: RequestInit;
  if (engine === 'google') {
    const params = new URLSearchParams({ client: 'dict-chrome-ex', sl: from ? mapLanguage(engine, from) : 'auto', tl: mapLanguage(engine, to) });
    url = `${GOOGLE_URL}?${params}`;
    const body = new URLSearchParams();
    texts.forEach((text) => body.append('q', text));
    init = { method: 'POST', body };
  } else {
    const params = new URLSearchParams({ from: from ? mapLanguage(engine, from) : '', to: mapLanguage(engine, to), isEnterpriseClient: 'false' });
    if (textType === 'html') params.set('textType', 'html');
    url = `${MICROSOFT_URL}?${params}`;
    init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(texts) };
  }
  const data = await requestJson(url, init, signal);
  if (!Array.isArray(data) || data.length !== texts.length) throw new Error('Invalid translation response');
  return data.map((item: unknown) => {
    let translatedText: unknown;
    let detectedLanguage: unknown;
    if (engine === 'google') {
      translatedText = Array.isArray(item) ? item[0] : item;
      detectedLanguage = Array.isArray(item) ? item[1] : '';
    } else {
      const result = item as { translations?: { text?: unknown }[]; detectedLanguage?: { language?: unknown } } | null;
      translatedText = result?.translations?.[0]?.text;
      detectedLanguage = result?.detectedLanguage?.language;
    }
    if (typeof translatedText !== 'string') throw new Error('Invalid translation response');
    return { translatedText, detectedLanguage: typeof detectedLanguage === 'string' ? detectedLanguage : '' };
  });
}, signal);

export const translateBatch = async (
  texts: string[], to: string, from?: string, signal?: AbortSignal, textType?: 'html' | 'plain',
): Promise<TranslateResult[]> => {
  checkAborted(signal);
  // Snapshot settings so switching engines cannot mix them within a single input.
  const engine = useAppStore.getState().translationEngine === 'google' ? 'google' : 'microsoft';
  const limit = engine === 'google' ? 1800 : 50000;
  const countLimit = engine === 'google' ? 20 : 100;
  const prepared = texts.map((text) => prepareText(text, textType === 'html'));
  const results: TranslateResult[] = texts.map(() => ({ translatedText: '', detectedLanguage: '' }));
  let pending: { owner: number; text: string; prefix: string; suffix: string }[] = [];
  let length = 0;
  const flush = async () => {
    if (!pending.length) return;
    const translated = await translateRequest(pending.map((item) => item.text), engine, to, from, signal, textType);
    pending.forEach((item, index) => {
      results[item.owner].translatedText += item.prefix + translated[index].translatedText + item.suffix;
      results[item.owner].detectedLanguage ||= translated[index].detectedLanguage;
    });
    pending = [];
    length = 0;
  };
  for (let owner = 0; owner < texts.length; owner++) {
    checkAborted(signal);
    const chunks = splitText(prepared[owner].payload, limit, textType === 'html');
    if (!texts[owner].trim() || !chunks.length) { results[owner].translatedText = texts[owner]; continue; }
    for (const chunk of chunks) {
      const text = chunk.trim();
      if (!text) {
        await flush();
        results[owner].translatedText += chunk;
        continue;
      }
      if (pending.length >= countLimit || length + text.length > limit) await flush();
      const start = chunk.indexOf(text);
      pending.push({ owner, text, prefix: chunk.slice(0, start), suffix: chunk.slice(start + text.length) });
      length += text.length;
    }
  }
  await flush();
  return results.map((result, index) => ({ ...result, translatedText: prepared[index].restore(result.translatedText) }));
};
export const translateText = async ({ text, to, from, signal, textType }: TranslateOptions): Promise<TranslateResult> =>
  (await translateBatch([text], to, from, signal, textType))[0];
