<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { PublicTheme, ThemeSceneKind } from '@/utils/themes';
import type { ResolvedColorMode } from '@/utils/colorMode';

const props = withDefaults(defineProps<{ theme?: PublicTheme; intensity?: number; mode?: ResolvedColorMode }>(), {
  intensity: 100,
  mode: 'light',
});

const PARTICLE_COUNT = 48;

// Deterministic hash noise: the field is identical on the server, on the client, and in tests,
// but it is not visibly banded the way `index % n` arithmetic is.
function noise(seed: number) {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

// depth 0 = far (small, slow, faint), depth 1 = near (large, fast, bright).
// Every particle carries two independent rhythms: the span travels, the ::before sways.
const particles = Array.from({ length: PARTICLE_COUNT }, (_, index) => {
  const n = (salt: number) => noise(index * 9.73 + salt * 4.31 + 1);
  return {
    x: `${(n(1) * 106 - 3).toFixed(2)}%`,
    y: `${(n(2) * 92 + 2).toFixed(2)}%`,
    depth: n(3),
    delay: -(n(4) * 20),
    swayDelay: -(n(5) * 9),
    drift: Math.round(n(6) * 150 - 75),
    sway: Math.round(12 + n(7) * 52),
    rotate: Math.round(n(8) * 360 - 180),
    spin: Math.round((n(9) * 220 + 160) * (n(10) > 0.5 ? 1 : -1)),
    variant: index % 4,
  };
});

const streaks = [
  { x: '14%', y: '12%', delay: '-2.4s', duration: '11s', length: '160px' },
  { x: '52%', y: '26%', delay: '-7.1s', duration: '14s', length: '210px' },
  { x: '74%', y: '8%', delay: '-11.6s', duration: '17s', length: '130px' },
];

// Discrete god rays read as a real Tyndall effect; a single repeating gradient never does.
const beams = [
  { x: '-6%', angle: 15, width: '120px', blur: '10px', alpha: '0.5', duration: '13s', delay: '-1s' },
  { x: '8%', angle: 19, width: '66px', blur: '6px', alpha: '0.72', duration: '17s', delay: '-6s' },
  { x: '22%', angle: 22, width: '150px', blur: '14px', alpha: '0.38', duration: '21s', delay: '-3s' },
  { x: '34%', angle: 17, width: '54px', blur: '5px', alpha: '0.66', duration: '15s', delay: '-9s' },
  { x: '48%', angle: 24, width: '96px', blur: '11px', alpha: '0.32', duration: '19s', delay: '-13s' },
];

const ripples = [
  { x: '9%', delay: '-0.4s', duration: '4.6s', bottom: '6%' },
  { x: '31%', delay: '-2.1s', duration: '5.4s', bottom: '3%' },
  { x: '54%', delay: '-3.4s', duration: '4.9s', bottom: '8%' },
  { x: '72%', delay: '-1.3s', duration: '6.1s', bottom: '4%' },
  { x: '90%', delay: '-4.6s', duration: '5.1s', bottom: '7%' },
];

// Droplets crawling down the glass, each dragging a fading trail behind it.
const drips = [
  { x: '13%', y: '-6%', size: '9px', sway: '10px', delay: '-2s', duration: '13s' },
  { x: '38%', y: '-12%', size: '6px', sway: '-7px', delay: '-8s', duration: '17s' },
  { x: '66%', y: '-4%', size: '11px', sway: '8px', delay: '-14s', duration: '11s' },
  { x: '86%', y: '-16%', size: '7px', sway: '-5px', delay: '-5s', duration: '15s' },
];

// 0-100 dial persisted in settings.theme.sceneIntensity; 100 keeps each theme's tuned look.
const intensityRatio = computed(() => Math.min(100, Math.max(0, Math.round(props.intensity))) / 100);
const modeMultiplier = computed(() => {
  if (props.mode !== 'dark') return 1;
  return props.theme?.scene.kind === 'stars' || props.theme?.scene.kind === 'snow' ? 0.92 : 0.72;
});

// Lower intensity thins the particle field as well; opacity scaling handles the rest.
const visibleParticles = computed(() => particles.slice(0, Math.round(PARTICLE_COUNT * (0.55 + 0.45 * intensityRatio.value))));

// 场景底图另有一份 WebP（体积约为原图的 1/4，见 scripts/optimize-theme-scenes.mjs），
// 通过 <picture> 优先使用；不支持 WebP 的浏览器回退到 asset 里的原始 jpg/png。
const sceneWebp = computed(() => props.theme?.scene.asset.replace(/\.(?:jpe?g|png)$/i, '.webp') || '');

const sceneStyle = computed<Record<string, string>>(() => {
  const opacity = (props.theme?.scene.opacity ?? 0) * intensityRatio.value * modeMultiplier.value;
  return {
    '--theme-scene-opacity': String(opacity),
    '--theme-scene-mobile-opacity': String(opacity * 0.72),
    '--theme-ambient-opacity': String(Math.min(0.72, opacity * 2.2)),
    '--theme-ambient-mobile-opacity': String(Math.min(0.54, opacity * 1.7)),
    '--theme-particle-alpha': (0.35 + 0.65 * intensityRatio.value).toFixed(2),
    '--theme-vignette-opacity': (0.42 * intensityRatio.value).toFixed(2),
    '--theme-scene-blend': props.theme?.scene.blendMode || 'normal',
  };
});

// CSS animations keep running in hidden tabs; pausing them keeps the scene battery friendly.
const paused = ref(false);

function onVisibilityChange() {
  paused.value = document.visibilityState === 'hidden';
}

// Texture, atmosphere, and the particle field lean against the pointer at different strengths
// (and opposite directions) so the scene reads as layered depth rather than one flat picture.
// Fine hover pointers only, and never under reduced motion.
const parallaxEnabled = ref(false);
const parallaxStyle = ref<Record<string, string>>({});
let parallaxFrame = 0;
let pendingPointer: { x: number; y: number } | null = null;

function supportsParallax() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return (
    window.matchMedia('(hover: hover) and (pointer: fine)').matches &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

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
      '--scene-parallax-x': `${(nx * 18).toFixed(1)}px`,
      '--scene-parallax-y': `${(ny * 13).toFixed(1)}px`,
    };
  });
}

