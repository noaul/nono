<script setup lang="ts">
import { computed } from 'vue';
import type { PublicTheme } from '@/utils/themes';

const props = defineProps<{ theme?: PublicTheme }>();

const particles = [
  { x: '4%', y: '-18%', size: '74px', delay: '-3s', duration: '22s', drift: '38px', rotate: '-16deg' },
  { x: '15%', y: '-34%', size: '48px', delay: '-11s', duration: '19s', drift: '-24px', rotate: '22deg' },
  { x: '29%', y: '-12%', size: '62px', delay: '-7s', duration: '24s', drift: '46px', rotate: '8deg' },
  { x: '43%', y: '-42%', size: '42px', delay: '-15s', duration: '18s', drift: '-34px', rotate: '-28deg' },
  { x: '56%', y: '-24%', size: '82px', delay: '-5s', duration: '26s', drift: '28px', rotate: '18deg' },
  { x: '68%', y: '-38%', size: '54px', delay: '-13s', duration: '21s', drift: '-44px', rotate: '-8deg' },
  { x: '79%', y: '-15%', size: '68px', delay: '-9s', duration: '23s', drift: '34px', rotate: '26deg' },
  { x: '91%', y: '-31%', size: '46px', delay: '-17s', duration: '20s', drift: '-28px', rotate: '-20deg' },
];

const sceneStyle = computed<Record<string, string>>(() => ({
  '--theme-scene-opacity': String(props.theme?.scene.opacity ?? 0),
  mixBlendMode: props.theme?.scene.blendMode || 'normal',
}));

function particleStyle(particle: typeof particles[number]) {
  return {
    '--scene-x': particle.x,
    '--scene-y': particle.y,
    '--scene-size': particle.size,
    '--scene-delay': particle.delay,
    '--scene-duration': particle.duration,
    '--scene-drift': particle.drift,
    '--scene-rotate': particle.rotate,
  };
}
</script>

<template>
  <div
    v-if="theme"
    class="theme-scene"
    :class="[`scene-${theme.scene.mode}`, `motion-${theme.scene.motion}`]"
    :data-scene="theme.scene.kind"
    :style="sceneStyle"
    data-testid="theme-scene"
    aria-hidden="true"
  >
    <img
      v-if="theme.scene.mode === 'texture'"
      class="scene-texture"
      :src="theme.scene.asset"
      alt=""
      decoding="async"
      draggable="false"
    />
    <template v-else>
      <img
        v-for="(particle, index) in particles"
        :key="index"
        class="scene-particle"
        :src="theme.scene.asset"
        :style="particleStyle(particle)"
        alt=""
        decoding="async"
        draggable="false"
      />
    </template>
  </div>
</template>

<style scoped>
.theme-scene {
  contain: layout paint style;
  inset: 0;
  opacity: var(--theme-scene-opacity, 0);
  overflow: hidden;
  pointer-events: none;
  position: fixed;
  transform: translateZ(0);
  z-index: 0;
}

.scene-texture {
  height: 108%;
  inset: -4%;
  max-width: none;
  object-fit: cover;
  position: absolute;
  transform: translate3d(0, 0, 0) scale(1.02);
  width: 108%;
}

.scene-particle {
  animation-delay: var(--scene-delay);
  animation-duration: var(--scene-duration);
  animation-iteration-count: infinite;
  animation-timing-function: linear;
  height: auto;
  left: var(--scene-x);
  max-width: none;
  position: absolute;
  top: var(--scene-y);
  transform-origin: center;
  width: var(--scene-size);
}

[data-scene='snow'] .scene-particle {
  filter: drop-shadow(0 3px 7px rgba(var(--public-shadow-rgb, 52, 70, 82), 0.12));
}

[data-scene='leaves'] .scene-particle {
  filter: drop-shadow(0 8px 12px rgba(var(--public-shadow-rgb, 45, 75, 55), 0.18));
}

.motion-float .scene-texture {
  animation: scene-float 24s ease-in-out infinite alternate;
}

.motion-shimmer .scene-texture {
  animation: scene-shimmer 9s ease-in-out infinite alternate;
}

.motion-breathe .scene-texture {
  animation: scene-breathe 14s ease-in-out infinite alternate;
}

.motion-rain .scene-texture {
  animation: scene-rain 18s ease-in-out infinite alternate;
}

.motion-fall .scene-particle {
  animation-name: scene-fall;
}

.motion-drift .scene-particle {
  animation-name: scene-leaf-drift;
}

@keyframes scene-float {
  from { transform: translate3d(-1.5%, 1%, 0) scale(1.03); }
  to { transform: translate3d(1.5%, -1%, 0) scale(1.08); }
}

@keyframes scene-shimmer {
  from { opacity: 0.72; transform: translate3d(-0.5%, 0, 0) scale(1.03); }
  to { opacity: 1; transform: translate3d(0.5%, -0.6%, 0) scale(1.06); }
}

@keyframes scene-breathe {
  from { opacity: 0.76; transform: translate3d(-1%, 0.8%, 0) scale(1.03); }
  to { opacity: 1; transform: translate3d(1%, -0.8%, 0) scale(1.07); }
}

@keyframes scene-rain {
  from { transform: translate3d(0, -1.4%, 0) scale(1.04); }
  to { transform: translate3d(0, 1.4%, 0) scale(1.08); }
}

@keyframes scene-fall {
  0% { opacity: 0; transform: translate3d(0, -8vh, 0) rotate(var(--scene-rotate)); }
  12% { opacity: 0.9; }
  88% { opacity: 0.72; }
  100% { opacity: 0; transform: translate3d(var(--scene-drift), 125vh, 0) rotate(calc(var(--scene-rotate) + 240deg)); }
}

@keyframes scene-leaf-drift {
  0% { opacity: 0; transform: translate3d(0, -10vh, 0) rotate(var(--scene-rotate)); }
  14% { opacity: 0.82; }
  50% { transform: translate3d(var(--scene-drift), 58vh, 0) rotate(calc(var(--scene-rotate) + 120deg)); }
  88% { opacity: 0.7; }
  100% { opacity: 0; transform: translate3d(var(--scene-drift), 126vh, 0) rotate(calc(var(--scene-rotate) + 260deg)); }
}

@media (max-width: 640px) {
  .theme-scene {
    filter: opacity(68%);
  }

  .scene-particle:nth-child(n + 6) {
    display: none;
  }

  .scene-particle {
    width: min(var(--scene-size), 54px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .scene-texture,
  .scene-particle {
    animation: none !important;
  }

  .scene-texture {
    transform: none;
  }

  .scene-particle {
    opacity: 0.34;
    transform: translate3d(0, 42vh, 0) rotate(var(--scene-rotate));
  }
}
</style>
