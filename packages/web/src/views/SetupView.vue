<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const form = reactive({ username: 'admin', email: 'admin@nono.local', displayName: 'Nono Admin', password: '' });
const error = ref('');

async function submit() {
  error.value = '';
  try {
    await auth.setup(form);
    await router.push('/admin');
  } catch (event) {
    error.value = event instanceof Error ? event.message : '初始化失败';
  }
}
</script>

<template>
  <main class="auth-page">
    <form class="auth-card" @submit.prevent="submit">
      <h1>初始化管理员</h1>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="field"><label>用户名</label><input v-model="form.username" /></div>
      <div class="field"><label>邮箱</label><input v-model="form.email" type="email" /></div>
      <div class="field"><label>显示名</label><input v-model="form.displayName" /></div>
      <div class="field"><label>密码</label><input v-model="form.password" type="password" autocomplete="new-password" /></div>
      <button class="button" type="submit">创建管理员</button>
    </form>
  </main>
</template>
