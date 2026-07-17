<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { Bot, FlaskConical, Save } from 'lucide-vue-next';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import AdminStateBanner from '@/components/admin/AdminStateBanner.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { User } from '@/api/types';

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
    message.value = 'LLM 配置已保存';
  } catch (event) {
    error.value = event instanceof Error ? event.message : '保存失败';
  }
}

async function testConnection() {
  error.value = '';
  message.value = '';
  isTesting.value = true;
  try {
    const result = await apiRequest<{ model: string; reasoningEffort: string }>('/api/admin/account/llm/test', { method: 'POST', body: jsonBody(form) });
    message.value = `连接成功 · ${result.model} · 思考深度：${reasoningLabel(result.reasoningEffort)}`;
  } catch (event) {
    error.value = event instanceof Error ? event.message : '连接测试失败';
  } finally {
    isTesting.value = false;
  }
}

function reasoningLabel(value: string) {
  return { none: '关闭', low: '低', medium: '中', high: '高' }[value as 'none' | 'low' | 'medium' | 'high'] || '关闭';
}
</script>

<template>
  <div class="admin-page-stack">
    <AdminPageHeader eyebrow="自动化" title="AI 智能收藏">
      <template #actions>
        <button class="button secondary" data-testid="test-llm-connection" type="button" :disabled="isTesting" @click="testConnection"><FlaskConical :size="17" /> {{ isTesting ? '测试中' : '测试连接' }}</button>
        <button class="button" form="llm-settings-form" type="submit"><Save :size="17" /> 保存配置</button>
      </template>
    </AdminPageHeader>

    <AdminStateBanner v-if="message" :message="message" tone="success" />
    <AdminStateBanner v-if="error" :message="error" tone="error" />
    <AdminStateBanner :message="`API Key 使用 AES-256-GCM 加密存储。${hasKey ? '当前已配置，留空不会覆盖。' : '当前未配置。'}`" tone="info" />

    <form id="llm-settings-form" class="admin-section" @submit.prevent="save">
      <header class="admin-section-head">
        <h2><Bot :size="18" /> 模型连接</h2>
      </header>
      <div class="admin-settings-grid">
        <div class="field"><label>Provider</label><select v-model="form.provider"><option value="openai">OpenAI</option><option value="claude">Claude</option></select></div>
        <div class="field"><label>模型</label><input v-model="form.model" /></div>
        <div class="field wide">
          <label>API 地址</label>
          <input v-model="form.baseUrl" data-testid="llm-base-url" type="url" placeholder="留空使用官方接口，例如 https://api.openai.com/v1" />
          <small>支持 OpenAI 兼容接口、Claude 网关和内网 HTTP 地址。</small>
        </div>
        <div class="field"><label>API Key</label><input v-model="form.apiKey" type="password" placeholder="留空则保留现有 Key" /></div>
        <div class="field">
          <label>思考深度</label>
          <select v-model="form.reasoningEffort" data-testid="llm-reasoning-effort">
            <option value="none">关闭</option>
            <option value="low">低</option>
            <option value="medium">中</option>
            <option value="high">高</option>
          </select>
          <small>支持推理的模型会按此设置调整思考预算。</small>
        </div>
      </div>
    </form>
  </div>
</template>
