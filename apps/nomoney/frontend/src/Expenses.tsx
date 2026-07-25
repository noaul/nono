import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import type { AssetLookupItem, AssetType, Currency, ExpenseItem, ListMeta, ListResponse } from './types';
import { api, ApiError } from './api';
import { compactDate, formatMoney } from './format';
import { Button, DataTable, Drawer, EmptyState, Field, PageHeader, Skeleton, StateBanner, inputClass, type DataTableColumn } from './ui';

type ExpenseCategory = 'renewal' | 'monthly' | 'setup' | 'other';
type ExpenseForm = {
  assetKey: string;
  amount: string;
  currency: Currency;
  paidAt: string;
  periodStart: string;
  periodEnd: string;
  category: ExpenseCategory;
  notes: string;
};

const currencies: Currency[] = ['CNY', 'USD', 'GBP', 'EUR', 'CAD'];
const assetTypes: AssetType[] = ['phone', 'vps', 'domain', 'subscription'];
const categories: ExpenseCategory[] = ['renewal', 'monthly', 'setup', 'other'];
const currentYear = new Date().getFullYear();
const initialForm: ExpenseForm = {
  assetKey: '',
  amount: '',
  currency: 'CNY',
  paidAt: new Date().toISOString().slice(0, 10),
  periodStart: '',
  periodEnd: '',
  category: 'monthly',
  notes: ''
};

