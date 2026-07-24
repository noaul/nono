import type { CSSProperties } from 'react';
import { MessageCircle } from 'lucide-react';
import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js';
import { siDiscord, siLine, siSignal, siTelegram, siViber, siWechat, siWhatsapp } from 'simple-icons';
import 'flag-icons/css/flag-icons.min.css';
import type { AccountType } from './types';

const appCatalog = {
  telegram: { label: 'Telegram', icon: siTelegram },
  whatsapp: { label: 'WhatsApp', icon: siWhatsapp },
  signal: { label: 'Signal', icon: siSignal },
  wechat: { label: '微信', icon: siWechat },
  line: { label: 'LINE', icon: siLine },
  discord: { label: 'Discord', icon: siDiscord },
  viber: { label: 'Viber', icon: siViber },
  other: { label: '其他', icon: null }
} satisfies Record<AccountType, { label: string; icon: typeof siTelegram | null }>;

export const accountTypes = Object.keys(appCatalog) as AccountType[];

export type CountryOption = {
  iso: CountryCode;
  callingCode: string;
  name: string;
};

export function getAccountTypeLabel(type: AccountType, language: 'zh' | 'en'): string {
  if (type === 'other') return language === 'zh' ? '其他' : 'Other';
  if (type === 'wechat') return language === 'zh' ? '微信' : 'WeChat';
  return appCatalog[type].label;
}

export function buildCountryOptions(language: 'zh' | 'en'): CountryOption[] {
  const locale = language === 'zh' ? 'zh-CN' : 'en';
  const displayNames = new Intl.DisplayNames([locale], { type: 'region' });
  return getCountries()
    .map((iso) => ({
      iso,
      callingCode: `+${getCountryCallingCode(iso)}`,
      name: displayNames.of(iso) ?? iso
    }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}

export function AccountAppIcon({ type, size = 20 }: { type: AccountType; size?: number }) {
  const entry = appCatalog[type];
  if (!entry.icon) return <MessageCircle aria-hidden="true" size={size} />;

  const style = { color: `#${entry.icon.hex}` } satisfies CSSProperties;
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style}>
      <path d={entry.icon.path} />
    </svg>
  );
}

export function CountryFlag({ countryIso, className = '' }: { countryIso: string; className?: string }) {
  const normalized = countryIso.toLowerCase();
  return (
    <span
      aria-label={countryIso.toUpperCase()}
      className={`fi fi-${normalized} rounded-[2px] shadow-sm ring-1 ring-slate-950/10 ${className}`}
      role="img"
    />
  );
}
