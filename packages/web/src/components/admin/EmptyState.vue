<script setup lang="ts">
import { Inbox } from 'lucide-vue-next';

defineProps<{
  title: string;
  description: string;
}>();
</script>

<template>
  <div class="admin-empty-state">
    <Inbox :size="24" />
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
    <div v-if="$slots.action" class="admin-empty-action">
      <slot name="action" />
    </div>
  </div>
</template>
