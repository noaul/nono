<script setup lang="ts">
import { inject, type Component } from 'vue';
import { routerKey } from 'vue-router';

export interface AdminTabItem {
  id: string;
  label: string;
  icon: Component;
  // Route tabs navigate to their own page; tabs without `to` switch panels in place.
  to?: string;
}

defineProps<{ items: AdminTabItem[]; active: string; label: string }>();
const emit = defineEmits<{ select: [id: string] }>();

const router = inject(routerKey, null);

function navigate(event: MouseEvent, to: string) {
  if (!router || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  void router.push(to);
}
</script>

<template>
  <div class="admin-tabs-bar">
    <nav v-if="items.some((item) => item.to)" class="admin-tabs" :aria-label="label">
      <a
        v-for="item in items"
        :key="item.id"
        :href="item.to"
        class="admin-tab"
        :class="{ active: active === item.id }"
        :aria-current="active === item.id ? 'page' : undefined"
        @click="navigate($event, item.to!)"
      >
        <component :is="item.icon" :size="16" />
        <span>{{ item.label }}</span>
      </a>
    </nav>
    <div v-else class="admin-tabs" role="tablist" :aria-label="label">
      <button
        v-for="item in items"
        :id="`${item.id}-tab`"
        :key="item.id"
        type="button"
        role="tab"
        class="admin-tab"
        :class="{ active: active === item.id }"
        :aria-selected="active === item.id"
        :aria-controls="item.id"
        :data-testid="`admin-tab-${item.id}`"
        @click="emit('select', item.id)"
      >
        <component :is="item.icon" :size="16" />
        <span>{{ item.label }}</span>
      </button>
    </div>
    <div v-if="$slots.actions" class="admin-tabs-actions"><slot name="actions" /></div>
  </div>
</template>
