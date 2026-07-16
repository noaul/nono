<script setup lang="ts">
import { computed } from 'vue';
import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-vue-next';

const props = withDefaults(defineProps<{
  message: string;
  tone?: 'success' | 'info' | 'warning' | 'error';
}>(), {
  tone: 'info',
});

const icon = computed(() => ({
  success: CircleCheck,
  info: Info,
  warning: TriangleAlert,
  error: CircleAlert,
})[props.tone]);
const role = computed(() => (props.tone === 'error' ? 'alert' : 'status'));
</script>

<template>
  <div
    class="admin-state-banner"
    :class="`admin-state-banner--${tone}`"
    :role="role"
    :aria-live="role === 'alert' ? 'assertive' : 'polite'"
  >
    <component :is="icon" :size="17" aria-hidden="true" />
    <span>{{ message }}</span>
  </div>
</template>
