<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { PublicTheme, ThemeSceneKind } from '@/utils/themes';
import type { ResolvedColorMode } from '@/utils/colorMode';

const props = withDefaults(defineProps<{ theme?: PublicTheme; intensity?: number; mode?: ResolvedColorMode }>(), {
  intensity: 100,
  mode: 'light',
});

const particles = Array.from({ length: 30 }, (_, index) => ({
  x: `${(index * 37 + 7) % 101}%`,
  y: `${(index * 29 + 11) % 94}%`,
  delay: -((index * 1.73) % 15),
  drift: ((index * 31) % 120) - 60,
  rotate: ((index * 47) % 100) - 50,
  variant: index % 4,
}));

const streaks = [
  { x: '18%', y: '16%', delay: '-1s' },
  { x: '58%', y: '30%', delay: '-5s' },
  { x: '78%', y: '10%', delay: '-8s' },
];

const ripples = [
  { x: '12%', delay: '-0.4s' },
  { x: '38%', delay: '-1.8s' },
  { x: '64%', delay: '-3.2s' },
  { x: '88%', delay: '-4.6s' },
];

// 0-100 dial persisted in settings.theme.sceneIntensity; 100 keeps each theme's tuned look.
const intensityRatio = computed(() => Math.min(100, Math.max(0, Math.round(props.intensity))) / 100);
const modeMultiplier = computed(() => {
  if (props.mode !== 'dark') return 1;
  return props.theme?.scene.kind === 'stars' || props.theme?.scene.kind === 'snow' ? 0.92 : 0.72;
});

// Lower intensity thins the particle field as well; opacity scaling handles the rest.
const visibleParticles = computed(() => particles.slice(0, Math.round(30 * (0.55 + 0.45 * intensityRatio.value))));

const sceneStyle = computed<Record<string, string>>(() => {
  const opacity = (props.theme?.scene.opacity ?? 0) * intensityRatio.value * modeMultiplier.value;
  return {
    '--theme-scene-opacity': String(opacity),
    '--theme-scene-mobile-opacity': String(opacity * 0.72),
    '--theme-ambient-opacity': String(Math.min(0.72, opacity * 2.2)),
    '--theme-ambient-mobile-opacity': String(Math.min(0.54, opacity * 1.7)),
    '--theme-particle-alpha': (0.35 + 0.65 * intensityRatio.value).toFixed(2),
    '--theme-scene-blend': props.theme?.scene.blendMode || 'normal',
  };
});

// CSS animations keep running in hidden tabs; pausing them keeps the scene battery friendly.
const paused = ref(false);

function onVisibilityChange() {
  paused.value = document.visibilityState === 'hidden';
}

// Texture + atmosphere drift a few pixels against the pointer for depth; particles keep
// their own full-screen animations. Fine hover pointers only, and never under reduced motion.
const parallaxEnabled =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
  !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const parallaxStyle = ref<Record<string, string>>({});
let parallaxFrame = 0;
let pendingPointer: { x: number; y: number } | null = null;

function onPointerMove(event: PointerEvent) {
  if (paused.value) return;
  pendingPointer = { x: event.clientX, y: event.clientY };
  if (parallaxFrame) return;
  parallaxFrame = requestAnimationFrame(() => {
    parallaxFrame = 0;
    if (!pendingPointer || typeof window === 'undefined') return;
    const nx = pendingPointer.x / Math.max(1, window.innerWidth) - 0.5;
    const ny = pendingPointer.y / Math.max(1, window.innerHeight) - 0.5;
    parallaxStyle.value = {
      '--scene-parallax-x': `${(nx * 14).toFixed(1)}px`,
      '--scene-parallax-y': `${(ny * 10).toFixed(1)}px`,
    };
  });
}

onMounted(() => {
  if (typeof document === 'undefined') return;
  paused.value = document.visibilityState === 'hidden';
  document.addEventListener('visibilitychange', onVisibilityChange);
  if (parallaxEnabled) window.addEventListener('pointermove', onPointerMove, { passive: true });
});

onBeforeUnmount(() => {
  if (typeof document === 'undefined') return;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  if (parallaxEnabled) window.removeEventListener('pointermove', onPointerMove);
  if (parallaxFrame) cancelAnimationFrame(parallaxFrame);
});

