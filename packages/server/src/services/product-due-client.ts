export interface ProductDueItem {
  assetType: 'phone' | 'domain' | 'vps' | 'subscription';
  id: number;
  name: string;
  dueDate: string;
  status: string;
}

export function createProductDueReader(options: {
  port?: number;
  token?: string;
  serviceName: string;
  fetch?: typeof fetch;
}): () => Promise<ProductDueItem[]> {
  const port = options.port || 2030;
  const token = options.token ?? '';
  const request = options.fetch || fetch;

  return async () => {
    if (!token) {
      throw serviceError(503, `${options.serviceName} internal notification authentication is not configured`);
    }
    const response = await request(`http://127.0.0.1:${port}/api/internal/notifications/due`, {
      headers: { 'x-nono-internal-token': token },
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    }).catch(() => {
      throw serviceError(502, `${options.serviceName} notification service is unavailable`);
    });
    if (!response.ok) {
      throw serviceError(response.status, `${options.serviceName} notification service rejected the request`);
    }
    const payload = await response.json().catch(() => null);
    const items = payload && typeof payload === 'object' && Array.isArray((payload as { items?: unknown }).items)
      ? (payload as { items: unknown[] }).items
      : null;
    if (!items) throw serviceError(502, `${options.serviceName} returned an invalid notification feed`);

    const parsed = items.map(parseDueItem);
    if (parsed.some((item) => item === null)) {
      throw serviceError(502, `${options.serviceName} returned an invalid notification feed`);
    }
    return parsed as ProductDueItem[];
  };
}

function parseDueItem(value: unknown): ProductDueItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const assetType = item.assetType;
  const id = Number(item.id);
  const name = typeof item.name === 'string' ? item.name.trim() : '';
  const dueDate = typeof item.dueDate === 'string' ? item.dueDate : '';
  const status = typeof item.status === 'string' ? item.status : '';
  if (!['phone', 'domain', 'vps', 'subscription'].includes(String(assetType))) return null;
  if (!Number.isSafeInteger(id) || id <= 0 || !name || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !status) return null;
  return { assetType: assetType as ProductDueItem['assetType'], id, name, dueDate, status };
}

function serviceError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}
