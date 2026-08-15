<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { startRegistration } from '@simplewebauthn/browser';
import { Check, Copy, Fingerprint, KeyRound, LogOut, MonitorSmartphone, Plus, Save, Trash2, X } from 'lucide-vue-next';
import AdminStateBanner from '@/components/admin/AdminStateBanner.vue';
import EmptyState from '@/components/admin/EmptyState.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { ApiToken, Site } from '@/api/types';
import { useConfirm } from '@/composables/useConfirm';
import { useI18n } from '@/composables/useI18n';
import { useModalBehavior } from '@/composables/useModalBehavior';
import { formatShanghaiDateTime } from '@/utils/dateTime';
import { scopesForProfile } from '@/utils/tokenScopes';

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
const tokens = ref<ApiToken[]>([]);
const tokenForm = reactive({ name: 'Chrome extension', scopeProfile: 'extension' as 'extension' | 'full', expiryDays: '' });
const isCreatingToken = ref(false);
const createdToken = ref('');
const tokenDialogOpen = ref(false);
const tokenDialog = ref<HTMLElement | null>(null);
const tokenDialogClose = ref<HTMLButtonElement | null>(null);
const tokenCopied = ref(false);
const confirmApi = useConfirm();

useModalBehavior({
  open: tokenDialogOpen,
  container: tokenDialog,
  close: closeTokenDialog,
  initialFocus: () => tokenDialogClose.value,
});

async function loadTokens() {
  try {
    tokens.value = await apiRequest<ApiToken[]>('/api/admin/tokens');
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('tokens.loadFailed');
  }
}

async function createToken() {
  if (!tokenForm.name.trim() || isCreatingToken.value) return;
  error.value = '';
  message.value = '';
  isCreatingToken.value = true;
  try {
    const scopes = scopesForProfile(tokenForm.scopeProfile);
    const expiresAt = tokenForm.expiryDays
      ? new Date(Date.now() + Number(tokenForm.expiryDays) * 86_400_000).toISOString()
      : null;
    const token = await apiRequest<ApiToken>('/api/admin/tokens', {
      method: 'POST',
      body: jsonBody({ name: tokenForm.name.trim(), scopes, expiresAt }),
    });
    createdToken.value = token.token;
    tokenCopied.value = false;
    tokenDialogOpen.value = true;
    tokens.value = [{ ...token, token: `${token.token.slice(0, 8)}...` }, ...tokens.value];
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('tokens.createFailed');
  } finally {
    isCreatingToken.value = false;
  }
}

async function copyCreatedToken() {
  await navigator.clipboard.writeText(createdToken.value);
  tokenCopied.value = true;
}

function closeTokenDialog() {
  tokenDialogOpen.value = false;
  createdToken.value = '';
  tokenCopied.value = false;
}

async function removeToken(token: ApiToken) {
  if (!await confirmApi.confirm({ title: t('tokens.revoke'), message: token.name, confirmText: t('tokens.revoke'), tone: 'danger' })) return;
  try {
    await apiRequest(`/api/admin/tokens/${token.id}`, { method: 'DELETE' });
    tokens.value = tokens.value.filter((item) => item.id !== token.id);
    message.value = t('tokens.revoked');
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('tokens.revokeFailed');
  }
}

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
  return formatShanghaiDateTime(value, 'zh-CN', { dateStyle: 'medium', timeStyle: 'short' });
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
  void loadTokens();
});
</script>

