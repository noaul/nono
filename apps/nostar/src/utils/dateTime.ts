export const APP_TIME_ZONE = 'Asia/Shanghai';

export function shanghaiDateKey(value: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function formatShanghaiDate(value: string | number | Date, locale?: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale, {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).format(date);
}

export function formatShanghaiDateTime(value: string | number | Date, locale?: string): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(locale, {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

const relativeFormatters = new Map<string, Intl.RelativeTimeFormat>();

function relativeFormatter(language: 'zh' | 'en'): Intl.RelativeTimeFormat {
  const locale = language === 'zh' ? 'zh-CN' : 'en';
  let formatter = relativeFormatters.get(locale);
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    relativeFormatters.set(locale, formatter);
  }
  return formatter;
}

/**
 * "9 months ago" / "9个月前" in the UI language, without bundling a date-library locale.
 * Thresholds follow the usual humanised steps (45s, 45min, 22h, 26d, 11mo), so a value rounds to
 * the largest unit that still reads naturally.
 */
export function formatRelativeTime(
  value: string | number | Date,
  language: 'zh' | 'en',
  now: number = Date.now(),
): string {
  const time = (value instanceof Date ? value : new Date(value)).getTime();
  if (Number.isNaN(time)) return '';

  const formatter = relativeFormatter(language);
  const seconds = (time - now) / 1000;
  const sign = seconds < 0 ? -1 : 1;
  const abs = Math.abs(seconds);
  const step = (amount: number) => sign * Math.max(1, Math.round(amount));

  if (abs < 45) return formatter.format(0, 'second');
  const minutes = abs / 60;
  if (minutes < 45) return formatter.format(step(minutes), 'minute');
  const hours = minutes / 60;
  if (hours < 22) return formatter.format(step(hours), 'hour');
  const days = hours / 24;
  if (days < 26) return formatter.format(step(days), 'day');
  const months = days / 30.4375;
  if (months < 11) return formatter.format(step(months), 'month');
  return formatter.format(step(days / 365.25), 'year');
}
