<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { KeyRound, Plus, Trash2 } from 'lucide-vue-next';
import EmptyState from '@/components/admin/EmptyState.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { ApiToken, ApiTokenSummary } from '@/api/types';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

const tokens = ref<ApiToken[]>([]);
const form = reactive({ name: 'Chrome extension', expiresAt: '', scopeProfile: 'extension' as 'extension' | 'full' });
const createdToken = ref('');
const summary = ref<ApiTokenSummary>({ total: 0, active: 0, expired: 0, neverExpires: 0, expiringSoon: 0 });

async function load() {
  [tokens.value, summary.value] = await Promise.all([apiRequest<ApiToken[]>('/api/admin/tokens'), apiRequest<ApiTokenSummary>('/api/admin/tokens/summary')]);
}

async function loadSummary() {
  summary.value = await apiRequest<ApiTokenSummary>('/api/admin/tokens/summary');
}

async function createToken() {
  const scopes = form.scopeProfile === 'full' ? ['*'] : ['bookmarks:read', 'bookmarks:write', 'ai:analyze'];
  const token = await apiRequest<ApiToken>('/api/admin/tokens', { method: 'POST', body: jsonBody({ name: form.name, scopes, expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null }) });
  createdToken.value = token.token;
  await load();
}

async function remove(token: ApiToken) {
  await apiRequest(`/api/admin/tokens/${token.id}`, { method: 'DELETE' });
  tokens.value = tokens.value.filter((item) => item.id !== token.id);
  await loadSummary();
}

function setExpiryPreset(days: string) {
  if (!days) {
    form.expiresAt = '';
    return;
  }
  const date = new Date(Date.now() + Number(days) * 24 * 60 * 60 * 1000);
  form.expiresAt = toDateTimeLocal(date);
}

function toDateTimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

onMounted(load);
</script>

<template>
  <div class="admin-page-stack">
    <div class="token-summary-grid">
      <section>
        <span>{{ t('tokens.total') }}</span>
        <strong>{{ summary.total }}</strong>
      </section>
      <section>
        <span>{{ t('tokens.active') }}</span>
        <strong>{{ summary.active }}</strong>
      </section>
      <section>
        <span>{{ t('tokens.permanent') }}</span>
        <strong>{{ summary.neverExpires }}</strong>
      </section>
      <section>
        <span>{{ t('tokens.expiringSoon') }}</span>
        <strong>{{ summary.expiringSoon }}</strong>
      </section>
      <section>
        <span>{{ t('tokens.expired') }}</span>
        <strong>{{ summary.expired }}</strong>
      </section>
    </div>
    <div class="admin-settings-grid">
      <form class="admin-section" @submit.prevent="createToken">
        <header class="admin-section-head">
          <h2><Plus :size="18" /> {{ t('tokens.create') }}</h2>
        </header>
        <div class="grid">
          <div class="field"><label>{{ t('tokens.name') }}</label><input data-testid="token-name" v-model="form.name" /></div>
          <div class="field">
            <label>{{ t('tokens.scope') }}</label>
            <select data-testid="token-scope-profile" v-model="form.scopeProfile">
              <option value="extension">{{ t('tokens.scopeExtension') }}</option>
              <option value="full">{{ t('tokens.scopeFull') }}</option>
            </select>
          </div>
          <div class="field">
            <label>{{ t('tokens.expiryPreset') }}</label>
            <select data-testid="token-expiry-preset" @change="setExpiryPreset(($event.target as HTMLSelectElement).value)">
              <option value="">{{ t('tokens.never') }}</option>
              <option value="7">{{ t('tokens.days', { count: 7 }) }}</option>
              <option value="30">{{ t('tokens.days', { count: 30 }) }}</option>
              <option value="90">{{ t('tokens.days', { count: 90 }) }}</option>
            </select>
          </div>
          <div class="field"><label>{{ t('tokens.expiresAt') }}</label><input v-model="form.expiresAt" type="datetime-local" /></div>
          <button class="button" type="submit"><Plus :size="17" /> {{ t('tokens.create') }}</button>
          <p v-if="createdToken" class="token-created-secret">{{ createdToken }}</p>
        </div>
      </form>
      <section class="admin-section">
        <header class="admin-section-head">
          <h2><KeyRound :size="18" /> {{ t('tokens.existing') }}</h2>
        </header>
        <div class="list">
          <EmptyState v-if="!tokens.length" :title="t('tokens.emptyTitle')" :description="t('tokens.emptyBody')" />
          <article v-for="token in tokens" :key="token.id" class="row">
            <div>
              <div class="row-title"><KeyRound :size="15" /> {{ token.name }}</div>
              <div class="row-subtitle">{{ token.token }} · {{ token.scopes.includes('*') ? t('tokens.scopeFull') : t('tokens.scopeExtension') }} · {{ token.expiresAt || t('tokens.never') }}</div>
            </div>
            <button class="icon-button danger" :data-testid="`revoke-token-${token.id}`" :title="t('tokens.revoke')" @click="remove(token)"><Trash2 :size="17" /></button>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>
