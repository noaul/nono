import type { Currency } from './types.js';

export type ExchangeRates = {
  base: Currency;
  rates: Partial<Record<Currency, number>>;
  date: string | null;
};

const supportedCurrencies = new Set<Currency>(['CNY', 'USD', 'GBP', 'EUR', 'CAD']);

export async function fetchExchangeRates(
  fetcher: typeof fetch | undefined,
  base: Currency,
  quotes: Currency[],
  timeoutMs = 1000,
): Promise<ExchangeRates> {
  const uniqueQuotes = Array.from(new Set(quotes.filter((quote) => quote !== base)));
  if (!fetcher || uniqueQuotes.length === 0) return emptyRates(base);

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
