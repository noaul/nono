import { z } from 'zod';
import { billingCycles, currencies } from './utils.js';

export const currencySchema = z.enum(currencies);
export const billingCycleSchema = z.enum(billingCycles);
const domainBillingCycleSchema = z.enum(['annual', 'biennial']);
export const statusSchema = z.enum(['active', 'paused', 'expired', 'cancelled', 'archived']);
const phoneTypeSchema = z.enum(['domestic', 'foreign']);
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const nullableText = z.string().trim().optional().nullable();
const nullableNumber = z.number().optional().nullable();

export const commonAssetSchema = z.object({
  amountMinorUnits: z.number().int().nonnegative(),
  currency: currencySchema,
  billingCycle: billingCycleSchema,
  billingDay: z.number().int().min(1).max(31).optional().nullable(),
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
  assetType: z.enum(['phone', 'domain', 'subscription']),
  assetId: z.number().int().positive(),
  amountMinorUnits: z.number().int().nonnegative(),
  currency: currencySchema,
  paidAt: dateSchema,
  periodStart: dateSchema.optional().nullable(),
  periodEnd: dateSchema.optional().nullable(),
  category: z.enum(['renewal', 'monthly', 'setup', 'other']).optional().default('other'),
  notes: nullableText
});