<template>
  <div class="admin-page-stack">
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

    <form id="account-password-form" class="admin-section" @submit.prevent="save">
      <header class="admin-section-head">
        <h2><KeyRound :size="18" /> {{ t('account.loginPassword') }}</h2>
        <button class="button" type="submit"><Save :size="17" /> {{ t('account.changePassword') }}</button>
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

    <section id="api-tokens" class="admin-section token-section" data-testid="api-token-section">
      <header class="admin-section-head">
        <h2><KeyRound :size="18" /> API Token</h2>
      </header>
      <form class="token-create-row" @submit.prevent="createToken">
        <div class="field">
          <label for="token-name">{{ t('tokens.name') }}</label>
          <input id="token-name" v-model="tokenForm.name" data-testid="token-name" maxlength="80" />
        </div>
        <div class="field">
          <label for="token-scope">{{ t('tokens.scope') }}</label>
          <select id="token-scope" v-model="tokenForm.scopeProfile" data-testid="token-scope-profile">
            <option value="extension">{{ t('tokens.scopeExtension') }}</option>
            <option value="full">{{ t('tokens.scopeFull') }}</option>
          </select>
        </div>
        <div class="field">
          <label for="token-expiry">{{ t('tokens.expiryPreset') }}</label>
          <select id="token-expiry" v-model="tokenForm.expiryDays" data-testid="token-expiry-preset">
            <option value="">{{ t('tokens.never') }}</option>
            <option value="7">{{ t('tokens.days', { count: 7 }) }}</option>
            <option value="30">{{ t('tokens.days', { count: 30 }) }}</option>
            <option value="90">{{ t('tokens.days', { count: 90 }) }}</option>
          </select>
        </div>
        <button class="button token-create-button" data-testid="create-api-token" type="button" :disabled="isCreatingToken || !tokenForm.name.trim()" @click="createToken">
          <Plus :size="17" /> {{ isCreatingToken ? t('common.saving') : t('tokens.create') }}
        </button>
      </form>
      <div class="token-list">
        <EmptyState v-if="!tokens.length" :title="t('tokens.emptyTitle')" :description="t('tokens.emptyBody')" />
        <article v-for="token in tokens" :key="token.id" class="token-row">
          <span class="security-row-icon"><KeyRound :size="17" /></span>
          <div class="security-row-main">
            <strong>{{ token.name }}</strong>
            <small>{{ token.token }} · {{ token.scopes.includes('*') ? t('tokens.scopeFull') : t('tokens.scopeExtension') }} · {{ token.expiresAt ? formatDate(token.expiresAt) : t('tokens.never') }}</small>
          </div>
          <button class="icon-button danger" type="button" :title="t('tokens.revoke')" :aria-label="t('tokens.revoke')" @click="removeToken(token)"><Trash2 :size="16" /></button>
        </article>
      </div>
    </section>

    <section class="admin-section security-section" data-testid="login-devices-section">
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

    <div v-if="tokenDialogOpen" class="token-dialog-backdrop" role="presentation" @mousedown.self="closeTokenDialog">
      <section ref="tokenDialog" class="token-dialog" data-testid="created-api-token-modal" role="dialog" aria-modal="true" :aria-label="t('tokens.oneTimeTitle')" tabindex="-1">
        <header>
          <div><h2>{{ t('tokens.oneTimeTitle') }}</h2><p>{{ t('tokens.oneTimeHint') }}</p></div>
          <button ref="tokenDialogClose" class="icon-button secondary" type="button" :title="t('common.close')" :aria-label="t('common.close')" @click="closeTokenDialog"><X :size="17" /></button>
        </header>
        <code>{{ createdToken }}</code>
        <button class="button" data-testid="copy-created-api-token" type="button" @click="copyCreatedToken">
          <Check v-if="tokenCopied" :size="17" /><Copy v-else :size="17" /> {{ tokenCopied ? t('tokens.copied') : t('tokens.copy') }}
        </button>
      </section>
    </div>
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
  background: color-mix(in srgb, var(--admin-accent) 14%, transparent);
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
  background: color-mix(in srgb, var(--admin-success) 10%, transparent);
  border-color: color-mix(in srgb, var(--admin-success) 26%, transparent);
  color: var(--admin-success);
}

.token-create-row {
  align-items: end;
  display: grid;
  gap: 10px;
  grid-template-columns: minmax(160px, 1.4fr) minmax(130px, 0.8fr) minmax(120px, 0.7fr) auto;
}

.token-create-button {
  min-height: 40px;
}

.token-list {
  border-top: 1px solid var(--admin-border);
  display: grid;
  margin-top: 14px;
  padding-top: 6px;
}

.token-row {
  align-items: center;
  display: grid;
  gap: 10px;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  min-height: 54px;
  padding: 7px 0;
}

.token-row + .token-row {
  border-top: 1px solid var(--admin-border);
}

.token-dialog-backdrop {
  align-items: center;
  background: rgba(10, 18, 28, 0.42);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 20px;
  position: fixed;
  z-index: 100;
}

.token-dialog {
  backdrop-filter: blur(28px) saturate(1.15);
  background: color-mix(in srgb, var(--admin-surface-elevated) 94%, transparent);
  border: 1px solid var(--admin-border);
  border-radius: 8px;
  box-shadow: var(--admin-shadow-lg);
  display: grid;
  gap: 16px;
  max-width: 560px;
  padding: 20px;
  width: 100%;
}

.token-dialog header {
  align-items: start;
  display: flex;
  gap: 16px;
  justify-content: space-between;
}

.token-dialog h2,
.token-dialog p {
  margin: 0;
}

.token-dialog h2 {
  color: var(--admin-text);
  font-size: 17px;
}

.token-dialog p {
  color: var(--admin-text-muted);
  font-size: 12px;
  margin-top: 5px;
}

.token-dialog code {
  background: var(--admin-control-bg);
  border: 1px solid var(--admin-border);
  border-radius: 7px;
  color: var(--admin-text);
  overflow-wrap: anywhere;
  padding: 13px;
  user-select: all;
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

  .token-create-row {
    grid-template-columns: 1fr;
  }

  .token-create-button {
    width: 100%;
  }
}
</style>