function metrics(kind: ThemeSceneKind, index: number) {
  switch (kind) {
    case 'bubbles':
      return { size: 12 + (index * 17) % 48, duration: 8 + (index * 7) % 9 };
    case 'snow':
      return { size: 10 + (index * 5) % 15, duration: 9 + (index * 7) % 9 };
    case 'leaves':
      return { size: 18 + (index * 7) % 20, duration: 10 + (index * 5) % 9 };
    case 'stars':
      return { size: 2 + (index * 3) % 5, duration: 1.8 + ((index * 7) % 20) / 10 };
    case 'sunbeams':
      return { size: 2 + (index * 5) % 5, duration: 7 + (index * 3) % 8 };
    case 'rain':
      return { size: 38 + (index * 11) % 48, duration: 0.9 + ((index * 3) % 8) / 10 };
  }
}

function particleStyle(particle: typeof particles[number], index: number) {
  const kind = props.theme?.scene.kind || 'stars';
  const { size, duration } = metrics(kind, index);
  return {
    '--scene-x': particle.x,
    '--scene-y': particle.y,
    '--scene-size': `${size}px`,
    '--scene-delay': `${kind === 'rain' ? particle.delay / 4 : particle.delay}s`,
    '--scene-duration': `${duration}s`,
    '--scene-drift': `${particle.drift}px`,
    '--scene-drift-back': `${Math.round(particle.drift * -0.5)}px`,
    '--scene-rotate': `${particle.rotate}deg`,
    '--scene-variant': String(particle.variant),
  };
}
</script>

<template>
  <div
    v-if="theme"
    class="theme-scene"
    :class="[`scene-${theme.scene.kind}`, `motion-${theme.scene.motion}`, { 'is-paused': paused }]"
    :data-scene="theme.scene.kind"
    :data-color-mode="mode"
    :style="[sceneStyle, parallaxStyle]"
    data-testid="theme-scene"
    aria-hidden="true"
  >
    <div class="scene-parallax">
      <img
        v-if="theme.scene.mode === 'texture'"
        class="scene-texture"
        :src="theme.scene.asset"
        alt=""
        decoding="async"
        draggable="false"
      />
      <span class="scene-atmosphere"></span>
    </div>
    <div class="scene-layer-particles">
      <span
        v-for="(particle, index) in visibleParticles"
        :key="index"
        class="scene-particle"
        :class="`variant-${particle.variant}`"
        :style="particleStyle(particle, index)"
      ></span>
      <span
        v-for="(streak, index) in theme.scene.kind === 'stars' ? streaks : []"
        :key="`streak-${index}`"
        class="scene-streak"
        :style="{ '--scene-x': streak.x, '--scene-y': streak.y, '--scene-delay': streak.delay }"
      ></span>
      <span
        v-for="(ripple, index) in theme.scene.kind === 'rain' ? ripples : []"
        :key="`ripple-${index}`"
        class="scene-ripple"
        :style="{ '--scene-x': ripple.x, '--scene-delay': ripple.delay }"
      ></span>
    </div>
  </div>
</template>

<style scoped>
.theme-scene {
  contain: layout paint style;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  position: fixed;
  transform: translateZ(0);
  z-index: 1;
}

/* Depth layer: texture + atmosphere lean a few pixels against the pointer. */
.scene-parallax {
  inset: 0;
  position: absolute;
  transform: translate3d(var(--scene-parallax-x, 0px), var(--scene-parallax-y, 0px), 0);
  transition: transform 0.24s ease-out;
}

.scene-layer-particles {
  inset: 0;
  opacity: var(--theme-particle-alpha, 1);
  position: absolute;
  transition: opacity 0.3s ease;
}

/* Hidden tabs pause every scene animation instead of burning battery. */
.theme-scene.is-paused *,
.theme-scene.is-paused *::before {
  animation-play-state: paused !important;
}

.scene-texture {
  height: 108%;
  inset: -4%;
  max-width: none;
  mix-blend-mode: var(--theme-scene-blend, normal);
  object-fit: cover;
  opacity: var(--theme-scene-opacity, 0.18);
  position: absolute;
  transition: opacity 0.3s ease;
  width: 108%;
}

