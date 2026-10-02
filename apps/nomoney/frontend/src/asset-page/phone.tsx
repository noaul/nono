import type React from 'react';
import { useEffect, useState } from 'react';
import { BarChart3, Check, Copy, Database, Globe2, Pencil, Phone, Signal, Sparkles, Trash2, UserRound } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AssetItem, Currency } from '../types';
import { compactDate, daysLeft, dueTone, formatCycle, formatMoney, currencies } from '../format';
import { EmptyState, Field, StatusBadge, inputClass } from '../ui';
import { stringValue } from '../domainRegistrars';
import { useI18n } from '../i18n';
import { cycles, statusOptions, monthlyEquivalent, formatMoneyTotals, numberValue, Section, countBy, type FormState } from './shared';
import { DomainStat } from './domain';

export type PhoneStats = {
  total: number;
  domestic: number;
  foreign: number;
  carrierCounts: Array<{ carrier: string; count: number }>;
  foreignCountryCounts: Array<{ country: string; count: number }>;
  monthlyTotal: Partial<Record<Currency, number>>;
  domesticMonthlyTotal: Partial<Record<Currency, number>>;
  activeCount: number;
  riskWithin30Days: number;
  riskWithin60Days: number;
};

export type PhoneVisualStyleKey = 'nebula' | 'daylight' | 'graphite' | 'ocean';

export type PhoneVisualAccentKey = 'cyan' | 'rose' | 'violet' | 'lime' | 'amber';

export type PhoneVisualStyle = {
  key: PhoneVisualStyleKey;
  labelZh: string;
  labelEn: string;
  shell: string;
  background: (accent: PhoneVisualAccent) => string;
  border: string;
  card: string;
  cardStrong: string;
  cardHover: string;
  chip: string;
  text: string;
  muted: string;
  soft: string;
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
};

export type PhoneVisualAccent = {
  key: PhoneVisualAccentKey;
  labelZh: string;
  labelEn: string;
  primary: string;
  secondary: string;
  tertiary: string;
  chart: string[];
};

export const phoneVisualStyles: PhoneVisualStyle[] = [
  {
    key: 'nebula',
    labelZh: '云雾',
    labelEn: 'Mist',
    shell: 'rgba(255,255,255,0.52)',
    background: (accent) => `radial-gradient(circle at 10% 0%, ${hexToRgba(accent.primary, 0.2)}, transparent 32%), radial-gradient(circle at 88% 8%, ${hexToRgba(accent.secondary, 0.16)}, transparent 30%), linear-gradient(135deg, rgba(255,255,255,0.72), rgba(248,250,252,0.42))`,
    border: 'rgba(148,163,184,0.24)',
    card: 'rgba(255,255,255,0.58)',
    cardStrong: 'rgba(255,255,255,0.72)',
    cardHover: 'rgba(255,255,255,0.82)',
    chip: 'rgba(255,255,255,0.56)',
    text: '#0f172a',
    muted: '#475569',
    soft: '#64748b',
    grid: 'rgba(100,116,139,0.14)',
    axis: '#475569',
    tooltipBg: 'rgba(255,255,255,0.96)',
    tooltipBorder: 'rgba(148,163,184,0.26)'
  },
  {
    key: 'daylight',
    labelZh: '日光白',
    labelEn: 'Daylight',
    shell: 'rgba(255,255,255,0.66)',
    background: (accent) => `radial-gradient(circle at 14% 10%, ${hexToRgba(accent.primary, 0.18)}, transparent 30%), radial-gradient(circle at 86% 0%, ${hexToRgba(accent.secondary, 0.14)}, transparent 28%), linear-gradient(135deg, rgba(255,255,255,0.86), rgba(241,245,249,0.48))`,
    border: 'rgba(15,23,42,0.11)',
    card: 'rgba(255,255,255,0.68)',
    cardStrong: 'rgba(255,255,255,0.82)',
    cardHover: 'rgba(255,255,255,0.96)',
    chip: 'rgba(15,23,42,0.06)',
    text: '#0f172a',
    muted: '#334155',
    soft: '#64748b',
    grid: 'rgba(15,23,42,0.1)',
    axis: '#475569',
    tooltipBg: '#ffffff',
    tooltipBorder: 'rgba(15,23,42,0.14)'
  },
  {
    key: 'graphite',
    labelZh: '银灰',
    labelEn: 'Silver',
    shell: 'rgba(248,250,252,0.58)',
    background: (accent) => `linear-gradient(160deg, rgba(255,255,255,0.72) 0%, rgba(226,232,240,0.38) 42%, rgba(255,255,255,0.45) 100%), radial-gradient(circle at 78% 4%, ${hexToRgba(accent.primary, 0.16)}, transparent 30%)`,
    border: 'rgba(71,85,105,0.16)',
    card: 'rgba(255,255,255,0.56)',
    cardStrong: 'rgba(248,250,252,0.74)',
    cardHover: 'rgba(255,255,255,0.86)',
    chip: 'rgba(255,255,255,0.5)',
    text: '#111827',
    muted: '#475569',
    soft: '#64748b',
    grid: 'rgba(71,85,105,0.13)',
    axis: '#475569',
    tooltipBg: 'rgba(255,255,255,0.96)',
    tooltipBorder: 'rgba(71,85,105,0.18)'
  },
  {
    key: 'ocean',
    labelZh: '海岛蓝',
    labelEn: 'Ocean',
    shell: 'rgba(240,253,250,0.54)',
    background: (accent) => `radial-gradient(circle at 16% 12%, ${hexToRgba(accent.secondary, 0.18)}, transparent 30%), radial-gradient(circle at 86% 4%, ${hexToRgba(accent.primary, 0.2)}, transparent 28%), linear-gradient(135deg, rgba(240,253,250,0.76), rgba(224,242,254,0.42))`,
    border: 'rgba(20,184,166,0.18)',
    card: 'rgba(255,255,255,0.56)',
    cardStrong: 'rgba(255,255,255,0.7)',
    cardHover: 'rgba(255,255,255,0.84)',
    chip: 'rgba(255,255,255,0.54)',
    text: '#0f172a',
    muted: '#31545f',
    soft: '#64748b',
    grid: 'rgba(20,184,166,0.15)',
    axis: '#31545f',
    tooltipBg: 'rgba(255,255,255,0.96)',
    tooltipBorder: 'rgba(20,184,166,0.22)'
  }
];

