import { FormEvent, useEffect, useState } from 'react';
import { CloudDownload, Download, LockKeyhole, Mail, Play, Save } from 'lucide-react';
import type { ListResponse, ReminderLogItem, SettingsValue } from './types';
import { api, ApiError } from './api';
import { withBasePath } from './base-path';
import { Button, DataTable, Field, PageHeader, Skeleton, StateBanner, StatusBadge, inputClass, type DataTableColumn } from './ui';
import { useI18n } from './i18n';

const defaultSettings: SettingsValue = {
  reminderDays: [30, 14, 7, 3, 1, 0],
  reminderEnabled: true,
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
  webdavPath: 'moneypulse-backup.json',
  webdavFolderPath: '',
  webdavBackupFilename: '',
  webdavEncryptionKey: ''
};

export function SettingsPage() {
  const { copy, language, setLanguage } = useI18n();
  const [settings, setSettings] = useState(defaultSettings);
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
    const storedLanguage = localStorage.getItem('moneypulse-language');
    const nextLanguage = storedLanguage === 'en' || storedLanguage === 'zh'
      ? storedLanguage
      : settingsResponse.settings.language ?? language;
    setSettings({ ...settingsResponse.settings, language: nextLanguage });
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
      const response = await api.put<{ settings: SettingsValue }>('/api/settings', settings);
      setSettings(response.settings);
      setLanguage(response.settings.language);
      showMessage(copy('设置已保存', 'Settings saved'), 'success');
    } catch (err) {
      showMessage(err instanceof ApiError ? err.message : copy('保存失败', 'Save failed'), 'danger');
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
    { key: 'asset', header: copy('资产', 'Asset'), render: (item) => <span className="font-mono text-xs text-slate-500">{item.assetType} #{item.assetId}</span> },
    { key: 'due', header: copy('到期日', 'Due date'), align: 'right', render: (item) => <span className="font-mono text-slate-500">{item.dueDate}</span> },
    { key: 'days', header: copy('提前', 'Lead time'), align: 'right', render: (item) => <span className="font-mono text-slate-500">{item.daysBefore}d</span> },
    { key: 'sent', header: copy('发送时间', 'Sent at'), align: 'right', render: (item) => <span className="font-mono text-xs text-slate-500">{item.sentAt}</span> },
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
        actions={<a className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-slate-100 dark:hover:bg-white/[0.07]" href={withBasePath('/api/export/json')}><Download size={16} />{copy('导出加密备份', 'Export encrypted backup')}</a>}
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
              <Field label={copy('提醒天数', 'Reminder days')}><input className={inputClass} value={settings.reminderDays.join(',')} onChange={(e) => setSettings({ ...settings, reminderDays: e.target.value.split(',').map((v) => Number(v.trim())).filter((v) => Number.isFinite(v)) })} /></Field>
              <Field label={copy('提醒开关', 'Reminders')}><select className={inputClass} value={String(settings.reminderEnabled)} onChange={(e) => setSettings({ ...settings, reminderEnabled: e.target.value === 'true' })}><option value="true">Enabled</option><option value="false">Disabled</option></select></Field>
              <Field label={copy('默认币种', 'Default currency')}><select className={inputClass} value={settings.defaultCurrency} onChange={(e) => setSettings({ ...settings, defaultCurrency: e.target.value as SettingsValue['defaultCurrency'] })}><option>CNY</option><option>USD</option><option>GBP</option><option>EUR</option><option>CAD</option></select></Field>
              <Field label={copy('时区', 'Timezone')}><input className={inputClass} value={settings.timezone} onChange={(e) => setSettings({ ...settings, timezone: e.target.value })} /></Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="SMTP Host"><input className={inputClass} value={settings.smtpHost} onChange={(e) => setSettings({ ...settings, smtpHost: e.target.value })} /></Field>
              <Field label="SMTP Port"><input className={inputClass} type="number" value={settings.smtpPort} onChange={(e) => setSettings({ ...settings, smtpPort: Number(e.target.value) })} /></Field>
              <Field label="SMTP User"><input className={inputClass} value={settings.smtpUser} onChange={(e) => setSettings({ ...settings, smtpUser: e.target.value })} /></Field>
              <Field label="From"><input className={inputClass} value={settings.smtpFrom} onChange={(e) => setSettings({ ...settings, smtpFrom: e.target.value })} /></Field>
              <Field label="To"><input className={inputClass} value={settings.smtpTo} onChange={(e) => setSettings({ ...settings, smtpTo: e.target.value })} /></Field>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button type="submit"><Save size={16} />{copy('保存设置', 'Save settings')}</Button>
              <Button type="button" variant="secondary" onClick={testEmail}><Mail size={16} />{copy('测试邮件', 'Test email')}</Button>
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
