import type React from 'react';
import clsx from 'clsx';
import { AlertCircle, Inbox, Loader2, X } from 'lucide-react';
import type { AssetStatus } from './types';
import { formatStatus } from './format';

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md';
}) {
  return (
    <button
      className={clsx(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-medium outline-none transition-all duration-200 ease-out focus-visible:ring-2 focus-visible:ring-brand-500/45 disabled:cursor-not-allowed disabled:opacity-50',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'sm' && 'h-8 px-3 text-xs',
        variant === 'primary' && 'border border-brand-500 bg-brand-600 text-white shadow-sm shadow-brand-950/20 hover:bg-brand-500',
        variant === 'secondary' && 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100 dark:hover:bg-white/[0.07]',
        variant === 'ghost' && 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.06]',
        variant === 'danger' && 'border border-danger-500/25 bg-danger-500/10 text-danger-600 hover:bg-danger-500/15 dark:text-danger-400',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function IconButton({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={clsx(
        'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 outline-none transition-all duration-200 ease-out hover:bg-slate-50 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-brand-500/45 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-400 dark:hover:bg-white/[0.08] dark:hover:text-slate-100',
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function PageHeader({
  title,
  eyebrow,
  description,
  actions
}: {
  title: string;
  eyebrow?: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/70 bg-white/55 px-4 py-3 shadow-sm shadow-slate-200/40 backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.035] dark:shadow-none sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-medium text-brand-600 dark:text-brand-400">{eyebrow}</p>}
        <h2 className="truncate text-xl font-semibold tracking-tight text-slate-950 dark:text-white sm:text-2xl">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  error
}: {
  label: string;
  children: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-slate-400">{hint}</span>}
      {error && <span className="block text-xs text-danger-500">{error}</span>}
    </label>
  );
}

export const inputClass =
  'h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-950 outline-none transition-all duration-200 ease-out placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/15 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-brand-400 dark:focus:ring-brand-500/20';

export function StatusBadge({ status }: { status: AssetStatus | string }) {
  const map: Record<string, string> = {
    active: 'border-success-500/25 bg-success-500/10 text-success-600 dark:text-success-400',
    paused: 'border-warning-500/25 bg-warning-500/10 text-warning-600 dark:text-warning-400',
    expired: 'border-danger-500/25 bg-danger-500/10 text-danger-600 dark:text-danger-400',
    cancelled: 'border-slate-300 bg-slate-100 text-slate-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-slate-400',
    archived: 'border-brand-500/25 bg-brand-500/10 text-brand-600 dark:text-brand-400',
    sent: 'border-success-500/25 bg-success-500/10 text-success-600 dark:text-success-400',
    failed: 'border-danger-500/25 bg-danger-500/10 text-danger-600 dark:text-danger-400'
  };
  const label = status in map ? formatMaybeStatus(status) : String(status);
  return (
    <span className={clsx('inline-flex items-center rounded-lg border px-2 py-0.5 text-[11px] font-medium', map[status] ?? map.cancelled)}>
      {label}
    </span>
  );
}

export function MetricCard({
  icon,
  label,
  value,
  detail,
  color = 'brand'
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  color?: 'brand' | 'success' | 'warning' | 'danger';
}) {
  const tone: Record<string, string> = {
    brand: 'text-brand-500 bg-brand-500/10 border-brand-500/20',
    success: 'text-success-500 bg-success-500/10 border-success-500/20',
    warning: 'text-warning-500 bg-warning-500/10 border-warning-500/20',
    danger: 'text-danger-500 bg-danger-500/10 border-danger-500/20'
  };
  return (
    <div className="card">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <div className="mt-2 font-mono text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">{value}</div>
        </div>
        <div className={clsx('flex h-9 w-9 items-center justify-center rounded-xl border', tone[color])}>{icon}</div>
      </div>
      {detail && <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{detail}</p>}
    </div>
  );
}

export function Drawer({
  title,
  open,
  onClose,
  children,
  footer
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <button aria-label="关闭" className="motion-fade-in absolute inset-0 bg-slate-950/65 backdrop-blur-sm" onClick={onClose} />
      <aside className="motion-drawer absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-ink-900">
        <header className="flex h-16 items-center justify-between border-b border-slate-200 px-5 dark:border-white/10">
          <h2 className="text-base font-semibold text-slate-950 dark:text-white">{title}</h2>
          <IconButton onClick={onClose} title="关闭">
            <X size={16} />
          </IconButton>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        <footer className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4 dark:border-white/10">{footer}</footer>
      </aside>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx('animate-pulse rounded-xl bg-slate-200 dark:bg-white/[0.07]', className)} />;
}

export function EmptyState({
  title = '暂无数据',
  description,
  action
}: {
  title?: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center dark:border-white/10 dark:bg-white/[0.03]">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 dark:border-white/10 dark:bg-white/[0.04]">
        <Inbox size={18} />
      </div>
      <p className="text-sm font-medium text-slate-800 dark:text-slate-200">{title}</p>
      {description && <p className="mt-1 max-w-md text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StateBanner({
  tone = 'info',
  children
}: {
  tone?: 'info' | 'danger' | 'success' | 'warning';
  children: React.ReactNode;
}) {
  const map = {
    info: 'border-brand-500/20 bg-brand-500/10 text-brand-700 dark:text-brand-300',
    danger: 'border-danger-500/20 bg-danger-500/10 text-danger-700 dark:text-danger-300',
    success: 'border-success-500/20 bg-success-500/10 text-success-700 dark:text-success-300',
    warning: 'border-warning-500/20 bg-warning-500/10 text-warning-700 dark:text-warning-300'
  };
  return (
    <div className={clsx('flex items-start gap-2 rounded-xl border px-3 py-2 text-sm', map[tone])}>
      <AlertCircle className="mt-0.5 shrink-0" size={16} />
      <div>{children}</div>
    </div>
  );
}

export function LoadingInline({ label = '加载中' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
      <Loader2 className="animate-spin" size={14} />
      {label}
    </span>
  );
}

export interface DataTableColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  render: (item: T) => React.ReactNode;
}

export function DataTable<T extends { id: number | string }>({
  columns,
  data,
  emptyText = '暂无数据'
}: {
  columns: DataTableColumn<T>[];
  data: T[];
  emptyText?: string;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-white/10 dark:bg-ink-900">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={clsx(
                    'px-4 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400',
                    col.align === 'right' && 'text-right',
                    col.align === 'center' && 'text-center'
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((item, index) => (
              <tr
                key={item.id}
                className="motion-row border-b border-slate-100 transition-colors duration-200 last:border-0 hover:bg-slate-50 dark:border-white/[0.06] dark:hover:bg-white/[0.04]"
                style={{ animationDelay: `${Math.min(index * 28, 180)}ms` }}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={clsx(
                      'px-4 py-3 align-middle text-slate-700 dark:text-slate-300',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center'
                    )}
                  >
                    {col.render(item)}
                  </td>
                ))}
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td className="px-5 py-12 text-center text-slate-400" colSpan={columns.length}>
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AssetCard({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div onClick={onClick} className={clsx('card-hover cursor-pointer', className)}>
      {children}
    </div>
  );
}

export function ProgressBar({ value, max, color = 'brand' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const colorMap: Record<string, string> = {
    brand: 'bg-brand-500',
    success: 'bg-success-500',
    warning: 'bg-warning-500',
    danger: 'bg-danger-500'
  };
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-white/[0.08]">
      <div className={clsx('h-1.5 rounded-full transition-all', colorMap[color] ?? colorMap.brand)} style={{ width: `${pct}%` }} />
    </div>
  );
}

function formatMaybeStatus(status: string): string {
  if (['active', 'paused', 'expired', 'cancelled', 'archived'].includes(status)) {
    return formatStatus(status as AssetStatus);
  }
  if (status === 'sent') return '已发送';
  if (status === 'failed') return '失败';
  return status;
}
