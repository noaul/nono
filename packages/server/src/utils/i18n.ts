export type Locale = 'zh' | 'en';

export const DEFAULT_LOCALE: Locale = 'zh';

const zh = {
  apiUrlProtocol: 'API 地址必须使用 HTTP 或 HTTPS',
  needProviderAndKey: '请填写 Provider 和 API Key 后再测试',
  cannotFetchUrl: '无法抓取该地址',
  needNoStarFields: '请完整填写 API 地址、模型和 API Key',
  connectFailedHttp: '连接失败：HTTP {status}',

  linkTimeout: '检测超时',
  linkInvalid: '链接无效',
  linkBroken: '访问异常',
  linkNotificationTitle: '{name} {status}',
  releaseTitle: '{repo} 发布 {tag}',
  releaseFallback: 'NoStar 发现新的 GitHub Release',
  sourceDomain: '域名',
  sourceVps: 'VPS',
  sourceSubscription: '订阅',
  overdueDays: '已逾期 {days} 天',
  dueToday: '今天到期',
  dueInDays: '{days} 天后到期',
  dueDate: '到期日期 {date}',
  noBackupYet: '尚无可用的全站备份',
  noBackupYetHint: '请创建并校验一次全站备份',
  backupStale: '全站备份已过期',
  backupStaleHint: '最近备份创建于 {date}',
  backupFailed: '自动备份失败',
} as const;

type MessageKey = keyof typeof zh;

const en: Record<MessageKey, string> = {
  apiUrlProtocol: 'The API URL must use HTTP or HTTPS',
  needProviderAndKey: 'Fill in the provider and API key before testing',
  cannotFetchUrl: 'Could not fetch that URL',
  needNoStarFields: 'Fill in the API URL, model, and API key',
  connectFailedHttp: 'Connection failed: HTTP {status}',

  linkTimeout: 'timed out',
  linkInvalid: 'is invalid',
  linkBroken: 'is unreachable',
  linkNotificationTitle: '{name} {status}',
  releaseTitle: '{repo} released {tag}',
  releaseFallback: 'NoStar found a new GitHub release',
  sourceDomain: 'Domain',
  sourceVps: 'VPS',
  sourceSubscription: 'Subscription',
  overdueDays: 'Overdue by {days} days',
  dueToday: 'Due today',
  dueInDays: 'Due in {days} days',
  dueDate: 'Due {date}',
  noBackupYet: 'No full backup available yet',
  noBackupYetHint: 'Create and verify a full backup',
  backupStale: 'The full backup is out of date',
  backupStaleHint: 'The most recent backup was created {date}',
  backupFailed: 'Automatic backup failed',
};

const catalogues: Record<Locale, Record<MessageKey, string>> = { zh, en };

export function isLocale(value: unknown): value is Locale {
  return value === 'zh' || value === 'en';
}

/**
 * Picks the locale for one request. The web client forwards the visitor's resolved choice in
 * `x-nono-locale`; anything else falls back to Accept-Language, then Chinese.
 */
export function resolveRequestLocale(headers: Record<string, unknown>): Locale {
  const explicit = headers['x-nono-locale'];
  if (isLocale(explicit)) return explicit;

  const accept = String(headers['accept-language'] || '').toLowerCase();
  for (const part of accept.split(',')) {
    const tag = part.split(';')[0]?.trim();
    if (!tag) continue;
    if (tag === 'zh' || tag.startsWith('zh-')) return 'zh';
    if (tag === 'en' || tag.startsWith('en-')) return 'en';
  }
  return DEFAULT_LOCALE;
}

export function t(locale: Locale, key: MessageKey, params?: Record<string, string | number>): string {
  const template = catalogues[locale]?.[key] ?? zh[key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (
    name in params ? String(params[name]) : match
  ));
}