onMounted(() => {
  if (typeof document === 'undefined') return;
  paused.value = document.visibilityState === 'hidden';
  document.addEventListener('visibilitychange', onVisibilityChange);
  parallaxEnabled.value = supportsParallax();
  if (parallaxEnabled.value) window.addEventListener('pointermove', onPointerMove, { passive: true });
});

onBeforeUnmount(() => {
  if (typeof document === 'undefined') return;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  if (parallaxEnabled.value) window.removeEventListener('pointermove', onPointerMove);
  if (parallaxFrame) cancelAnimationFrame(parallaxFrame);
});

// size/travel ranges are read at depth 0 → depth 1; sway is the secondary rhythm in seconds.
const SCENE_METRICS: Record<ThemeSceneKind, { size: [number, number]; travel: [number, number]; sway: [number, number] }> = {
  bubbles: { size: [7, 52], travel: [26, 12], sway: [3.2, 7.5] },
  snow: { size: [8, 26], travel: [27, 13], sway: [3.6, 8.4] },
  leaves: { size: [13, 40], travel: [25, 12], sway: [2.8, 6.4] },
  stars: { size: [1.4, 4.6], travel: [2.6, 7.2], sway: [4, 11] },
  sunbeams: { size: [1.4, 5], travel: [34, 17], sway: [4.5, 10] },
  rain: { size: [42, 132], travel: [1.5, 0.62], sway: [2, 5] },
};

function particleStyle(particle: typeof particles[number], index: number) {
  const kind = props.theme?.scene.kind || 'stars';
  const range = SCENE_METRICS[kind];
  const depth = particle.depth;
  const size = lerp(range.size[0], range.size[1], depth);
  // Falling/rising fields: near particles cross the screen faster. Stars instead pick an
  // unrelated twinkle period so neighbouring stars never pulse in lockstep.
  const travel = kind === 'stars'
    ? lerp(range.travel[0], range.travel[1], noise(index * 3.1 + 41))
    : lerp(range.travel[0], range.travel[1], depth * 0.78 + noise(index * 2.7 + 13) * 0.22);
  const sway = lerp(range.sway[0], range.sway[1], noise(index * 5.3 + 29));
  return {
    '--scene-x': particle.x,
    '--scene-y': particle.y,
    '--scene-size': `${size.toFixed(1)}px`,
    '--scene-depth': depth.toFixed(2),
    '--scene-fade': (0.3 + 0.7 * depth).toFixed(2),
    '--scene-delay': `${(kind === 'rain' ? particle.delay / 5 : particle.delay).toFixed(2)}s`,
    '--scene-duration': `${travel.toFixed(2)}s`,
    '--scene-sway': `${Math.round(particle.sway * (0.45 + 0.75 * depth))}px`,
    '--scene-sway-duration': `${sway.toFixed(2)}s`,
    '--scene-sway-delay': `${particle.swayDelay.toFixed(2)}s`,
    '--scene-drift': `${Math.round(particle.drift * (0.4 + depth))}px`,
    '--scene-rotate': `${particle.rotate}deg`,
    '--scene-spin': `${particle.spin}deg`,
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
      <picture v-if="theme.scene.mode === 'texture'">
        <source type="image/webp" :srcset="sceneWebp" />
        <img
          class="scene-texture"
          :src="theme.scene.asset"
          alt=""
          decoding="async"
          draggable="false"
        />
      </picture>
      <span class="scene-atmosphere"></span>
      <span class="scene-aura"></span>
    </div>
    <div class="scene-layer-particles">
      <div class="scene-wind">
        <span
          v-for="(particle, index) in visibleParticles"
          :key="index"
          class="scene-particle"
          :class="`variant-${particle.variant}`"
          :style="particleStyle(particle, index)"
        ></span>
        <span
          v-for="(beam, index) in theme.scene.kind === 'sunbeams' ? beams : []"
          :key="`beam-${index}`"
          class="scene-beam"
          :style="{
            '--scene-x': beam.x,
            '--beam-angle': `${beam.angle}deg`,
            '--beam-width': beam.width,
            '--beam-blur': beam.blur,
            '--beam-alpha': beam.alpha,
            '--scene-duration': beam.duration,
            '--scene-delay': beam.delay,
          }"
        ></span>
        <span
          v-for="(streak, index) in theme.scene.kind === 'stars' ? streaks : []"
          :key="`streak-${index}`"
          class="scene-streak"
          :style="{
            '--scene-x': streak.x,
            '--scene-y': streak.y,
            '--scene-delay': streak.delay,
            '--scene-duration': streak.duration,
            '--scene-length': streak.length,
          }"
        ></span>
        <span
          v-for="(ripple, index) in theme.scene.kind === 'rain' ? ripples : []"
          :key="`ripple-${index}`"
          class="scene-ripple"
          :style="{
            '--scene-x': ripple.x,
            '--scene-delay': ripple.delay,
            '--scene-duration': ripple.duration,
            '--scene-bottom': ripple.bottom,
          }"
        ></span>
        <span
          v-for="(drip, index) in theme.scene.kind === 'rain' ? drips : []"
          :key="`drip-${index}`"
          class="scene-drip"
          :style="{
            '--scene-x': drip.x,
            '--scene-y': drip.y,
            '--scene-size': drip.size,
            '--scene-sway': drip.sway,
            '--scene-delay': drip.delay,
            '--scene-duration': drip.duration,
          }"
        ></span>
      </div>
    </div>
    <span class="scene-vignette"></span>
  </div>
