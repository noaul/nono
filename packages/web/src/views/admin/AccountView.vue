<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { startRegistration } from '@simplewebauthn/browser';
import { Fingerprint, KeyRound, LogOut, MonitorSmartphone, Plus, Save, Trash2 } from 'lucide-vue-next';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import AdminStateBanner from '@/components/admin/AdminStateBanner.vue';
import { apiRequest, jsonBody } from '@/api/client';
import { useConfirm } from '@/composables/useConfirm';

interface PasskeyItem {
  id: string;
  name: string;
  deviceType: string;
  backedUp: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

interface SessionItem {
  id: string;
  current: boolean;
  userAgent: string;
  ipAddress: string;
  lastSeenAt: string;
  expiresAt: string;
  createdAt: string;
}

const form = reactive({ currentPassword: '', newPassword: '' });
const message = ref('');
const error = ref('');
const passkeyName = ref('');
const passkeys = ref<PasskeyItem[]>([]);
const sessions = ref<SessionItem[]>([]);
const isLoadingSecurity = ref(true);
const isAddingPasskey = ref(false);
const confirmApi = useConfirm();

async function loadSecurity() {
  isLoadingSecurity.value = true;
  try {
    const data = await apiRequest<{ passkeys: PasskeyItem[]; sessions: SessionItem[] }>('/api/admin/account/security');
    passkeys.value = data.passkeys;
    sessions.value = data.sessions;
  } catch (event) {
    error.value = event instanceof Error ? event.message : '安全信息加载失败';
  } finally {
    isLoadingSecurity.value = false;
  }
}

async function addPasskey() {
  const name = passkeyName.value.trim();
  if (!name || isAddingPasskey.value) return;
  error.value = '';
  message.value = '';
  isAddingPasskey.value = true;
  try {
    const registration = await apiRequest<{ options: Parameters<typeof startRegistration>[0]['optionsJSON']; challengeId: string }>('/api/admin/account/passkeys/options', { method: 'POST' });
    const response = await startRegistration({ optionsJSON: registration.options });
    const passkey = await apiRequest<PasskeyItem>('/api/admin/account/passkeys', {
      method: 'POST',
      body: jsonBody({ challengeId: registration.challengeId, name, response }),
    });
    passkeys.value = [passkey, ...passkeys.value.filter((item) => item.id !== passkey.id)];
    passkeyName.value = '';
    message.value = '通行密钥已添加';
  } catch (event) {
    error.value = event instanceof Error ? event.message : '添加通行密钥失败';
  } finally {
    isAddingPasskey.value = false;
  }
}

async function removePasskey(passkey: PasskeyItem) {
  if (!await confirmApi.confirm({ title: '删除通行密钥', message: passkey.name, confirmText: '删除', tone: 'danger' })) return;
  try {
    await apiRequest(`/api/admin/account/passkeys/${encodeURIComponent(passkey.id)}`, { method: 'DELETE' });
    passkeys.value = passkeys.value.filter((item) => item.id !== passkey.id);
    message.value = '通行密钥已删除';
  } catch (event) {
    error.value = event instanceof Error ? event.message : '删除通行密钥失败';
  }
}

async function revokeSession(session: SessionItem) {
  if (!await confirmApi.confirm({ title: '退出设备', message: session.userAgent || session.ipAddress || '未知设备', confirmText: '退出', tone: 'danger' })) return;
  try {
    await apiRequest(`/api/admin/account/sessions/${session.id}`, { method: 'DELETE' });
    sessions.value = sessions.value.filter((item) => item.id !== session.id);
    message.value = '设备已退出';
  } catch (event) {
    error.value = event instanceof Error ? event.message : '退出设备失败';
  }
}

async function revokeOtherSessions() {
  if (!await confirmApi.confirm({ title: '退出其他设备', message: '保留当前设备', confirmText: '全部退出', tone: 'danger' })) return;
  try {
    await apiRequest('/api/admin/account/sessions/revoke-others', { method: 'POST' });
    sessions.value = sessions.value.filter((item) => item.current);
    message.value = '其他设备已退出';
  } catch (event) {
    error.value = event instanceof Error ? event.message : '退出其他设备失败';
  }
}

function formatDate(value: string | null) {
  if (!value) return '尚未使用';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

async function save() {
  error.value = '';
  message.value = '';
  try {
    await apiRequest('/api/admin/account/password', { method: 'PUT', body: jsonBody(form) });
    form.currentPassword = '';
    form.newPassword = '';
    message.value = '密码已更新';
  } catch (event) {
    error.value = event instanceof Error ? event.message : '更新失败';
  }
}

onMounted(loadSecurity);
</script>

<template>
  <div class="admin-page-stack">
    <AdminPageHeader eyebrow="系统" title="账户设置">
      <template #actions>
        <button class="button" form="account-password-form" type="submit"><Save :size="17" /> 修改密码</button>
      </template>
    </AdminPageHeader>

    <AdminStateBanner v-if="message" :message="message" tone="success" />
    <AdminStateBanner v-if="error" :message="error" tone="error" />

    <section class="admin-section security-section">
      <header class="admin-section-head">
        <h2><Fingerprint :size="18" /> 通行密钥</h2>
      </header>
      <div class="security-add-row">
        <div class="field">
          <label for="passkey-name">设备名称</label>
          <input id="passkey-name" v-model="passkeyName" data-testid="passkey-name" maxlength="80" placeholder="例如：Windows Hello" @keydown.enter.prevent="addPasskey" />
        </div>
        <button class="button" data-testid="add-passkey" type="button" :disabled="!passkeyName.trim() || isAddingPasskey" @click="addPasskey">
          <Plus :size="17" /> {{ isAddingPasskey ? '添加中' : '添加' }}
        </button>
      </div>
      <div v-if="passkeys.length" class="security-list">
        <article v-for="passkey in passkeys" :key="passkey.id" class="security-row">
          <span class="security-row-icon"><Fingerprint :size="18" /></span>
          <div class="security-row-main">
            <strong>{{ passkey.name }}</strong>
            <small>{{ passkey.backedUp ? '已同步' : '仅此设备' }} · {{ formatDate(passkey.lastUsedAt || passkey.createdAt) }}</small>
          </div>
          <button class="icon-button secondary" type="button" title="删除通行密钥" aria-label="删除通行密钥" @click="removePasskey(passkey)">
            <Trash2 :size="16" />
          </button>
        </article>
      </div>
      <p v-else-if="!isLoadingSecurity" class="security-empty">尚未添加通行密钥</p>
    </section>

    <section class="admin-section security-section">
      <header class="admin-section-head">
        <h2><MonitorSmartphone :size="18" /> 登录设备</h2>
        <button v-if="sessions.some((session) => !session.current)" class="button secondary compact" type="button" @click="revokeOtherSessions">
          <LogOut :size="16" /> 退出其他设备
        </button>
      </header>
      <div class="security-list">
        <article v-for="session in sessions" :key="session.id" class="security-row">
          <span class="security-row-icon"><MonitorSmartphone :size="18" /></span>
          <div class="security-row-main">
            <strong>{{ session.userAgent || '未知设备' }} <span v-if="session.current" class="current-device">当前设备</span></strong>
            <small>{{ session.ipAddress || '未知 IP' }} · {{ formatDate(session.lastSeenAt) }}</small>
          </div>
          <button v-if="!session.current" class="icon-button secondary" type="button" title="退出设备" aria-label="退出设备" @click="revokeSession(session)">
            <LogOut :size="16" />
          </button>
        </article>
      </div>
    </section>

    <form id="account-password-form" class="admin-section" @submit.prevent="save">
      <header class="admin-section-head">
        <h2><KeyRound :size="18" /> 登录密码</h2>
      </header>
      <div class="admin-settings-grid">
        <div class="field"><label>当前密码</label><input v-model="form.currentPassword" type="password" autocomplete="current-password" /></div>
        <div class="field"><label>新密码</label><input v-model="form.newPassword" type="password" autocomplete="new-password" /></div>
      </div>
    </form>
  </div>
</template>

<style scoped>
.security-add-row {
  align-items: end;
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(220px, 420px) auto;
  margin-bottom: 14px;
}

.security-list {
  border: 1px solid var(--admin-border);
  border-radius: var(--admin-radius-control);
  overflow: hidden;
}

.security-row {
  align-items: center;
  background: var(--admin-surface-elevated);
  display: grid;
  gap: 12px;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  min-height: 58px;
  padding: 9px 11px;
}

.security-row + .security-row {
  border-top: 1px solid var(--admin-border);
}

.security-row-icon {
  align-items: center;
  background: var(--admin-control-bg);
  border: 1px solid var(--admin-border);
  border-radius: 8px;
  color: var(--admin-accent);
  display: inline-flex;
  height: 34px;
  justify-content: center;
  width: 34px;
}

.security-row-main {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.security-row-main strong,
.security-row-main small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.security-row-main strong {
  color: var(--admin-text);
  font-size: 14px;
}

.security-row-main small,
.security-empty {
  color: var(--admin-text-muted);
  font-size: 12px;
}

.current-device {
  background: color-mix(in srgb, var(--admin-accent) 11%, white);
  border-radius: 5px;
  color: var(--admin-accent);
  display: inline-block;
  font-size: 11px;
  margin-left: 6px;
  padding: 2px 6px;
}

.security-empty {
  margin: 0;
  padding: 8px 0 2px;
}

@media (max-width: 640px) {
  .security-add-row {
    grid-template-columns: 1fr;
  }

  .security-add-row .button {
    width: 100%;
  }
}
</style>
