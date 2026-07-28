<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { startRegistration } from '@simplewebauthn/browser';
import { Fingerprint, KeyRound, LogOut, MonitorSmartphone, Plus, Save, Trash2 } from 'lucide-vue-next';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import AdminStateBanner from '@/components/admin/AdminStateBanner.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { Site } from '@/api/types';
import { useConfirm } from '@/composables/useConfirm';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

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
const guestAccess = reactive({ enabled: false, password: '', passwordSet: false });
const message = ref('');
const error = ref('');
const passkeyName = ref('');
const passkeys = ref<PasskeyItem[]>([]);
const sessions = ref<SessionItem[]>([]);
const isLoadingSecurity = ref(true);
const isAddingPasskey = ref(false);
const isSavingGuestAccess = ref(false);
const confirmApi = useConfirm();

async function loadGuestAccess() {
  try {
    const site = await apiRequest<Site>('/api/admin/site');
    guestAccess.enabled = Boolean(site.guestAccessEnabled);
    guestAccess.passwordSet = Boolean(site.guestAccessPasswordSet);
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('account.guestLoadFailed');
  }
}

async function loadSecurity() {
  isLoadingSecurity.value = true;
  try {
    const data = await apiRequest<{ passkeys: PasskeyItem[]; sessions: SessionItem[] }>('/api/admin/account/security');
    passkeys.value = data.passkeys;
    sessions.value = data.sessions;
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('account.securityLoadFailed');
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
    message.value = t('account.passkeyAdded');
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('account.passkeyAddFailed');
  } finally {
    isAddingPasskey.value = false;
  }
}

async function removePasskey(passkey: PasskeyItem) {
  if (!await confirmApi.confirm({ title: t('account.passkeyDelete'), message: passkey.name, confirmText: t('common.delete'), tone: 'danger' })) return;
  try {
    await apiRequest(`/api/admin/account/passkeys/${encodeURIComponent(passkey.id)}`, { method: 'DELETE' });
    passkeys.value = passkeys.value.filter((item) => item.id !== passkey.id);
    message.value = t('account.passkeyDeleted');
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('account.passkeyDeleteFailed');
  }
}

async function revokeSession(session: SessionItem) {
  if (!await confirmApi.confirm({ title: t('account.signOutDevice'), message: session.userAgent || session.ipAddress || t('account.unknownDevice'), confirmText: t('account.signOut'), tone: 'danger' })) return;
  try {
    await apiRequest(`/api/admin/account/sessions/${session.id}`, { method: 'DELETE' });
    sessions.value = sessions.value.filter((item) => item.id !== session.id);
    message.value = t('account.deviceSignedOut');
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('account.deviceSignOutFailed');
  }
}

async function revokeOtherSessions() {
  if (!await confirmApi.confirm({ title: t('account.signOutOthers'), message: t('account.keepCurrent'), confirmText: t('account.signOutAll'), tone: 'danger' })) return;
  try {
    await apiRequest('/api/admin/account/sessions/revoke-others', { method: 'POST' });
    sessions.value = sessions.value.filter((item) => item.current);
    message.value = t('account.othersSignedOut');
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('account.signOutOthersFailed');
  }
}