export function Expenses() {
  const [items, setItems] = useState<ExpenseItem[]>([]);
  const [assetOptions, setAssetOptions] = useState<AssetLookupItem[]>([]);
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseItem | null>(null);
  const [form, setForm] = useState<ExpenseForm>(initialForm);
  const [year, setYear] = useState(String(currentYear));
  const [currency, setCurrency] = useState('');
  const [assetType, setAssetType] = useState('');
  const [category, setCategory] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const params = new URLSearchParams();
    if (year) params.set('year', year);
    if (currency) params.set('currency', currency);
    if (assetType) params.set('assetType', assetType);
    if (category) params.set('category', category);
    const [expenseResponse, lookupResponse] = await Promise.all([
      api.get<ListResponse<ExpenseItem>>(`/api/expenses?${params}`),
      api.get<{ items: AssetLookupItem[] }>('/api/assets/lookup')
    ]);
    setItems(expenseResponse.items);
    setMeta(expenseResponse.meta ?? null);
    setAssetOptions(lookupResponse.items);
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    setError('');
    load().catch((err) => {
      setError(err instanceof ApiError ? err.message : '加载失败');
      setLoading(false);
    });
  }, [year, currency, assetType, category]);

  const totals = useMemo(() => {
    const grouped: Partial<Record<Currency, number>> = {};
    for (const item of items) grouped[item.currency] = (grouped[item.currency] ?? 0) + item.amountMinorUnits;
    return grouped;
  }, [items]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...initialForm, assetKey: assetOptions[0] ? toAssetKey(assetOptions[0].assetType, assetOptions[0].assetId) : '' });
    setDrawerOpen(true);
  };

  const openEdit = (item: ExpenseItem) => {
    setEditing(item);
    setForm({
      assetKey: toAssetKey(item.assetType, item.assetId),
      amount: (item.amountMinorUnits / 100).toFixed(2),
      currency: item.currency,
      paidAt: item.paidAt,
      periodStart: item.periodStart ?? '',
      periodEnd: item.periodEnd ?? '',
      category: item.category,
      notes: item.notes ?? ''
    });
    setDrawerOpen(true);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const selected = parseAssetKey(form.assetKey);
    if (!selected) {
      setError('请选择关联资产');
      return;
    }
    const payload = {
      assetType: selected.assetType,
      assetId: selected.assetId,
      amountMinorUnits: Math.round(Number(form.amount || 0) * 100),
      currency: form.currency,
      paidAt: form.paidAt,
      periodStart: form.periodStart || null,
      periodEnd: form.periodEnd || null,
      category: form.category,
      notes: form.notes || null
    };
    try {
      if (editing) await api.put(`/api/expenses/${editing.id}`, payload);
      else await api.post('/api/expenses', payload);
      setDrawerOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败');
    }
  };

  const remove = async (item: ExpenseItem) => {
    if (!window.confirm('删除这条费用流水？')) return;
    await api.delete(`/api/expenses/${item.id}`);
    await load();
  };

  const columns: DataTableColumn<ExpenseItem>[] = [
    { key: 'asset', header: '资产', render: (item) => <div><span className="font-medium text-slate-950 dark:text-white">{item.assetLabel ?? item.assetType}</span><span className="ml-2 font-mono text-xs text-slate-400">#{item.assetId}</span></div> },
    { key: 'type', header: '类型', render: (item) => <span className="font-mono text-xs text-slate-500">{item.assetType}</span> },
    { key: 'amount', header: '金额', align: 'right', render: (item) => <span className="font-mono font-semibold text-slate-950 dark:text-white">{formatMoney(item.amountMinorUnits, item.currency)}</span> },
    { key: 'paid', header: '支付日期', align: 'right', render: (item) => <span className="font-mono text-slate-500">{item.paidAt}</span> },
    { key: 'period', header: '覆盖周期', align: 'right', render: (item) => <span className="text-slate-500">{compactDate(item.periodStart)} 至 {compactDate(item.periodEnd)}</span> },
    { key: 'cat', header: '分类', render: (item) => <span className="rounded-lg border border-slate-200 px-2 py-0.5 text-xs text-slate-500 dark:border-white/10">{item.category}</span> },
    { key: 'actions', header: '', align: 'right', render: (item) => (
      <div className="flex justify-end gap-1">
        <button className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white" onClick={() => openEdit(item)}>
          <Pencil size={14} />
        </button>
        <button className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-danger-500/10 hover:text-danger-500" onClick={() => remove(item)}>
          <Trash2 size={14} />
        </button>
      </div>
    ) }
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="费用流水"
        eyebrow="Ledger"
        description={`当前筛选 ${meta?.total ?? items.length} 条，合计 ${formatTotals(totals)}。`}
        actions={<Button onClick={openCreate}><Plus size={16} />新增流水</Button>}
      />

      <section className="card">
        <div className="grid gap-3 md:grid-cols-4">
          <Field label="年份"><input className={inputClass} value={year} onChange={(e) => setYear(e.target.value)} /></Field>
          <Field label="币种"><select className={inputClass} value={currency} onChange={(e) => setCurrency(e.target.value)}><option value="">全部</option>{currencies.map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="资产类型"><select className={inputClass} value={assetType} onChange={(e) => setAssetType(e.target.value)}><option value="">全部</option>{assetTypes.map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label="分类"><select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}><option value="">全部</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></Field>
        </div>
      </section>

      {error && <StateBanner tone="danger">{error}</StateBanner>}

      {loading ? (
        <Skeleton className="h-64" />
      ) : items.length === 0 ? (
        <EmptyState title="暂无费用流水" description="记录实际付款后，Dashboard 的年度实际支出会同步更新。" action={<Button onClick={openCreate}><Plus size={16} />新增流水</Button>} />
      ) : (
        <DataTable columns={columns} data={items} />
      )}

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        title={editing ? '编辑流水' : '新增流水'}
        footer={<><Button variant="secondary" onClick={() => setDrawerOpen(false)}>取消</Button><Button form="expense-form" type="submit">保存</Button></>}
      >
        <form id="expense-form" onSubmit={submit} className="space-y-4">
          <Field label="关联资产">
            <select className={inputClass} value={form.assetKey} onChange={(e) => setForm({ ...form, assetKey: e.target.value })}>
              <option value="">选择资产</option>
              {assetOptions.map((asset) => (
                <option key={toAssetKey(asset.assetType, asset.assetId)} value={toAssetKey(asset.assetType, asset.assetId)}>
                  {asset.label} · {asset.assetType} #{asset.assetId}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="金额"><input className={`${inputClass} font-mono`} type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
            <Field label="币种"><select className={inputClass} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value as Currency })}>{currencies.map((value) => <option key={value}>{value}</option>)}</select></Field>
          </div>
          <Field label="支付日期"><input className={inputClass} type="date" value={form.paidAt} onChange={(e) => setForm({ ...form, paidAt: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="周期开始"><input className={inputClass} type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} /></Field>
            <Field label="周期结束"><input className={inputClass} type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} /></Field>
          </div>
          <Field label="分类"><select className={inputClass} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ExpenseCategory })}>{categories.map((value) => <option key={value} value={value}>{value}</option>)}</select></Field>
          <Field label="备注"><textarea className={`${inputClass} h-24 py-2.5`} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </form>
      </Drawer>
    </div>
  );
}

function toAssetKey(assetType: AssetType, assetId: number): string {
  return `${assetType}:${assetId}`;
}

function parseAssetKey(value: string): { assetType: AssetType; assetId: number } | null {
  const [assetType, id] = value.split(':');
  if (!assetTypes.includes(assetType as AssetType)) return null;
  const assetId = Number(id);
  if (!Number.isInteger(assetId) || assetId <= 0) return null;
  return { assetType: assetType as AssetType, assetId };
}

function formatTotals(totals: Partial<Record<Currency, number>>): string {
  const values = currencies.filter((currency) => totals[currency]).map((currency) => formatMoney(totals[currency] ?? 0, currency));
  return values.length ? values.join(' + ') : '0';
}
