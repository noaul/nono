<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { Bot, FlaskConical, Plus, Save, Star, Trash2 } from 'lucide-vue-next';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
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
    message.value = t('llm.nostarSaved');
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('llm.nostarSaveFailed');
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
    message.value = t('llm.nostarConnected', { model: result.model });
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('llm.nostarTestFailed');
  } finally {
    testingProfileId.value = '';
  }
}
</script>

<template>
  <div class="admin-page-stack">
    <AdminPageHeader :eyebrow="t('admin.sectionAutomation')" :title="t('admin.titleLlm')">
      <template #actions>
        <button class="button secondary" data-testid="test-llm-connection" type="button" :disabled="isTesting" @click="testConnection"><FlaskConical :size="17" /> {{ isTesting ? t('llm.testing') : t('llm.testConnection') }}</button>
        <button class="button" form="llm-settings-form" type="submit"><Save :size="17" /> {{ t('llm.saveConfig') }}</button>
      </template>
    </AdminPageHeader>

    <AdminStateBanner v-if="message" :message="message" tone="success" />
    <AdminStateBanner v-if="error" :message="error" tone="error" />
    <AdminStateBanner :message="t('llm.keyNotice', { state: hasKey ? t('llm.keyConfigured') : t('llm.keyMissing') })" tone="info" />

    <form id="llm-settings-form" class="admin-section" @submit.prevent="save">
      <header class="admin-section-head">
        <h2><Bot :size="18" /> {{ t('llm.connection') }}</h2>
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

    <section class="admin-section nostar-ai-section">
      <header class="admin-section-head">
        <h2><Star :size="18" /> NoStar AI</h2>
        <div class="admin-section-actions">
          <button class="button secondary" data-testid="add-nostar-ai-profile" type="button" @click="addNoStarProfile"><Plus :size="17" /> {{ t('llm.addProfile') }}</button>
          <button class="button" data-testid="save-nostar-ai-profiles" type="button" :disabled="isSavingNoStar" @click="saveNoStarProfiles"><Save :size="17" /> {{ isSavingNoStar ? t('common.saving') : t('common.save') }}</button>
        </div>
      </header>

      <div v-if="noStarProfiles.length" class="nostar-profile-list">
        <article v-for="(profile, index) in noStarProfiles" :key="profile.id" class="nostar-profile-editor">
          <div class="nostar-profile-toolbar">
            <label class="nostar-active-choice">
              <input type="radio" name="nostar-active-profile" :checked="profile.isActive" @change="activateNoStarProfile(index)" />
              {{ t('llm.default') }}
            </label>
            <button class="icon-button danger" type="button" :title="t('llm.deleteProfile')" @click="removeNoStarProfile(index)"><Trash2 :size="16" /></button>
          </div>
          <div class="admin-settings-grid nostar-profile-grid">
            <div class="field"><label>{{ t('llm.profileName') }}</label><input v-model="profile.name" :data-testid="`nostar-profile-name-${index}`" maxlength="60" /></div>
            <div class="field">
              <label>{{ t('llm.apiType') }}</label>
              <select v-model="profile.apiType">
                <option value="openai">OpenAI</option>
                <option value="openai-compatible">OpenAI Compatible</option>
                <option value="openai-responses">OpenAI Responses</option>
                <option value="claude">Claude</option>
                <option value="gemini">Gemini</option>
                <option value="deepseek">DeepSeek</option>
              </select>
            </div>
            <div class="field wide"><label>{{ t('llm.baseUrl') }}</label><input v-model="profile.baseUrl" type="url" /></div>
            <div class="field"><label>{{ t('llm.model') }}</label><input v-model="profile.model" /></div>
            <div class="field"><label>{{ t('llm.apiKey') }}</label><input v-model="profile.apiKey" type="password" :placeholder="t('llm.apiKeyKeep')" /></div>
            <div class="field">
              <label>{{ t('llm.effort') }}</label>
              <select v-model="profile.reasoningEffort">
                <option value="none">{{ t('llm.effortNone') }}</option><option value="low">{{ t('llm.effortLow') }}</option><option value="medium">{{ t('llm.effortMedium') }}</option><option value="high">{{ t('llm.effortHigh') }}</option>
              </select>
            </div>
            <div class="field"><label>{{ t('llm.concurrency') }}</label><input v-model.number="profile.concurrency" type="number" min="1" max="32" /></div>
            <div class="field wide"><label>{{ t('llm.repoPrompt') }}</label><textarea v-model="profile.customPrompt" rows="3" maxlength="8000" /></div>
          </div>
          <div class="nostar-profile-footer">
            <label class="toggle-row"><input v-model="profile.useCustomPrompt" type="checkbox" /><span>{{ t('llm.useCustomPrompt') }}</span></label>
            <button class="button secondary" type="button" :disabled="testingProfileId === profile.id" @click="testNoStarProfile(profile)"><FlaskConical :size="16" /> {{ testingProfileId === profile.id ? t('llm.testing') : t('llm.testConnection') }}</button>
          </div>
        </article>
      </div>
      <button v-else class="add-list-row" type="button" :title="t('llm.addNostarProfile')" @click="addNoStarProfile"><Plus :size="18" /></button>
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
