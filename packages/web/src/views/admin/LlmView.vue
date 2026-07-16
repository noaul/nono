<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { Save } from 'lucide-vue-next';
import { apiRequest, jsonBody } from '@/api/client';
import type { User } from '@/api/types';

const form = reactive({ provider: 'openai' as 'openai' | 'claude', model: 'gpt-4o-mini', apiKey: '' });
const hasKey = ref(false);
const message = ref('');
const error = ref('');

onMounted(async () => {
  const account = await apiRequest<User>('/api/admin/account');
  form.provider = (account.llmProvider as 'openai' | 'claude') || 'openai';
  form.model = account.llmModel || (form.provider === 'claude' ? 'claude-sonnet-4-5' : 'gpt-4o-mini');
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
</script>

<template>
  <form class="panel grid" @submit.prevent="save">
    <p v-if="message" class="notice">{{ message }}</p>
    <p v-if="error" class="error">{{ error }}</p>
    <p class="notice">API Key 会在后端用 AES-256-GCM 加密存储。{{ hasKey ? '当前已配置 Key。' : '当前未配置 Key。' }}</p>
    <div class="field"><label>Provider</label><select v-model="form.provider"><option value="openai">OpenAI</option><option value="claude">Claude</option></select></div>
    <div class="field"><label>模型</label><input v-model="form.model" /></div>
    <div class="field"><label>API Key</label><input v-model="form.apiKey" type="password" placeholder="留空则保留现有 Key" /></div>
    <button class="button" type="submit"><Save :size="17" /> 保存 LLM 配置</button>
  </form>
</template>
