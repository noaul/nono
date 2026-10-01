import { FormEvent, useEffect, useRef, useState } from 'react';
import { Bell, CloudDownload, Download, LockKeyhole, Mail, Play, Save, Upload } from 'lucide-react';
import type { ListResponse, ReminderLogItem, SettingsValue } from './types';
import { api, ApiError } from './api';
import { withBasePath } from './base-path';
import { Button, DataTable, Field, PageHeader, Skeleton, StateBanner, StatusBadge, inputClass, type DataTableColumn } from './ui';
import { readStoredLanguage, useI18n } from './i18n';
import { product } from './product';
import { currencies, formatShanghaiDateTime } from './format';
import { setPreferences } from './preferences';

const productBackupName = product === 'yumi' ? 'yumi-backup.json.enc' : 'nomoney-backup.json.enc';

const defaultSettings: SettingsValue = {
  reminderDays: [30, 14, 7, 3, 1, 0],
  reminderEnabled: true,
  autoRenewEnabled: true,
  defaultCurrency: 'CNY',
  timezone: 'Asia/Shanghai',
  language: 'zh',
  smtpHost: '',
  smtpPort: 587,
  smtpUser: '',
  smtpFrom: '',
  smtpTo: '',
  webdavUrl: '',
  webdavUsername: '',
  webdavPassword: '',
  webdavPath: productBackupName,
  webdavFolderPath: '',
  webdavBackupFilename: '',
  webdavEncryptionKey: '',
  webhookUrl: '',
  telegramBotToken: '',
  telegramChatId: '',
  barkUrl: '',
  outageAlertsEnabled: true,
  diskAlertPercent: 90
};

type NotifyResult = { channel: 'email' | 'webhook' | 'telegram' | 'bark'; ok: boolean; error?: string };

function channelLabel(channel: NotifyResult['channel'], copy: (zh: string, en: string) => string) {
  return { email: copy('邮件', 'Email'), webhook: 'Webhook', telegram: 'Telegram', bark: 'Bark' }[channel];
}

