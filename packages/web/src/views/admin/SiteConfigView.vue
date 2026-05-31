<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { Save } from 'lucide-vue-next';
import AdminLayout from '@/components/AdminLayout.vue';
import { apiRequest, jsonBody } from '@/api/client';
import type { Site } from '@/api/types';

const form = reactive({
  name: '',
  description: '',
  slug: 'admin',
  backgroundImage: '',
  backgroundColor: '#000000',
  fontColor: '#ffffff',
  searchUrlTemplate: 'https://www.google.com/search?q={query}',
  localSearchFirst: true,
});
const message = ref('');
const error = ref('');

onMounted(async () => {
  const site = await apiRequest<Site>('/api/admin/site');
  Object.assign(form, site);
});

async function save() {
  error.value = '';
  message.value = '';
  try {
    Object.assign(form, await apiRequest<Site>('/api/admin/site', { method: 'PUT', body: jsonBody(form) }));
    message.value = '已保存';
  } catch (event) {
    error.value = event instanceof Error ? event.message : '保存失败';
  }
}
</script>

<template>
  <AdminLayout title="站点配置">
    <form class="panel grid" @submit.prevent="save">
      <p v-if="message" class="notice">{{ message }}</p>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="grid two">
        <div class="field"><label>站点名</label><input v-model="form.name" /></div>
        <div class="field"><label>发布地址</label><input v-model="form.slug" /></div>
      </div>
      <div class="field"><label>简介</label><textarea v-model="form.description" /></div>
      <div class="field"><label>背景图片</label><input v-model="form.backgroundImage" /></div>
      <div class="grid two">
        <div class="field"><label>背景色</label><input v-model="form.backgroundColor" type="color" /></div>
        <div class="field"><label>字体色</label><input v-model="form.fontColor" type="color" /></div>
      </div>
      <div class="field"><label>搜索模板</label><input v-model="form.searchUrlTemplate" /></div>
      <label class="toolbar"><input v-model="form.localSearchFirst" type="checkbox" /> 站内优先搜索</label>
      <button class="button" type="submit"><Save :size="17" /> 保存</button>
    </form>
  </AdminLayout>
</template>
