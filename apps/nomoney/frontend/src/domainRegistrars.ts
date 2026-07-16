export interface RegistrarProfile {
  name: string;
  aliases: string[];
  consoleUrl: string;
  color: string;
}

export const registrarProfiles: RegistrarProfile[] = [
  {
    name: 'Spaceship',
    aliases: ['spaceship'],
    consoleUrl: 'https://www.spaceship.com/application/domain-list-application',
    color: 'bg-blue-500'
  },
  {
    name: 'Google Cloud',
    aliases: ['google cloud', 'google cloude', 'google domains'],
    consoleUrl: 'https://console.cloud.google.com/net-services/domains/registrations',
    color: 'bg-emerald-500'
  },
  {
    name: 'Cloudflare',
    aliases: ['cloudflare', 'cloudfare'],
    consoleUrl: 'https://dash.cloudflare.com',
    color: 'bg-amber-500'
  },
  {
    name: 'netcup',
    aliases: ['netcup'],
    consoleUrl: 'https://www.customercontrolpanel.de',
    color: 'bg-rose-500'
  },
  {
    name: 'Namecheap',
    aliases: ['namecheap'],
    consoleUrl: 'https://ap.www.namecheap.com/domains/list',
    color: 'bg-orange-500'
  },
  {
    name: 'Porkbun',
    aliases: ['porkbun'],
    consoleUrl: 'https://porkbun.com/account/domainsSpeedy',
    color: 'bg-pink-500'
  },
  {
    name: 'Dynadot',
    aliases: ['dynadot'],
    consoleUrl: 'https://www.dynadot.com/account/domain/setting',
    color: 'bg-violet-500'
  },
  {
    name: 'GoDaddy',
    aliases: ['godaddy', 'go daddy'],
    consoleUrl: 'https://dcc.godaddy.com/domains',
    color: 'bg-cyan-500'
  },
  {
    name: 'NameSilo',
    aliases: ['namesilo'],
    consoleUrl: 'https://www.namesilo.com/account_domains.php',
    color: 'bg-lime-500'
  },
  {
    name: 'Gandi',
    aliases: ['gandi'],
    consoleUrl: 'https://admin.gandi.net/domain',
    color: 'bg-slate-500'
  },
  {
    name: 'AWS Route 53',
    aliases: ['aws route 53', 'route 53', 'aws'],
    consoleUrl: 'https://console.aws.amazon.com/route53/v2/hostedzones',
    color: 'bg-yellow-500'
  },
  {
    name: 'Alibaba Cloud',
    aliases: ['alibaba cloud', 'aliyun', '阿里云'],
    consoleUrl: 'https://dc.console.aliyun.com/next/index',
    color: 'bg-orange-600'
  },
  {
    name: 'Tencent Cloud',
    aliases: ['tencent cloud', '腾讯云'],
    consoleUrl: 'https://console.cloud.tencent.com/domain',
    color: 'bg-blue-600'
  }
];

export const dnsProviderProfiles: RegistrarProfile[] = [
  {
    name: 'Cloudflare',
    aliases: ['cloudflare', 'cloudfare'],
    consoleUrl: 'https://dash.cloudflare.com',
    color: 'bg-amber-500'
  },
  {
    name: 'Google Cloud DNS',
    aliases: ['google cloud dns', 'google cloud', 'google cloude'],
    consoleUrl: 'https://console.cloud.google.com/net-services/dns/zones',
    color: 'bg-emerald-500'
  },
  {
    name: 'AWS Route 53',
    aliases: ['aws route 53', 'route 53', 'aws'],
    consoleUrl: 'https://console.aws.amazon.com/route53/v2/hostedzones',
    color: 'bg-yellow-500'
  },
  {
    name: 'DNSPod',
    aliases: ['dnspod', 'tencent dns', '腾讯云 dns'],
    consoleUrl: 'https://console.dnspod.cn/dns/list',
    color: 'bg-blue-600'
  },
  {
    name: 'Alibaba Cloud DNS',
    aliases: ['alibaba cloud dns', 'aliyun dns', '阿里云 dns'],
    consoleUrl: 'https://dns.console.aliyun.com/',
    color: 'bg-orange-600'
  },
  {
    name: 'Spaceship DNS',
    aliases: ['spaceship dns', 'spaceship'],
    consoleUrl: 'https://www.spaceship.com/application/domain-list-application',
    color: 'bg-blue-500'
  },
  {
    name: 'netcup DNS',
    aliases: ['netcup dns', 'netcup'],
    consoleUrl: 'https://www.customercontrolpanel.de',
    color: 'bg-rose-500'
  },
  {
    name: 'Namecheap DNS',
    aliases: ['namecheap dns', 'namecheap'],
    consoleUrl: 'https://ap.www.namecheap.com/domains/list',
    color: 'bg-orange-500'
  },
  {
    name: 'Porkbun DNS',
    aliases: ['porkbun dns', 'porkbun'],
    consoleUrl: 'https://porkbun.com/account/domainsSpeedy',
    color: 'bg-pink-500'
  }
];

