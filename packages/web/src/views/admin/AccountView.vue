<script setup lang="ts">
import { reactive, ref } from 'vue';
import { KeyRound, Save } from 'lucide-vue-next';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import AdminStateBanner from '@/components/admin/AdminStateBanner.vue';
import { apiRequest, jsonBody } from '@/api/client';

const form = reactive({ currentPassword: '', newPassword: '' });
const message = ref('');
const error = ref('');

async function save() {
  error.value = '';
  message.value = '';
  try {
    await apiRequest('/api/admin/account/password', { method: 'PUT', body: jsonBody(form) });
    form.currentPassword = '';
    form.newPassword = '';
    message.value = '密码已更新';
  } catch (event) {
    error.value = event instanceof Error ? event.message : '更新失败';
  }
}
</script>

<template>
  <div class="admin-page-stack">
    <AdminPageHeader eyebrow="系统" title="账户设置">
      <template #actions>
        <button class="button" form="account-password-form" type="submit"><Save :size="17" /> 修改密码</button>
      </template>
    </AdminPageHeader>

    <AdminStateBanner v-if="message" :message="message" tone="success" />
    <AdminStateBanner v-if="error" :message="error" tone="error" />

    <form id="account-password-form" class="admin-section" @submit.prevent="save">
      <header class="admin-section-head">
        <h2><KeyRound :size="18" /> 登录密码</h2>
      </header>
      <div class="admin-settings-grid">
        <div class="field"><label>当前密码</label><input v-model="form.currentPassword" type="password" autocomplete="current-password" /></div>
        <div class="field"><label>新密码</label><input v-model="form.newPassword" type="password" autocomplete="new-password" /></div>
      </div>
    </form>
  </div>
</template>
