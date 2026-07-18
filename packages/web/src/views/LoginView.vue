<script setup lang="ts">
import { ref } from 'vue';
import { Fingerprint } from 'lucide-vue-next';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { requiresDocumentNavigation, resolveInternalRedirect } from '@/utils/redirect';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();
const username = ref('admin');
const password = ref('');
const error = ref('');
const isPasskeyLoading = ref(false);

async function enterApplication() {
  const nextPath = resolveInternalRedirect(route.query.next, '/admin');
  if (requiresDocumentNavigation(nextPath)) {
    window.location.assign(nextPath);
    return;
  }
  await router.push(nextPath);
}

async function submit() {
  error.value = '';
  try {
    await auth.login({ username: username.value, password: password.value });
    await enterApplication();
  } catch (event) {
    error.value = event instanceof Error ? event.message : '登录失败';
  }
}

async function loginWithPasskey() {
  if (isPasskeyLoading.value) return;
  error.value = '';
  isPasskeyLoading.value = true;
  try {
    await auth.loginWithPasskey();
    await enterApplication();
  } catch (event) {
    error.value = event instanceof Error ? event.message : '通行密钥登录失败';
  } finally {
    isPasskeyLoading.value = false;
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
      <div class="auth-divider"><span>或</span></div>
      <button class="button secondary passkey-login" data-testid="passkey-login" type="button" :disabled="isPasskeyLoading" @click="loginWithPasskey">
        <Fingerprint :size="18" /> {{ isPasskeyLoading ? '验证中' : '使用通行密钥' }}
      </button>
      <RouterLink class="button secondary" to="/setup">初始化管理员</RouterLink>
    </form>
  </main>
</template>

<style scoped>
.auth-divider {
  align-items: center;
  color: var(--muted);
  display: grid;
  font-size: 12px;
  gap: 10px;
  grid-template-columns: 1fr auto 1fr;
}

.auth-divider::before,
.auth-divider::after {
  background: var(--line);
  content: '';
  height: 1px;
}

.passkey-login {
  align-items: center;
  display: inline-flex;
  gap: 8px;
  justify-content: center;
}
</style>
