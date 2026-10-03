import type { MobileBridge } from './bridge';

/** Never retry logout automatically: a transport failure leaves remote revocation uncertain. */
export async function logoutSharedSession(options: {
  bridge: MobileBridge | null;
  fetcher?: typeof fetch;
  navigate: (url: string) => void;
  confirmLocalLogout: () => boolean;
}): Promise<'native' | 'browser' | 'local' | 'canceled'> {
  let response: Response;
  try {
    response = await (options.fetcher || fetch)('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
  } catch (error) {
    if (!options.bridge?.supports('session.clear')) throw error;
    if (!options.confirmLocalLogout()) return 'canceled';
    options.bridge.send('session.clear');
    return 'local';
  }
  if (!response.ok) throw new Error(`Logout failed (HTTP ${response.status})`);
  if (options.bridge?.supports('session.clear')) {
    options.bridge.send('session.clear');
    return 'native';
  }
  options.navigate('/login');
  return 'browser';
}