</template>

<style scoped>
.theme-scene {
  animation: scene-enter 1.1s ease-out both;
  contain: layout paint style;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  position: fixed;
  transform: translateZ(0);
  z-index: 1;
}

/* Depth layers: texture and atmosphere lean into the pointer, the particle field leans away. */
.scene-parallax {
  inset: 0;
  position: absolute;
  transform: translate3d(var(--scene-parallax-x, 0px), var(--scene-parallax-y, 0px), 0);
  transition: transform 0.28s cubic-bezier(0.22, 0.61, 0.36, 1);
}

.scene-layer-particles {
  inset: 0;
  opacity: var(--theme-particle-alpha, 1);
  position: absolute;
  transform: translate3d(calc(var(--scene-parallax-x, 0px) * -0.4), calc(var(--scene-parallax-y, 0px) * -0.4), 0);
  transition: opacity 0.3s ease, transform 0.34s cubic-bezier(0.22, 0.61, 0.36, 1);
}

/* One shared wind pass so a whole field of snow/leaves/rain gusts together. */
.scene-wind {
  inset: 0;
  position: absolute;
}

[data-scene='snow'] .scene-wind {
  animation: scene-gust 19s ease-in-out infinite alternate;
}

[data-scene='leaves'] .scene-wind {
  animation: scene-gust 23s ease-in-out infinite alternate;
}

[data-scene='rain'] .scene-wind {
  animation: scene-gust-rain 12s ease-in-out infinite alternate;
}

[data-scene='stars'] .scene-wind {
  animation: scene-sky-drift 96s ease-in-out infinite alternate;
}

/* Hidden tabs pause every scene animation instead of burning battery. */
.theme-scene.is-paused *,
.theme-scene.is-paused *::before,
.theme-scene.is-paused *::after {
  animation-play-state: paused !important;
}

/* <picture> 只是 WebP 的容器，不参与布局，避免它变成 .scene-texture 的包含块。 */
.scene-parallax picture {
  display: contents;
}

.scene-texture {
  height: 112%;
  inset: -6%;
  max-width: none;
  mix-blend-mode: var(--theme-scene-blend, normal);
  object-fit: cover;
  opacity: var(--theme-scene-opacity, 0.18);
  position: absolute;
  transition: opacity 0.3s ease;
  width: 112%;
}

.scene-atmosphere,
.scene-aura,
.scene-particle,
.scene-particle::before,
.scene-particle::after,
.scene-beam,
.scene-streak,
.scene-ripple,
.scene-ripple::before,
.scene-drip,
.scene-vignette {
  display: block;
  position: absolute;
}

.scene-atmosphere,
.scene-aura {
  inset: -20%;
  opacity: var(--theme-ambient-opacity, 0.4);
}

/* The aura is the second, slower half of every atmosphere so light never loops visibly. */
.scene-aura {
  opacity: calc(var(--theme-ambient-opacity, 0.4) * 0.72);
}

/* Edge falloff pulls the eye to the middle of the page; tinted with the theme's own overlay. */
.scene-vignette {
  background: radial-gradient(ellipse at 50% 42%, transparent 38%, rgba(var(--public-overlay-rgb, 12, 20, 28), 0.3) 100%);
  inset: 0;
  opacity: var(--theme-vignette-opacity, 0.42);
}

.scene-particle {
  animation-delay: var(--scene-delay);
  animation-duration: var(--scene-duration);
  animation-iteration-count: infinite;
  animation-timing-function: linear;
  left: var(--scene-x);
  opacity: 0;
  will-change: transform, opacity;
}

/* Second rhythm: the glyph sways/flutters on its own clock inside the travelling span. */
.scene-particle::before {
  animation-delay: var(--scene-sway-delay);
  animation-direction: alternate;
  animation-duration: var(--scene-sway-duration);
  animation-iteration-count: infinite;
  animation-timing-function: cubic-bezier(0.45, 0, 0.55, 1);
  content: '';
  inset: 0;
}

