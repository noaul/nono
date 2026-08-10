<script setup lang="ts">
import { useI18n } from '@/composables/useI18n';

const { t } = useI18n();
const updatedAt = '2026-07-16';
</script>

<template>
  <main class="privacy-page">
    <article class="privacy-content">
      <header class="privacy-header">
        <a class="privacy-brand" href="/" :aria-label="t('privacy.backHome')">NoNo</a>
        <p class="privacy-kicker">NoNo Smart Bookmark</p>
        <h1>{{ t('privacy.title') }}</h1>
        <p class="privacy-updated">{{ t('privacy.updated', { date: updatedAt }) }}</p>
      </header>

      <section>
        <h2>{{ t('privacy.scopeTitle') }}</h2>
        <p>{{ t('privacy.scopeBody') }}</p>
      </section>

      <section>
        <h2>{{ t('privacy.dataTitle') }}</h2>
        <p>{{ t('privacy.dataBody1') }}</p>
        <p>{{ t('privacy.dataBody2') }}</p>
      </section>

      <section>
        <h2>{{ t('privacy.useTitle') }}</h2>
        <p>{{ t('privacy.useBody1') }}</p>
        <p>{{ t('privacy.useBody2') }}</p>
      </section>

      <section>
        <h2>{{ t('privacy.retentionTitle') }}</h2>
        <p>{{ t('privacy.retentionBody') }}</p>
      </section>

      <section>
        <h2>{{ t('privacy.neverTitle') }}</h2>
        <ul>
          <li>{{ t('privacy.never1') }}</li>
          <li>{{ t('privacy.never2') }}</li>
          <li>{{ t('privacy.never3') }}</li>
        </ul>
      </section>

      <section>
        <h2>{{ t('privacy.updatesTitle') }}</h2>
        <p>{{ t('privacy.updatesBody') }}</p>
      </section>
    </article>
  </main>
</template>

<style scoped>
.privacy-page {
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  padding: 56px 24px 80px;
  transition: background-color 0.24s ease, color 0.24s ease;
}

.privacy-content {
  background: color-mix(in srgb, var(--panel) 92%, transparent);
  border: 1px solid var(--line);
  border-radius: 8px;
  box-shadow: 0 18px 48px rgba(49, 69, 124, 0.11);
  margin: 0 auto;
  max-width: 820px;
  overflow: hidden;
}

.privacy-header,
.privacy-content section {
  padding: 28px 34px;
}

.privacy-header {
  background: color-mix(in srgb, var(--panel-2) 78%, transparent);
  border-bottom: 1px solid var(--line);
}

.privacy-brand {
  color: var(--admin-link);
  font-size: 16px;
  font-weight: 800;
}

.privacy-kicker,
.privacy-updated {
  color: var(--muted);
  font-size: 13px;
  margin: 14px 0 0;
}

h1,
h2,
p,
ul {
  margin: 0;
}

h1 {
  font-size: 32px;
  line-height: 1.2;
  margin-top: 8px;
}

.privacy-content section + section {
  border-top: 1px solid var(--line);
}

h2 {
  font-size: 18px;
  line-height: 1.35;
}

p,
li {
  color: var(--muted);
  font-size: 15px;
  line-height: 1.8;
}

h2 + p,
p + p,
ul {
  margin-top: 12px;
}

ul {
  padding-left: 22px;
}

li + li {
  margin-top: 6px;
}

@media (max-width: 640px) {
  .privacy-page {
    padding: 24px 14px 48px;
  }

  .privacy-header,
  .privacy-content section {
    padding: 24px 20px;
  }

  h1 {
    font-size: 27px;
  }
}
</style>
