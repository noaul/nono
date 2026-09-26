<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { User } from '@/api/types';
import { useAuthStore } from '@/stores/auth';
import { useI18n } from '@/composables/useI18n';
import { useConfirm } from '@/composables/useConfirm';
import AdminStateBanner from './AdminStateBanner.vue';

const auth = useAuthStore();
const { t } = useI18n();
const confirmApi = useConfirm();
const users = ref<User[]>([]);
const allowRegistration = ref(false);
const loaded = ref(false);
const busy = ref(false);
const error = ref('');
const message = ref('');

async function load() {
  if (!auth.isAdmin || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    const [members, config] = await Promise.all([
      apiRequest<User[]>('/api/admin/users'),
      apiRequest<{ allowRegistration: boolean }>('/api/admin/config'),
    ]);
    users.value = members;
    allowRegistration.value = config.allowRegistration;
    loaded.value = true;
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('users.loadFailed');
  } finally {
    busy.value = false;
  }
}

async function saveRegistration() {
  if (!loaded.value || busy.value || !auth.isAdmin) return;
  busy.value = true;
  error.value = message.value = '';
  try {
    const config = await apiRequest<{ allowRegistration: boolean }>('/api/admin/config', {
      method: 'PUT', body: jsonBody({ allowRegistration: allowRegistration.value }),
    });
    allowRegistration.value = config.allowRegistration;
    message.value = t('users.saved');
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('common.saveFailed');
  } finally {
    busy.value = false;
  }
}

async function saveUser(user: User) {
  if (busy.value || !auth.isAdmin) return;
  busy.value = true;
  error.value = message.value = '';
  try {
    const saved = await apiRequest<User>(`/api/admin/users/${user.id}`, {
      method: 'PUT', body: jsonBody({ role: user.role, displayName: user.displayName, email: user.email }),
    });
    users.value = users.value.map((item) => item.id === saved.id ? saved : item);
    if (saved.id === auth.user?.id) auth.user = { ...auth.user, ...saved };
    message.value = t('users.saved');
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('common.saveFailed');
  } finally {
    busy.value = false;
  }
}

async function removeUser(user: User) {
  if (busy.value || !auth.isAdmin || user.id === auth.user?.id) return;
  if (!await confirmApi.confirm({ title: t('users.deleteTitle'), message: t('users.deleteConfirm', { name: user.username }), confirmText: t('common.delete'), tone: 'danger' })) return;
  busy.value = true;
  error.value = message.value = '';
  try {
    await apiRequest(`/api/admin/users/${user.id}`, { method: 'DELETE' });
    users.value = users.value.filter((item) => item.id !== user.id);
    message.value = t('users.deleted');
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('users.deleteFailed');
  } finally {
    busy.value = false;
  }
}

onMounted(load);
</script>

<template>
  <section v-if="auth.isAdmin" id="user-management" class="admin-section">
    <header class="admin-section-head"><h2>{{ t('users.title') }}</h2></header>
    <AdminStateBanner v-if="error" :message="error" tone="error" />
    <AdminStateBanner v-if="message" :message="message" tone="success" />
    <button v-if="!loaded" class="button secondary" type="button" :disabled="busy" @click="load">{{ busy ? t('common.loading') : t('common.retry') }}</button>
    <template v-else>
      <form class="admin-settings-grid" data-testid="registration-form" @submit.prevent="saveRegistration">
        <label class="switch-row"><input v-model="allowRegistration" data-testid="allow-registration" type="checkbox" :disabled="busy" /><span><strong>{{ t('users.allowRegistration') }}</strong><small>{{ t('users.registrationHint') }}</small></span></label>
        <div><button class="button" type="submit" :disabled="busy">{{ t('common.save') }}</button></div>
      </form>
      <form v-for="user in users" :key="user.id" class="admin-settings-grid member-form" :data-testid="`user-form-${user.id}`" @submit.prevent="saveUser(user)">
        <strong class="wide">{{ user.username }}</strong>
        <label class="field"><span>{{ t('auth.displayName') }}</span><input v-model="user.displayName" required maxlength="80" :disabled="busy" /></label>
        <label class="field"><span>{{ t('auth.email') }}</span><input v-model="user.email" type="email" required :disabled="busy" /></label>
        <label class="field"><span>{{ t('users.role') }}</span><select v-model="user.role" :data-testid="`user-role-${user.id}`" :disabled="busy || user.id === auth.user?.id"><option value="user">{{ t('admin.roleMember') }}</option><option value="admin">{{ t('admin.roleAdmin') }}</option></select></label>
        <div class="member-actions"><button class="button" type="submit" :disabled="busy">{{ t('common.save') }}</button><button v-if="user.id !== auth.user?.id" class="button danger" type="button" :disabled="busy" @click="removeUser(user)">{{ t('common.delete') }}</button></div>
      </form>
    </template>
  </section>
</template>

<style scoped>
.member-form { border-top: 1px solid var(--ui-border); margin-top: 16px; padding-top: 16px; }
.member-actions { display: flex; align-items: end; gap: 8px; }
</style>
