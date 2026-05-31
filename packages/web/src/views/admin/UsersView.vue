<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Save, Trash2 } from 'lucide-vue-next';
import AdminLayout from '@/components/AdminLayout.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { User } from '@/api/types';

const users = ref<User[]>([]);
const config = ref({ allowRegistration: false, defaultRole: 'user' });
const message = ref('');

async function load() {
  [users.value, config.value] = await Promise.all([apiRequest<User[]>('/api/admin/users'), apiRequest<typeof config.value>('/api/admin/config')]);
}

async function saveUser(user: User) {
  await apiRequest(`/api/admin/users/${user.id}`, { method: 'PUT', body: jsonBody({ role: user.role, displayName: user.displayName, email: user.email }) });
  message.value = '用户已保存';
}

async function deleteUser(user: User) {
  await apiRequest(`/api/admin/users/${user.id}`, { method: 'DELETE' });
  await load();
}

async function saveConfig() {
  await apiRequest('/api/admin/config', { method: 'PUT', body: jsonBody(config.value) });
  message.value = '配置已保存';
}

onMounted(load);
</script>

<template>
  <AdminLayout title="用户管理">
    <div class="grid">
      <section class="panel grid">
        <p v-if="message" class="notice">{{ message }}</p>
        <label class="toolbar"><input v-model="config.allowRegistration" type="checkbox" /> 开放注册</label>
        <div class="field"><label>默认角色</label><select v-model="config.defaultRole"><option value="user">user</option><option value="admin">admin</option></select></div>
        <button class="button" type="button" @click="saveConfig"><Save :size="17" /> 保存全局配置</button>
      </section>
      <section class="panel list">
        <article v-for="user in users" :key="user.id" class="row">
          <div class="grid">
            <div class="grid two">
              <div class="field"><label>显示名</label><input v-model="user.displayName" /></div>
              <div class="field"><label>邮箱</label><input v-model="user.email" type="email" /></div>
            </div>
            <div class="field"><label>角色</label><select v-model="user.role"><option value="user">user</option><option value="admin">admin</option></select></div>
          </div>
          <div class="toolbar">
            <button class="icon-button secondary" title="保存" @click="saveUser(user)"><Save :size="17" /></button>
            <button class="icon-button danger" title="删除" @click="deleteUser(user)"><Trash2 :size="17" /></button>
          </div>
        </article>
      </section>
    </div>
  </AdminLayout>
</template>
