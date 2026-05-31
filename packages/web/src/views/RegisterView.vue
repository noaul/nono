<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const form = reactive({ username: '', email: '', displayName: '', password: '' });
const error = ref('');
const message = ref('');

async function submit() {
  error.value = '';
  message.value = '';
  try {
    await auth.register(form);
    message.value = '注册成功，请登录。';
    await router.push('/login');
  } catch (event) {
    error.value = event instanceof Error ? event.message : '注册失败';
  }
}
</script>

<template>
  <main class="auth-page">
    <form class="auth-card" @submit.prevent="submit">
      <h1>注册账号</h1>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="message" class="notice">{{ message }}</p>
      <div class="field"><label>用户名</label><input v-model="form.username" /></div>
      <div class="field"><label>邮箱</label><input v-model="form.email" type="email" /></div>
      <div class="field"><label>显示名</label><input v-model="form.displayName" /></div>
      <div class="field"><label>密码</label><input v-model="form.password" type="password" autocomplete="new-password" /></div>
      <button class="button" type="submit">注册</button>
      <RouterLink class="button secondary" to="/login">返回登录</RouterLink>
    </form>
  </main>
</template>