.scene-atmosphere,
.scene-particle,
.scene-particle::before,
.scene-streak,
.scene-ripple {
  display: block;
  position: absolute;
}

.scene-atmosphere {
  inset: -18%;
  opacity: var(--theme-ambient-opacity, 0.4);
}

.scene-particle {
  animation-delay: var(--scene-delay);
  animation-duration: var(--scene-duration);
  animation-iteration-count: infinite;
  animation-timing-function: linear;
  left: var(--scene-x);
  will-change: opacity, transform;
}

/* Summer: transparent CSS bubbles rise independently of the background image. */
[data-scene='bubbles'] .scene-atmosphere {
  animation: scene-caustics 9s ease-in-out infinite alternate;
  background:
    radial-gradient(ellipse at 16% 20%, rgba(255, 255, 255, 0.38), transparent 24%),
    radial-gradient(ellipse at 72% 62%, rgba(42, 206, 195, 0.24), transparent 30%);
  filter: blur(18px);
}

[data-scene='bubbles'] .scene-particle {
  animation-name: scene-bubble-rise;
  bottom: -18vh;
  height: var(--scene-size);
  width: var(--scene-size);
}

[data-scene='bubbles'] .scene-particle::before {
  background: radial-gradient(circle at 32% 25%, rgba(255, 255, 255, 0.92) 0 5%, rgba(255, 255, 255, 0.18) 18%, rgba(31, 181, 174, 0.08) 58%, transparent 72%);
  border: 1px solid rgba(255, 255, 255, 0.58);
  border-radius: 50%;
  box-shadow: inset -5px -7px 12px rgba(18, 126, 129, 0.12), 0 4px 14px rgba(54, 154, 158, 0.12);
  inset: 0;
}

/* Winter: glyphs are transparent; no raster snowflake or white image backing is used. */
[data-scene='snow'] .scene-atmosphere {
  animation: scene-winter-glow 7s ease-in-out infinite alternate;
  background: radial-gradient(circle at 52% 8%, rgba(255, 226, 183, 0.28), transparent 26%);
}

[data-scene='snow'] .scene-particle {
  animation-name: scene-snow-fall;
  height: var(--scene-size);
  top: -14vh;
  width: var(--scene-size);
}

[data-scene='snow'] .scene-particle::before {
  color: rgba(255, 255, 255, 0.92);
  content: '❄';
  filter: drop-shadow(0 2px 4px rgba(82, 101, 122, 0.2));
  font-size: var(--scene-size);
  line-height: 1;
}

[data-scene='snow'] .variant-1::before,
[data-scene='snow'] .variant-3::before {
  content: '✦';
  opacity: 0.72;
}

/* Green leaves use generated leaf shapes, so edges stay transparent at every size. */
[data-scene='leaves'] .scene-atmosphere {
  animation: scene-leaf-light 8s ease-in-out infinite alternate;
  background: radial-gradient(ellipse at 22% 10%, rgba(245, 255, 210, 0.46), transparent 34%);
  filter: blur(12px);
}

[data-scene='leaves'] .scene-particle {
  animation-name: scene-leaf-fall;
  height: var(--scene-size);
  top: -16vh;
  width: var(--scene-size);
}

[data-scene='leaves'] .scene-particle::before {
  background: linear-gradient(135deg, #b5d88c 0%, #5fa76c 48%, #2d7951 100%);
  border-radius: 100% 0 100% 0;
  box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.32), 0 5px 10px rgba(31, 82, 52, 0.2);
  inset: 0;
  transform: scaleY(0.7);
}

