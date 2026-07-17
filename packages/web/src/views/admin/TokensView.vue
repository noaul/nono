<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { KeyRound, Plus, Trash2 } from 'lucide-vue-next';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import EmptyState from '@/components/admin/EmptyState.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { ApiToken, ApiTokenSummary } from '@/api/types';

const tokens = ref<ApiToken[]>([]);
const form = reactive({ name: 'Chrome extension', expiresAt: '' });
const createdToken = ref('');
const summary = ref<ApiTokenSummary>({ total: 0, active: 0, expired: 0, neverExpires: 0, expiringSoon: 0 });

async function load() {
  [tokens.value, summary.value] = await Promise.all([apiRequest<ApiToken[]>('/api/admin/tokens'), apiRequest<ApiTokenSummary>('/api/admin/tokens/summary')]);
}

async function loadSummary() {
  summary.value = await apiRequest<ApiTokenSummary>('/api/admin/tokens/summary');
}

async function createToken() {
  const token = await apiRequest<ApiToken>('/api/admin/tokens', { method: 'POST', body: jsonBody({ name: form.name, expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null }) });
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
    <AdminPageHeader eyebrow="自动化" title="API Token" description="管理浏览器扩展和脚本使用的访问凭据。" />

    <div class="token-summary-grid">
      <section>
        <span>Token 总数</span>
        <strong>{{ summary.total }}</strong>
      </section>
      <section>
        <span>活跃 Token</span>
        <strong>{{ summary.active }}</strong>
      </section>
      <section>
        <span>永久 Token</span>
        <strong>{{ summary.neverExpires }}</strong>
      </section>
      <section>
        <span>即将过期</span>
        <strong>{{ summary.expiringSoon }}</strong>
      </section>
      <section>
        <span>已过期</span>
        <strong>{{ summary.expired }}</strong>
      </section>
    </div>
    <div class="admin-settings-grid">
      <form class="admin-section" @submit.prevent="createToken">
        <header class="admin-section-head">
          <div>
            <h2><Plus :size="18" /> 创建 Token</h2>
            <p>按用途命名，并按需设置有效期。</p>
          </div>
        </header>
        <div class="grid">
          <div class="field"><label>名称</label><input data-testid="token-name" v-model="form.name" /></div>
          <div class="field">
            <label>过期预设</label>
            <select data-testid="token-expiry-preset" @change="setExpiryPreset(($event.target as HTMLSelectElement).value)">
              <option value="">不过期</option>
              <option value="7">7 天</option>
              <option value="30">30 天</option>
              <option value="90">90 天</option>
            </select>
          </div>
          <div class="field"><label>过期时间</label><input v-model="form.expiresAt" type="datetime-local" /></div>
          <button class="button" type="submit"><Plus :size="17" /> 创建 Token</button>
          <p v-if="createdToken" class="token-created-secret">{{ createdToken }}</p>
        </div>
      </form>
      <section class="admin-section">
        <header class="admin-section-head">
          <div>
            <h2><KeyRound :size="18" /> 已创建 Token</h2>
            <p>撤销后对应扩展或脚本会立即失去访问权限。</p>
          </div>
        </header>
        <div class="list">
          <EmptyState v-if="!tokens.length" title="还没有 API Token" description="创建一个 Token 供浏览器扩展或脚本访问接口。" />
          <article v-for="token in tokens" :key="token.id" class="row">
            <div>
              <div class="row-title"><KeyRound :size="15" /> {{ token.name }}</div>
              <div class="row-subtitle">{{ token.token }} · {{ token.expiresAt || '不过期' }}</div>
            </div>
            <button class="icon-button danger" :data-testid="`revoke-token-${token.id}`" title="撤销" @click="remove(token)"><Trash2 :size="17" /></button>
          </article>
        </div>
      </section>
    </div>
  </div>
</template>
