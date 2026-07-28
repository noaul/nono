<script setup lang="ts">
import { ref } from 'vue';
import { Fingerprint } from 'lucide-vue-next';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { requiresDocumentNavigation, resolveInternalRedirect } from '@/utils/redirect';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

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
    error.value = event instanceof Error ? event.message : t('auth.signInFailed');
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
    error.value = event instanceof Error ? event.message : t('auth.passkeyFailed');
  } finally {
    isPasskeyLoading.value = false;
  }
}
</script>

<template>
  <main class="auth-page">
    <form class="auth-card" @submit.prevent="submit">
      <h1>{{ t('auth.signInTitle') }}</h1>
      <p v-if="auth.setupRequired" class="notice">{{ t('auth.setupNotice') }}</p>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="field">
        <label>{{ t('auth.username') }}</label>
        <input v-model="username" autocomplete="username" />
      </div>
      <div class="field">
        <label>{{ t('auth.password') }}</label>
        <input v-model="password" type="password" autocomplete="current-password" />
      </div>
      <button class="button" type="submit">{{ t('auth.signIn') }}</button>
      <div class="auth-divider"><span>{{ t('auth.or') }}</span></div>
      <button class="button secondary passkey-login" data-testid="passkey-login" type="button" :disabled="isPasskeyLoading" @click="loginWithPasskey">
        <Fingerprint :size="18" /> {{ isPasskeyLoading ? t('auth.passkeyVerifying') : t('auth.usePasskey') }}
      </button>
      <RouterLink class="button secondary" to="/setup">{{ t('auth.initAdmin') }}</RouterLink>
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
