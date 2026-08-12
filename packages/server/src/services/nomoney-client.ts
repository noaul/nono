export interface NoMoneyRenewalResult {
  idempotent?: boolean;
  item: Record<string, unknown>;
  renewal?: {
    id: number;
    renewedExpireDate?: string;
    amountMinorUnits?: number;
    currency?: string;
    [key: string]: unknown;
  };
}

export interface NoMoneyClient {
  renewVps(vpsId: number, input: { requestId: string; expectedExpireDate: string }): Promise<NoMoneyRenewalResult>;
  undoVpsRenewal(vpsId: number, renewalId: number): Promise<NoMoneyRenewalResult>;
  updateVpsRenewalExpense(vpsId: number, renewalId: number, amountMinorUnits: number): Promise<NoMoneyRenewalResult>;
}

export function createNoMoneyClient(options: {
  port?: number;
  token?: string;
  fetch?: typeof fetch;
  serviceName?: string;
} = {}): NoMoneyClient {
  const port = options.port || Number(process.env.NOMONEY_INTERNAL_PORT || 2030);
  const token = options.token ?? process.env.NOMONEY_INTERNAL_TOKEN ?? '';
  const request = options.fetch || fetch;
  const serviceName = options.serviceName || 'NoMoney';

  async function send(path: string, method: 'POST' | 'PUT', body?: Record<string, unknown>) {
    if (!token) throw serviceError(503, `${serviceName} internal authentication is not configured`);
    const response = await request(`http://127.0.0.1:${port}/api/internal${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-nono-internal-token': token,
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    }).catch(() => {
      throw serviceError(502, `${serviceName} is unavailable`);
    });
    const payload = await response.json().catch(() => ({})) as {
      error?: { message?: string };
      [key: string]: unknown;
    };
    if (!response.ok) throw serviceError(response.status, payload.error?.message || `${serviceName} request failed`);
    return payload as unknown as NoMoneyRenewalResult;
  }

  return {
    renewVps: (vpsId, input) => send(`/vps/${vpsId}/renew`, 'POST', input),
    undoVpsRenewal: (vpsId, renewalId) => send(`/vps/${vpsId}/renewals/${renewalId}/undo`, 'POST'),
    updateVpsRenewalExpense: (vpsId, renewalId, amountMinorUnits) => (
      send(`/vps/${vpsId}/renewals/${renewalId}/expense`, 'PUT', { amountMinorUnits })
    ),
  };
}

function serviceError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode });
}
