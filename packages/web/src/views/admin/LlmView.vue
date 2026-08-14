<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { Bot, FlaskConical, Save } from 'lucide-vue-next';
import AdminStateBanner from '@/components/admin/AdminStateBanner.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { User } from '@/api/types';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

const form = reactive({ provider: 'openai' as 'openai' | 'claude', model: 'gpt-4o-mini', apiKey: '', baseUrl: '', reasoningEffort: 'none' as 'none' | 'low' | 'medium' | 'high' });
const hasKey = ref(false);
const message = ref('');
const error = ref('');
const isTesting = ref(false);

onMounted(async () => {
  const account = await apiRequest<User>('/api/admin/account');
  form.provider = (account.llmProvider as 'openai' | 'claude') || 'openai';
  form.model = account.llmModel || (form.provider === 'claude' ? 'claude-sonnet-4-5' : 'gpt-4o-mini');
  form.baseUrl = account.llmBaseUrl || '';
  form.reasoningEffort = account.llmReasoningEffort || 'none';
  hasKey.value = Boolean(account.hasLlmApiKey);
});

async function save() {
  error.value = '';
  message.value = '';
  try {
    await apiRequest('/api/admin/account/llm', { method: 'PUT', body: jsonBody(form) });
    hasKey.value = hasKey.value || Boolean(form.apiKey);
    form.apiKey = '';
    message.value = t('llm.saved');
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('common.saveFailed');
  }
}

async function testConnection() {
  error.value = '';
  message.value = '';
  isTesting.value = true;
  try {
    const result = await apiRequest<{ model: string; reasoningEffort: string }>('/api/admin/account/llm/test', { method: 'POST', body: jsonBody(form) });
    message.value = t('llm.connected', { model: result.model, effort: reasoningLabel(result.reasoningEffort) });
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('llm.testFailed');
  } finally {
    isTesting.value = false;
  }
}

function reasoningLabel(value: string) {
  return { none: t('llm.effortNone'), low: t('llm.effortLow'), medium: t('llm.effortMedium'), high: t('llm.effortHigh') }[value as 'none' | 'low' | 'medium' | 'high'] || t('llm.effortNone');
}

</script>

<template>
  <div class="admin-page-stack">
    <AdminStateBanner v-if="message" :message="message" tone="success" />
    <AdminStateBanner v-if="error" :message="error" tone="error" />
    <AdminStateBanner :message="t('llm.keyNotice', { state: hasKey ? t('llm.keyConfigured') : t('llm.keyMissing') })" tone="info" />

    <form id="llm-settings-form" class="admin-section" @submit.prevent="save">
      <header class="admin-section-head">
        <h2><Bot :size="18" /> {{ t('llm.connection') }}</h2>
        <div class="admin-section-actions">
          <button class="button secondary" data-testid="test-llm-connection" type="button" :disabled="isTesting" @click="testConnection"><FlaskConical :size="17" /> {{ isTesting ? t('llm.testing') : t('llm.testConnection') }}</button>
          <button class="button" type="submit"><Save :size="17" /> {{ t('llm.saveConfig') }}</button>
        </div>
      </header>
      <div class="admin-settings-grid">
        <div class="field"><label>Provider</label><select v-model="form.provider"><option value="openai">OpenAI</option><option value="claude">Claude</option></select></div>
        <div class="field"><label>{{ t('llm.model') }}</label><input v-model="form.model" /></div>
        <div class="field wide">
          <label>{{ t('llm.baseUrl') }}</label>
          <input v-model="form.baseUrl" data-testid="llm-base-url" type="url" :placeholder="t('llm.baseUrlPlaceholder')" />
          <small>{{ t('llm.baseUrlHint') }}</small>
        </div>
        <div class="field"><label>{{ t('llm.apiKey') }}</label><input v-model="form.apiKey" type="password" :placeholder="t('llm.apiKeyPlaceholder')" /></div>
        <div class="field">
          <label>{{ t('llm.effort') }}</label>
          <select v-model="form.reasoningEffort" data-testid="llm-reasoning-effort">
            <option value="none">{{ t('llm.effortNone') }}</option>
            <option value="low">{{ t('llm.effortLow') }}</option>
            <option value="medium">{{ t('llm.effortMedium') }}</option>
            <option value="high">{{ t('llm.effortHigh') }}</option>
          </select>
          <small>{{ t('llm.effortHint') }}</small>
        </div>
      </div>
    </form>

  </div>
</template>

<style scoped>
.admin-section-actions {
  align-items: center;
  display: flex;
  gap: 10px;
}

@media (max-width: 720px) {
  .admin-section-head,
  .admin-section-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
