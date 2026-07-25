export type VpsCapacityKind = 'cpu' | 'memory' | 'storage';

export function formatVpsCapacity(value: unknown, kind: VpsCapacityKind): string {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  if (!text) return '-';

  if (kind === 'cpu') {
    const cpu = text.match(/(\d+(?:\.\d+)?)\s*(?:v?cpus?|cores?|核)/i);
    return cpu ? `${formatNumber(cpu[1])} vCPU` : compactFallback(text);
  }

  const capacity = text.match(/(\d+(?:\.\d+)?)\s*(KiB|MiB|GiB|TiB|KB|MB|GB|TB)\b/i);
  if (!capacity) return compactFallback(text);

  return `${formatNumber(capacity[1])} ${capacity[2].toUpperCase().replace('IB', 'B')}`;
}

function formatNumber(value: string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : value;
}

function compactFallback(value: string): string {
  return value.split('/', 1)[0]?.trim() || '-';
}
