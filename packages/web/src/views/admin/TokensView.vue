<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { KeyRound, Plus, Trash2 } from 'lucide-vue-next';
import AdminLayout from '@/components/AdminLayout.vue';
import { apiRequest, jsonBody } from '@/api/client';

interface ApiToken {
  id: number;
  name: string;
  token: string;
  expiresAt?: string | null;
  createdAt: string;
}

const tokens = ref<ApiToken[]>([]);
const form = reactive({ name: 'Chrome extension', expiresAt: '' });
const createdToken = ref('');

async function load() {
  tokens.value = await apiRequest<ApiToken[]>('/api/admin/tokens');
}

async function createToken() {
  const token = await apiRequest<ApiToken>('/api/admin/tokens', { method: 'POST', body: jsonBody({ name: form.name, expiresAt: form.expiresAt || null }) });
  createdToken.value = token.token;
  await load();
}

async function remove(token: ApiToken) {
  await apiRequest(`/api/admin/tokens/${token.id}`, { method: 'DELETE' });
  await load();
}

onMounted(load);
</script>

<template>
  <AdminLayout title="API Token">
    <div class="grid two">
      <form class="panel grid" @submit.prevent="createToken">
        <div class="field"><label>名称</label><input v-model="form.name" /></div>
        <div class="field"><label>过期时间</label><input v-model="form.expiresAt" type="datetime-local" /></div>
        <button class="button" type="submit"><Plus :size="17" /> 创建 Token</button>
        <p v-if="createdToken" class="notice">{{ createdToken }}</p>
      </form>
      <section class="panel list">
        <article v-for="token in tokens" :key="token.id" class="row">
          <div>
            <div class="row-title"><KeyRound :size="15" /> {{ token.name }}</div>
            <div class="row-subtitle">{{ token.token }} · {{ token.expiresAt || '不过期' }}</div>
          </div>
          <button class="icon-button danger" title="撤销" @click="remove(token)"><Trash2 :size="17" /></button>
        </article>
      </section>
    </div>
  </AdminLayout>
</template>
