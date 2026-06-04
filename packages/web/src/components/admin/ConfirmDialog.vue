<script setup lang="ts">
import { AlertTriangle, X } from 'lucide-vue-next';
import { useConfirm } from '@/composables/useConfirm';

const confirmApi = useConfirm();
</script>

<template>
  <Teleport to="body">
    <div v-if="confirmApi.state.value.open" class="confirm-backdrop" role="presentation">
      <section class="confirm-dialog" role="dialog" aria-modal="true" :aria-label="confirmApi.state.value.title">
        <div class="confirm-icon" :class="{ danger: confirmApi.state.value.tone === 'danger' }">
          <AlertTriangle :size="20" />
        </div>
        <div class="confirm-copy">
          <h2>{{ confirmApi.state.value.title }}</h2>
          <p>{{ confirmApi.state.value.message }}</p>
        </div>
        <button class="icon-button secondary confirm-close" type="button" aria-label="关闭" @click="confirmApi.cancel">
          <X :size="16" />
        </button>
        <div class="confirm-actions">
          <button data-testid="confirm-cancel" class="button secondary" type="button" @click="confirmApi.cancel">
            {{ confirmApi.state.value.cancelText }}
          </button>
          <button data-testid="confirm-accept" class="button" :class="{ danger: confirmApi.state.value.tone === 'danger' }" type="button" @click="confirmApi.accept">
            {{ confirmApi.state.value.confirmText }}
          </button>
        </div>
      </section>
    </div>
  </Teleport>
</template>
