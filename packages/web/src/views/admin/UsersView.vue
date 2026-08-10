<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Save, Trash2, Users } from 'lucide-vue-next';
import AdminStateBanner from '@/components/admin/AdminStateBanner.vue';
import EmptyState from '@/components/admin/EmptyState.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { User } from '@/api/types';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

const users = ref<User[]>([]);
const config = ref({ allowRegistration: false, defaultRole: 'user' });
const message = ref('');

async function load() {
  [users.value, config.value] = await Promise.all([apiRequest<User[]>('/api/admin/users'), apiRequest<typeof config.value>('/api/admin/config')]);
}

async function saveUser(user: User) {
  await apiRequest(`/api/admin/users/${user.id}`, { method: 'PUT', body: jsonBody({ role: user.role, displayName: user.displayName, email: user.email }) });
  message.value = t('users.saved');
}

async function deleteUser(user: User) {
  await apiRequest(`/api/admin/users/${user.id}`, { method: 'DELETE' });
  await load();
}

async function saveConfig() {
  await apiRequest('/api/admin/config', { method: 'PUT', body: jsonBody(config.value) });
  message.value = t('users.configSaved');
}

onMounted(load);
</script>

<template>
  <div class="admin-page-stack">
    <AdminStateBanner v-if="message" :message="message" tone="success" />

    <section class="admin-section">
      <header class="admin-section-head">
        <h2><Users :size="18" /> {{ t('users.registrationPolicy') }}</h2>
      </header>
      <div class="admin-settings-grid">
        <label class="switch-row"><input v-model="config.allowRegistration" type="checkbox" /><span><strong>{{ t('users.openRegistration') }}</strong><small>{{ t('users.openRegistrationHint') }}</small></span></label>
        <div class="field"><label>{{ t('users.defaultRole') }}</label><select v-model="config.defaultRole"><option value="user">user</option><option value="admin">admin</option></select></div>
        <div class="admin-section-actions wide"><button class="button" type="button" @click="saveConfig"><Save :size="17" /> {{ t('users.saveGlobal') }}</button></div>
      </div>
    </section>

    <section class="admin-section">
      <header class="admin-section-head">
        <h2>{{ t('users.memberList') }}</h2>
      </header>
      <div class="list">
        <EmptyState v-if="!users.length" :title="t('users.emptyTitle')" :description="t('users.emptyBody')" />
        <article v-for="user in users" :key="user.id" class="row">
          <div class="grid">
            <div class="grid two">
              <div class="field"><label>{{ t('auth.displayName') }}</label><input v-model="user.displayName" /></div>
              <div class="field"><label>{{ t('auth.email') }}</label><input v-model="user.email" type="email" /></div>
            </div>
            <div class="field"><label>{{ t('users.role') }}</label><select v-model="user.role"><option value="user">user</option><option value="admin">admin</option></select></div>
          </div>
          <div class="toolbar">
            <button class="icon-button secondary" :title="t('common.save')" @click="saveUser(user)"><Save :size="17" /></button>
            <button class="icon-button danger" :title="t('common.delete')" @click="deleteUser(user)"><Trash2 :size="17" /></button>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>