/* Summer: transparent CSS bubbles rise and wobble independently of the background image. */
[data-scene='bubbles'] .scene-atmosphere {
  animation: scene-caustics 11s ease-in-out infinite alternate;
  background:
    radial-gradient(ellipse at 16% 20%, rgba(255, 255, 255, 0.42), transparent 26%),
    radial-gradient(ellipse at 72% 62%, rgba(var(--accent-rgb, 42, 206, 195), 0.26), transparent 32%);
  filter: blur(18px);
}

[data-scene='bubbles'] .scene-aura {
  animation: scene-caustics-slow 17s ease-in-out infinite alternate;
  background:
    repeating-linear-gradient(102deg, transparent 0 42px, rgba(255, 255, 255, 0.16) 46px 60px, transparent 64px 120px),
    radial-gradient(ellipse at 50% -10%, rgba(255, 255, 255, 0.34), transparent 46%);
  filter: blur(22px);
}

[data-scene='bubbles'] .scene-particle {
  animation-name: scene-bubble-rise;
  animation-timing-function: cubic-bezier(0.4, 0.02, 0.62, 1);
  bottom: calc(var(--scene-size) * -1.6);
  height: var(--scene-size);
  width: var(--scene-size);
}

/* A white bubble on a pale background is invisible, so the rim and the shadow both carry
   the theme accent: light catches the top-left, the accent pools at the bottom-right. */
[data-scene='bubbles'] .scene-particle::before {
  animation-name: scene-bubble-wobble;
  background: radial-gradient(circle at 31% 24%, rgba(255, 255, 255, 0.98) 0 7%, rgba(255, 255, 255, 0.32) 21%, rgba(var(--accent-rgb, 31, 181, 174), 0.17) 54%, rgba(var(--accent-rgb, 31, 181, 174), 0.06) 71%, transparent 78%);
  border: 1px solid rgba(255, 255, 255, 0.92);
  border-radius: 50%;
  box-shadow:
    inset -5px -7px 14px rgba(var(--accent-rgb, 18, 126, 129), 0.34),
    inset 5px 6px 11px rgba(255, 255, 255, 0.62),
    0 5px 18px rgba(var(--accent-rgb, 54, 154, 158), 0.3);
}

/* Winter: glyphs are transparent; no raster snowflake or white image backing is used. */
/* Winter ships no texture, so the sky itself has to give the flakes something to sit on:
   a cold band down from the top, warm lamplight rising from the bottom corners. */
[data-scene='snow'] .scene-atmosphere {
  animation: scene-winter-glow 9s ease-in-out infinite alternate;
  background:
    linear-gradient(180deg, rgba(104, 142, 194, 0.78) 14%, rgba(158, 190, 226, 0.34) 42%, transparent 70%),
    radial-gradient(circle at 52% 14%, rgba(255, 224, 174, 0.42), transparent 26%),
    radial-gradient(ellipse at 14% 74%, rgba(var(--accent-rgb, 217, 119, 69), 0.34), transparent 30%),
    radial-gradient(ellipse at 86% 77%, rgba(255, 206, 140, 0.32), transparent 26%);
}

[data-scene='snow'] .scene-aura {
  animation: scene-frost-breathe 14s ease-in-out infinite alternate;
  background:
    radial-gradient(ellipse at 82% 88%, rgba(255, 236, 208, 0.24), transparent 30%),
    linear-gradient(178deg, rgba(206, 227, 245, 0.32) 0%, transparent 42%);
  filter: blur(16px);
}

[data-scene='snow'] .scene-particle {
  animation-name: scene-snow-fall;
  height: var(--scene-size);
  top: calc(var(--scene-size) * -2.4);
  width: var(--scene-size);
}

[data-scene='snow'] .scene-particle::before {
  animation-name: scene-snow-sway;
  color: #ffffff;
  content: '❄';
  filter: drop-shadow(0 1px 3px rgba(44, 72, 110, 0.55));
  font-size: var(--scene-size);
  line-height: 1;
  text-align: center;
}

[data-scene='snow'] .variant-1::before {
  content: '✦';
  opacity: 0.76;
}

