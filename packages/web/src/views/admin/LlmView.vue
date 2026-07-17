<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { Bot, FlaskConical, Plus, Save, Star, Trash2 } from 'lucide-vue-next';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import AdminStateBanner from '@/components/admin/AdminStateBanner.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { User } from '@/api/types';

const form = reactive({ provider: 'openai' as 'openai' | 'claude', model: 'gpt-4o-mini', apiKey: '', baseUrl: '', reasoningEffort: 'none' as 'none' | 'low' | 'medium' | 'high' });
const hasKey = ref(false);
const message = ref('');
const error = ref('');
const isTesting = ref(false);
const isSavingNoStar = ref(false);
const testingProfileId = ref('');

interface NoStarAiProfile {
  id: string;
  name: string;
  apiType: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  isActive: boolean;
  customPrompt: string;
  useCustomPrompt: boolean;
  concurrency: number;
  reasoningEffort: string;
}

const noStarProfiles = ref<NoStarAiProfile[]>([]);

onMounted(async () => {
  const [account, profiles] = await Promise.all([
    apiRequest<User>('/api/admin/account'),
    apiRequest<NoStarAiProfile[]>('/api/admin/nostar/ai'),
  ]);
  form.provider = (account.llmProvider as 'openai' | 'claude') || 'openai';
  form.model = account.llmModel || (form.provider === 'claude' ? 'claude-sonnet-4-5' : 'gpt-4o-mini');
  form.baseUrl = account.llmBaseUrl || '';
  form.reasoningEffort = account.llmReasoningEffort || 'none';
  hasKey.value = Boolean(account.hasLlmApiKey);
  noStarProfiles.value = profiles;
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

function addNoStarProfile() {
  noStarProfiles.value.push({
    id: crypto.randomUUID(),
    name: '',
    apiType: 'openai',
    baseUrl: 'https://api.openai.com',
    apiKey: '',
    model: 'gpt-4o-mini',
    isActive: noStarProfiles.value.length === 0,
    customPrompt: '',
    useCustomPrompt: false,
    concurrency: 1,
    reasoningEffort: 'none',
  });
}

function removeNoStarProfile(index: number) {
  const wasActive = noStarProfiles.value[index]?.isActive;
  noStarProfiles.value.splice(index, 1);
  if (wasActive && noStarProfiles.value[0]) noStarProfiles.value[0].isActive = true;
}

function activateNoStarProfile(index: number) {
  noStarProfiles.value.forEach((profile, profileIndex) => {
    profile.isActive = profileIndex === index;
  });
}

async function saveNoStarProfiles() {
  error.value = '';
  message.value = '';
  isSavingNoStar.value = true;
  try {
    await apiRequest('/api/admin/nostar/ai', {
      method: 'PUT',
      body: jsonBody({ profiles: noStarProfiles.value }),
    });
    noStarProfiles.value.forEach((profile) => {
      if (profile.apiKey && !profile.apiKey.startsWith('***')) profile.apiKey = `***${profile.apiKey.slice(-4)}`;
    });
    message.value = 'NoStar AI 配置已保存';
  } catch (event) {
    error.value = event instanceof Error ? event.message : 'NoStar AI 配置保存失败';
  } finally {
    isSavingNoStar.value = false;
  }
}

async function testNoStarProfile(profile: NoStarAiProfile) {
  error.value = '';
  message.value = '';
  testingProfileId.value = profile.id;
  try {
    const result = await apiRequest<{ model: string }>('/api/admin/nostar/ai/test', {
      method: 'POST',
      body: jsonBody(profile),
    });
    message.value = `NoStar 连接成功 · ${result.model}`;
  } catch (event) {
    error.value = event instanceof Error ? event.message : 'NoStar 连接测试失败';
  } finally {
    testingProfileId.value = '';
  }
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

    <section class="admin-section nostar-ai-section">
      <header class="admin-section-head">
        <h2><Star :size="18" /> NoStar AI</h2>
        <div class="admin-section-actions">
          <button class="button secondary" data-testid="add-nostar-ai-profile" type="button" @click="addNoStarProfile"><Plus :size="17" /> 新增</button>
          <button class="button" data-testid="save-nostar-ai-profiles" type="button" :disabled="isSavingNoStar" @click="saveNoStarProfiles"><Save :size="17" /> {{ isSavingNoStar ? '保存中' : '保存' }}</button>
        </div>
      </header>

      <div v-if="noStarProfiles.length" class="nostar-profile-list">
        <article v-for="(profile, index) in noStarProfiles" :key="profile.id" class="nostar-profile-editor">
          <div class="nostar-profile-toolbar">
            <label class="nostar-active-choice">
              <input type="radio" name="nostar-active-profile" :checked="profile.isActive" @change="activateNoStarProfile(index)" />
              默认
            </label>
            <button class="icon-button danger" type="button" title="删除配置" @click="removeNoStarProfile(index)"><Trash2 :size="16" /></button>
          </div>
          <div class="admin-settings-grid nostar-profile-grid">
            <div class="field"><label>名称</label><input v-model="profile.name" :data-testid="`nostar-profile-name-${index}`" maxlength="60" /></div>
            <div class="field">
              <label>接口类型</label>
              <select v-model="profile.apiType">
                <option value="openai">OpenAI</option>
                <option value="openai-compatible">OpenAI Compatible</option>
                <option value="openai-responses">OpenAI Responses</option>
                <option value="claude">Claude</option>
                <option value="gemini">Gemini</option>
                <option value="deepseek">DeepSeek</option>
              </select>
            </div>
            <div class="field wide"><label>API 地址</label><input v-model="profile.baseUrl" type="url" /></div>
            <div class="field"><label>模型</label><input v-model="profile.model" /></div>
            <div class="field"><label>API Key</label><input v-model="profile.apiKey" type="password" placeholder="留空或掩码则保留" /></div>
            <div class="field">
              <label>思考深度</label>
              <select v-model="profile.reasoningEffort">
                <option value="none">关闭</option><option value="low">低</option><option value="medium">中</option><option value="high">高</option>
              </select>
            </div>
            <div class="field"><label>并发数</label><input v-model.number="profile.concurrency" type="number" min="1" max="32" /></div>
            <div class="field wide"><label>仓库分析提示词</label><textarea v-model="profile.customPrompt" rows="3" maxlength="8000" /></div>
          </div>
          <div class="nostar-profile-footer">
            <label class="toggle-row"><input v-model="profile.useCustomPrompt" type="checkbox" /><span>启用自定义提示词</span></label>
            <button class="button secondary" type="button" :disabled="testingProfileId === profile.id" @click="testNoStarProfile(profile)"><FlaskConical :size="16" /> {{ testingProfileId === profile.id ? '测试中' : '测试连接' }}</button>
          </div>
        </article>
      </div>
      <button v-else class="add-list-row" type="button" title="新增 NoStar AI 配置" @click="addNoStarProfile"><Plus :size="18" /></button>
    </section>
  </div>
</template>

<style scoped>
.admin-section-actions,
.nostar-profile-toolbar,
.nostar-profile-footer {
  align-items: center;
  display: flex;
  gap: 10px;
}

.nostar-profile-list {
  display: grid;
  gap: 14px;
}

.nostar-profile-editor {
  border-top: 1px solid var(--admin-border);
  display: grid;
  gap: 14px;
  padding-top: 16px;
}

.nostar-profile-toolbar,
.nostar-profile-footer {
  justify-content: space-between;
}

.nostar-active-choice {
  align-items: center;
  display: inline-flex;
  font-size: 13px;
  font-weight: 700;
  gap: 7px;
}

.nostar-profile-grid textarea {
  resize: vertical;
}

@media (max-width: 720px) {
  .admin-section-head,
  .admin-section-actions,
  .nostar-profile-footer {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
