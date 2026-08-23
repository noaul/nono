<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();

const auth = useAuthStore();
const router = useRouter();
const form = reactive({ username: 'admin', email: 'admin@nono.local', displayName: 'NoNo Admin', password: '', bootstrapToken: '' });
const error = ref('');

async function submit() {
  error.value = '';
  try {
    await auth.setup(form);
    await router.push('/admin');
  } catch (event) {
    error.value = event instanceof Error ? event.message : t('auth.setupFailed');
  }
}
</script>

<template>
  <main class="auth-page">
    <form class="auth-card" @submit.prevent="submit">
      <h1>{{ t('auth.initAdmin') }}</h1>
      <p v-if="error" class="error">{{ error }}</p>
      <div class="field"><label>{{ t('auth.username') }}</label><input v-model="form.username" /></div>
      <div class="field"><label>{{ t('auth.email') }}</label><input v-model="form.email" type="email" /></div>
      <div class="field"><label>{{ t('auth.displayName') }}</label><input v-model="form.displayName" /></div>
      <div class="field"><label>{{ t('auth.password') }}</label><input v-model="form.password" type="password" autocomplete="new-password" /></div>
      <div class="field"><label>{{ t('auth.bootstrapToken') }}</label><input v-model="form.bootstrapToken" type="password" autocomplete="off" /></div>
      <button class="button" type="submit">{{ t('auth.createAdmin') }}</button>
    </form>
  </main>
</template>