export const commonDomainExtensions = [
  '.com',
  '.cc',
  '.de',
  '.net',
  '.org',
  '.me',
  '.dev',
  '.app',
  '.io',
  '.ai',
  '.co',
  '.cn',
  '.xyz',
  '.cloud',
  '.co.uk',
  '.com.cn',
  '.net.cn',
  '.org.cn',
  '.top'
];

const suffixWeights: Record<string, number> = {
  '.com': 28,
  '.ai': 24,
  '.io': 22,
  '.de': 20,
  '.cc': 19,
  '.co': 18,
  '.me': 17,
  '.org': 16,
  '.net': 14,
  '.cn': 14,
  '.co.uk': 14,
  '.dev': 13,
  '.app': 13,
  '.xyz': 8,
  '.cloud': 6,
  '.top': 5
};

export function findRegistrarProfile(value: unknown): RegistrarProfile | undefined {
  return findProviderProfile(value, registrarProfiles);
}

export function findDnsProviderProfile(value: unknown): RegistrarProfile | undefined {
  return findProviderProfile(value, dnsProviderProfiles);
}

export function findProviderProfile(value: unknown, profiles: RegistrarProfile[]): RegistrarProfile | undefined {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return profiles.find((profile) => profile.aliases.includes(normalized) || profile.name.toLowerCase() === normalized);
}

export function inferDomainExtension(domainName: unknown): string {
  const normalized = String(domainName ?? '').trim().toLowerCase().replace(/\.$/, '');
  const parts = normalized.split('.').filter(Boolean);
  if (parts.length < 2) return '';
  const multiPartTlds = new Set(['co.uk', 'com.cn', 'net.cn', 'org.cn', 'com.au', 'co.jp']);
  const lastTwo = parts.slice(-2).join('.');
  return `.${multiPartTlds.has(lastTwo) && parts.length > 2 ? lastTwo : parts[parts.length - 1]}`;
}

export function normalizeDomainExtension(value: unknown): string {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return '';
  return text.startsWith('.') ? text : `.${text}`;
}

export function domainPrefix(domainName: unknown, domainExtension?: unknown): string {
  const normalized = normalizeDomainName(domainName);
  const extension = normalizeDomainExtension(domainExtension) || inferDomainExtension(normalized);
  if (extension && normalized.endsWith(extension)) {
    return normalized.slice(0, -extension.length).replace(/\.$/, '');
  }
  return normalized.split('.')[0] ?? normalized;
}

export function composeDomainName(domainPrefixOrName: unknown, domainExtension: unknown): string {
  const prefix = domainPrefix(domainPrefixOrName, domainExtension);
  const extension = normalizeDomainExtension(domainExtension);
  return extension && prefix ? `${prefix}${extension}` : normalizeDomainName(domainPrefixOrName);
}

export function calculateDomainRarity(domainName: unknown, domainExtension?: unknown): number {
  const extension = normalizeDomainExtension(domainExtension) || inferDomainExtension(domainName);
  const prefix = domainPrefix(domainName, extension);
  const length = prefix.length;
  const lengthScore =
    length <= 1 ? 44 :
    length === 2 ? 38 :
    length === 3 ? 32 :
    length === 4 ? 26 :
    length === 5 ? 21 :
    length <= 8 ? 15 :
    length <= 12 ? 8 :
    3;
  const suffixScore = suffixWeights[extension] ?? 7;
  const cleanScore = /^[a-z]+$/.test(prefix) ? 15 : /^[a-z0-9]+$/.test(prefix) ? 9 : 2;
  const shortBonus = /^[a-z]+$/.test(prefix) && length <= 3 ? 8 : 0;
  const hyphenPenalty = prefix.includes('-') ? 10 : 0;
  const numberPenalty = /\d/.test(prefix) ? 6 : 0;
  return Math.max(0, Math.min(100, suffixScore + lengthScore + cleanScore + shortBonus - hyphenPenalty - numberPenalty));
}

export function domainLink(item: Record<string, unknown>): string | null {
  return stringValue(item.registrarUrl) || stringValue(item.renewalUrl) || findRegistrarProfile(item.registrar)?.consoleUrl || null;
}

export function dnsProviderLink(item: Record<string, unknown>): string | null {
  return findDnsProviderProfile(item.dnsProvider)?.consoleUrl ?? null;
}

export function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function normalizeDomainName(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/\.$/, '')
    .replace(/\s+/g, '');
}