[data-scene='leaves'] .variant-1::before,
[data-scene='leaves'] .variant-3::before {
  background: linear-gradient(135deg, #e1b268 0%, #bd7545 52%, #7f4936 100%);
}

/* Night: stars twinkle at fixed coordinates while three streaks cross the sky. */
[data-scene='stars'] .scene-atmosphere {
  animation: scene-aurora 10s ease-in-out infinite alternate;
  background:
    radial-gradient(ellipse at 20% 32%, rgba(92, 119, 214, 0.34), transparent 28%),
    radial-gradient(ellipse at 76% 18%, rgba(216, 164, 109, 0.2), transparent 24%);
  filter: blur(24px);
}

[data-scene='stars'] .scene-particle {
  animation-name: scene-star-twinkle;
  background: #fff7dc;
  border-radius: 50%;
  box-shadow: 0 0 14px rgba(255, 231, 164, 0.86);
  height: var(--scene-size);
  top: var(--scene-y);
  width: var(--scene-size);
}

.scene-streak {
  animation: scene-shooting-star 8s var(--scene-delay) ease-in-out infinite;
  background: linear-gradient(90deg, rgba(255, 246, 211, 0.92), transparent);
  height: 1px;
  left: var(--scene-x);
  opacity: 0;
  top: var(--scene-y);
  transform: rotate(-28deg);
  width: 120px;
}

/* Clear day: visible moving beams plus floating dust make the Tyndall effect legible. */
[data-scene='sunbeams'] .scene-atmosphere {
  animation: scene-sunbeam-sweep 8s ease-in-out infinite alternate;
  background: repeating-conic-gradient(from 112deg at 8% 0%, transparent 0deg 8deg, rgba(255, 250, 198, 0.25) 9deg 14deg, transparent 15deg 25deg);
  filter: blur(7px);
  transform-origin: 8% 0%;
}

[data-scene='sunbeams'] .scene-particle {
  animation-name: scene-dust-float;
  background: rgba(255, 248, 193, 0.82);
  border-radius: 50%;
  box-shadow: 0 0 8px rgba(255, 238, 158, 0.7);
  bottom: -8vh;
  height: var(--scene-size);
  width: var(--scene-size);
}

/* Rain lines and ripples are both generated with CSS and remain fully transparent. */
[data-scene='rain'] .scene-atmosphere {
  animation: scene-rain-mist 6s ease-in-out infinite alternate;
  background: linear-gradient(110deg, transparent 20%, rgba(221, 246, 249, 0.24), transparent 72%);
  filter: blur(20px);
}

[data-scene='rain'] .scene-particle {
  animation-name: scene-rain-drop;
  background: linear-gradient(180deg, transparent, rgba(226, 248, 250, 0.72));
  height: var(--scene-size);
  top: -18vh;
  width: 1px;
}

.scene-ripple {
  animation: scene-ripple 5s var(--scene-delay) ease-out infinite;
  border: 1px solid rgba(225, 248, 249, 0.58);
  border-radius: 50%;
  bottom: 4%;
  height: 14px;
  left: var(--scene-x);
  opacity: 0;
  width: 58px;
}

.motion-float .scene-texture { animation: scene-texture-float 14s ease-in-out infinite alternate; }
.motion-shimmer .scene-texture { animation: scene-texture-shimmer 8s ease-in-out infinite alternate; }
.motion-breathe .scene-texture { animation: scene-texture-breathe 10s ease-in-out infinite alternate; }
.motion-rain .scene-texture { animation: scene-texture-rain 9s ease-in-out infinite alternate; }

@keyframes scene-texture-float {
  from { transform: translate3d(-1.5%, 1%, 0) scale(1.03); }
  to { transform: translate3d(1.5%, -1%, 0) scale(1.09); }
}

@keyframes scene-texture-shimmer {
  from { filter: brightness(0.88); transform: scale(1.03); }
  to { filter: brightness(1.14); transform: scale(1.08); }
}

@keyframes scene-texture-breathe {
  from { transform: translate3d(-1%, 1%, 0) scale(1.03); }
  to { transform: translate3d(1%, -1%, 0) scale(1.09); }
}

@keyframes scene-texture-rain {
  from { transform: translate3d(0, -1.5%, 0) scale(1.04); }
  to { transform: translate3d(0, 1.5%, 0) scale(1.09); }
}

@keyframes scene-bubble-rise {
  0% { opacity: 0; transform: translate3d(0, 0, 0) scale(0.68); }
  12% { opacity: 0.74; }
  55% { transform: translate3d(var(--scene-drift), -62vh, 0) scale(1); }
  100% { opacity: 0; transform: translate3d(var(--scene-drift-back), -128vh, 0) scale(1.16); }
}

@keyframes scene-caustics {
  from { transform: translate3d(-2%, 2%, 0) rotate(-2deg) scale(1.02); }
  to { transform: translate3d(3%, -2%, 0) rotate(2deg) scale(1.08); }
}

@keyframes scene-snow-fall {
  0% { opacity: 0; transform: translate3d(0, -8vh, 0) rotate(var(--scene-rotate)); }
  10% { opacity: 0.88; }
  52% { transform: translate3d(var(--scene-drift), 58vh, 0) rotate(calc(var(--scene-rotate) + 130deg)); }
  100% { opacity: 0; transform: translate3d(var(--scene-drift-back), 126vh, 0) rotate(calc(var(--scene-rotate) + 280deg)); }
}

@keyframes scene-winter-glow {
  from { opacity: 0.45; transform: translateX(-3%); }
  to { opacity: 0.85; transform: translateX(3%); }
}

@keyframes scene-leaf-fall {
  0% { opacity: 0; transform: translate3d(0, -8vh, 0) rotate(var(--scene-rotate)) rotateY(0deg); }
  12% { opacity: 0.86; }
  50% { transform: translate3d(var(--scene-drift), 56vh, 0) rotate(calc(var(--scene-rotate) + 150deg)) rotateY(180deg); }
  100% { opacity: 0; transform: translate3d(var(--scene-drift-back), 126vh, 0) rotate(calc(var(--scene-rotate) + 330deg)) rotateY(360deg); }
}

@keyframes scene-leaf-light {
  from { transform: translate3d(-3%, 2%, 0) scale(1); }
  to { transform: translate3d(4%, -2%, 0) scale(1.08); }
}

@keyframes scene-star-twinkle {
  0%, 100% { opacity: 0.18; transform: scale(0.55); }
  48% { opacity: 1; transform: scale(1.45); }
  62% { opacity: 0.42; transform: scale(0.85); }
}

@keyframes scene-shooting-star {
  0%, 78% { opacity: 0; transform: translate3d(0, 0, 0) rotate(-28deg) scaleX(0.35); }
  82% { opacity: 1; }
  91% { opacity: 0.8; }
  100% { opacity: 0; transform: translate3d(44vw, 24vw, 0) rotate(-28deg) scaleX(1); }
}

@keyframes scene-aurora {
  from { transform: translate3d(-3%, 2%, 0) rotate(-1deg) scale(1); }
  to { transform: translate3d(4%, -3%, 0) rotate(2deg) scale(1.08); }
}

@keyframes scene-sunbeam-sweep {
  from { opacity: 0.48; transform: rotate(-5deg) scale(1.03); }
  to { opacity: 0.92; transform: rotate(7deg) scale(1.12); }
}

@keyframes scene-dust-float {
  0% { opacity: 0; transform: translate3d(0, 0, 0); }
  20% { opacity: 0.72; }
  55% { transform: translate3d(var(--scene-drift), -52vh, 0); }
  100% { opacity: 0; transform: translate3d(var(--scene-drift-back), -112vh, 0); }
}

@keyframes scene-rain-drop {
  0% { opacity: 0; transform: translate3d(0, -10vh, 0) rotate(7deg); }
  12% { opacity: 0.7; }
  100% { opacity: 0; transform: translate3d(-8vw, 130vh, 0) rotate(7deg); }
}

@keyframes scene-rain-mist {
  from { transform: translateX(-5%) scale(1.02); }
  to { transform: translateX(5%) scale(1.08); }
}

@keyframes scene-ripple {
  0%, 66% { opacity: 0; transform: scale(0.2); }
  72% { opacity: 0.72; }
  100% { opacity: 0; transform: scale(2.4); }
}

@media (max-width: 640px) {
  .scene-particle:nth-of-type(n + 18) {
    display: none;
  }

  .scene-texture {
    opacity: var(--theme-scene-mobile-opacity, 0.13);
  }

  .scene-atmosphere {
    opacity: var(--theme-ambient-mobile-opacity, 0.3);
  }
}

@media (prefers-reduced-motion: reduce) {
  .scene-parallax {
    transform: none;
    transition: none;
  }

  .scene-texture,
  .scene-atmosphere,
  .scene-particle,
  .scene-streak,
  .scene-ripple {
    animation: none !important;
  }

  .scene-particle:nth-of-type(n + 10),
  .scene-streak,
  .scene-ripple {
    display: none;
  }

  .scene-texture,
  .scene-atmosphere {
    transform: none;
  }

  .scene-particle {
    opacity: 0.3;
  }
}
</style>
