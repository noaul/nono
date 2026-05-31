<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const username = ref('admin');
const password = ref('');
const error = ref('');

async function submit() {
  error.value = '';
  try {
    await auth.login({ username: username.value, password: password.value });
    await router.push('/admin');
  } catch (event) {
    error.value = event instanceof Error ? event.message : '登录失败';
  }
}
</script>

<template>
  <main class="auth-page">
    <form class="auth-card" @submit.prevent="submit">
      <h1>登录 Nono</h1>
      <p v-if="auth.setupRequired" class="notice">还没有管理员账号，请先初始化。</p>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="field">
        <label>用户名</label>
        <input v-model="username" autocomplete="username" />
      </div>
      <div class="field">
        <label>密码</label>
        <input v-model="password" type="password" autocomplete="current-password" />
      </div>
      <button class="button" type="submit">登录</button>
      <RouterLink class="button secondary" to="/setup">初始化管理员</RouterLink>
    </form>
  </main>
</template>