/* Distant flakes read better as soft grains than as tiny unreadable glyphs. */
[data-scene='snow'] .variant-3::before {
  background: radial-gradient(circle at 38% 32%, #fff 0 40%, rgba(255, 255, 255, 0.42) 68%, transparent 100%);
  border-radius: 50%;
  content: '';
  filter: blur(0.4px);
  inset: 18%;
}

/* Green leaves use generated leaf shapes, so edges stay transparent at every size. */
[data-scene='leaves'] .scene-atmosphere {
  animation: scene-leaf-light 10s ease-in-out infinite alternate;
  background:
    radial-gradient(ellipse at 22% 8%, rgba(245, 255, 210, 0.5), transparent 36%),
    radial-gradient(circle at 68% 34%, rgba(var(--accent-rgb, 47, 133, 90), 0.18), transparent 26%);
  filter: blur(12px);
}

[data-scene='leaves'] .scene-aura {
  animation: scene-dapple 15s ease-in-out infinite alternate;
  background:
    radial-gradient(circle at 44% 62%, rgba(255, 252, 214, 0.32), transparent 16%),
    radial-gradient(circle at 78% 76%, rgba(255, 250, 208, 0.26), transparent 13%),
    radial-gradient(circle at 16% 48%, rgba(255, 252, 220, 0.22), transparent 12%);
  filter: blur(20px);
}

[data-scene='leaves'] .scene-particle {
  animation-name: scene-leaf-fall;
  height: var(--scene-size);
  perspective: 340px;
  top: calc(var(--scene-size) * -2);
  width: var(--scene-size);
}

[data-scene='leaves'] .scene-particle::before {
  animation-name: scene-leaf-flutter;
  background:
    linear-gradient(135deg, transparent 45%, rgba(255, 255, 255, 0.4) 48%, transparent 51%),
    linear-gradient(135deg, #c3e29a 0%, #6cb075 46%, #2c7c52 100%);
  border-radius: 100% 0 100% 0;
  box-shadow: inset 1px 1px 0 rgba(255, 255, 255, 0.36), 0 6px 12px rgba(31, 82, 52, 0.22);
}

[data-scene='leaves'] .variant-1::before {
  background:
    linear-gradient(135deg, transparent 45%, rgba(255, 255, 255, 0.32) 48%, transparent 51%),
    linear-gradient(135deg, #e7bb72 0%, #c07a48 52%, #7f4936 100%);
}

[data-scene='leaves'] .variant-3::before {
  background:
    linear-gradient(135deg, transparent 45%, rgba(255, 255, 255, 0.34) 48%, transparent 51%),
    linear-gradient(135deg, #d7e79c 0%, #93bb63 50%, #4e8a44 100%);
  border-radius: 100% 12% 100% 12%;
}

/* Night: three star depths twinkle out of sync while meteors cross a slowly drifting sky. */
[data-scene='stars'] .scene-atmosphere {
  animation: scene-aurora 13s ease-in-out infinite alternate;
  background:
    radial-gradient(ellipse at 20% 32%, rgba(92, 119, 214, 0.38), transparent 30%),
    radial-gradient(ellipse at 76% 18%, rgba(var(--accent-rgb, 216, 164, 109), 0.22), transparent 26%);
  filter: blur(24px);
}

[data-scene='stars'] .scene-aura {
  animation: scene-nebula 22s ease-in-out infinite alternate;
  background:
    radial-gradient(ellipse at 58% 74%, rgba(126, 92, 190, 0.26), transparent 32%),
    radial-gradient(ellipse at 34% 88%, rgba(64, 122, 168, 0.22), transparent 28%);
  filter: blur(34px);
}

[data-scene='stars'] .scene-particle {
  animation-name: scene-star-twinkle;
  animation-timing-function: ease-in-out;
  height: var(--scene-size);
  top: var(--scene-y);
  width: var(--scene-size);
}

[data-scene='stars'] .scene-particle::before {
  animation: none;
  background: #fff8e2;
  border-radius: 50%;
  box-shadow: 0 0 calc(var(--scene-size) * 3) rgba(255, 231, 164, 0.9);
}

[data-scene='stars'] .variant-2::before {
  background: #dce8ff;
  box-shadow: 0 0 calc(var(--scene-size) * 3.4) rgba(180, 205, 255, 0.85);
}

/* Only the brightest layer gets a lens flare, otherwise the sky turns into a grid. */
[data-scene='stars'] .variant-0::after {
  animation: scene-star-flare 7s var(--scene-sway-delay) ease-in-out infinite;
  background: linear-gradient(90deg, transparent, rgba(255, 247, 214, 0.8), transparent);
  content: '';
  height: 1px;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: calc(var(--scene-size) * 8);
}

.scene-streak {
  animation: scene-shooting-star var(--scene-duration, 12s) var(--scene-delay) ease-in infinite;
  background: linear-gradient(90deg, rgba(255, 247, 214, 0) 0%, rgba(255, 247, 214, 0.72) 74%, #fffdf4 100%);
  border-radius: 999px;
  filter: drop-shadow(0 0 6px rgba(255, 236, 180, 0.75));
  height: 2px;
  left: var(--scene-x);
  opacity: 0;
  top: var(--scene-y);
  transform-origin: right center;
  width: var(--scene-length, 160px);
}

/* Clear day: discrete god rays sweep at their own pace while dust drifts through them. */
[data-scene='sunbeams'] .scene-atmosphere {
  animation: scene-sun-bloom 9s ease-in-out infinite alternate;
  background: radial-gradient(circle at 6% -6%, rgba(255, 246, 190, 0.6), rgba(255, 238, 170, 0.22) 22%, transparent 44%);
  filter: blur(12px);
}

[data-scene='sunbeams'] .scene-aura {
  animation: scene-haze 18s ease-in-out infinite alternate;
  background: linear-gradient(122deg, transparent 26%, rgba(255, 250, 214, 0.24) 48%, transparent 74%);
  filter: blur(26px);
}

/* No screen blend: on a light page it collapses to white and the rays vanish. A warm amber
   wash at a real alpha is what actually reads as sunlight cutting through the air. */
.scene-beam {
  animation: scene-beam-sweep var(--scene-duration, 15s) var(--scene-delay) ease-in-out infinite alternate;
  background: linear-gradient(to bottom, rgba(255, 233, 163, var(--beam-alpha, 0.5)) 0%, rgba(255, 226, 152, 0.26) 42%, rgba(255, 232, 176, 0.08) 66%, transparent 86%);
  filter: blur(var(--beam-blur, 8px));
  height: 165vh;
  left: var(--scene-x);
  top: -30vh;
  transform-origin: top center;
  width: var(--beam-width, 90px);
}

[data-scene='sunbeams'] .scene-particle {
  animation-name: scene-dust-float;
  bottom: -10vh;
  height: var(--scene-size);
  width: var(--scene-size);
}

[data-scene='sunbeams'] .scene-particle::before {
  animation-name: scene-dust-shimmer;
  background: rgba(255, 226, 150, 0.95);
  border-radius: 50%;
  box-shadow: 0 0 10px rgba(248, 190, 92, 0.85);
}

/* Rain lines, ripples, and glass droplets are all generated with CSS and stay transparent. */
[data-scene='rain'] .scene-atmosphere {
  animation: scene-rain-mist 8s ease-in-out infinite alternate;
  background: linear-gradient(110deg, transparent 18%, rgba(221, 246, 249, 0.28), transparent 74%);
  filter: blur(20px);
}

[data-scene='rain'] .scene-aura {
  animation: scene-rain-sheet 5.5s linear infinite;
  background: repeating-linear-gradient(99deg, transparent 0 26px, rgba(232, 250, 252, 0.1) 28px 30px, transparent 32px 66px);
  filter: blur(3px);
}

[data-scene='rain'] .scene-particle {
  animation-name: scene-rain-drop;
  height: var(--scene-size);
  top: calc(-8vh - var(--scene-size));
  width: calc(0.8px + var(--scene-depth, 0.5) * 1.4px);
}

/* Real rain over a pale sky is a dark streak with a bright head, not a white scratch. */
[data-scene='rain'] .scene-particle::before {
  animation: none;
  background: linear-gradient(180deg, rgba(92, 128, 138, 0) 0%, rgba(92, 128, 138, 0.45) 58%, rgba(242, 253, 255, 0.95) 100%);
  border-radius: 999px;
}

.scene-ripple {
  animation: scene-ripple var(--scene-duration, 5s) var(--scene-delay) ease-out infinite;
  border: 1px solid rgba(225, 248, 249, 0.6);
  border-radius: 50%;
  bottom: var(--scene-bottom, 4%);
  height: 13px;
  left: var(--scene-x);
  opacity: 0;
  width: 56px;
}

.scene-ripple::before {
  animation: scene-ripple-inner var(--scene-duration, 5s) var(--scene-delay) ease-out infinite;
  border: 1px solid rgba(225, 248, 249, 0.42);
  border-radius: 50%;
  content: '';
  inset: 18%;
  opacity: 0;
}

.scene-drip {
  animation: scene-drip-slide var(--scene-duration, 14s) var(--scene-delay) cubic-bezier(0.55, 0, 0.86, 0.36) infinite;
  background: radial-gradient(circle at 36% 28%, rgba(255, 255, 255, 0.92) 0 16%, rgba(224, 246, 250, 0.55) 46%, rgba(158, 196, 204, 0.24) 78%, transparent 100%);
  border: 1px solid rgba(255, 255, 255, 0.55);
  border-radius: 52% 48% 44% 56% / 60% 58% 42% 40%;
  box-shadow:
    0 2px 6px rgba(52, 84, 92, 0.32),
    0 -8px 0 -2px rgba(232, 250, 252, 0.42),
    0 -17px 0 -3px rgba(232, 250, 252, 0.3),
    0 -28px 0 -4px rgba(232, 250, 252, 0.2);
  height: var(--scene-size, 8px);
  left: var(--scene-x);
  opacity: 0;
  top: var(--scene-y);
  width: var(--scene-size, 8px);
}

.motion-float .scene-texture { animation: scene-texture-float 22s ease-in-out infinite alternate; }
.motion-shimmer .scene-texture { animation: scene-texture-shimmer 14s ease-in-out infinite alternate; }
.motion-breathe .scene-texture { animation: scene-texture-breathe 18s ease-in-out infinite alternate; }
.motion-rain .scene-texture { animation: scene-texture-rain 16s ease-in-out infinite alternate; }

@keyframes scene-enter {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes scene-texture-float {
  from { transform: translate3d(-1.6%, 1.1%, 0) scale(1.04) rotate(-0.3deg); }
  to { transform: translate3d(1.6%, -1.1%, 0) scale(1.1) rotate(0.3deg); }
}

@keyframes scene-texture-shimmer {
  from { filter: brightness(0.86) saturate(0.96); transform: scale(1.04); }
  to { filter: brightness(1.16) saturate(1.08); transform: scale(1.1); }
}

@keyframes scene-texture-breathe {
  from { filter: brightness(0.96); transform: translate3d(-1%, 1%, 0) scale(1.04); }
  to { filter: brightness(1.08); transform: translate3d(1%, -1%, 0) scale(1.1); }
}

@keyframes scene-texture-rain {
  from { transform: translate3d(0, -1.6%, 0) scale(1.05); }
  to { transform: translate3d(0, 1.6%, 0) scale(1.1); }
}

@keyframes scene-gust {
  from { transform: translate3d(-2.2vw, 0, 0) skewX(1.1deg); }
  to { transform: translate3d(2.2vw, 0, 0) skewX(-1.1deg); }
}

@keyframes scene-gust-rain {
  from { transform: translate3d(-1.2vw, 0, 0) skewX(0.6deg); }
  to { transform: translate3d(1.2vw, 0, 0) skewX(-0.6deg); }
}

@keyframes scene-sky-drift {
  from { transform: translate3d(-1.4vw, 0.7vh, 0) scale(1); }
  to { transform: translate3d(1.4vw, -0.7vh, 0) scale(1.03); }
}

@keyframes scene-bubble-rise {
  0% { opacity: 0; transform: translate3d(0, 0, 0) scale(0.55); }
  9% { opacity: var(--scene-fade, 0.7); }
  74% { opacity: var(--scene-fade, 0.7); }
  100% { opacity: 0; transform: translate3d(var(--scene-drift), -124vh, 0) scale(1.14); }
}

@keyframes scene-bubble-wobble {
  from { transform: translate3d(calc(var(--scene-sway) * -0.5), 0, 0) scale(0.96); }
  to { transform: translate3d(calc(var(--scene-sway) * 0.5), 0, 0) scale(1.04); }
}

@keyframes scene-caustics {
  from { transform: translate3d(-2%, 2%, 0) rotate(-2deg) scale(1.02); }
  to { transform: translate3d(3%, -2%, 0) rotate(2deg) scale(1.08); }
}

@keyframes scene-caustics-slow {
  from { opacity: calc(var(--theme-ambient-opacity, 0.4) * 0.4); transform: translate3d(3%, -1%, 0) scale(1.06); }
  to { opacity: calc(var(--theme-ambient-opacity, 0.4) * 0.85); transform: translate3d(-3%, 2%, 0) scale(1.02); }
}

@keyframes scene-snow-fall {
  0% { opacity: 0; transform: translate3d(0, 0, 0) rotate(var(--scene-rotate)); }
  8% { opacity: var(--scene-fade, 0.8); }
  90% { opacity: var(--scene-fade, 0.8); }
  100% { opacity: 0; transform: translate3d(var(--scene-drift), 120vh, 0) rotate(calc(var(--scene-rotate) + var(--scene-spin))); }
}

@keyframes scene-snow-sway {
  from { transform: translate3d(calc(var(--scene-sway) * -1), 0, 0); }
  to { transform: translate3d(var(--scene-sway), 0, 0); }
}

@keyframes scene-winter-glow {
  from { opacity: calc(var(--theme-ambient-opacity, 0.4) * 0.6); transform: translateX(-3%); }
  to { opacity: var(--theme-ambient-opacity, 0.4); transform: translateX(3%); }
}

@keyframes scene-frost-breathe {
  from { transform: translate3d(2%, 1%, 0) scale(1.02); }
  to { transform: translate3d(-2%, -1%, 0) scale(1.08); }
}

@keyframes scene-leaf-fall {
  0% { opacity: 0; transform: translate3d(0, 0, 0) rotate(var(--scene-rotate)); }
  10% { opacity: var(--scene-fade, 0.8); }
  88% { opacity: var(--scene-fade, 0.8); }
  100% { opacity: 0; transform: translate3d(var(--scene-drift), 122vh, 0) rotate(calc(var(--scene-rotate) + var(--scene-spin))); }
}

/* The leaf turns over as it falls instead of spinning flat like a sticker. */
@keyframes scene-leaf-flutter {
  from { transform: rotate3d(1, 0.65, 0.15, -68deg) scaleY(0.82); }
  to { transform: rotate3d(1, 0.65, 0.15, 76deg) scaleY(0.82); }
}

@keyframes scene-leaf-light {
  from { transform: translate3d(-3%, 2%, 0) scale(1); }
  to { transform: translate3d(4%, -2%, 0) scale(1.08); }
}

@keyframes scene-dapple {
  from { opacity: calc(var(--theme-ambient-opacity, 0.4) * 0.35); transform: translate3d(-2%, -1%, 0) scale(1.04); }
  to { opacity: calc(var(--theme-ambient-opacity, 0.4) * 0.8); transform: translate3d(3%, 2%, 0) scale(1); }
}

@keyframes scene-star-twinkle {
  0%, 100% { opacity: calc(var(--scene-fade, 0.8) * 0.2); transform: scale(0.58); }
  44% { opacity: var(--scene-fade, 0.8); transform: scale(1.38); }
  62% { opacity: calc(var(--scene-fade, 0.8) * 0.44); transform: scale(0.88); }
}

@keyframes scene-star-flare {
  0%, 100% { opacity: 0; transform: translate(-50%, -50%) scaleX(0.4); }
  46% { opacity: 0.85; transform: translate(-50%, -50%) scaleX(1); }
}

@keyframes scene-shooting-star {
  0%, 88% { opacity: 0; transform: rotate(24deg) translate3d(-10vw, 0, 0) scaleX(0.15); }
  90% { opacity: 0; transform: rotate(24deg) translate3d(-8vw, 0, 0) scaleX(0.3); }
  93% { opacity: 1; }
  100% { opacity: 0; transform: rotate(24deg) translate3d(42vw, 0, 0) scaleX(1); }
}

@keyframes scene-aurora {
  from { transform: translate3d(-3%, 2%, 0) rotate(-1deg) scale(1); }
  to { transform: translate3d(4%, -3%, 0) rotate(2deg) scale(1.08); }
}

@keyframes scene-nebula {
  from { opacity: calc(var(--theme-ambient-opacity, 0.4) * 0.35); transform: translate3d(3%, 1%, 0) rotate(1.5deg) scale(1.02); }
  to { opacity: calc(var(--theme-ambient-opacity, 0.4) * 0.78); transform: translate3d(-4%, -2%, 0) rotate(-1.5deg) scale(1.1); }
}

@keyframes scene-beam-sweep {
  from { opacity: 0.3; transform: rotate(calc(var(--beam-angle, 18deg) - 2.6deg)) scaleX(0.88); }
  to { opacity: 1; transform: rotate(calc(var(--beam-angle, 18deg) + 2.6deg)) scaleX(1.1); }
}

@keyframes scene-sun-bloom {
  from { opacity: calc(var(--theme-ambient-opacity, 0.4) * 0.6); transform: scale(1); }
  to { opacity: var(--theme-ambient-opacity, 0.4); transform: scale(1.08); }
}

@keyframes scene-haze {
  from { transform: translate3d(-4%, 0, 0) scale(1.02); }
  to { transform: translate3d(5%, 0, 0) scale(1.08); }
}

@keyframes scene-dust-float {
  0% { opacity: 0; transform: translate3d(0, 0, 0); }
  18% { opacity: var(--scene-fade, 0.7); }
  78% { opacity: var(--scene-fade, 0.7); }
  100% { opacity: 0; transform: translate3d(var(--scene-drift), -118vh, 0); }
}

@keyframes scene-dust-shimmer {
  from { opacity: 0.34; transform: translate3d(calc(var(--scene-sway) * -0.4), 0, 0) scale(0.68); }
  to { opacity: 1; transform: translate3d(calc(var(--scene-sway) * 0.4), 0, 0) scale(1.22); }
}

@keyframes scene-rain-drop {
  0% { opacity: 0; transform: translate3d(0, 0, 0) rotate(9deg); }
  9% { opacity: var(--scene-fade, 0.7); }
  100% { opacity: 0; transform: translate3d(-12vw, 132vh, 0) rotate(9deg); }
}

@keyframes scene-rain-mist {
  from { transform: translateX(-5%) scale(1.02); }
  to { transform: translateX(5%) scale(1.08); }
}

/* The sheet slides exactly one gradient period, so the loop has no visible seam. */
@keyframes scene-rain-sheet {
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(-10.4px, 65.2px, 0); }
}

@keyframes scene-ripple {
  0%, 62% { opacity: 0; transform: scale(0.18); }
  70% { opacity: 0.72; }
  100% { opacity: 0; transform: scale(2.5); }
}

@keyframes scene-ripple-inner {
  0%, 66% { opacity: 0; transform: scale(0.3); }
  74% { opacity: 0.5; }
  100% { opacity: 0; transform: scale(2.1); }
}

@keyframes scene-drip-slide {
  0% { opacity: 0; transform: translate3d(0, 0, 0) scale(0.5); }
  10% { opacity: 0.82; transform: translate3d(0, 4vh, 0) scale(1); }
  92% { opacity: 0.6; }
  100% { opacity: 0; transform: translate3d(var(--scene-sway, 8px), 116vh, 0) scale(1.08); }
}

@media (max-width: 640px) {
  .scene-particle:nth-of-type(n + 18) {
    display: none;
  }

  /* Beams and drips trail the particle spans, so count them with siblings, not nth-of-type. */
  .scene-beam ~ .scene-beam ~ .scene-beam,
  .scene-drip ~ .scene-drip ~ .scene-drip {
    display: none;
  }

  .scene-texture {
    opacity: var(--theme-scene-mobile-opacity, 0.13);
  }

  .scene-atmosphere,
  .scene-aura {
    opacity: var(--theme-ambient-mobile-opacity, 0.3);
  }

  .scene-vignette {
    opacity: calc(var(--theme-vignette-opacity, 0.42) * 0.7);
  }
}

@media (prefers-reduced-motion: reduce) {
  .scene-parallax,
  .scene-layer-particles {
    transform: none;
    transition: none;
  }

  .theme-scene,
  .theme-scene *,
  .theme-scene *::before,
  .theme-scene *::after {
    animation: none !important;
  }

  .scene-particle:nth-of-type(n + 10),
  .scene-beam ~ .scene-beam ~ .scene-beam,
  .scene-streak,
  .scene-ripple,
  .scene-drip {
    display: none;
  }

  .scene-texture,
  .scene-atmosphere,
  .scene-aura {
    transform: none;
  }

  .scene-particle {
    opacity: calc(var(--scene-fade, 0.6) * 0.5);
  }
}
</style>
