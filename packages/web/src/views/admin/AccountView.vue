<script setup lang="ts">
import { reactive, ref } from 'vue';
import { Save } from 'lucide-vue-next';
import AdminLayout from '@/components/AdminLayout.vue';
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
  <AdminLayout title="账户设置">
    <form class="panel grid" @submit.prevent="save">
      <p v-if="message" class="notice">{{ message }}</p>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="field"><label>当前密码</label><input v-model="form.currentPassword" type="password" autocomplete="current-password" /></div>
      <div class="field"><label>新密码</label><input v-model="form.newPassword" type="password" autocomplete="new-password" /></div>
      <button class="button" type="submit"><Save :size="17" /> 修改密码</button>
    </form>
  </AdminLayout>
</template>
