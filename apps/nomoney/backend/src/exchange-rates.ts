import type { Currency } from './types.js';
import { currencies } from './utils.js';

export type ExchangeRates = {
  base: Currency;
  rates: Partial<Record<Currency, number>>;
  date: string | null;
};

const supportedCurrencies = new Set<Currency>(currencies);

const cacheTtlMs = 6 * 60 * 60 * 1000;
// Keyed by fetcher so each caller (and each test context) gets its own cache.
const rateCaches = new WeakMap<typeof fetch, Map<string, { at: number; rates: ExchangeRates }>>();

export async function fetchExchangeRates(
  fetcher: typeof fetch | undefined,
  base: Currency,
  quotes: Currency[],
  timeoutMs = 1000,
): Promise<ExchangeRates> {
  const uniqueQuotes = Array.from(new Set(quotes.filter((quote) => quote !== base))).sort();
  if (!fetcher || uniqueQuotes.length === 0) return emptyRates(base);
  const cacheKey = `${base}:${uniqueQuotes.join(',')}`;
  let rateCache = rateCaches.get(fetcher);
  if (!rateCache) rateCaches.set(fetcher, rateCache = new Map());
  const cached = rateCache.get(cacheKey);
  if (cached && Date.now() - cached.at < cacheTtlMs) return cached.rates;
  const rates = await requestExchangeRates(fetcher, base, uniqueQuotes, timeoutMs);
  // Only complete answers are cached, so a transient failure is retried next time.
  if (uniqueQuotes.every((quote) => rates.rates[quote])) rateCache.set(cacheKey, { at: Date.now(), rates });
  return rates;
}

/** Sums per-currency totals into `target`; `complete` is false when a rate was unavailable. */
export async function convertTotals(
  fetcher: typeof fetch | undefined,
  values: Partial<Record<Currency, number>>,
  target: Currency
): Promise<{ currency: Currency; amountMinorUnits: number; complete: boolean; rateDate: string | null }> {
  const sources = (Object.keys(values) as Currency[]).filter((currency) => Number(values[currency] ?? 0) !== 0);
  const rates = await fetchExchangeRates(fetcher, target, sources);
  let total = 0;
  let complete = true;
  for (const currency of sources) {
    const amount = Number(values[currency] ?? 0);
    if (currency === target) total += amount;
    else if (rates.rates[currency]) total += amount / rates.rates[currency]!;
    else complete = false;
  }
  return { currency: target, amountMinorUnits: Math.round(total), complete, rateDate: rates.date };
}

async function requestExchangeRates(
  fetcher: typeof fetch,
  base: Currency,
  uniqueQuotes: Currency[],
  timeoutMs: number
): Promise<ExchangeRates> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const url = `https://api.frankfurter.dev/v2/rates?base=${base}&quotes=${uniqueQuotes.join(',')}`;
    const response = await fetcher(url, { signal: controller.signal });
    if (!response.ok) return emptyRates(base);
    return parseExchangeRates(base, await response.json());
  } catch {
    return emptyRates(base);
  } finally {
    clearTimeout(timeout);
  }
}

function parseExchangeRates(base: Currency, payload: unknown): ExchangeRates {
  const rates: Partial<Record<Currency, number>> = {};
  let date: string | null = null;

  if (Array.isArray(payload)) {
    for (const entry of payload) {
      if (!entry || typeof entry !== 'object') continue;
      const record = entry as Record<string, unknown>;
      const quote = parseCurrency(record.quote);
      const rate = Number(record.rate ?? 0);
      if (!quote || rate <= 0) continue;
      rates[quote] = rate;
      date = stringValue(record.date) || date;
    }
  } else if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    date = stringValue(record.date);
    const rawRates = record.rates && typeof record.rates === 'object'
      ? record.rates as Record<string, unknown>
      : {};
    for (const [currency, value] of Object.entries(rawRates)) {
      const parsedCurrency = parseCurrency(currency);
      const rate = Number(value ?? 0);
      if (parsedCurrency && rate > 0) rates[parsedCurrency] = rate;
    }
  }

  return { base, rates, date };
}

function emptyRates(base: Currency): ExchangeRates {
  return { base, rates: {}, date: null };
}

function parseCurrency(value: unknown): Currency | null {
  const currency = String(value ?? '').trim().toUpperCase() as Currency;
  return supportedCurrencies.has(currency) ? currency : null;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