export function SettingsPage() {
  const { copy, language, setLanguage } = useI18n();
  const [settings, setSettings] = useState(defaultSettings);
  const [reminderDaysText, setReminderDaysText] = useState(defaultSettings.reminderDays.join(','));
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [logs, setLogs] = useState<ReminderLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'success' | 'danger' | 'info'>('info');

  const load = async () => {
    const [settingsResponse, logResponse] = await Promise.all([
      api.get<{ settings: SettingsValue }>('/api/settings'),
      api.get<ListResponse<ReminderLogItem>>('/api/reminders/logs?limit=8')
    ]);
    const nextLanguage = readStoredLanguage() ?? settingsResponse.settings.language ?? language;
    setSettings({ ...settingsResponse.settings, language: nextLanguage });
    setReminderDaysText(settingsResponse.settings.reminderDays.join(','));
    setLanguage(nextLanguage);
    setLogs(logResponse.items);
    setLoading(false);
  };

  useEffect(() => {
    load().catch((err) => {
      setMessage(err instanceof ApiError ? err.message : copy('设置加载失败', 'Failed to load settings'));
      setMessageTone('danger');
      setLoading(false);
    });
  }, []);

  const saveSettings = async (e: FormEvent) => {
    e.preventDefault();
    setMessage('');
    try {
      const reminderDays = [...new Set(reminderDaysText.split(/[,，\s]+/).filter(Boolean).map(Number))]
        .filter((value) => Number.isInteger(value) && value >= 0 && value <= 365)
        .sort((a, b) => b - a);
      const response = await api.put<{ settings: SettingsValue }>('/api/settings', { ...settings, reminderDays });
      setSettings(response.settings);
      setReminderDaysText(response.settings.reminderDays.join(','));
      setLanguage(response.settings.language);
      setPreferences({ defaultCurrency: response.settings.defaultCurrency, timezone: response.settings.timezone });
      showMessage(copy('设置已保存', 'Settings saved'), 'success');
    } catch (err) {
      showMessage(err instanceof ApiError ? err.message : copy('保存失败', 'Save failed'), 'danger');
    }
  };

  const clearBark = async () => {
    try {
      const response = await api.put<{ settings: SettingsValue }>('/api/settings', { barkUrl: null });
      setSettings((current) => ({ ...current, barkUrl: '', barkUrlSet: response.settings.barkUrlSet }));
      showMessage(copy('Bark 已移除', 'Bark removed'), 'success');
    } catch (err) {
      showMessage(err instanceof ApiError ? err.message : copy('移除失败', 'Failed to remove Bark'), 'danger');
    }
  };

  const testEmail = async () => {
    setMessage('');
    try {
      await api.post('/api/settings/test-email');
      showMessage(copy('测试邮件已发送', 'Test email sent'), 'success');
    } catch (err) {
      showMessage(err instanceof ApiError ? err.message : copy('测试邮件失败', 'Test email failed'), 'danger');
    }
  };

  const testNotify = async () => {
    setMessage('');
    try {
      const response = await api.post<{ results: NotifyResult[] }>('/api/settings/test-notify', {});
      if (response.results.length === 0) {
        showMessage(copy('还没有配置任何通知渠道。', 'No notification channel is configured yet.'), 'info');
        return;
      }
      const summary = response.results.map((result) => `${channelLabel(result.channel, copy)} ${result.ok ? '✓' : `✗ ${result.error ?? ''}`}`).join('  ·  ');
      showMessage(summary, response.results.every((result) => result.ok) ? 'success' : 'danger');
    } catch (err) {
      showMessage(err instanceof ApiError ? err.message : copy('测试失败', 'Test failed'), 'danger');
    }
  };

  const runReminder = async () => {
    try {
      const response = await api.post<{ sent: boolean; items: unknown[] }>('/api/reminders/run-now');
      showMessage(
        response.sent
          ? copy(`已发送提醒：${response.items.length} 项`, `Sent ${response.items.length} reminders`)
          : copy('没有需要发送的新提醒', 'No new reminders to send'),
        response.sent ? 'success' : 'info'
      );
      await load();
    } catch (err) {
      showMessage(err instanceof ApiError ? err.message : copy('扫描失败', 'Scan failed'), 'danger');
    }
  };

  const backupWebdav = async () => {
    try {
      const response = await api.post<{ bytes: number }>('/api/backup/webdav');
      showMessage(copy(`WebDAV 加密备份已完成：${response.bytes} bytes`, `Encrypted WebDAV backup completed: ${response.bytes} bytes`), 'success');
    } catch (err) {
      showMessage(err instanceof ApiError ? err.message : copy('WebDAV 备份失败', 'WebDAV backup failed'), 'danger');
    }
  };

  const backupFileRef = useRef<HTMLInputElement>(null);
  const restoreFile = async (file: File) => {
    if (!window.confirm(copy(`用 ${file.name} 恢复会覆盖当前的资产、流水、设置、提醒日志和登录账号。恢复后需要用备份里的账号重新登录。继续？`, `Restoring ${file.name} replaces current assets, expenses, settings, reminder logs and sign-in accounts. You will sign in again with the account from the backup. Continue?`))) return;
    try {
      const payload = JSON.parse(await file.text());
      await api.post('/api/backup/restore-file', payload);
      window.alert(copy('已恢复。请用备份中的账号重新登录。', 'Restored. Sign in with the account from the backup.'));
      window.location.reload();
    } catch (err) {
      showMessage(err instanceof ApiError ? err.message : err instanceof SyntaxError ? copy('文件不是有效的备份', 'The file is not a valid backup') : copy('恢复失败', 'Restore failed'), 'danger');
    }
  };

  const restoreWebdav = async () => {
    if (!window.confirm(copy('从 WebDAV 备份恢复会覆盖当前资产、流水、设置和提醒日志。继续？', 'Restoring from WebDAV will replace current assets, expenses, settings, and reminder logs. Continue?'))) return;
    try {
      await api.post('/api/backup/restore');
      showMessage(copy('已从 WebDAV 备份恢复', 'Restored from WebDAV backup'), 'success');
      await load();
    } catch (err) {
      showMessage(err instanceof ApiError ? err.message : copy('WebDAV 恢复失败', 'WebDAV restore failed'), 'danger');
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.put('/api/auth/password', passwordForm);
      setPasswordForm({ currentPassword: '', newPassword: '' });
      showMessage(copy('密码已修改', 'Password changed'), 'success');
    } catch (err) {
      showMessage(err instanceof ApiError ? err.message : copy('密码修改失败', 'Password change failed'), 'danger');
    }
  };

  const showMessage = (text: string, tone: 'success' | 'danger' | 'info') => {
    setMessage(text);
    setMessageTone(tone);
  };

  const logColumns: DataTableColumn<ReminderLogItem>[] = [
    { key: 'asset', header: copy('资产', 'Asset'), render: (item) => <span className="text-xs text-slate-700 dark:text-slate-300">{item.assetName ?? `${item.assetType} #${item.assetId}`}</span> },
    { key: 'due', header: copy('到期日', 'Due date'), align: 'right', render: (item) => <span className="font-mono text-slate-500">{item.dueDate}</span> },
    { key: 'days', header: copy('提前', 'Lead time'), align: 'right', render: (item) => <span className="font-mono text-slate-500">{item.daysBefore < 0 ? copy(`逾期 ${-item.daysBefore}d`, `${-item.daysBefore}d overdue`) : `${item.daysBefore}d`}</span> },
    { key: 'sent', header: copy('发送时间', 'Sent at'), align: 'right', render: (item) => <span className="font-mono text-xs text-slate-500">{formatShanghaiDateTime(item.sentAt, language)}</span> },
    { key: 'status', header: copy('状态', 'Status'), align: 'center', render: (item) => <StatusBadge status={item.status} /> }
  ];

  if (loading) {
    return <Skeleton className="h-96" />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={copy('设置', 'Settings')}
        eyebrow="System"
        description={copy('管理提醒策略、邮件投递、WebDAV 备份、语言和账户安全。', 'Manage reminders, email delivery, WebDAV backup, language, and account security.')}
        actions={(
          <div className="flex flex-wrap gap-2">
            <a className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100 dark:hover:bg-white/[0.07]" href={withBasePath('/api/export/json')}><Download size={16} />{copy('导出加密备份', 'Export encrypted backup')}</a>
            <Button type="button" variant="secondary" onClick={() => backupFileRef.current?.click()}><Upload size={16} />{copy('从备份文件恢复', 'Restore from file')}</Button>
            <input ref={backupFileRef} type="file" accept=".enc,.json,application/json" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void restoreFile(file); event.target.value = ''; }} />
          </div>
        )}
      />

      {message && <StateBanner tone={messageTone}>{message}</StateBanner>}

      <div className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="card">
          <div className="mb-5">
            <h3 className="text-sm font-semibold text-slate-950 dark:text-white">{copy('提醒与邮件', 'Reminders and email')}</h3>
            <p className="mt-1 text-xs text-slate-500">{copy('配置每日提醒扫描，以及 SMTP 投递信息。', 'Configure reminder scans and SMTP delivery.')}</p>
          </div>
          <form onSubmit={saveSettings} className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={copy('提醒天数', 'Reminder days')} hint={copy('逗号分隔，如 30,7,1,0；漏发会在下次补发，逾期后还会在 1/7/14/30 天各提醒一次。', 'Comma-separated, e.g. 30,7,1,0. Missed days are caught up; overdue items are re-sent at 1/7/14/30 days.')}><input className={inputClass} inputMode="numeric" value={reminderDaysText} onChange={(e) => setReminderDaysText(e.target.value)} /></Field>
              <Field label={copy('提醒开关', 'Reminders')}><select className={inputClass} value={String(settings.reminderEnabled)} onChange={(e) => setSettings({ ...settings, reminderEnabled: e.target.value === 'true' })}><option value="true">{copy('开启', 'Enabled')}</option><option value="false">{copy('关闭', 'Disabled')}</option></select></Field>
              <Field label={copy('自动续费记账', 'Auto-renew bookkeeping')} hint={copy('开启后，标记为“自动续费”的项目到期后自动顺延一个周期并记一笔支出（只处理逾期 60 天内的）。', 'Items marked auto-renew roll forward one cycle at their due date and record an expense (only if overdue by 60 days or less).')}><select className={inputClass} value={String(settings.autoRenewEnabled)} onChange={(e) => setSettings({ ...settings, autoRenewEnabled: e.target.value === 'true' })}><option value="true">{copy('开启', 'Enabled')}</option><option value="false">{copy('关闭', 'Disabled')}</option></select></Field>
              <Field label={copy('默认币种', 'Default currency')}><select className={inputClass} value={settings.defaultCurrency} onChange={(e) => setSettings({ ...settings, defaultCurrency: e.target.value as SettingsValue['defaultCurrency'] })}>{currencies.map((value) => <option key={value}>{value}</option>)}</select></Field>
              <Field label={copy('时区', 'Timezone')}><input className={inputClass} value={settings.timezone} onChange={(e) => setSettings({ ...settings, timezone: e.target.value })} /></Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="SMTP Host"><input className={inputClass} value={settings.smtpHost} onChange={(e) => setSettings({ ...settings, smtpHost: e.target.value })} /></Field>
              <Field label="SMTP Port"><input className={inputClass} type="number" value={settings.smtpPort} onChange={(e) => setSettings({ ...settings, smtpPort: Number(e.target.value) })} /></Field>
              <Field label="SMTP User"><input className={inputClass} value={settings.smtpUser} onChange={(e) => setSettings({ ...settings, smtpUser: e.target.value })} /></Field>
              <Field label="From"><input className={inputClass} value={settings.smtpFrom} onChange={(e) => setSettings({ ...settings, smtpFrom: e.target.value })} /></Field>
              <Field label="To"><input className={inputClass} value={settings.smtpTo} onChange={(e) => setSettings({ ...settings, smtpTo: e.target.value })} /></Field>
            </div>
            <div className="border-t border-slate-100 pt-4 dark:border-white/[0.06]">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{copy('其他通知渠道', 'Other channels')}</h4>
              <p className="mt-1 text-xs text-slate-400">{copy('到期提醒和服务器告警会同时发到所有已配置的渠道，任一渠道成功即算已送达。', 'Reminders and server alerts go to every configured channel; one success counts as delivered.')}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Telegram Bot Token" hint={settings.telegramBotTokenSet ? copy('已保存；留空不会覆盖。', 'Saved; leave blank to keep it.') : undefined}><input className={inputClass} type="password" autoComplete="off" value={settings.telegramBotToken} placeholder={settings.telegramBotTokenSet ? copy('已保存', 'Saved') : '123456:ABC…'} onChange={(e) => setSettings({ ...settings, telegramBotToken: e.target.value })} /></Field>
              <Field label="Telegram Chat ID"><input className={`${inputClass} font-mono`} value={settings.telegramChatId} placeholder="123456789" onChange={(e) => setSettings({ ...settings, telegramChatId: e.target.value })} /></Field>
              <Field label={copy('Bark 推送地址', 'Bark URL')} hint={settings.barkUrlSet ? copy('已保存；留空不会覆盖。', 'Saved; leave blank to keep it.') : copy('如 https://api.day.app/你的Key', 'e.g. https://api.day.app/<key>')}><input className={inputClass} type="password" autoComplete="off" value={settings.barkUrl} placeholder={settings.barkUrlSet ? copy('已保存', 'Saved') : 'https://api.day.app/…'} onChange={(e) => setSettings({ ...settings, barkUrl: e.target.value })} />{settings.barkUrlSet && <button type="button" className="mt-2 text-xs text-danger-600 hover:underline" onClick={clearBark}>{copy('移除 Bark', 'Remove Bark')}</button>}</Field>
              <Field label="Webhook" hint={copy('POST JSON：subject、text、content。', 'POSTs JSON with subject, text and content.')}><input className={inputClass} type="url" value={settings.webhookUrl} placeholder="https://hooks.example.com/…" onChange={(e) => setSettings({ ...settings, webhookUrl: e.target.value })} /></Field>
            </div>
            {product === 'yumi' && (
              <div className="grid gap-4 md:grid-cols-2">
                <Field label={copy('宕机告警', 'Outage alerts')} hint={copy('连续两次探测失败（约 10 分钟）时通知，恢复后再通知一次。', 'Sent after two failed checks in a row (about 10 minutes), and again on recovery.')}><select className={inputClass} value={String(settings.outageAlertsEnabled)} onChange={(e) => setSettings({ ...settings, outageAlertsEnabled: e.target.value === 'true' })}><option value="true">{copy('开启', 'Enabled')}</option><option value="false">{copy('关闭', 'Disabled')}</option></select></Field>
                <Field label={copy('磁盘告警阈值（%）', 'Disk alert threshold (%)')} hint={copy('0 表示关闭。', '0 turns it off.')}><input className={`${inputClass} font-mono`} type="number" min="0" max="100" value={settings.diskAlertPercent} onChange={(e) => setSettings({ ...settings, diskAlertPercent: Number(e.target.value) })} /></Field>
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="submit"><Save size={16} />{copy('保存设置', 'Save settings')}</Button>
              <Button type="button" variant="secondary" onClick={testEmail}><Mail size={16} />{copy('测试邮件', 'Test email')}</Button>
              <Button type="button" variant="secondary" onClick={testNotify}><Bell size={16} />{copy('测试全部渠道', 'Test all channels')}</Button>
              <Button type="button" variant="secondary" onClick={runReminder}><Play size={16} />{copy('手动扫描', 'Run scan')}</Button>
            </div>
          </form>
        </section>

        <div className="space-y-5">
          <section className="card">
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white">{copy('偏好与 WebDAV', 'Preferences and WebDAV')}</h3>
              <p className="mt-1 text-xs text-slate-500">{copy('语言切换、远程加密备份和恢复入口。', 'Language, encrypted remote backup, and restore controls.')}</p>
            </div>
            <form onSubmit={saveSettings} className="space-y-4">
              <Field label={copy('界面语言', 'Interface language')}>
                <select
                  className={inputClass}
                  value={settings.language}
                  onChange={(e) => {
                    const next = e.target.value as SettingsValue['language'];
                    setSettings({ ...settings, language: next });
                    setLanguage(next);
                  }}
                >
                  <option value="zh">中文</option>
                  <option value="en">English</option>
                </select>
              </Field>
              <Field label="WebDAV URL"><input className={inputClass} value={settings.webdavUrl} onChange={(e) => setSettings({ ...settings, webdavUrl: e.target.value })} placeholder="https://dav.example.com/remote.php/dav/files/user" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={copy('WebDAV 用户名', 'WebDAV username')}><input className={inputClass} value={settings.webdavUsername} onChange={(e) => setSettings({ ...settings, webdavUsername: e.target.value })} /></Field>
                <Field label={copy('WebDAV 密码', 'WebDAV password')} hint={settings.webdavPasswordSet ? copy('已保存；留空不会覆盖。', 'Saved; leave blank to keep it.') : undefined}><input className={inputClass} type="password" value={settings.webdavPassword} onChange={(e) => setSettings({ ...settings, webdavPassword: e.target.value })} placeholder={settings.webdavPasswordSet ? copy('已保存', 'Saved') : ''} /></Field>
              </div>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
                <Field label={copy('WebDAV 子文件夹', 'WebDAV subfolder')} hint={copy('例如 backups/moneypulse；会在 WebDAV 根地址下保存。', 'For example backups/moneypulse; saved below the WebDAV base URL.')}>
                  <input className={inputClass} value={settings.webdavFolderPath} onChange={(e) => setSettings({ ...settings, webdavFolderPath: e.target.value })} placeholder="backups/moneypulse" />
                </Field>
                <Field label={copy('备份文件名', 'Backup filename')} hint={copy('建议使用 .json.enc 后缀。', 'Use a .json.enc suffix.')}>
                  <input className={inputClass} value={settings.webdavBackupFilename} onChange={(e) => setSettings({ ...settings, webdavBackupFilename: e.target.value })} placeholder="assets.json.enc" />
                </Field>
              </div>
              <Field label={copy('备份加密密钥', 'Backup encryption key')} hint={settings.webdavEncryptionKeySet ? copy('已保存；留空不会覆盖。用于 AES-256-GCM 加密备份。', 'Saved; leave blank to keep it. Used for AES-256-GCM backups.') : copy('用于 AES-256-GCM 加密备份；建议单独设置一个恢复口令。', 'Used for AES-256-GCM backups; a separate restore passphrase is recommended.')}>
                <input className={inputClass} type="password" value={settings.webdavEncryptionKey} onChange={(e) => setSettings({ ...settings, webdavEncryptionKey: e.target.value })} placeholder={settings.webdavEncryptionKeySet ? copy('已保存', 'Saved') : copy('建议单独设置一个恢复口令', 'Recommended: set a separate restore passphrase')} />
              </Field>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="submit"><Save size={16} />{copy('保存设置', 'Save settings')}</Button>
                <Button type="button" variant="secondary" onClick={backupWebdav}><LockKeyhole size={16} />{copy('加密备份', 'Encrypted backup')}</Button>
                <Button type="button" variant="secondary" onClick={restoreWebdav}><CloudDownload size={16} />{copy('恢复', 'Restore')}</Button>
              </div>
            </form>
          </section>

          <section className="card">
            <div className="mb-5">
              <h3 className="text-sm font-semibold text-slate-950 dark:text-white">{copy('账户安全', 'Account security')}</h3>
              <p className="mt-1 text-xs text-slate-500">{copy('修改本地单用户登录密码。', 'Change the local single-user login password.')}</p>
            </div>
            <form onSubmit={changePassword} className="space-y-4">
              <Field label={copy('当前密码', 'Current password')}><input className={inputClass} type="password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} /></Field>
              <Field label={copy('新密码', 'New password')}><input className={inputClass} type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} /></Field>
              <Button type="submit">{copy('修改密码', 'Change password')}</Button>
            </form>
          </section>
        </div>
      </div>

      <section>
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-950 dark:text-white">{copy('提醒日志', 'Reminder logs')}</h3>
          <p className="mt-1 text-xs text-slate-500">{copy('最近 8 条提醒扫描结果。', 'Latest 8 reminder scan results.')}</p>
        </div>
        <DataTable columns={logColumns} data={logs} emptyText={copy('暂无提醒日志', 'No reminder logs')} />
      </section>
    </div>
  );
}
