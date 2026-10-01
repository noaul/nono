import { useSyncExternalStore } from 'react';
import type { Currency, SettingsValue } from './types';
import { api } from './api';

export type Preferences = Pick<SettingsValue, 'defaultCurrency' | 'timezone'>;

let preferences: Preferences = { defaultCurrency: 'CNY', timezone: 'Asia/Shanghai' };
const listeners = new Set<() => void>();

export function getPreferences(): Preferences {
  return preferences;
}

export function getDefaultCurrency(): Currency {
  return preferences.defaultCurrency;
}

export function setPreferences(next: Partial<Preferences>) {
  preferences = { ...preferences, ...next };
  for (const listener of listeners) listener();
}

export async function loadPreferences() {
  const response = await api.get<{ settings: SettingsValue }>('/api/settings');
  setPreferences({ defaultCurrency: response.settings.defaultCurrency, timezone: response.settings.timezone });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePreferences(): Preferences {
  return useSyncExternalStore(subscribe, getPreferences, getPreferences);
}
