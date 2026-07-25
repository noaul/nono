import { type FormEvent, type KeyboardEvent, useDeferredValue, useEffect, useId, useMemo, useState } from 'react';
import { Check, ChevronDown, Mail, MonitorSmartphone, Pencil, Phone, Plus, Search, Trash2 } from 'lucide-react';
import type { AccountType, CommunicationAccount, ListResponse } from './types';
import { api, ApiError } from './api';
import { useI18n } from './i18n';
import { AccountAppIcon, accountTypes, buildCountryOptions, CountryFlag, filterCountryOptions, getAccountTypeLabel, type CountryOption } from './accountCatalog';
import { Button, DataTable, Drawer, EmptyState, Field, PageHeader, Skeleton, StateBanner, inputClass, type DataTableColumn } from './ui';

type AccountForm = {
  accountType: AccountType;
  phoneNumber: string;
  countryCallingCode: string;
  countryIso: string;
  boundEmail: string;
  loginDevice: string;
  displayName: string;
  notes: string;
};

const emptyForm: AccountForm = {
  accountType: 'telegram',
  phoneNumber: '',
  countryCallingCode: '+86',
  countryIso: 'CN',
  boundEmail: '',
  loginDevice: '',
  displayName: '',
  notes: ''
};

export function AccountPage() {
  const { copy, language } = useI18n();
  const [items, setItems] = useState<CommunicationAccount[]>([]);
  const [phoneFilter, setPhoneFilter] = useState('');
  const deferredPhoneFilter = useDeferredValue(phoneFilter);
  const [accountTypeFilter, setAccountTypeFilter] = useState<AccountType | ''>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState<CommunicationAccount | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const countryOptions = useMemo(() => buildCountryOptions(language), [language]);

  const load = async () => {
    const params = buildAccountQuery(phoneFilter, accountTypeFilter);
    const response = await api.get<ListResponse<CommunicationAccount>>(`/api/accounts?${params.toString()}`);
    setItems(response.items);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const params = buildAccountQuery(deferredPhoneFilter, accountTypeFilter);
    api.get<ListResponse<CommunicationAccount>>(`/api/accounts?${params.toString()}`)
      .then((response) => { if (active) setItems(response.items); })
      .catch((err) => { if (active) setError(errorMessage(err, copy('加载账号失败', 'Failed to load accounts'))); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [accountTypeFilter, copy, deferredPhoneFilter]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setFormError('');
    setDrawerOpen(true);
  };

  const openEdit = (item: CommunicationAccount) => {
    setEditing(item);
    setForm({
      accountType: item.accountType,
      phoneNumber: item.phoneNumber,
      countryCallingCode: item.countryCallingCode,
      countryIso: item.countryIso,
      boundEmail: item.boundEmail,
      loginDevice: item.loginDevice ?? '',
      displayName: item.displayName ?? '',
      notes: item.notes ?? ''
    });
    setFormError('');
    setDrawerOpen(true);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError('');
    const payload = {
      ...form,
      phoneNumber: form.phoneNumber.trim(),
      boundEmail: form.boundEmail.trim(),
      loginDevice: form.loginDevice.trim() || null,
      displayName: form.displayName.trim() || null,
      notes: form.notes.trim() || null
    };
    try {
      if (editing) {
        await api.put<{ item: CommunicationAccount }>(`/api/accounts/${editing.id}`, payload);
      } else {
        await api.post<{ item: CommunicationAccount }>('/api/accounts', payload);
      }
      setDrawerOpen(false);
      await load();
    } catch (err) {
      setFormError(errorMessage(err, copy('保存账号失败', 'Failed to save account')));
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (item: CommunicationAccount) => {
    setError('');
    try {
      await api.delete(`/api/accounts/${item.id}`);
      setDeleteTargetId(null);
      await load();
    } catch (err) {
      setError(errorMessage(err, copy('删除账号失败', 'Failed to delete account')));
    }
  };

  const updateCountry = (countryIso: string) => {
    const country = countryOptions.find((option) => option.iso === countryIso);
    if (!country) return;
    setForm((current) => ({ ...current, countryIso: country.iso, countryCallingCode: country.callingCode }));
  };

  const columns: DataTableColumn<CommunicationAccount>[] = [
    {
      key: 'accountType',
      header: copy('账号类型', 'Account type'),
      render: (item) => (
        <div className="flex min-w-[140px] items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.04]">
            <AccountAppIcon type={item.accountType} size={18} />
          </span>
          <div className="min-w-0">
            <p className="font-medium text-slate-950 dark:text-white">{getAccountTypeLabel(item.accountType, language)}</p>
            <p className="truncate text-xs text-slate-400">{item.displayName || '-'}</p>
          </div>
        </div>
      )
    },
    {
      key: 'phone',
      header: copy('手机号码', 'Phone number'),
      render: (item) => (
        <div className="flex min-w-[180px] items-center gap-2">
          <CountryFlag countryIso={item.countryIso} className="text-base" />
          <span className="font-mono font-medium text-slate-950 dark:text-white">{item.countryCallingCode} {item.phoneNumber}</span>
        </div>
      )
    },
    { key: 'country', header: copy('国家 / 地区', 'Country / region'), render: (item) => <span className="text-slate-500">{countryName(countryOptions, item.countryIso)}</span> },
    { key: 'device', header: copy('登录设备', 'Login device'), render: (item) => <span className="text-slate-500">{item.loginDevice || '-'}</span> },
    { key: 'email', header: copy('绑定邮箱', 'Bound email'), render: (item) => <span className="break-all text-slate-500">{item.boundEmail || '-'}</span> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (item) => deleteTargetId === item.id ? (
        <div className="flex min-w-[170px] items-center justify-end gap-2">
          <span className="text-xs text-danger-500">{copy('移入回收站？', 'Move to recycle bin?')}</span>
          <Button size="sm" variant="ghost" onClick={() => setDeleteTargetId(null)}>{copy('取消', 'Cancel')}</Button>
          <Button size="sm" variant="danger" onClick={() => remove(item)}>{copy('移入', 'Move')}</Button>
        </div>
      ) : (
        <div className="flex justify-end gap-1">
          <button className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white" onClick={() => openEdit(item)} title={copy('编辑', 'Edit')} aria-label={copy('编辑', 'Edit')}><Pencil size={14} /></button>
          <button className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-danger-500/10 hover:text-danger-500" onClick={() => setDeleteTargetId(item.id)} title={copy('移入回收站', 'Move to recycle bin')} aria-label={copy('移入回收站', 'Move to recycle bin')}><Trash2 size={14} /></button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Accounts"
        title={copy('账号管理', 'Account management')}
        description={copy(`集中管理 ${items.length} 个通讯账号及其绑定信息。`, `Manage ${items.length} communication accounts and bindings.`)}
        actions={<Button onClick={openCreate}><Plus size={16} />{copy('新增账号', 'Add account')}</Button>}
      />

      <section className="card">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-3 text-slate-400" size={16} />
            <input className={`${inputClass} pl-9`} value={phoneFilter} onChange={(event) => setPhoneFilter(event.target.value)} placeholder={copy('按手机号码筛选', 'Filter by phone number')} />
          </div>
          <select className={inputClass} value={accountTypeFilter} onChange={(event) => setAccountTypeFilter(event.target.value as AccountType | '')}>
            <option value="">{copy('全部账号类型', 'All account types')}</option>
            {accountTypes.map((type) => <option key={type} value={type}>{getAccountTypeLabel(type, language)}</option>)}
          </select>
        </div>
      </section>

      {error && <StateBanner tone="danger">{error}</StateBanner>}

      {loading ? (
        <Skeleton className="h-64" />
      ) : items.length === 0 ? (
        <EmptyState title={copy('暂无账号', 'No accounts')} description={copy('新增常用通讯账号，便于按号码和应用快速查找。', 'Add communication accounts for quick lookup by phone or app.')} action={<Button onClick={openCreate}><Plus size={16} />{copy('新增账号', 'Add account')}</Button>} />
      ) : (
        <>
          <div className="hidden md:block"><DataTable columns={columns} data={items} /></div>
          <div className="motion-list grid gap-3 md:hidden">
            {items.map((item) => (
              <article key={item.id} className="motion-card rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-ink-900">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.04]"><AccountAppIcon type={item.accountType} /></span>
                    <div className="min-w-0"><h3 className="truncate font-medium text-slate-950 dark:text-white">{item.displayName || getAccountTypeLabel(item.accountType, language)}</h3><p className="text-xs text-slate-400">{getAccountTypeLabel(item.accountType, language)}</p></div>
                  </div>
                  <div className="flex gap-1">
                    <button className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100" onClick={() => openEdit(item)} aria-label={copy('编辑', 'Edit')}><Pencil size={14} /></button>
                    <button className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-danger-500/10 hover:text-danger-500" onClick={() => setDeleteTargetId(item.id)} aria-label={copy('删除', 'Delete')}><Trash2 size={14} /></button>
                  </div>
                </div>
                <div className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-sm dark:border-white/[0.06]">
                  <div className="flex min-w-0 items-center gap-2"><Phone size={14} className="shrink-0 text-slate-400" /><CountryFlag countryIso={item.countryIso} /><span className="truncate font-mono text-slate-700 dark:text-slate-300">{item.countryCallingCode} {item.phoneNumber}</span></div>
                  <div className="flex min-w-0 items-center gap-2"><MonitorSmartphone size={14} className="shrink-0 text-slate-400" /><span className="truncate text-slate-500">{item.loginDevice || '-'}</span></div>
                  <div className="flex min-w-0 items-center gap-2"><Mail size={14} className="shrink-0 text-slate-400" /><span className="truncate text-slate-500">{item.boundEmail || '-'}</span></div>
                </div>
                {deleteTargetId === item.id && <div className="mt-3 flex items-center justify-end gap-2 rounded-xl border border-danger-500/20 bg-danger-500/10 p-2"><span className="mr-auto text-xs text-danger-600 dark:text-danger-400">{copy('移入回收站？', 'Move to recycle bin?')}</span><Button size="sm" variant="ghost" onClick={() => setDeleteTargetId(null)}>{copy('取消', 'Cancel')}</Button><Button size="sm" variant="danger" onClick={() => remove(item)}>{copy('移入', 'Move')}</Button></div>}
              </article>
            ))}
          </div>
        </>
      )}

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? copy('编辑账号', 'Edit account') : copy('新增账号', 'Add account')}
        footer={<><Button variant="secondary" onClick={() => setDrawerOpen(false)}>{copy('取消', 'Cancel')}</Button><Button type="submit" form="account-form" disabled={submitting}>{submitting ? copy('保存中', 'Saving') : copy('保存', 'Save')}</Button></>}
      >
        <form id="account-form" className="space-y-5" onSubmit={submit}>
          {formError && <StateBanner tone="danger">{formError}</StateBanner>}
          <Field label={copy('账号类型', 'Account type')}>
            <select className={inputClass} value={form.accountType} onChange={(event) => setForm({ ...form, accountType: event.target.value as AccountType })}>
              {accountTypes.map((type) => <option key={type} value={type}>{getAccountTypeLabel(type, language)}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-[minmax(0,1fr)_112px] gap-3">
            <Field label={copy('国家 / 地区', 'Country / region')}>
              <CountryCombobox
                options={countryOptions}
                value={form.countryIso}
                onChange={updateCountry}
                placeholder={copy('搜索国家、代码或区号', 'Search country, code, or calling code')}
                emptyText={copy('没有匹配的国家或地区', 'No matching country or region')}
              />
            </Field>
            <Field label={copy('国家区号', 'Calling code')}><input className={`${inputClass} font-mono`} value={form.countryCallingCode} readOnly /></Field>
          </div>
          <Field label={copy('手机号码', 'Phone number')} hint={copy('填写区号后的本地号码。', 'Enter the local number after the calling code.')}><input className={`${inputClass} font-mono`} required inputMode="tel" value={form.phoneNumber} onChange={(event) => setForm({ ...form, phoneNumber: event.target.value })} placeholder="13800138000" /></Field>
          <Field label={copy('登录设备（选填）', 'Login device (optional)')}><input className={inputClass} value={form.loginDevice} onChange={(event) => setForm({ ...form, loginDevice: event.target.value })} placeholder={copy('例如 iPhone 15 Pro', 'For example, iPhone 15 Pro')} /></Field>
          <Field label={copy('绑定邮箱（选填）', 'Bound email (optional)')}><input className={inputClass} type="email" value={form.boundEmail} onChange={(event) => setForm({ ...form, boundEmail: event.target.value })} placeholder="name@example.com" /></Field>
          <Field label={copy('显示名称', 'Display name')}><input className={inputClass} value={form.displayName} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /></Field>
          <Field label={copy('备注', 'Notes')}><textarea className={`${inputClass} h-24 py-2.5`} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field>
        </form>
      </Drawer>
    </div>
  );
}

function CountryCombobox({
  options,
  value,
  onChange,
  placeholder,
  emptyText
}: {
  options: CountryOption[];
  value: string;
  onChange: (countryIso: string) => void;
  placeholder: string;
  emptyText: string;
}) {
  const listboxId = useId();
  const selected = options.find((option) => option.iso === value);
  const selectedName = selected?.name ?? '';
  const [query, setQuery] = useState(selectedName);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const searchQuery = query === selectedName ? '' : query;
  const filteredOptions = useMemo(() => filterCountryOptions(options, searchQuery), [options, searchQuery]);

  useEffect(() => setQuery(selectedName), [selectedName]);
  useEffect(() => setActiveIndex(0), [searchQuery]);

  const choose = (option: CountryOption) => {
    onChange(option.iso);
    setQuery(option.name);
    setOpen(false);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, Math.max(filteredOptions.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Enter' && open && filteredOptions[activeIndex]) {
      event.preventDefault();
      choose(filteredOptions[activeIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setQuery(selectedName);
      setOpen(false);
    }
  };

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setQuery(selectedName);
        setOpen(false);
      }}
    >
      {selected && (
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center">
          <CountryFlag countryIso={selected.iso} />
        </span>
      )}
      <input
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={open}
        aria-activedescendant={open && filteredOptions[activeIndex] ? `${listboxId}-${filteredOptions[activeIndex].iso}` : undefined}
        autoComplete="off"
        spellCheck={false}
        className={`${inputClass} pl-10 pr-9`}
        value={query}
        placeholder={placeholder}
        onFocus={(event) => { setOpen(true); event.currentTarget.select(); }}
        onClick={() => setOpen(true)}
        onChange={(event) => { setQuery(event.target.value); setOpen(true); }}
        onKeyDown={handleKeyDown}
      />
      <ChevronDown aria-hidden="true" className={`pointer-events-none absolute right-3 top-3 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} size={16} />
      {open && (
        <div id={listboxId} role="listbox" className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-white/10 dark:bg-ink-800">
          {filteredOptions.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-slate-400">{emptyText}</p>
          ) : filteredOptions.map((option, index) => (
            <div
              id={`${listboxId}-${option.iso}`}
              key={option.iso}
              role="option"
              aria-selected={option.iso === value}
              className={`flex cursor-default items-center gap-3 rounded-lg px-3 py-2 text-sm ${index === activeIndex ? 'bg-slate-100 text-slate-950 dark:bg-white/[0.08] dark:text-white' : 'text-slate-600 dark:text-slate-300'}`}
              onMouseEnter={() => setActiveIndex(index)}
              onMouseDown={(event) => { event.preventDefault(); choose(option); }}
            >
              <CountryFlag countryIso={option.iso} />
              <span className="min-w-0 flex-1 truncate">{option.name}</span>
              <span className="shrink-0 font-mono text-xs text-slate-400">{option.callingCode}</span>
              {option.iso === value && <Check aria-hidden="true" className="shrink-0 text-brand-500" size={15} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function countryName(options: ReturnType<typeof buildCountryOptions>, countryIso: string): string {
  return options.find((option) => option.iso === countryIso)?.name ?? countryIso;
}

function buildAccountQuery(phoneFilter: string, accountTypeFilter: AccountType | ''): URLSearchParams {
  const params = new URLSearchParams();
  if (phoneFilter.trim()) params.set('phone', phoneFilter.trim());
  if (accountTypeFilter) params.set('accountType', accountTypeFilter);
  return params;
}

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiError)) return fallback;
  if (error.status === 409) return '相同应用与手机号码的账号已存在。';
  return error.message;
}
