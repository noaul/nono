import { en } from './en';
import { zh, type Messages } from './zh';
import type { Locale } from '@/utils/locale';

export type { Messages };

export const catalogues: Record<Locale, Messages> = { zh, en };

/** Dot-notation keys of the catalogue, e.g. 'appearance.theme'. */
type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<Messages>;

function lookup(messages: Messages, key: string): string | undefined {
  let current: unknown = messages;
  for (const part of key.split('.')) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : undefined;
}

/** Replaces `{name}` placeholders; a missing param is left visible rather than blanked out. */
function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (
    name in params ? String(params[name]) : match
  ));
}

/**
 * Resolves a key in the requested locale, falling back to Chinese (the source catalogue) and
 * finally to the key itself, so an untranslated screen degrades to readable text.
 */
export function translate(locale: Locale, key: MessageKey, params?: Record<string, string | number>): string {
  const template = lookup(catalogues[locale], key) ?? lookup(zh, key);
  return template === undefined ? key : interpolate(template, params);
}
