import { z } from 'zod';

export const currencySchema = z.enum(['CNY', 'USD', 'GBP', 'EUR', 'CAD']);
export const billingCycleSchema = z.enum(['monthly', 'quarterly', 'annual', 'biennial']);
const domainBillingCycleSchema = z.enum(['annual', 'biennial']);
export const statusSchema = z.enum(['active', 'paused', 'expired', 'cancelled', 'archived']);
const phoneTypeSchema = z.enum(['domestic', 'foreign']);
const vpsTypeSchema = z.enum(['website', 'route', 'residential']);
const sshAuthTypeSchema = z.enum(['password', 'privateKey']);
const sshResultStatusSchema = z.enum(['untested', 'success', 'failed']);
const probeInstallStatusSchema = z.enum(['notInstalled', 'installed', 'failed']);
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const nullableText = z.string().trim().optional().nullable();
const nullableNumber = z.number().optional().nullable();
const nullableMonitorStatus = z.enum(['unknown', 'online', 'offline', 'warning']).optional().nullable();

export const commonAssetSchema = z.object({
  amountMinorUnits: z.number().int().nonnegative(),
  currency: currencySchema,
  billingCycle: billingCycleSchema,
  nextDueDate: dateSchema.optional().nullable(),
  autoRenew: z.boolean().optional().default(false),
  paymentMethod: nullableText,
  renewalUrl: nullableText,
  status: statusSchema.optional().default('active'),
  tags: z.array(z.string().trim().min(1)).optional().default([]),
  notes: nullableText
});

export const phoneSchema = commonAssetSchema.extend({
  phoneType: phoneTypeSchema.optional().default('domestic'),
  isEsim: z.boolean().optional().default(false),
  cardNumber: z.string().trim().min(1),
  poPhoneNumber: nullableText,
  carrier: nullableText,
  planName: nullableText,
  realNamePerson: nullableText,
  userName: nullableText,
  isSecondaryCard: z.boolean().optional().default(false),
  dataAllowanceGb: nullableNumber,
  voiceMinutes: nullableNumber,
  monthlyRentMinorUnits: z.number().int().nonnegative().optional().nullable(),
  attachedServices: nullableText,
  attachedServicesMinorUnits: z.number().int().nonnegative().optional().nullable(),
  discountMinorUnits: z.number().int().nonnegative().optional().nullable(),
  cashbackMinorUnits: z.number().int().nonnegative().optional().nullable(),
  countryCode: nullableText,
  homeLocation: nullableText,
  aPhoneNumber: nullableText,
  mainlandNumber: nullableText,
  realNameMethod: nullableText,
  balanceMinorUnits: z.number().int().optional().nullable(),
  totalKeepaliveUntil: dateSchema.optional().nullable(),
  keepaliveMethod: nullableText,
  minimumKeepaliveAmountMinorUnits: z.number().int().nonnegative().optional().nullable(),
  keepaliveDays: z.number().int().nonnegative().optional().nullable(),
  billingDay: z.number().int().min(1).max(31).optional().nullable(),
  activateDate: dateSchema.optional().nullable(),
  expireDate: dateSchema.optional().nullable()
});

export const vpsSchema = commonAssetSchema.extend({
  name: z.string().trim().min(1),
  vpsType: vpsTypeSchema.optional().nullable(),
  provider: nullableText,
  ipAddress: nullableText,
  location: nullableText,
  cpu: nullableText,
  memory: nullableText,
  storage: nullableText,
  bandwidth: nullableText,
  os: nullableText,
  sshHost: nullableText,
  sshPort: z.number().int().min(1).max(65535).optional().nullable(),
  sshUser: nullableText,
  sshAuthType: sshAuthTypeSchema.optional().nullable(),
  sshPassword: nullableText,
  sshPrivateKey: nullableText,
  sshPrivateKeyPassphrase: nullableText,
  sshCommand: nullableText,
  probeUrl: nullableText,
  probePort: z.number().int().min(1).max(65535).optional().nullable(),
  probeApiKey: nullableText,
  probeInstallStatus: probeInstallStatusSchema.optional().nullable(),
  probeInstallMessage: nullableText,
  probeInstalledAt: z.string().datetime().optional().nullable(),
  sshLastTestStatus: sshResultStatusSchema.optional().nullable(),
  sshLastTestMessage: nullableText,
  sshLastTestedAt: z.string().datetime().optional().nullable(),
  monitorStatus: nullableMonitorStatus,
  monitorCpuPercent: nullableNumber,
  monitorMemoryPercent: nullableNumber,
  monitorDiskPercent: nullableNumber,
  monitorNetInBps: nullableNumber,
  monitorNetOutBps: nullableNumber,
  monitorNetTotalInBytes: nullableNumber,
  monitorNetTotalOutBytes: nullableNumber,
  monitorLoad1: nullableNumber,
  monitorUptimeSeconds: nullableNumber,
  monitorUpdatedAt: z.string().datetime().optional().nullable(),
  startDate: dateSchema.optional().nullable(),
  expireDate: dateSchema.optional().nullable()
});

export const domainSchema = commonAssetSchema.extend({
  billingCycle: domainBillingCycleSchema,
  domainName: z.string().trim().min(1),
  registrar: nullableText,
  registrarAccount: nullableText,
  registrarUrl: nullableText,
  dnsProvider: nullableText,
  purpose: nullableText,
  registerDate: dateSchema.optional().nullable(),
  lastRenewDate: dateSchema.optional().nullable(),
  domainExtension: z
    .string()
    .trim()
    .regex(/^\.?[a-z0-9-]+(\.[a-z0-9-]+)*$/i)
    .optional()
    .nullable(),
  rarityScore: z.number().int().min(0).max(100).optional().default(0),
  expireDate: dateSchema.optional().nullable()
});

export const subscriptionSchema = commonAssetSchema.extend({
  name: z.string().trim().min(1),
  purchaseType: z.enum(['subscription', 'buyout']).optional().default('subscription'),
  provider: nullableText,
  account: nullableText,
  category: nullableText,
  email: z.string().trim().email().optional().nullable(),
  phoneNumber: nullableText,
  licenseKey: nullableText,
  deviceLimit: z.number().int().nonnegative().optional().nullable(),
  content: nullableText
});

export const expenseSchema = z.object({
  assetType: z.enum(['phone', 'vps', 'domain', 'subscription']),
  assetId: z.number().int().positive(),
  amountMinorUnits: z.number().int().nonnegative(),
  currency: currencySchema,
  paidAt: dateSchema,
  periodStart: dateSchema.optional().nullable(),
  periodEnd: dateSchema.optional().nullable(),
  category: z.enum(['renewal', 'monthly', 'setup', 'other']).optional().default('other'),
  notes: nullableText
});
