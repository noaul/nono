import { FormEvent, useState } from 'react';
import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { api, ApiError } from './api';
import { Button, Field, StateBanner, inputClass } from './ui';
import type { User } from './types';
import { useI18n } from './i18n';

export function LoginPage({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const { copy } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const r = await api.post<{ user: User }>('/api/auth/login', { username, password });
      onAuthenticated(r.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy('登录失败', 'Sign-in failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthFrame title={copy('登录 NoMoney', 'Sign in to NoMoney')} subtitle={copy('进入你的个人资产与费用工作台。', 'Open your personal asset and expense workspace.')}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={copy('用户名', 'Username')}>
          <input className={inputClass} value={username} autoComplete="username" onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label={copy('密码', 'Password')}>
          <input className={inputClass} type="password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <StateBanner tone="danger">{error}</StateBanner>}
        <Button className="w-full" type="submit" disabled={submitting}>
          {submitting ? copy('登录中', 'Signing in…') : copy('登录', 'Sign in')}
        </Button>
      </form>
    </AuthFrame>
  );
}

export function SetupPage({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const { copy } = useI18n();
  const [form, setForm] = useState({ username: 'owner', email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const r = await api.post<{ user: User }>('/api/auth/setup', form);
      onAuthenticated(r.user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy('初始化失败', 'Setup failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthFrame title={copy('初始化账户', 'Create your account')} subtitle={copy('创建唯一管理员，后续所有资产与提醒都归这个账户管理。', 'Create the single administrator that owns every asset and reminder.')}>
      <form onSubmit={submit} className="space-y-4">
        <Field label={copy('用户名', 'Username')}>
          <input className={inputClass} value={form.username} autoComplete="username" onChange={(e) => setForm({ ...form, username: e.target.value })} />
        </Field>
        <Field label={copy('提醒邮箱', 'Reminder email')}>
          <input className={inputClass} type="email" value={form.email} autoComplete="email" onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label={copy('密码', 'Password')} hint={copy('至少 8 位，用于本地单用户登录。', 'At least 8 characters, for local single-user sign-in.')}>
          <input className={inputClass} type="password" value={form.password} autoComplete="new-password" onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
        {error && <StateBanner tone="danger">{error}</StateBanner>}
        <Button className="w-full" type="submit" disabled={submitting}>
          {submitting ? copy('创建中', 'Creating…') : copy('创建账户', 'Create account')}
        </Button>
      </form>
    </AuthFrame>
  );
}

function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const { copy } = useI18n();
  return (
    <div className="grid min-h-screen bg-slate-50 text-slate-950 dark:bg-ink-950 dark:text-white lg:grid-cols-[0.95fr_1.05fr]">
      <section className="hidden border-r border-slate-200 bg-white px-10 py-8 dark:border-white/10 dark:bg-ink-900 lg:flex lg:flex-col lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-xs font-semibold text-white dark:bg-white dark:text-slate-950">
             NM
          </div>
          <div>
             <div className="text-sm font-semibold">NoMoney</div>
            <div className="font-mono text-[11px] text-slate-400">asset cost control</div>
          </div>
        </div>
        <div className="max-w-md">
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-brand-500/20 bg-brand-500/10 text-brand-500">
            <ShieldCheck size={20} />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">{copy('资产、续费和真实支出，放在一个干净的工作台里。', 'Assets, renewals, and real spend in one clean workspace.')}</h1>
          <p className="mt-4 text-sm leading-6 text-slate-500 dark:text-slate-400">
            {copy('单用户部署、HttpOnly 会话、多币种成本、到期提醒与费用流水，适合个人服务器、域名和订阅的长期维护。', 'Single-user deployment, HttpOnly sessions, multi-currency costs, renewal reminders, and expense tracking — built for looking after your own servers, domains, and subscriptions.')}
          </p>
        </div>
        <div className="font-mono text-xs text-slate-400">Dark-first private finance workspace</div>
      </section>
      <section className="flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-6">
            <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-brand-600 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-brand-400">
              <LockKeyhole size={18} />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
          </div>
          <div className="card">{children}</div>
        </div>
      </section>
    </div>
  );
}
