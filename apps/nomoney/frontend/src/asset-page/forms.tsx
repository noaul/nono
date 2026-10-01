import type { AssetPageConfig } from '../assetConfig';
import type { AssetItem } from '../types';
import { composeDomainName, domainPrefix, inferDomainExtension, normalizeDomainExtension, stringValue } from '../domainRegistrars';
import { getDefaultCurrency } from '../preferences';
import { nil, type FormState } from './shared';
import { buildSshCommand } from './vps';
import { getDomainPrefixFromForm, applyDomainLifecycleDefaults, getDomainLifecycle } from './domain';

/** A copy of an entry: renamed so it is easy to spot, with VPS probe credentials left behind. */
export function duplicateForm(config: AssetPageConfig, form: FormState): FormState {
  const next = { ...form };
  if (config.endpoint === 'vps') {
    next.name = `${String(form.name ?? '')} (copy)`;
    for (const key of ['probeUrl', 'probeApiKey', 'probePort']) next[key] = '';
  }
  if (config.endpoint === 'subscriptions') next.name = `${String(form.name ?? '')} (copy)`;
  return next;
}

export function initialForm(config: AssetPageConfig): FormState {
  const base: FormState = {
    amount: '',
    currency: getDefaultCurrency(),
    billingCycle: config.endpoint === 'domains' ? 'annual' : 'monthly',
    nextDueDate: '',
    status: 'active',
    autoRenew: true,
    paymentMethod: '',
    renewalUrl: '',
    tags: '',
    notes: ''
  };
  for (const field of config.fields) base[field.key] = '';
  if (config.endpoint === 'domains') {
    base.domainPrefix = '';
    base.domainExtension = '.com';
  }
  if (config.endpoint === 'phones') {
    base.phoneType = 'domestic';
    base.isSecondaryCard = false;
    base.isEsim = false;
    base.billingCycle = 'monthly';
  }
  if (config.endpoint === 'vps') {
    base.vpsType = '';
    base.sshPort = '22';
    base.sshUser = 'root';
    base.sshAuthType = 'password';
    base.probePort = '9100';
  }
  if (config.endpoint === 'subscriptions') {
    base.purchaseType = 'subscription';
  }
  return base;
}

export function assetToForm(config: AssetPageConfig, item: AssetItem): FormState {
  const base = initialForm(config);
  for (const field of config.fields) {
    const value = item[field.key];
    base[field.key] = field.key.endsWith('MinorUnits') && typeof value === 'number'
      ? (value / 100).toFixed(2)
      : field.key === 'isSecondaryCard' || field.key === 'isEsim'
        ? Boolean(value)
        : String(value ?? '');
  }
  if (config.endpoint === 'domains') {
    const extension = normalizeDomainExtension(item.domainExtension || inferDomainExtension(item.domainName)) || '.com';
    const prefix = domainPrefix(item.domainName, extension);
    base.domainPrefix = prefix;
    base.domainName = composeDomainName(prefix, extension);
    base.domainExtension = extension;
  }
  const result: FormState = {
    ...base,
    amount: (item.amountMinorUnits / 100).toFixed(2),
    currency: item.currency,
    billingCycle: item.billingCycle,
    nextDueDate: item.nextDueDate ?? '',
    status: item.status,
    autoRenew: item.autoRenew,
    paymentMethod: item.paymentMethod ?? '',
    renewalUrl: item.renewalUrl ?? '',
    tags: item.tags.join(', '),
    notes: item.notes ?? ''
  };
  if (config.endpoint === 'domains') {
    applyDomainLifecycleDefaults(result);
  }
  if (config.endpoint === 'vps') {
    result.expireDate = item.expireDate ?? item.nextDueDate ?? '';
    result.sshPassword = '';
    result.sshPrivateKey = '';
    result.sshPrivateKeyPassphrase = '';
    result.probeApiKey = '';
  }
  return result;
}

export function formToPayload(config: AssetPageConfig, form: FormState): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    amountMinorUnits: Math.round(Number(form.amount || 0) * 100),
    currency: form.currency,
    billingCycle: form.billingCycle,
    nextDueDate: nil(form.nextDueDate),
    status: form.status,
    autoRenew: Boolean(form.autoRenew),
    paymentMethod: nil(form.paymentMethod),
    renewalUrl: nil(form.renewalUrl),
    tags: String(form.tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean),
    notes: nil(form.notes)
  };
  for (const field of config.fields) {
    const value = form[field.key];
    if (field.key === 'domainExtension') {
      payload[field.key] = normalizeDomainExtension(value) || null;
    } else if (field.key === 'rarityScore') {
      payload[field.key] = Math.max(0, Math.min(100, Number(value || 0)));
    } else if (field.key === 'isSecondaryCard' || field.key === 'isEsim') {
      payload[field.key] = Boolean(value);
    } else if (field.key.endsWith('MinorUnits')) {
      payload[field.key] = value === '' ? null : Math.round(Number(value || 0) * 100);
    } else {
      payload[field.key] = field.type === 'number' ? (value === '' ? null : Number(value)) : nil(value);
    }
  }
  if (config.endpoint === 'domains') {
    const extension = normalizeDomainExtension(form.domainExtension) || '.com';
    const lifecycle = getDomainLifecycle(form);
    payload.domainName = composeDomainName(getDomainPrefixFromForm(form, extension), extension);
    payload.domainExtension = extension;
    payload.lastRenewDate = nil(lifecycle.lastRenewDate);
    payload.expireDate = nil(lifecycle.expireDate);
    payload.nextDueDate = nil(lifecycle.nextDueDate);
  }
  if (config.endpoint === 'vps') {
    payload.startDate = null;
    payload.nextDueDate = null;
    payload.sshHost = nil(form.ipAddress);
    payload.sshCommand = nil(form.sshCommand || buildSshCommand(form));
    for (const key of ['sshPassword', 'sshPrivateKey', 'sshPrivateKeyPassphrase', 'probeApiKey']) {
      if (!stringValue(payload[key])) delete payload[key];
    }
  }
  if (config.endpoint === 'subscriptions') {
    if (payload.purchaseType === 'buyout') {
      payload.account = null;
      payload.billingCycle = 'annual';
      payload.nextDueDate = null;
      payload.autoRenew = false;
      payload.renewalUrl = null;
    }
  }
  return payload;
}
