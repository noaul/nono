<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { Save, Trash2, Users } from 'lucide-vue-next';
import AdminPageHeader from '@/components/admin/AdminPageHeader.vue';
import AdminStateBanner from '@/components/admin/AdminStateBanner.vue';
import EmptyState from '@/components/admin/EmptyState.vue';
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
  <div class="admin-page-stack">
    <AdminPageHeader eyebrow="系统" title="用户管理" />
    <AdminStateBanner v-if="message" :message="message" tone="success" />

    <section class="admin-section">
      <header class="admin-section-head">
        <h2><Users :size="18" /> 注册策略</h2>
      </header>
      <div class="admin-settings-grid">
        <label class="switch-row"><input v-model="config.allowRegistration" type="checkbox" /><span><strong>开放注册</strong><small>允许新用户创建账户</small></span></label>
        <div class="field"><label>默认角色</label><select v-model="config.defaultRole"><option value="user">user</option><option value="admin">admin</option></select></div>
        <div class="admin-section-actions wide"><button class="button" type="button" @click="saveConfig"><Save :size="17" /> 保存全局配置</button></div>
      </div>
    </section>

    <section class="admin-section">
      <header class="admin-section-head">
        <h2>成员列表</h2>
      </header>
      <div class="list">
        <EmptyState v-if="!users.length" title="还没有其他用户" description="开放注册或手动创建后，成员会出现在这里。" />
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
      </div>
    </section>
  </div>
</template>
