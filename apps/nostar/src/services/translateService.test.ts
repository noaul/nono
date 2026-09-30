import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { translateBatch, translateText } from './translateService';

const settings = vi.hoisted(() => ({ translationEngine: 'microsoft' }));
vi.mock('../store/useAppStore', () => ({ useAppStore: { getState: () => settings } }));

const jsonResponse = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const microsoftEcho = (_input: RequestInfo | URL, init?: RequestInit) => {
  const texts = JSON.parse(String(init?.body)) as string[];
  return Promise.resolve(jsonResponse(texts.map((text) => ({ translations: [{ text }], detectedLanguage: { language: 'en' } }))));
};

describe('translation engines', () => {
  beforeEach(() => {
    settings.translationEngine = 'microsoft';
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses current Edge endpoint without token authentication and maps Chinese language codes', async () => {
    const requests: { url: URL; init?: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: new URL(String(input)), init });
      return jsonResponse([{ translations: [{ text: '你好' }], detectedLanguage: { language: 'en' } }]);
    });
    expect(await translateText({ text: 'Hello', to: 'zh' })).toEqual({ translatedText: '你好', detectedLanguage: 'en' });
    expect(requests).toHaveLength(1);
    expect(requests[0].url.origin + requests[0].url.pathname).toBe('https://edge.microsoft.com/translate/translatetext');
    expect(requests[0].url.searchParams.get('to')).toBe('zh-Hans');
    expect(JSON.parse(String(requests[0].init?.body))).toEqual(['Hello']);
    expect(new Headers(requests[0].init?.headers).has('Authorization')).toBe(false);
    expect(requests[0].init?.credentials).toBe('omit');
    expect(localStorage.length).toBe(0);
  });

  it('selects Google and normalizes both auto-detection pairs and explicit-language strings', async () => {
    settings.translationEngine = 'google';
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.origin + url.pathname).toBe('https://clients5.google.com/translate_a/t');
      expect(url.searchParams.get('tl')).toBe('zh-CN');
      expect((init?.body as URLSearchParams).getAll('q')).toEqual(['Hello', 'World']);
      return jsonResponse(url.searchParams.get('sl') === 'auto' ? [['你好', 'en'], ['世界', 'en']] : ['你好', '世界']);
    });
    expect(await translateBatch(['Hello', 'World'], 'zh')).toEqual([
      { translatedText: '你好', detectedLanguage: 'en' }, { translatedText: '世界', detectedLanguage: 'en' },
    ]);
    expect((await translateBatch(['Hello', 'World'], 'zh', 'en')).map((r) => r.translatedText)).toEqual(['你好', '世界']);
  });

  it('reassembles oversized items without losing whitespace, order or result cardinality', async () => {
    const large = 'a'.repeat(49990) + ' \n\n ' + 'b'.repeat(50020) + ' 😀';
    const bodies: string[][] = [];
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as string[]);
      return microsoftEcho(input, init);
    });
    const results = await translateBatch(['before', large, '', ' \n', 'after'], 'en');
    expect(results.map((r) => r.translatedText)).toEqual(['before', large, '', ' \n', 'after']);
    expect(bodies.flat().every((text) => text.length <= 50000)).toBe(true);
    expect((await translateText({ text: large, to: 'en' })).translatedText).toBe(large);
  });

  it('chunks even a single long Google input within the engine limit', async () => {
    settings.translationEngine = 'google';
    const large = 'a'.repeat(1800) + ' \n' + 'b'.repeat(2200);
    const bodies: string[][] = [];
    vi.stubGlobal('fetch', (_input: RequestInfo | URL, init?: RequestInit) => {
      const texts = (init?.body as URLSearchParams).getAll('q');
      bodies.push(texts);
      return Promise.resolve(jsonResponse(texts.map((text) => [text, 'en'])));
    });
    expect((await translateText({ text: large, to: 'en' })).translatedText).toBe(large);
    expect(bodies.flat().every((text) => text.length <= 1800)).toBe(true);
    expect(bodies.every((texts) => texts.length <= 20 && texts.join('').length <= 1800)).toBe(true);
  });

  it('preserves inline code exactly, including replacement syntax and existing placeholders', async () => {
    const original = '<p>Hello {0} <code class="x">$&amp; $1 Foo()</code> and <CODE>Bar()</CODE></p>';
    vi.stubGlobal('fetch', (_input: RequestInfo | URL, init?: RequestInit) => {
      const texts = JSON.parse(String(init?.body)) as string[];
      expect(texts[0]).not.toContain('Foo()');
      expect(texts[0]).not.toContain('Bar()');
      return jsonResponse(texts.map((text) => ({ translations: [{ text: text.replace('Hello', '你好') }] })));
    });
    expect((await translateText({ text: original, to: 'zh', textType: 'html' })).translatedText)
      .toBe('<p>你好 {0} <code class="x">$&amp; $1 Foo()</code> and <CODE>Bar()</CODE></p>');
  });

  it.each(['microsoft', 'google'])('preserves HTML attributes and translates linked text with %s', async (engine) => {
    settings.translationEngine = engine;
    const original = '<p>Hello <a href="https://example.com/hello" title="a > b">world</a> {0} <code>foo($&amp;)</code></p>';
    let payload = '';
    let htmlMode: string | null = null;
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      htmlMode = new URL(String(input)).searchParams.get('textType');
      payload = engine === 'google' ? (init?.body as URLSearchParams).get('q')! : (JSON.parse(String(init?.body)) as string[])[0];
      const translated = payload.replace('Hello', '你好').replace('world', '世界').replace('https://example.com/hello', 'corrupted-link');
      return Promise.resolve(jsonResponse(engine === 'google' ? [[translated, 'en']] : [{ translations: [{ text: translated }] }]));
    });
    const result = await translateText({ text: original, to: 'zh', textType: 'html' });
    expect(result.translatedText).toBe('<p>你好 <a href="https://example.com/hello" title="a > b">世界</a> {0} <code>foo($&amp;)</code></p>');
    expect(payload).not.toContain('https://example.com/hello');
    expect(payload).not.toContain('a > b');
    expect(payload).not.toContain('foo(');
    if (engine === 'microsoft') expect(htmlMode).toBe('html');
  });

  it('falls back to original HTML if translated tags are reordered', async () => {
    const original = '<p>Hello <a href="https://example.com">world</a></p>';
    vi.stubGlobal('fetch', (_input: RequestInfo | URL, init?: RequestInit) => {
      const payload = (JSON.parse(String(init?.body)) as string[])[0];
      const tokens = payload.match(/\{\d+\}/g) ?? [];
      const translated = tokens.reverse().join('') + '你好世界';
      return Promise.resolve(jsonResponse([{ translations: [{ text: translated }] }]));
    });
    expect((await translateText({ text: original, to: 'zh', textType: 'html' })).translatedText).toBe(original);
  });

  it('falls back to the whole original input if a protected code placeholder disappears', async () => {
    const original = '<p>Hello <code>safe()</code></p>';
    vi.stubGlobal('fetch', () => Promise.resolve(jsonResponse([{ translations: [{ text: '<p>你好</p>' }] }])));
    expect((await translateText({ text: original, to: 'zh', textType: 'html' })).translatedText).toBe(original);
  });

  it('retries transient HTTP errors but rejects permanent client errors immediately', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    vi.stubGlobal('fetch', () => Promise.resolve(++attempts === 1 ? jsonResponse({}, 503) : jsonResponse([{ translations: [{ text: 'ok' }] }])));
    const result = translateText({ text: 'Hello', to: 'en' });
    await vi.runAllTimersAsync();
    expect((await result).translatedText).toBe('ok');
    expect(attempts).toBe(2);
    attempts = 0;
    vi.stubGlobal('fetch', () => { attempts++; return Promise.resolve(jsonResponse({}, 400)); });
    await expect(translateText({ text: 'Hello', to: 'en' })).rejects.toThrow(/400/);
    expect(attempts).toBe(1);
  });

  it('bounds stalled response body consumption and stops after three timeout attempts', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    vi.stubGlobal('fetch', () => {
      attempts++;
      return Promise.resolve({ ok: true, json: () => new Promise(() => {}) } as Response);
    });
    const assertion = expect(translateText({ text: 'Hello', to: 'en' })).rejects.toThrow(/timed out/i);
    await vi.runAllTimersAsync();
    await assertion;
    expect(attempts).toBe(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels during response consumption without retrying or retaining timeout timers', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let attempts = 0;
    vi.stubGlobal('fetch', () => {
      attempts++;
      return Promise.resolve({ ok: true, json: () => new Promise(() => {}) } as Response);
    });
    const assertion = expect(translateText({ text: 'Hello', to: 'en', signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(1);
    controller.abort();
    await assertion;
    expect(attempts).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not retry transport cancellation represented by an Error name', async () => {
    vi.useFakeTimers();
    let attempts = 0;
    vi.stubGlobal('fetch', () => {
      attempts++;
      return Promise.reject(Object.assign(new Error('Canceled'), { name: 'AbortError' }));
    });
    const assertion = expect(translateText({ text: 'Hello', to: 'en' })).rejects.toMatchObject({ name: 'AbortError' });
    await vi.runAllTimersAsync();
    await assertion;
    expect(attempts).toBe(1);
  });

  it('does not send an already-canceled request', async () => {
    const controller = new AbortController();
    controller.abort();
    let attempts = 0;
    vi.stubGlobal('fetch', () => { attempts++; return Promise.resolve(jsonResponse([])); });
    await expect(translateText({ text: 'Hello', to: 'en', signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' });
    expect(attempts).toBe(0);
  });
});
