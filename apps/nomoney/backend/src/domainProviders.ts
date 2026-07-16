export interface ProviderProfile {
  name: string;
  aliases: string[];
  consoleUrl: string;
}

export const registrarProfiles: ProviderProfile[] = [
  {
    name: 'Spaceship',
    aliases: ['spaceship'],
    consoleUrl: 'https://www.spaceship.com/application/domain-list-application'
  },
  {
    name: 'Google Cloud',
    aliases: ['google cloud', 'google cloude', 'google domains'],
    consoleUrl: 'https://console.cloud.google.com/net-services/domains/registrations'
  },
  {
    name: 'Cloudflare',
    aliases: ['cloudflare', 'cloudfare'],
    consoleUrl: 'https://dash.cloudflare.com'
  },
  {
    name: 'netcup',
    aliases: ['netcup'],
    consoleUrl: 'https://www.customercontrolpanel.de'
  },
  {
    name: 'Namecheap',
    aliases: ['namecheap'],
    consoleUrl: 'https://ap.www.namecheap.com/domains/list'
  },
  {
    name: 'Porkbun',
    aliases: ['porkbun'],
    consoleUrl: 'https://porkbun.com/account/domainsSpeedy'
  },
  {
    name: 'Dynadot',
    aliases: ['dynadot'],
    consoleUrl: 'https://www.dynadot.com/account/domain/setting'
  },
  {
    name: 'GoDaddy',
    aliases: ['godaddy', 'go daddy'],
    consoleUrl: 'https://dcc.godaddy.com/domains'
  },
  {
    name: 'NameSilo',
    aliases: ['namesilo'],
    consoleUrl: 'https://www.namesilo.com/account_domains.php'
  },
  {
    name: 'Name.com',
    aliases: ['name.com', 'namecom'],
    consoleUrl: 'https://www.name.com/account/domains'
  },
  {
    name: 'Gandi',
    aliases: ['gandi'],
    consoleUrl: 'https://admin.gandi.net/domain'
  },
  {
    name: 'AWS Route 53',
    aliases: ['aws route 53', 'route 53', 'aws'],
    consoleUrl: 'https://console.aws.amazon.com/route53/v2/hostedzones'
  },
  {
    name: 'Alibaba Cloud',
    aliases: ['alibaba cloud', 'aliyun', '阿里云'],
    consoleUrl: 'https://dc.console.aliyun.com/next/index'
  },
  {
    name: 'Tencent Cloud',
    aliases: ['tencent cloud', '腾讯云'],
    consoleUrl: 'https://console.cloud.tencent.com/domain'
  }
];

const multiPartTlds = new Set(['co.uk', 'com.cn', 'net.cn', 'org.cn', 'com.au', 'co.jp']);

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

export function findProviderProfile(value: unknown, profiles = registrarProfiles): ProviderProfile | undefined {
  const normalized = normalizeProviderName(value);
  return profiles.find((profile) => profile.aliases.includes(normalized) || profile.name.toLowerCase() === normalized);
}

export function providerConsoleUrl(value: unknown, profiles = registrarProfiles): string | null {
  return findProviderProfile(value, profiles)?.consoleUrl ?? null;
}

export function normalizeDomainExtension(value: unknown): string | null {
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;
  return text.startsWith('.') ? text : `.${text}`;
}

export function inferDomainExtension(domainName: unknown): string | null {
  const normalized = normalizeDomainName(domainName);
  const parts = normalized.split('.').filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  const lastTwo = parts.slice(-2).join('.');
  return normalizeDomainExtension(multiPartTlds.has(lastTwo) && parts.length > 2 ? lastTwo : parts[parts.length - 1]);
}

export function composeDomainName(domainName: unknown, domainExtension?: unknown): string {
  const normalized = normalizeDomainName(domainName);
  const extension = normalizeDomainExtension(domainExtension) ?? inferDomainExtension(normalized);
  if (!extension) {
    return normalized;
  }
  if (normalized.endsWith(extension)) {
    return normalized;
  }
  const prefix = domainPrefix(normalized);
  return prefix ? `${prefix}${extension}` : normalized;
}

export function domainPrefix(domainName: unknown, domainExtension?: unknown): string {
  const normalized = normalizeDomainName(domainName);
  const extension = normalizeDomainExtension(domainExtension) ?? inferDomainExtension(normalized);
  if (extension && normalized.endsWith(extension)) {
    return normalized.slice(0, -extension.length).replace(/\.$/, '');
  }
  return normalized.split('.')[0] ?? normalized;
}

export function calculateDomainRarity(domainName: unknown, domainExtension?: unknown): number {
  const extension = normalizeDomainExtension(domainExtension) ?? inferDomainExtension(domainName) ?? '';
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

function normalizeProviderName(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
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
