import type { PortalSettings } from '@/api/types';

export const portalDefaults: PortalSettings = {
  enabled: true,
  url: '/nodesk',
  label: '前往 Nodesk',
  imageUrl: '',
  openInNewTab: false,
};

export function getPortalSettings(settings: unknown, fallbackUrl = portalDefaults.url): PortalSettings {
  const record = isRecord(settings) && isRecord(settings.portal) ? settings.portal : {};

  return {
    enabled: typeof record.enabled === 'boolean' ? record.enabled : portalDefaults.enabled,
    url: safeHttpUrl(valueOrFallback(record.url, fallbackUrl)),
    label: stringValue(record.label) || portalDefaults.label,
    imageUrl: safeImageUrl(stringValue(record.imageUrl)),
    openInNewTab: typeof record.openInNewTab === 'boolean' ? record.openInNewTab : portalDefaults.openInNewTab,
  };
}

export function safeHttpUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;

  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export function safeImageUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return trimmed;
  return safeHttpUrl(trimmed);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function valueOrFallback(value: unknown, fallback: string) {
  return stringValue(value) || fallback;
}