export const phoneVisualAccents: PhoneVisualAccent[] = [
  { key: 'cyan', labelZh: '冰蓝', labelEn: 'Cyan', primary: '#38bdf8', secondary: '#22c55e', tertiary: '#f97316', chart: ['#38bdf8', '#22c55e', '#f97316', '#e879f9', '#f43f5e', '#a3e635'] },
  { key: 'rose', labelZh: '玫瑰', labelEn: 'Rose', primary: '#fb7185', secondary: '#f59e0b', tertiary: '#60a5fa', chart: ['#fb7185', '#f59e0b', '#60a5fa', '#34d399', '#c084fc', '#f472b6'] },
  { key: 'violet', labelZh: '电紫', labelEn: 'Violet', primary: '#8b5cf6', secondary: '#06b6d4', tertiary: '#facc15', chart: ['#8b5cf6', '#06b6d4', '#facc15', '#fb7185', '#34d399', '#a78bfa'] },
  { key: 'lime', labelZh: '青柠', labelEn: 'Lime', primary: '#84cc16', secondary: '#14b8a6', tertiary: '#f97316', chart: ['#84cc16', '#14b8a6', '#f97316', '#38bdf8', '#eab308', '#f43f5e'] },
  { key: 'amber', labelZh: '琥珀', labelEn: 'Amber', primary: '#f59e0b', secondary: '#ef4444', tertiary: '#22c55e', chart: ['#f59e0b', '#ef4444', '#22c55e', '#3b82f6', '#a855f7', '#f97316'] }
];

export function PhoneCommandPanel({
  stats,
  copy
}: {
  stats: PhoneStats;
  copy: (zh: string, en: string) => string;
}) {
  const carrierSummary = stats.carrierCounts.map(({ carrier, count }) => `${carrier} ${count}`).join(' / ');
  const countrySummary = stats.foreignCountryCounts.length > 0
    ? stats.foreignCountryCounts.map(({ country, count }) => `${country} ${count}`).join(' / ')
    : '-';
  return (
    <section className="motion-list grid grid-cols-2 gap-2.5 sm:gap-3 xl:grid-cols-4">
      <DomainStat icon={<Phone size={17} />} label={copy('电话卡总数', 'Phone cards')} value={stats.total} detail={copy(`国内 ${stats.domestic} / 国外 ${stats.foreign}`, `${stats.domestic} domestic / ${stats.foreign} foreign`)} />
      <DomainStat icon={<Signal size={17} />} label={copy('总月花费', 'Monthly total')} value={formatMoneyTotals(stats.monthlyTotal)} detail={copy('按当前筛选结果合计', 'Total for the current filter')} mono />
      <DomainStat icon={<Database size={17} />} label={copy('国内运营商', 'Domestic carriers')} value={<CountPills entries={stats.carrierCounts} labelKey="carrier" />} detail={carrierSummary} />
      <DomainStat icon={<UserRound size={17} />} label={copy('国外卡片', 'Foreign cards')} value={<CountPills entries={stats.foreignCountryCounts} labelKey="country" />} detail={copy(`${countrySummary}，30 天风险 ${stats.riskWithin30Days}`, `${countrySummary}, ${stats.riskWithin30Days} risks`)} mono />
    </section>
  );
}

export function CountPills<T extends { count: number } & Record<string, string | number>>({ entries, labelKey }: { entries: T[]; labelKey: keyof T }) {
  if (entries.length === 0) return <span>-</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {entries.map((entry) => (
        <span key={String(entry[labelKey])} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-sm font-semibold text-slate-900 dark:border-white/10 dark:bg-white/[0.04] dark:text-white">
          {String(entry[labelKey])} <span className="font-mono text-brand-600 dark:text-brand-300">{entry.count}</span>
        </span>
      ))}
    </span>
  );
}