function formatDate(value: string | null) {
  if (!value) return t('account.neverUsed');
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

async function save() {
  error.value = '';
  message.value = '';
  try {
    await apiRequest('/api/admin/account/password', { method: 'PUT', body: jsonBody(form) });
    form.currentPassword = '';
    form.newPassword = '';
    message.value = t('account.passwordUpdated');
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('account.updateFailed');
  }
}

async function saveGuestAccess() {
  error.value = '';
  message.value = '';
  isSavingGuestAccess.value = true;
  try {
    const site = await apiRequest<Site>('/api/admin/site', {
      method: 'PUT',
      body: jsonBody({
        guestAccessEnabled: guestAccess.enabled,
        ...(guestAccess.password ? { guestAccessPassword: guestAccess.password } : {}),
      }),
    });
    guestAccess.enabled = Boolean(site.guestAccessEnabled);
    guestAccess.passwordSet = Boolean(site.guestAccessPasswordSet);
    guestAccess.password = '';
    message.value = guestAccess.enabled ? t('account.guestOn') : t('account.guestOff');
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('account.guestSaveFailed');
  } finally {
    isSavingGuestAccess.value = false;
  }
}

onMounted(() => {
  void loadSecurity();
  void loadGuestAccess();
});
</script>

<template>
  <div class="admin-page-stack">
    <AdminPageHeader :eyebrow="t('admin.sectionSystem')" :title="t('admin.titleAccount')">
      <template #actions>
        <button class="button" form="account-password-form" type="submit"><Save :size="17" /> {{ t('account.changePassword') }}</button>
      </template>
    </AdminPageHeader>

    <AdminStateBanner v-if="message" :message="message" tone="success" />
    <AdminStateBanner v-if="error" :message="error" tone="error" />

    <section class="admin-section security-section">
      <header class="admin-section-head">
        <h2><Fingerprint :size="18" /> {{ t('account.passkeys') }}</h2>
      </header>
      <div class="security-add-row">
        <div class="field">
          <label for="passkey-name">{{ t('account.deviceName') }}</label>
          <input id="passkey-name" v-model="passkeyName" data-testid="passkey-name" maxlength="80" :placeholder="t('account.deviceNamePlaceholder')" @keydown.enter.prevent="addPasskey" />
        </div>
        <button class="button" data-testid="add-passkey" type="button" :disabled="!passkeyName.trim() || isAddingPasskey" @click="addPasskey">
          <Plus :size="17" /> {{ isAddingPasskey ? t('account.adding') : t('account.add') }}
        </button>
      </div>
      <div v-if="passkeys.length" class="security-list">
        <article v-for="passkey in passkeys" :key="passkey.id" class="security-row">
          <span class="security-row-icon"><Fingerprint :size="18" /></span>
          <div class="security-row-main">
            <strong>{{ passkey.name }}</strong>
            <small>{{ passkey.backedUp ? t('account.synced') : t('account.thisDeviceOnly') }} · {{ formatDate(passkey.lastUsedAt || passkey.createdAt) }}</small>
          </div>
          <button class="icon-button secondary" type="button" :title="t('account.passkeyDelete')" :aria-label="t('account.passkeyDelete')" @click="removePasskey(passkey)">
            <Trash2 :size="16" />
          </button>
        </article>
      </div>
      <p v-else-if="!isLoadingSecurity" class="security-empty">{{ t('account.noPasskeys') }}</p>
    </section>

    <section class="admin-section security-section">
      <header class="admin-section-head">
        <h2><MonitorSmartphone :size="18" /> {{ t('account.devices') }}</h2>
        <button v-if="sessions.some((session) => !session.current)" class="button secondary compact" type="button" @click="revokeOtherSessions">
          <LogOut :size="16" /> {{ t('account.signOutOthers') }}
        </button>
      </header>
      <div class="security-list">
        <article v-for="session in sessions" :key="session.id" class="security-row">
          <span class="security-row-icon"><MonitorSmartphone :size="18" /></span>
          <div class="security-row-main">
            <strong>{{ session.userAgent || t('account.unknownDevice') }} <span v-if="session.current" class="current-device">{{ t('account.currentDevice') }}</span></strong>
            <small>{{ session.ipAddress || t('account.unknownIp') }} · {{ formatDate(session.lastSeenAt) }}</small>
          </div>
          <button v-if="!session.current" class="icon-button secondary" type="button" :title="t('account.signOutDevice')" :aria-label="t('account.signOutDevice')" @click="revokeSession(session)">
            <LogOut :size="16" />
          </button>
        </article>
      </div>
    </section>

    <form id="account-password-form" class="admin-section" @submit.prevent="save">
      <header class="admin-section-head">
        <h2><KeyRound :size="18" /> {{ t('account.loginPassword') }}</h2>
      </header>
      <div class="admin-settings-grid">
        <div class="field"><label>{{ t('account.currentPassword') }}</label><input v-model="form.currentPassword" type="password" autocomplete="current-password" /></div>
        <div class="field"><label>{{ t('account.newPassword') }}</label><input v-model="form.newPassword" type="password" autocomplete="new-password" /></div>
      </div>
    </form>

    <form class="admin-section guest-access-section" @submit.prevent="saveGuestAccess">
      <header class="admin-section-head">
        <h2><KeyRound :size="18" /> {{ t('account.guestPassword') }}</h2>
        <label class="guest-access-toggle">
          <input v-model="guestAccess.enabled" data-testid="guest-access-enabled" type="checkbox" />
          <span>{{ guestAccess.enabled ? t('account.enabled') : t('account.disabled') }}</span>
        </label>
      </header>
      <div class="guest-access-fields">
        <div class="field">
          <label for="guest-access-password">{{ t('account.simplePassword') }}</label>
          <input
            id="guest-access-password"
            v-model="guestAccess.password"
            data-testid="guest-access-password"
            type="password"
            autocomplete="new-password"
            minlength="4"
            maxlength="72"
            :placeholder="guestAccess.passwordSet ? t('account.keepCurrentPassword') : t('account.setMinPassword')"
          />
        </div>
        <span class="password-state" :class="{ configured: guestAccess.passwordSet || guestAccess.password }">
          {{ guestAccess.password || guestAccess.passwordSet ? t('account.passwordConfigured') : t('account.passwordNotConfigured') }}
        </span>
        <button
          class="button"
          data-testid="save-guest-access"
          type="submit"
          :disabled="isSavingGuestAccess || (guestAccess.enabled && !guestAccess.passwordSet && guestAccess.password.length < 4)"
        >
          <Save :size="17" /> {{ isSavingGuestAccess ? t('common.saving') : t('account.saveGuest') }}
        </button>
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

.guest-access-toggle {
  align-items: center;
  color: var(--admin-text-muted);
  display: inline-flex;
  font-size: 12px;
  font-weight: 750;
  gap: 8px;
}

.guest-access-toggle input {
  accent-color: var(--admin-accent);
  height: 17px;
  width: 17px;
}

.guest-access-fields {
  align-items: end;
  display: grid;
  gap: 12px;
  grid-template-columns: minmax(220px, 1fr) auto auto;
}

.password-state {
  align-items: center;
  background: var(--admin-control-bg);
  border: 1px solid var(--admin-border);
  border-radius: var(--admin-radius-control);
  color: var(--admin-text-muted);
  display: inline-flex;
  font-size: 12px;
  font-weight: 750;
  min-height: 40px;
  padding: 0 12px;
}

.password-state.configured {
  background: rgba(16, 185, 129, 0.08);
  border-color: rgba(5, 150, 105, 0.24);
  color: var(--admin-success);
}

@media (max-width: 640px) {
  .security-add-row {
    grid-template-columns: 1fr;
  }

  .security-add-row .button,
  .guest-access-fields .button {
    width: 100%;
  }

  .guest-access-fields {
    grid-template-columns: 1fr;
  }
}
</style>
