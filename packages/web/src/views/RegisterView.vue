<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

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
    message.value = t('auth.registerOk');
    await router.push('/login');
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('auth.registerFailed');
  }
}
</script>

<template>
  <main class="auth-page">
    <form class="auth-card" @submit.prevent="submit">
      <h1>{{ t('auth.registerTitle') }}</h1>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="message" class="notice">{{ message }}</p>
      <div class="field"><label>{{ t('auth.username') }}</label><input v-model="form.username" /></div>
      <div class="field"><label>{{ t('auth.email') }}</label><input v-model="form.email" type="email" /></div>
      <div class="field"><label>{{ t('auth.displayName') }}</label><input v-model="form.displayName" /></div>
      <div class="field"><label>{{ t('auth.password') }}</label><input v-model="form.password" type="password" autocomplete="new-password" /></div>
      <button class="button" type="submit">{{ t('auth.register') }}</button>
      <RouterLink class="button secondary" to="/login">{{ t('auth.backToSignIn') }}</RouterLink>
    </form>
  </main>
</template>
