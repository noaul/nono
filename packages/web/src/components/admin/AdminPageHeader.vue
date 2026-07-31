<script setup lang="ts">
defineProps<{
  title: string;
  eyebrow?: string;
  description?: string;
}>();
</script>

<template>
  <header class="admin-page-header">
    <div class="admin-page-heading">
      <p v-if="eyebrow" class="admin-page-eyebrow">{{ eyebrow }}</p>
      <!-- h2, not h1: AdminLayout's topbar owns the page's only h1. -->
      <h2 class="admin-page-title">{{ title }}</h2>
      <p v-if="description" class="admin-page-description">{{ description }}</p>
    </div>
    <div v-if="$slots.actions" class="admin-page-actions">
      <slot name="actions" />
    </div>
  </header>
</template>
