export type Currency = 'CNY' | 'USD' | 'GBP' | 'EUR' | 'CAD';
export type BillingCycle = 'monthly' | 'quarterly' | 'annual' | 'biennial';
export type AssetStatus = 'active' | 'paused' | 'expired' | 'cancelled' | 'archived';
export type AssetType = 'phone' | 'vps' | 'domain' | 'subscription';
export type AccountType = 'telegram' | 'whatsapp' | 'signal' | 'wechat' | 'line' | 'discord' | 'viber' | 'other';

export interface User {
  id: number;
  username: string;
  email: string;
}

export type DailyStatusState = 'operational' | 'degraded' | 'outage' | 'no_data';
export type OverallStatus = 'operational' | 'degraded' | 'partial_outage' | 'major_outage' | 'no_data';

export interface StatusDay {
  day: string;
  state: DailyStatusState;
  uptimePercent: number | null;
  sampleCount: number;
  incidents: number;
}

export interface StatusOverview {
  overallStatus: OverallStatus;
  range: { start: string; end: string; days: number };
  items: Array<{
    id: number;
    name: string;
    provider: string | null;
    location: string | null;
    configured: boolean;
    currentState: DailyStatusState;
    uptimePercent: number | null;
    history: StatusDay[];
  }>;
  domainStats: {
    total: number;
    active: number;
    expiringWithin30Days: number;
    autoRenew: number;
    registrars: number;
    topSuffix: string | null;
  };
}

export interface CommunicationAccount {
  id: number;
  accountType: AccountType;
  phoneNumber: string;
  countryCallingCode: string;
  countryIso: string;
  boundEmail: string;
  loginDevice: string | null;
  displayName: string | null;
  notes: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetItem {
  id: number;
  assetType: AssetType;
  amountMinorUnits: number;
  currency: Currency;
  displayAmountMinorUnits?: number | null;
  displayCurrency?: Currency;
  displayExchangeRateDate?: string | null;
  billingCycle: BillingCycle;
  nextDueDate: string | null;
  expireDate?: string | null;
  autoRenew: boolean;
  paymentMethod: string | null;
  renewalUrl: string | null;
  status: AssetStatus;
  tags: string[];
  notes: string | null;
  archivedAt: string | null;
  [key: string]: unknown;
}

export interface ExpenseItem {
  id: number;
  assetType: AssetType;
  assetId: number;
  assetLabel: string | null;
  amountMinorUnits: number;
  currency: Currency;
  paidAt: string;
  periodStart: string | null;
  periodEnd: string | null;
  category: 'renewal' | 'monthly' | 'setup' | 'other';
  notes: string | null;
}

export interface DashboardSummary {
  predictedMonthly: Partial<Record<Currency, number>>;
  predictedYearly: Partial<Record<Currency, number>>;
  actualYearly: Partial<Record<Currency, number>>;
  assetCounts: Record<string, number>;
  categoryCosts: Partial<Record<AssetType, DashboardCategoryCost>>;
  expiringCount: number;
  dueBuckets?: {
    overdue: number;
    today: number;
    week: number;
    month: number;
  };
  nextDueItems?: DueItem[];
  phoneStats?: {
    total: number;
    domestic: number;
    foreign: number;
    monthlyRentByCurrency: Partial<Record<Currency, number>>;
    carriers: Array<{ carrier: string; count: number }>;
  };
  currencyTotals?: {
    predictedMonthly: Partial<Record<Currency, number>>;
    predictedYearly: Partial<Record<Currency, number>>;
    actualYearly: Partial<Record<Currency, number>>;
  };
}

export interface DashboardCostSubcategory {
  key: string;
  label: string;
  count: number;
  predictedMonthly: Partial<Record<Currency, number>>;
  predictedYearly: Partial<Record<Currency, number>>;
  oneTimeCost: Partial<Record<Currency, number>>;
}

export interface DashboardCategoryCost {
  assetType: AssetType;
  assetCount: number;
  recurringCount: number;
  predictedMonthly: Partial<Record<Currency, number>>;
  predictedYearly: Partial<Record<Currency, number>>;
  actualYearly: Partial<Record<Currency, number>>;
  oneTimeCost: Partial<Record<Currency, number>>;
  dueCount: number;
  subcategories: DashboardCostSubcategory[];
}

export interface DueItem {
  assetType: AssetType;
  assetId: number;
  name: string;
  dueDate: string;
  daysLeft: number;
  amountMinorUnits: number;
  currency: Currency;
  billingCycle: BillingCycle;
  autoRenew: boolean;
  renewalUrl: string | null;
  status: AssetStatus;
}

export interface SettingsValue {
  reminderDays: number[];
  reminderEnabled: boolean;
  defaultCurrency: Currency;
  timezone: string;
  language: 'zh' | 'en';
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpFrom: string;
  smtpTo: string;
  webdavUrl: string;
  webdavUsername: string;
  webdavPassword: string;
  webdavPath: string;
  webdavFolderPath: string;
  webdavBackupFilename: string;
  webdavEncryptionKey: string;
  webdavPasswordSet?: boolean;
  webdavEncryptionKeySet?: boolean;
}

export interface ListMeta {
  total: number;
  limit: number;
  offset: number;
  summary?: {
    totalsByCurrency: Partial<Record<Currency, number>>;
    assetTypeCounts: Partial<Record<AssetType, number>>;
    categoryCounts: Partial<Record<'renewal' | 'monthly' | 'setup' | 'other', number>>;
    earliestPaidAt: string | null;
    latestPaidAt: string | null;
  };
  registrarAccounts?: Array<{
    registrar: string;
    account: string;
    value: string;
    count: number;
  }>;
  renewalTotals?: {
    count: number;
    windowStart: string;
    windowEnd: string;
    byCurrency: Partial<Record<Currency, number>>;
    displayCurrency: Currency;
    convertedTotal: {
      amountMinorUnits: number;
      currency: Currency;
      exchangeRateDate: string | null;
    };
    yearlyTotal?: {
      count: number;
      windowStart: string;
      windowEnd: string;
      byCurrency: Partial<Record<Currency, number>>;
      convertedTotal: {
        amountMinorUnits: number;
        currency: Currency;
        exchangeRateDate: string | null;
      };
    };
  };
}

export interface ListResponse<T> {
  items: T[];
  meta?: ListMeta;
}

export interface AssetLookupItem {
  assetType: AssetType;
  assetId: number;
  label: string;
  provider: string | null;
  status: AssetStatus | string;
  currency: Currency;
  amountMinorUnits: number;
}

export interface ReminderLogItem {
  id: number;
  runId: string;
  assetType: AssetType;
  assetId: number;
  dueDate: string;
  daysBefore: number;
  sentAt: string;
  status: 'sent' | 'failed';
  errorMessage: string | null;
}