export function PhoneVisualDashboard({ items, stats, copy }: { items: AssetItem[]; stats: PhoneStats; copy: (zh: string, en: string) => string }) {
  const [styleKey, setStyleKey] = useState<PhoneVisualStyleKey>(() => getStoredPhoneVisualStyle());
  const [accentKey, setAccentKey] = useState<PhoneVisualAccentKey>(() => getStoredPhoneVisualAccent());
  const domestic = items.filter((item) => stringValue(item.phoneType) !== 'foreign');
  const foreign = items.filter((item) => stringValue(item.phoneType) === 'foreign');
  const costChart = domestic
    .map((item) => ({
      number: getPhoneDisplayNumber(item).replace(/^\+86/, ''),
      owner: stringValue(item.userName) || stringValue(item.realNamePerson) || '-',
      // Domestic cards bill in different cycles; compare them as a monthly amount.
      cost: Math.round(monthlyEquivalent(Number(item.amountMinorUnits ?? 0), item.billingCycle)) / 100,
      currency: item.currency,
      carrier: normalizeDomesticCarrier(item.carrier, copy)
    }))
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 10);
  const carrierChart = stats.carrierCounts.map(({ carrier, count }) => ({ name: carrier, count }));
  const countryChart = stats.foreignCountryCounts.map(({ country, count }) => ({ name: country, count }));
  const userChart = countBy(domestic, (item) => stringValue(item.userName) || stringValue(item.realNamePerson) || copy('未记录', 'Unknown')).slice(0, 6);
  const keepaliveItems = foreign
    .map((item) => {
      const dueDate = stringValue(item.totalKeepaliveUntil) || stringValue(item.nextDueDate) || stringValue(item.expireDate);
      return {
        id: item.id,
        number: getPhoneDisplayNumber(item),
        country: getPhoneCountryCode(item),
        carrier: stringValue(item.carrier) || '-',
        dueDate,
        left: daysLeft(dueDate || null)
      };
    })
    .sort((a, b) => (a.left ?? 9999) - (b.left ?? 9999))
    .slice(0, 5);
  const showcase = domestic
    .slice()
    .sort((a, b) => Number(b.amountMinorUnits ?? 0) - Number(a.amountMinorUnits ?? 0))
    .slice(0, 4);
  const visualStyle = phoneVisualStyles.find((item) => item.key === styleKey) ?? phoneVisualStyles[0];
  const visualAccent = phoneVisualAccents.find((item) => item.key === accentKey) ?? phoneVisualAccents[0];
  const chartColors = visualAccent.chart;

  useEffect(() => {
    localStorage.setItem('moneypulse-phone-visual-style', styleKey);
  }, [styleKey]);

  useEffect(() => {
    localStorage.setItem('moneypulse-phone-visual-accent', accentKey);
  }, [accentKey]);

  if (stats.total === 0) {
    return <EmptyState title={copy('暂无电话卡', 'No phone cards')} description={copy('新增几张电话卡后，这里会生成可视化管理大屏。', 'Add phone cards to generate the visual management board.')} />;
  }

  return (
    <section
      className="motion-list overflow-hidden rounded-2xl border shadow-soft transition-colors duration-300"
      style={{ background: visualStyle.shell, borderColor: visualStyle.border, color: visualStyle.text }}
    >
      <div className="relative isolate overflow-hidden px-5 py-5 sm:px-7 sm:py-6">
        <div className="absolute inset-0 -z-10 transition-all duration-500" style={{ background: visualStyle.background(visualAccent) }} />
        <div className="absolute inset-x-0 top-0 -z-10 h-px" style={{ background: `linear-gradient(90deg, transparent, ${hexToRgba(visualAccent.primary, 0.72)}, transparent)` }} />

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium" style={{ background: visualStyle.chip, borderColor: visualStyle.border, color: visualAccent.primary }}>
              <Sparkles size={14} />
              {copy('可视化电话号码管理系统', 'Visual phone number command center')}
            </div>
            <h3 className="mt-3 text-2xl font-semibold tracking-normal sm:text-3xl" style={{ color: visualStyle.text }}>{copy('号码资产全景', 'Number portfolio overview')}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: visualStyle.muted }}>
              {copy('把号码、使用人、运营商、国家与保号状态放在一个动态视图里，快速发现费用重心和风险号码。', 'A live view of numbers, owners, carriers, countries, and keepalive risk so cost centers stand out fast.')}
            </p>
          </div>
          <PhoneAppearanceControl
            styleKey={styleKey}
            accentKey={accentKey}
            onStyleChange={setStyleKey}
            onAccentChange={setAccentKey}
            copy={copy}
            visualStyle={visualStyle}
          />
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <VisualGlassCard label={copy('月花费', 'Monthly cost')} value={formatMoneyTotals(stats.domesticMonthlyTotal)} detail={copy(`${stats.activeCount} 张活跃卡`, `${stats.activeCount} active cards`)} icon={<Signal size={18} />} color={visualAccent.tertiary} visualStyle={visualStyle} compact />
          <VisualGlassCard label={copy('号码总数', 'Total numbers')} value={stats.total} detail={copy(`国内 ${stats.domestic} / 国外 ${stats.foreign}`, `${stats.domestic} domestic / ${stats.foreign} foreign`)} icon={<Phone size={18} />} color={visualAccent.primary} visualStyle={visualStyle} compact />
          <PhoneHeroMetric label={copy('国内', 'Domestic')} value={stats.domestic} color={visualAccent.primary} visualStyle={visualStyle} />
          <PhoneHeroMetric label={copy('国外', 'Foreign')} value={stats.foreign} color={visualAccent.secondary} visualStyle={visualStyle} />
          <PhoneHeroMetric label={copy('关注', 'Watch')} value={stats.riskWithin60Days} color={visualAccent.tertiary} visualStyle={visualStyle} />
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[1.6fr_0.9fr]">
          <div className="rounded-2xl border p-4 transition-colors duration-300" style={{ background: visualStyle.cardStrong, borderColor: visualStyle.border }}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium" style={{ color: visualStyle.text }}>{copy('国内号码月花费分布', 'Domestic monthly cost map')}</p>
                <p className="text-xs" style={{ color: visualStyle.soft }}>{copy('按费用从高到低，颜色代表运营商。', 'Sorted high to low; color hints at carrier.')}</p>
              </div>
              <BarChart3 size={20} style={{ color: visualAccent.tertiary }} />
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costChart} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke={visualStyle.grid} vertical={false} />
                  <XAxis dataKey="number" tick={{ fill: visualStyle.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: visualStyle.border }} />
                  <YAxis tick={{ fill: visualStyle.soft, fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: visualStyle.tooltipBg, border: `1px solid ${visualStyle.tooltipBorder}`, borderRadius: 12, color: visualStyle.text }} formatter={(value, _name, entry) => [formatMoney(Math.round(Number(value) * 100), (entry.payload.currency as Currency) || 'CNY'), copy('月花费', 'Monthly cost')]} />
                  <Bar dataKey="cost" radius={[8, 8, 2, 2]}>
                    {costChart.map((entry, index) => <Cell key={entry.number} fill={carrierColor(entry.carrier, chartColors[index % chartColors.length])} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-2xl border p-4 transition-colors duration-300" style={{ background: visualStyle.cardStrong, borderColor: visualStyle.border }}>
              <p className="text-sm font-medium" style={{ color: visualStyle.text }}>{copy('本人运营商', 'Carrier mix')}</p>
              <div className="mt-3 h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={carrierChart} dataKey="count" nameKey="name" innerRadius={42} outerRadius={66} paddingAngle={4}>
                      {carrierChart.map((entry, index) => <Cell key={entry.name} fill={carrierColor(entry.name, chartColors[index % chartColors.length])} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: visualStyle.tooltipBg, border: `1px solid ${visualStyle.tooltipBorder}`, borderRadius: 12, color: visualStyle.text }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-2">
                {carrierChart.map((entry, index) => (
                  <span key={entry.name} className="rounded-full border px-2 py-1 text-xs" style={{ background: visualStyle.chip, borderColor: visualStyle.border, color: visualStyle.muted }}>
                    <span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: carrierColor(entry.name, chartColors[index % chartColors.length]) }} />{entry.name} {entry.count}
                  </span>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border p-4 transition-colors duration-300" style={{ background: visualStyle.cardStrong, borderColor: visualStyle.border }}>
              <p className="text-sm font-medium" style={{ color: visualStyle.text }}>{copy('国家分布', 'Country spread')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {countryChart.length === 0 ? <span className="text-sm" style={{ color: visualStyle.soft }}>-</span> : countryChart.map((entry, index) => (
                  <span key={entry.name} className="rounded-xl border px-3 py-2 font-mono text-sm font-semibold" style={{ background: visualStyle.chip, borderColor: visualStyle.border, color: visualStyle.text }}>
                    <Globe2 className="mr-1 inline" size={14} style={{ color: visualAccent.primary }} />{entry.name} <span style={{ color: chartColors[index % chartColors.length] }}>{entry.count}</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border p-4 transition-colors duration-300" style={{ background: visualStyle.card, borderColor: visualStyle.border }}>
            <p className="text-sm font-medium" style={{ color: visualStyle.text }}>{copy('实际使用人分布', 'Actual user split')}</p>
            <div className="mt-4 space-y-3">
              {userChart.map((entry, index) => (
                <div key={entry.name}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span style={{ color: visualStyle.muted }}>{entry.name}</span>
                    <span className="font-mono" style={{ color: visualStyle.text }}>{entry.count}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full" style={{ background: visualStyle.chip }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.max(12, (entry.count / Math.max(1, domestic.length)) * 100)}%`, background: chartColors[index % chartColors.length] }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border p-4 transition-colors duration-300" style={{ background: visualStyle.card, borderColor: visualStyle.border }}>
            <p className="text-sm font-medium" style={{ color: visualStyle.text }}>{copy('保号与关注', 'Keepalive watch')}</p>
            <div className="mt-4 space-y-2">
              {keepaliveItems.length === 0 ? <p className="text-sm" style={{ color: visualStyle.soft }}>{copy('暂无国外卡保号记录。', 'No foreign keepalive records yet.')}</p> : keepaliveItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2" style={{ background: visualStyle.cardStrong, borderColor: visualStyle.border }}>
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm font-semibold" style={{ color: visualStyle.text }}>{item.number}</p>
                    <p className="text-xs" style={{ color: visualStyle.soft }}>{item.country} · {item.carrier}</p>
                  </div>
                  <div className={`shrink-0 text-right font-mono text-sm font-semibold ${dueTone(item.left)}`}>
                    {item.left === null ? '-' : `${item.left}d`}
                    <p className="text-[11px] font-normal" style={{ color: visualStyle.soft }}>{compactDate(item.dueDate)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {showcase.map((item) => (
            <div key={item.id} className="rounded-2xl border p-4 transition-all duration-200 hover:-translate-y-0.5" style={{ background: visualStyle.card, borderColor: visualStyle.border }}>
              <p className="font-mono text-base font-semibold" style={{ color: visualStyle.text }}>{getPhoneDisplayNumber(item)}</p>
              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                <span className="rounded-md px-1.5 py-0.5" style={{ background: hexToRgba(visualAccent.secondary, 0.15), color: visualAccent.secondary }}>{stringValue(item.userName) || stringValue(item.realNamePerson) || '-'}</span>
                <span className="font-mono" style={{ color: visualAccent.tertiary }}>{formatMoney(item.amountMinorUnits, item.currency)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function PhoneAppearanceControl({
  styleKey,
  accentKey,
  onStyleChange,
  onAccentChange,
  copy,
  visualStyle
}: {
  styleKey: PhoneVisualStyleKey;
  accentKey: PhoneVisualAccentKey;
  onStyleChange: (next: PhoneVisualStyleKey) => void;
  onAccentChange: (next: PhoneVisualAccentKey) => void;
  copy: (zh: string, en: string) => string;
  visualStyle: PhoneVisualStyle;
}) {
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 rounded-2xl border px-2.5 py-2" style={{ background: visualStyle.card, borderColor: visualStyle.border }}>
      <span className="px-1 text-xs font-medium" style={{ color: visualStyle.soft }}>{copy('外观', 'Look')}</span>
      <select
        value={styleKey}
        onChange={(event) => onStyleChange(event.target.value as PhoneVisualStyleKey)}
        className="h-8 rounded-xl border px-2.5 text-xs font-medium outline-hidden transition-colors"
        style={{ background: visualStyle.chip, borderColor: visualStyle.border, color: visualStyle.text }}
      >
        {phoneVisualStyles.map((style) => <option key={style.key} value={style.key}>{copy(style.labelZh, style.labelEn)}</option>)}
      </select>
      <div className="flex items-center gap-1">
        {phoneVisualAccents.map((item) => {
          const active = accentKey === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onAccentChange(item.key)}
              className="h-7 w-7 rounded-full border p-1 transition-all duration-200 hover:-translate-y-0.5"
              style={{
                background: active ? hexToRgba(item.primary, 0.16) : 'transparent',
                borderColor: active ? hexToRgba(item.primary, 0.72) : visualStyle.border,
                boxShadow: active ? `0 0 0 2px ${hexToRgba(item.primary, 0.12)}` : 'none'
              }}
              title={copy(item.labelZh, item.labelEn)}
              aria-label={copy(item.labelZh, item.labelEn)}
            >
              <span className="block h-full w-full rounded-full" style={{ background: item.primary }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PhoneHeroMetric({ label, value, color, visualStyle }: { label: string; value: number; color: string; visualStyle: PhoneVisualStyle }) {
  return (
    <div className="rounded-2xl border px-3 py-3" style={{ background: visualStyle.card, borderColor: visualStyle.border }}>
      <p className="text-xs" style={{ color: visualStyle.muted }}>{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold" style={{ color }}>{value}</p>
    </div>
  );
}

export function VisualGlassCard({ label, value, detail, icon, color, visualStyle, compact = false }: { label: string; value: React.ReactNode; detail: string; icon: React.ReactNode; color: string; visualStyle: PhoneVisualStyle; compact?: boolean }) {
  return (
    <div className={`${compact ? 'p-3' : 'p-4'} rounded-2xl border transition-colors duration-300`} style={{ background: visualStyle.card, borderColor: visualStyle.border }}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm" style={{ color: visualStyle.muted }}>{label}</p>
          <div className={`${compact ? 'text-2xl' : 'text-3xl'} mt-2 font-mono font-semibold`} style={{ color: visualStyle.text }}>{value}</div>
        </div>
        <div className={`${compact ? 'h-9 w-9' : 'h-10 w-10'} flex items-center justify-center rounded-xl border`} style={{ borderColor: hexToRgba(color, 0.28), background: hexToRgba(color, 0.14), color }}>{icon}</div>
      </div>
      <p className={`${compact ? 'mt-3' : 'mt-4'} text-xs`} style={{ color: visualStyle.soft }}>{detail}</p>
    </div>
  );
}

export function PhoneFormSections({
  form,
  updateForm,
  copy,
  language
}: {
  form: FormState;
  updateForm: (key: string, value: string | boolean) => void;
  copy: (zh: string, en: string) => string;
  language: ReturnType<typeof useI18n>['language'];
}) {
  const phoneType = String(form.phoneType || 'domestic');
  return (
    <>
      <Section title={copy('卡片类型', 'Card type')}>
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-white/[0.03]">
          {[
            { value: 'domestic', label: copy('国内电话卡', 'Domestic') },
            { value: 'foreign', label: copy('国外电话卡', 'Foreign') }
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => updateForm('phoneType', option.value)}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${phoneType === option.value ? 'bg-white text-brand-600 shadow-xs dark:bg-white/10 dark:text-brand-300' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </Section>

      {phoneType === 'foreign' ? (
        <Section title={copy('国外号码', 'Foreign number')}>
          <Field label={copy('SIM 形态', 'SIM format')}>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1 dark:border-white/10 dark:bg-white/[0.03]">
              {[
                { value: false, label: copy('实体 SIM', 'Physical SIM') },
                { value: true, label: copy('eSIM', 'eSIM') }
              ].map((option) => (
                <button
                  key={String(option.value)}
                  type="button"
                  onClick={() => updateForm('isEsim', option.value)}
                  className={`rounded-lg px-3 py-2 text-sm font-medium transition-all ${Boolean(form.isEsim) === option.value ? 'bg-white text-brand-600 shadow-xs dark:bg-white/10 dark:text-brand-300' : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-[108px_minmax(0,1fr)] gap-3">
            <Field label={copy('国家区号', 'Country code')}><input className={`${inputClass} font-mono`} value={String(form.countryCode ?? '')} onChange={(e) => updateForm('countryCode', e.target.value)} placeholder="+1" /></Field>
            <Field label={copy('A 电话号码', 'A number')}><input className={`${inputClass} font-mono`} required value={String(form.aPhoneNumber || form.cardNumber || '')} onChange={(e) => { updateForm('aPhoneNumber', e.target.value); updateForm('cardNumber', e.target.value); }} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={copy('归属地', 'Home location')}><input className={inputClass} value={String(form.homeLocation ?? '')} onChange={(e) => updateForm('homeLocation', e.target.value)} /></Field>
            <Field label={copy('运营商', 'Carrier')}><input className={inputClass} value={String(form.carrier ?? '')} onChange={(e) => updateForm('carrier', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={copy('内地号码', 'Mainland number')}><input className={`${inputClass} font-mono`} value={String(form.mainlandNumber ?? '')} onChange={(e) => updateForm('mainlandNumber', e.target.value)} /></Field>
            <Field label={copy('实名方式', 'Verification')}><input className={inputClass} value={String(form.realNameMethod ?? '')} onChange={(e) => updateForm('realNameMethod', e.target.value)} /></Field>
          </div>
        </Section>
      ) : (
        <Section title={copy('国内号码', 'Domestic number')}>
          <Field label={copy('电话号码', 'Phone number')}><input className={`${inputClass} font-mono`} required value={String(form.cardNumber ?? '')} onChange={(e) => updateForm('cardNumber', e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={copy('PO 电话号码', 'PO number')}><input className={`${inputClass} font-mono`} value={String(form.poPhoneNumber ?? '')} onChange={(e) => updateForm('poPhoneNumber', e.target.value)} /></Field>
            <Field label={copy('运营商', 'Carrier')}><input className={inputClass} value={String(form.carrier ?? '')} onChange={(e) => updateForm('carrier', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={copy('实名人', 'Registered owner')}><input className={inputClass} value={String(form.realNamePerson ?? '')} onChange={(e) => updateForm('realNamePerson', e.target.value)} /></Field>
            <Field label={copy('使用人', 'User')}><input className={inputClass} value={String(form.userName ?? '')} onChange={(e) => updateForm('userName', e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label={copy('是否副卡', 'Secondary')}><select className={inputClass} value={String(form.isSecondaryCard)} onChange={(e) => updateForm('isSecondaryCard', e.target.value === 'true')}><option value="false">{copy('否', 'No')}</option><option value="true">{copy('是', 'Yes')}</option></select></Field>
            <Field label={copy('流量（G）', 'Data GB')}><input className={`${inputClass} font-mono`} type="number" step="0.1" value={String(form.dataAllowanceGb ?? '')} onChange={(e) => updateForm('dataAllowanceGb', e.target.value)} /></Field>
            <Field label={copy('通话（min）', 'Minutes')}><input className={`${inputClass} font-mono`} type="number" value={String(form.voiceMinutes ?? '')} onChange={(e) => updateForm('voiceMinutes', e.target.value)} /></Field>
          </div>
          <Field label={copy('套餐名称', 'Plan name')}><input className={inputClass} placeholder={copy('如：大王卡 19 元', 'e.g. 19 CNY basic plan')} value={String(form.planName ?? '')} onChange={(e) => updateForm('planName', e.target.value)} /></Field>
          <Field label={copy('附属业务备注', 'Attached service notes')}><input className={inputClass} value={String(form.attachedServices ?? '')} onChange={(e) => updateForm('attachedServices', e.target.value)} /></Field>
        </Section>
      )}

      <Section title={phoneType === 'foreign' ? copy('余额与保号', 'Balance and keepalive') : copy('月租与花费', 'Rent and cost')}>
        {phoneType === 'foreign' ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Field label={copy(`余额（${String(form.currency || 'CNY')}）`, `Balance (${String(form.currency || 'CNY')})`)}><input className={`${inputClass} font-mono`} type="number" step="0.01" value={String(form.balanceMinorUnits ?? '')} onChange={(e) => updateForm('balanceMinorUnits', e.target.value)} /></Field>
              <Field label={copy('最低保号金额', 'Min keepalive')}><input className={`${inputClass} font-mono`} type="number" step="0.01" value={String(form.minimumKeepaliveAmountMinorUnits ?? '')} onChange={(e) => updateForm('minimumKeepaliveAmountMinorUnits', e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={copy('总保号截止日期', 'Keepalive until')}><input className={inputClass} type="date" value={String(form.totalKeepaliveUntil ?? '')} onChange={(e) => updateForm('totalKeepaliveUntil', e.target.value)} /></Field>
              <Field label={copy('保号天数', 'Keepalive days')}><input className={`${inputClass} font-mono`} type="number" value={String(form.keepaliveDays ?? '')} onChange={(e) => updateForm('keepaliveDays', e.target.value)} /></Field>
            </div>
            <Field label={copy('保号方式', 'Keepalive method')}><input className={inputClass} value={String(form.keepaliveMethod ?? '')} onChange={(e) => updateForm('keepaliveMethod', e.target.value)} /></Field>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label={copy('月租', 'Monthly rent')}><input className={`${inputClass} font-mono`} type="number" step="0.01" value={String(form.monthlyRentMinorUnits ?? '')} onChange={(e) => updateForm('monthlyRentMinorUnits', e.target.value)} /></Field>
            <Field label={copy('附属业务', 'Attached services')}><input className={`${inputClass} font-mono`} type="number" step="0.01" value={String(form.attachedServicesMinorUnits ?? '')} onChange={(e) => updateForm('attachedServicesMinorUnits', e.target.value)} /></Field>
            <Field label={copy('减免', 'Discount')}><input className={`${inputClass} font-mono`} type="number" step="0.01" value={String(form.discountMinorUnits ?? '')} onChange={(e) => updateForm('discountMinorUnits', e.target.value)} /></Field>
            <Field label={copy('月花费', 'Monthly cost')}><input className={`${inputClass} bg-slate-50 font-mono dark:bg-white/[0.04]`} type="number" step="0.01" value={String(form.amount ?? '')} readOnly /></Field>
            <Field label={copy('回款（扣减月花费）', 'Cashback deducted')}><input className={`${inputClass} font-mono`} type="number" step="0.01" value={String(form.cashbackMinorUnits ?? '')} onChange={(e) => updateForm('cashbackMinorUnits', e.target.value)} /></Field>
          </div>
        )}
      </Section>

      <Section title={copy('费用与状态', 'Cost and status')}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy('币种', 'Currency')}><select className={inputClass} value={String(form.currency)} onChange={(e) => updateForm('currency', e.target.value)}>{currencies.map((value) => <option key={value}>{value}</option>)}</select></Field>
          <Field label={copy('计费周期', 'Billing cycle')}><select className={inputClass} value={String(form.billingCycle)} onChange={(e) => updateForm('billingCycle', e.target.value)}>{cycles.map((value) => <option key={value} value={value}>{formatCycle(value, language)}</option>)}</select></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy('下次扣费', 'Next payment')}><input className={inputClass} type="date" value={String(form.nextDueDate ?? '')} onChange={(e) => updateForm('nextDueDate', e.target.value)} /></Field>
          <Field label={copy('到期日', 'Expires on')}><input className={inputClass} type="date" value={String(form.expireDate ?? '')} onChange={(e) => updateForm('expireDate', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy('开卡日期', 'Activated on')}><input className={inputClass} type="date" value={String(form.activateDate ?? '')} onChange={(e) => updateForm('activateDate', e.target.value)} /></Field>
          <Field label={copy('扣费日', 'Billing day')}><input className={`${inputClass} font-mono`} type="number" min="1" max="31" value={String(form.billingDay ?? '')} onChange={(e) => updateForm('billingDay', e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={copy('状态', 'Status')}><select className={inputClass} value={String(form.status)} onChange={(e) => updateForm('status', e.target.value)}>{statusOptions(copy)}</select></Field>
          <Field label={copy('自动续费', 'Auto renew')}><select className={inputClass} value={String(form.autoRenew)} onChange={(e) => updateForm('autoRenew', e.target.value === 'true')}><option value="true">{copy('开启', 'On')}</option><option value="false">{copy('关闭', 'Off')}</option></select></Field>
        </div>
        <Field label={copy('备注', 'Notes')}><textarea className={`${inputClass} h-24 py-2.5`} value={String(form.notes ?? '')} onChange={(e) => updateForm('notes', e.target.value)} /></Field>
      </Section>
    </>
  );
}

export function LinkedAccountsBadge({ item, copy }: { item: AssetItem; copy: (zh: string, en: string) => string }) {
  const accounts = Array.isArray(item.linkedAccounts) ? item.linkedAccounts as Array<{ accountType: string }> : [];
  if (!accounts.length) return null;
  const types = [...new Set(accounts.map((account) => account.accountType))].join(', ');
  return <span className="ml-1.5 rounded-md bg-brand-500/10 px-1.5 py-0.5 text-[10px] text-brand-600 dark:text-brand-300" title={types}>{copy(`${accounts.length} 个账号`, `${accounts.length} accounts`)}</span>;
}

export function PhoneMiniCardView({ item, copy }: { item: AssetItem; copy: (zh: string, en: string) => string }) {
  const country = getPhoneCountryCode(item);
  const phoneNumber = getPhoneDisplayNumber(item);
  const isForeign = stringValue(item.phoneType) === 'foreign';

  return (
    <div className="motion-card rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-xs transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-500/30 hover:shadow-soft dark:border-white/10 dark:bg-ink-850">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-xs font-semibold text-slate-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-300">
            {country}{isForeign ? ` · ${getSimFormFactorLabel(item, copy)}` : ''}
          </span>
          <h3 className="mt-2 truncate font-mono text-base font-semibold tracking-normal text-slate-950 dark:text-white">
            {phoneNumber}
          </h3>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{copy('月花费', 'Monthly')}</p>
          <p className="mt-1 font-mono text-sm font-semibold text-slate-950 dark:text-white">{formatMoney(item.amountMinorUnits, item.currency)}</p>
        </div>
      </div>
    </div>
  );
}

export function PhoneCardView({
  item,
  duplicated,
  duplicating,
  copiedNumber,
  onCopyNumber,
  onDuplicate,
  renewAction,
  onEdit,
  onDelete,
  copy
}: {
  item: AssetItem;
  duplicated: boolean;
  duplicating: boolean;
  copiedNumber: boolean;
  onCopyNumber: (item: AssetItem) => void;
  onDuplicate: (item: AssetItem) => void;
  renewAction?: React.ReactNode;
  onEdit: (item: AssetItem) => void;
  onDelete: (item: AssetItem) => void;
  copy: (zh: string, en: string) => string;
}) {
  const isForeign = stringValue(item.phoneType) === 'foreign';
  const dueDate = String(item.nextDueDate ?? item.expireDate ?? '');
  const left = daysLeft(dueDate || null);
  const duplicateTitle = duplicated
    ? copy('已复制条目', 'Entry duplicated')
    : duplicating
      ? copy('复制中', 'Duplicating')
      : copy('复制条目', 'Duplicate entry');
  return (
    <div className="motion-card card-hover group relative overflow-hidden">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex max-w-full items-center gap-2">
            <h3 className="truncate font-mono text-lg font-semibold text-slate-950 dark:text-white">{getPhoneDisplayNumber(item)}</h3>
            <button
              className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all ${copiedNumber ? 'bg-success-500/10 text-success-500' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white'}`}
              onClick={() => onCopyNumber(item)}
              title={copy('复制号码', 'Copy number')}
              aria-label={copy('复制号码', 'Copy number')}
            >
              {copiedNumber ? <Check size={13} /> : <Copy size={13} />}
            </button>
            <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-medium ${isForeign ? 'bg-brand-500/10 text-brand-600 dark:text-brand-300' : 'bg-success-500/10 text-success-600 dark:text-success-300'}`}>
              {isForeign ? copy('国外', 'Foreign') : copy('国内', 'Domestic')}
            </span>
            {isForeign && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600 dark:bg-white/[0.06] dark:text-slate-300">{getSimFormFactorLabel(item, copy)}</span>}
            <LinkedAccountsBadge item={item} copy={copy} />
          </div>
          <div className="mt-1 flex min-w-0 items-center gap-2 text-sm">
            <span className="truncate text-slate-500">{stringValue(item.carrier) || '-'}</span>
            {isForeign ? (
              <span className="shrink-0 rounded-md bg-brand-500/10 px-1.5 py-0.5 font-mono text-xs font-semibold text-brand-600 dark:text-brand-300">{getPhoneCountryCode(item)}</span>
            ) : (
              <span className="shrink-0 rounded-md bg-success-500/10 px-1.5 py-0.5 text-xs font-semibold text-success-700 dark:text-success-300">{stringValue(item.userName) || stringValue(item.realNamePerson) || '-'}</span>
            )}
          </div>
        </div>
        <StatusBadge status={item.status} />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-xs text-slate-500">{copy('月花费', 'Monthly cost')}</p>
          <p className="mt-1 font-mono text-xl font-semibold text-slate-950 dark:text-white">{formatMoney(item.amountMinorUnits, item.currency)}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-xs text-slate-500">{isForeign ? copy('保号截止', 'Keepalive until') : copy('套餐资源', 'Plan usage')}</p>
          <p className="mt-1 truncate font-mono text-sm font-semibold text-slate-950 dark:text-white">
            {isForeign ? compactDate(stringValue(item.totalKeepaliveUntil)) : `${Number(item.dataAllowanceGb ?? 0) || '-'}G / ${Number(item.voiceMinutes ?? 0) || '-'}min`}
          </p>
        </div>
      </div>

      {left !== null && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm dark:border-white/10">
          <span className="text-slate-500">{copy('下次扣费', 'Next payment')}</span>
          <span className={`font-mono font-semibold ${dueTone(left)}`}>{compactDate(dueDate)} · {left}d</span>
        </div>
      )}

      <div className="mt-5 flex justify-end gap-1 border-t border-slate-100 pt-3 dark:border-white/[0.06]">
        {renewAction}
        <button
          onClick={() => onDuplicate(item)}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-200 disabled:cursor-wait ${duplicated ? 'bg-success-500/10 text-success-500' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white'}`}
          title={duplicateTitle}
          aria-label={duplicateTitle}
          disabled={duplicating}
        >
          {duplicated ? <Check size={14} /> : <Copy className={duplicating ? 'animate-pulse' : ''} size={14} />}
        </button>
        <button onClick={() => onEdit(item)} className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-white/[0.06] dark:hover:text-white" title={copy('编辑', 'Edit')}>
          <Pencil size={14} />
        </button>
        <button onClick={() => onDelete(item)} className="inline-flex h-8 w-8 items-center justify-center rounded-xl text-slate-400 hover:bg-danger-500/10 hover:text-danger-500" title={copy('移入回收站', 'Move to recycle bin')} aria-label={copy('移入回收站', 'Move to recycle bin')}>
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );
}

export function getStoredPhoneVisualStyle(): PhoneVisualStyleKey {
  const stored = localStorage.getItem('moneypulse-phone-visual-style');
  return phoneVisualStyles.some((item) => item.key === stored) ? stored as PhoneVisualStyleKey : 'nebula';
}

export function getStoredPhoneVisualAccent(): PhoneVisualAccentKey {
  const stored = localStorage.getItem('moneypulse-phone-visual-accent');
  return phoneVisualAccents.some((item) => item.key === stored) ? stored as PhoneVisualAccentKey : 'cyan';
}

export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const normalized = clean.length === 3
    ? clean.split('').map((char) => `${char}${char}`).join('')
    : clean.padEnd(6, '0').slice(0, 6);
  const value = Number.parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export function carrierColor(carrier: string, fallback: string): string {
  if (carrier.includes('移动')) return '#38bdf8';
  if (carrier.includes('联通')) return '#f97316';
  if (carrier.includes('电信')) return '#22c55e';
  return fallback;
}

export function normalizeDomesticCarrier(value: unknown, copy: (zh: string, en: string) => string): string {
  const carrier = stringValue(value);
  if (carrier.includes('移动') || carrier.toLowerCase().includes('mobile')) return '移动';
  if (carrier.includes('联通') || carrier.toLowerCase().includes('unicom')) return '联通';
  if (carrier.includes('电信') || carrier.toLowerCase().includes('telecom')) return '电信';
  return carrier || copy('未记录运营商', 'No carrier');
}

export function getPhoneCountryCode(item: AssetItem): string {
  if (stringValue(item.phoneType) !== 'foreign') return 'CN';
  const homeLocation = stringValue(item.homeLocation).toUpperCase();
  if (homeLocation) return normalizeCountryShortName(homeLocation);
  const countryCode = stringValue(item.countryCode).replace(/^\+/, '');
  const byDialCode: Record<string, string> = {
    '1': 'US',
    '44': 'UK',
    '49': 'DE',
    '81': 'JP',
    '82': 'KR',
    '852': 'HK',
    '853': 'MAC',
    '886': 'TW'
  };
  return byDialCode[countryCode] || countryCode || '-';
}

export function getSimFormFactorLabel(item: AssetItem, copy: (zh: string, en: string) => string): string {
  return Boolean(item.isEsim) ? copy('eSIM', 'eSIM') : copy('实体 SIM', 'Physical SIM');
}

export function getPhoneDisplayNumber(item: AssetItem): string {
  const number = stringValue(item.aPhoneNumber) || stringValue(item.cardNumber) || stringValue(item.poPhoneNumber);
  if (!number) return '-';
  if (stringValue(item.phoneType) !== 'foreign') return number;
  const countryCode = stringValue(item.countryCode).replace(/^\+/, '');
  if (!countryCode || number.startsWith('+')) return number;
  const normalizedNumber = number.replace(/^0+/, '');
  return `+${countryCode} ${normalizedNumber}`;
}

export function normalizeCountryShortName(value: string): string {
  const normalized = value.trim().toUpperCase();
  const aliases: Record<string, string> = {
    HONGKONG: 'HK',
    'HONG KONG': 'HK',
    MACAO: 'MAC',
    MACAU: 'MAC',
    MO: 'MAC',
    GB: 'UK',
    UNITEDKINGDOM: 'UK',
    'UNITED KINGDOM': 'UK',
    UNITEDSTATES: 'US',
    'UNITED STATES': 'US',
    USA: 'US'
  };
  return aliases[normalized] || normalized;
}

export function updatePhoneCostFields(next: FormState, key: string): void {
  if (!['monthlyRentMinorUnits', 'attachedServicesMinorUnits', 'discountMinorUnits', 'cashbackMinorUnits'].includes(key)) return;
  const rent = numberValue(next.monthlyRentMinorUnits) ?? 0;
  const attachedServices = numberValue(next.attachedServicesMinorUnits) ?? 0;
  const discount = numberValue(next.discountMinorUnits) ?? 0;
  const cashback = numberValue(next.cashbackMinorUnits) ?? 0;
  next.amount = String(Math.max(rent + attachedServices - discount - cashback, 0));
}
