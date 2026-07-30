<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { PublicTheme } from '@/utils/themes';
import type { ResolvedColorMode } from '@/utils/colorMode';
import {
  createField,
  createLedge,
  intensityEnvelope,
  stepField,
  createRandom,
  type Field,
  type Ledge,
  type SceneKind,
} from '@/utils/sceneParticles';
import { drawLeaf } from '@/utils/sceneLeaf';
import { drawSnowflake } from '@/utils/sceneSnow';

const props = withDefaults(defineProps<{ theme?: PublicTheme; intensity?: number; mode?: ResolvedColorMode }>(), {
  intensity: 100,
  mode: 'light',
});

// 0-100 dial persisted in settings.theme.sceneIntensity; 100 keeps each theme's tuned look.
const intensityRatio = computed(() => Math.min(100, Math.max(0, Math.round(props.intensity))) / 100);
const modeMultiplier = computed(() => {
  if (props.mode !== 'dark') return 1;
  return props.theme?.scene.kind === 'stars' || props.theme?.scene.kind === 'snow' ? 0.92 : 0.72;
});

// The particle field is sized by the dial as well; `visibleParticles` is what actually renders.
const visibleParticles = ref(0);

const sceneStyle = computed<Record<string, string>>(() => {
  const opacity = (props.theme?.scene.opacity ?? 0) * intensityRatio.value * modeMultiplier.value;
  return {
    '--theme-scene-opacity': String(opacity),
    '--theme-scene-mobile-opacity': String(opacity * 0.72),
    '--theme-ambient-opacity': String(Math.min(0.72, opacity * 2.2)),
    '--theme-ambient-mobile-opacity': String(Math.min(0.54, opacity * 1.7)),
    '--theme-particle-alpha': (0.35 + 0.65 * intensityRatio.value).toFixed(2),
    '--theme-vignette-opacity': (0.42 * intensityRatio.value).toFixed(2),
  };
});

const canvas = ref<HTMLCanvasElement | null>(null);
const paused = ref(false);

let context: CanvasRenderingContext2D | null = null;
let field: Field | null = null;
let random = createRandom(1);
let frame = 0;
let lastTime = 0;
let ledgeTimer = 0;
let reducedMotion = false;
let ledgeMeasureFrame = 0;

const MAX_SCENE_CANVAS_PIXELS = 8_000_000;

// Surfaces are keyed by folder id so water already beaded on a border survives a re-measure
// (scroll, resize, a card animating in) instead of resetting every time the layout is sampled.
const ledgeCache = new Map<string, Ledge>();

/** A width change smaller than this reuses the cached surface rather than rebuilding it. */
const LEDGE_WIDTH_TOLERANCE = 8;
let ledges: Ledge[] = [];

/**
 * Everything rain can run off. Deliberately NOT the folder card root: its top edge is the
 * floating title, so water would collect above the folder label. The marker sits on the glass
 * content panel instead, plus the tab strip.
 */
const COLLIDER_SELECTOR = '[data-scene-collider-id]';

const PALETTE: Record<SceneKind, { body: string; accent: string; glow: string }> = {
  rain: { body: 'rgba(92, 128, 138, 0.55)', accent: 'rgba(126, 158, 170, 0.5)', glow: 'rgba(150, 180, 192, 0.42)' },
  snow: { body: '#ffffff', accent: 'rgba(226, 240, 255, 0.95)', glow: 'rgba(44, 72, 110, 0.35)' },
  leaves: { body: '#6cb075', accent: '#c07a48', glow: 'rgba(31, 82, 52, 0.28)' },
  bubbles: { body: 'rgba(255, 255, 255, 0.9)', accent: 'rgba(11, 125, 128, 0.35)', glow: 'rgba(11, 125, 128, 0.22)' },
  stars: { body: '#fff8e2', accent: '#dce8ff', glow: 'rgba(255, 231, 164, 0.9)' },
  sunbeams: { body: 'rgba(255, 226, 150, 0.95)', accent: 'rgba(248, 190, 92, 0.85)', glow: 'rgba(248, 190, 92, 0.6)' },
};

function measureLedges() {
  if (typeof document === 'undefined') return;
  const kind = props.theme?.scene.kind;
  // Rain is the only scene that collides, so no other scene pays to sample the page.
  if (kind !== 'rain') {
    ledges = [];
    return;
  }
  const seen = new Set<string>();
  const next: Ledge[] = [];
  for (const element of document.querySelectorAll<HTMLElement>(COLLIDER_SELECTOR)) {
    const rect = element.getBoundingClientRect();
    if (rect.width < 40 || rect.bottom < 0 || rect.top > window.innerHeight) continue;
    const id = element.dataset.sceneColliderId || '';
    if (!id) continue;
    seen.add(id);
    const cached = ledgeCache.get(id);
    if (cached && Math.abs(cached.width - rect.width) < LEDGE_WIDTH_TOLERANCE) {
      cached.x = rect.left;
      cached.y = rect.top;
      cached.height = rect.height;
      next.push(cached);
      continue;
    }
    const ledge = createLedge(id, rect.left, rect.top, rect.width, rect.height);
    ledgeCache.set(id, ledge);
    next.push(ledge);
  }
  for (const id of [...ledgeCache.keys()]) {
    if (!seen.has(id)) ledgeCache.delete(id);
  }
  ledges = next;
}

function scheduleMeasureLedges() {
  if (ledgeMeasureFrame) return;
  ledgeMeasureFrame = requestAnimationFrame(() => {
    ledgeMeasureFrame = 0;
    measureLedges();
  });
}

function resize() {
  const element = canvas.value;
  if (!element) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  const pixelBudgetRatio = Math.sqrt(MAX_SCENE_CANVAS_PIXELS / Math.max(1, width * height));
  const ratio = Math.min(2, window.devicePixelRatio || 1, pixelBudgetRatio);
  element.width = Math.floor(width * ratio);
  element.height = Math.floor(height * ratio);
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  context = element.getContext('2d');
  context?.setTransform(ratio, 0, 0, ratio, 0, 0);
  if (field) {
    field.width = width;
    field.height = height;
  }
  measureLedges();
}

/** Draws the water rain leaves behind: beads on a top border and drops hanging from an eave. */
function drawLedgeWater(ctx: CanvasRenderingContext2D, kind: SceneKind) {
  if (kind !== 'rain') return;
  const palette = PALETTE[kind];

  {
    // Beads on the top border, plus whatever is hanging from the eave below. Both are drawn as
    // translucent blue-grey water with one small highlight, not opaque white spheres.
    for (const ledge of ledges) {
      for (const bead of ledge.beads) {
        const remaining = Math.max(0, 1 - bead.age / bead.life);
        // Fades in as it lands and out as it dries, so nothing pops.
        const alpha = Math.min(1, bead.age * 6) * (0.35 + 0.55 * remaining);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = palette.accent;
        ctx.beginPath();
        ctx.ellipse(bead.x, ledge.y - bead.size * bead.squash * 0.6, bead.size, bead.size * bead.squash, 0, 0, Math.PI * 2);
        ctx.fill();
        // A single off-centre glint is enough to read as water.
        ctx.globalAlpha = alpha * 0.5;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.beginPath();
        ctx.ellipse(bead.x - bead.size * 0.3, ledge.y - bead.size * bead.squash, bead.size * 0.26, bead.size * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      for (const drop of ledge.hanging) {
        // Wobble and stretch grow with the drop, so it visibly strains before letting go.
        const ripeness = Math.min(1, drop.size / drop.detachAt);
        const wobble = Math.sin(drop.age * 7 + drop.phase) * ripeness * 1.4;
        const neckY = ledge.y + ledge.height;
        const bellyY = neckY + drop.size * (0.9 + ripeness * 0.8);
        const radius = drop.size * 0.85;
        ctx.globalAlpha = 0.55 + 0.25 * ripeness;
        ctx.fillStyle = palette.accent;
        // Teardrop: a narrow neck at the border widening into a belly below.
        ctx.beginPath();
        ctx.moveTo(drop.x - radius * 0.35 + wobble * 0.4, neckY);
        ctx.quadraticCurveTo(drop.x - radius + wobble, bellyY - radius * 0.5, drop.x + wobble, bellyY);
        ctx.quadraticCurveTo(drop.x + radius + wobble, bellyY - radius * 0.5, drop.x + radius * 0.35 + wobble * 0.4, neckY);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.beginPath();
        ctx.ellipse(drop.x - radius * 0.28 + wobble, bellyY - radius * 0.35, radius * 0.2, radius * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    return;
  }

}

function drawParticle(ctx: CanvasRenderingContext2D, kind: SceneKind, particle: Field['particles'][number], time: number) {
  const palette = PALETTE[kind];
  const fade = 0.3 + 0.7 * particle.depth;

  if (kind === 'rain') {
    // Streaks are drawn along the velocity vector, so wind visibly slants the rain.
    // Each layer crossed costs opacity as well as size, so deeper rain reads as spent.
    const spent = 1 / (1 + particle.passes * 0.45);
    const speed = Math.hypot(particle.vx, particle.vy) || 1;
    const length = particle.size;
    ctx.strokeStyle = palette.body;
    ctx.lineWidth = 0.7 + particle.depth * 1.1;
    ctx.globalAlpha = fade * spent;
    ctx.beginPath();
    ctx.moveTo(particle.x, particle.y);
    ctx.lineTo(particle.x - (particle.vx / speed) * length, particle.y - (particle.vy / speed) * length);
    ctx.stroke();
    // A slightly fatter, rounded head sells the teardrop without a bright white block.
    const headRadius = 0.55 + particle.depth * 0.75;
    ctx.globalAlpha = fade * spent * 0.75;
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.ellipse(particle.x, particle.y - headRadius, headRadius * 0.85, headRadius * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (kind === 'snow') {
    drawSnowflake(ctx, particle);
    return;
  }

  if (kind === 'leaves') {
    drawLeaf(ctx, particle);
    return;
  }

  if (kind === 'bubbles') {
    ctx.globalAlpha = fade * 0.85;
    ctx.strokeStyle = palette.body;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = palette.accent;
    ctx.globalAlpha = fade * 0.3;
    ctx.fill();
    ctx.globalAlpha = fade * 0.9;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.beginPath();
    ctx.arc(particle.x - particle.size * 0.3, particle.y - particle.size * 0.34, particle.size * 0.18, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  if (kind === 'stars') {
    const twinkle = 0.35 + 0.65 * Math.abs(Math.sin(time * (0.5 + particle.depth) + particle.rotation));
    ctx.globalAlpha = fade * twinkle;
    ctx.fillStyle = particle.variant === 2 ? palette.accent : palette.body;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
    ctx.fill();
    if (particle.depth > 0.82) {
      ctx.globalAlpha = fade * twinkle * 0.5;
      ctx.fillRect(particle.x - particle.size * 4, particle.y - 0.4, particle.size * 8, 0.8);
    }
    return;
  }

  // sunbeams: dust motes catching the light
  const shimmer = 0.4 + 0.6 * Math.abs(Math.sin(time * 0.8 + particle.rotation));
  ctx.globalAlpha = fade * shimmer;
  ctx.fillStyle = palette.body;
  ctx.beginPath();
  ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
  ctx.fill();
}

function render(time: number) {
  frame = requestAnimationFrame(render);
  const ctx = context;
  const kind = props.theme?.scene.kind;
  if (!ctx || !field || !kind || paused.value) {
    lastTime = time;
    return;
  }

  // Clamp so a backgrounded tab or a long paint does not teleport every particle.
  const delta = Math.min(0.05, Math.max(0, (time - lastTime) / 1000));
  lastTime = time;
  if (delta <= 0) return;

  ledgeTimer += delta;
  if (ledgeTimer > 0.4) {
    ledgeTimer = 0;
    measureLedges();
  }

  stepField(field, { delta, ledges, intensity: intensityRatio.value, random });
  visibleParticles.value = field.particles.length;

  ctx.clearRect(0, 0, field.width, field.height);
  ctx.globalAlpha = 1;
  drawLedgeWater(ctx, kind);
  for (const particle of field.particles) drawParticle(ctx, kind, particle, field.time);

  if (field.bursts.length) {
    const palette = PALETTE[kind];
    if (kind === 'rain') {
      // Spray, not beads: short strokes along each fleck's own direction of travel.
      ctx.strokeStyle = palette.glow;
      ctx.lineWidth = 0.8;
      for (const burst of field.bursts) {
        const remaining = Math.max(0, 1 - burst.age / burst.life);
        const speed = Math.hypot(burst.vx, burst.vy) || 1;
        const length = Math.min(5, burst.size * 2.2 * remaining + 1);
        ctx.globalAlpha = remaining * 0.55;
        ctx.beginPath();
        ctx.moveTo(burst.x, burst.y);
        ctx.lineTo(burst.x - (burst.vx / speed) * length, burst.y - (burst.vy / speed) * length);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = palette.glow;
      for (const burst of field.bursts) {
        ctx.globalAlpha = Math.max(0, 1 - burst.age / burst.life) * 0.8;
        ctx.beginPath();
        ctx.arc(burst.x, burst.y, burst.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
}

function startField() {
  const kind = props.theme?.scene.kind;
  if (!kind || typeof window === 'undefined') return;
  field = createField(kind, window.innerWidth, window.innerHeight, 1);
  random = createRandom(0x9e3779b9);
  ledgeCache.clear();
  measureLedges();
}

function onVisibilityChange() {
  paused.value = document.visibilityState === 'hidden';
}

// The texture leans a few pixels against the pointer for depth. Fine hover pointers only,
// and never under reduced motion.
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
  if (typeof window === 'undefined') return;
  reducedMotion = typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  paused.value = document.visibilityState === 'hidden';
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('scroll', scheduleMeasureLedges, { passive: true });
  parallaxEnabled.value = supportsParallax();
  if (parallaxEnabled.value) window.addEventListener('pointermove', onPointerMove, { passive: true });

  resize();
  startField();
  // Reduced motion keeps the still texture and skips the simulation entirely.
  if (!reducedMotion) frame = requestAnimationFrame(render);
});

onBeforeUnmount(() => {
  if (typeof window === 'undefined') return;
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('resize', resize);
  window.removeEventListener('scroll', scheduleMeasureLedges);
  if (parallaxEnabled.value) window.removeEventListener('pointermove', onPointerMove);
  if (frame) cancelAnimationFrame(frame);
  if (parallaxFrame) cancelAnimationFrame(parallaxFrame);
  if (ledgeMeasureFrame) cancelAnimationFrame(ledgeMeasureFrame);
});

watch(() => props.theme?.scene.kind, () => {
  resize();
  startField();
}, { flush: 'post' });

defineExpose({ intensityRatio, visibleParticles, intensityEnvelope });
</script>

<template>
  <div
    v-if="theme"
    class="theme-scene"
    :class="[`scene-${theme.scene.kind}`, { 'is-paused': paused }]"
    :data-scene="theme.scene.kind"
    :data-color-mode="mode"
    :style="[sceneStyle, parallaxStyle]"
    data-testid="theme-scene"
    aria-hidden="true"
  >
    <!-- No background imagery: a plain tinted wash keeps the page clean and lets the
         particles carry the whole effect. -->
    <div class="scene-parallax">
      <span class="scene-atmosphere"></span>
    </div>
    <canvas ref="canvas" class="scene-canvas" data-testid="scene-canvas"></canvas>
    <span class="scene-vignette"></span>
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

/* Only the pointer parallax moves this layer; the texture itself has no keyframes. */
.scene-parallax {
  inset: 0;
  position: absolute;
  transform: translate3d(var(--scene-parallax-x, 0px), var(--scene-parallax-y, 0px), 0);
  transition: transform 0.28s cubic-bezier(0.22, 0.61, 0.36, 1);
}

/* Hidden tabs stop the simulation; this also freezes any transition still in flight. */
.theme-scene.is-paused *,
.theme-scene.is-paused *::before,
.theme-scene.is-paused *::after {
  animation-play-state: paused !important;
  transition: none !important;
}

.scene-atmosphere,
.scene-vignette,
.scene-canvas {
  display: block;
  position: absolute;
}

/* Static light wash: gives the scene depth without animating the background. */
.scene-atmosphere {
  inset: 0;
  opacity: var(--theme-ambient-opacity, 0.4);
}

/* One soft vertical wash per scene — no imagery, no stray radial blobs. */
[data-scene='bubbles'] .scene-atmosphere {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.34) 0%, transparent 58%);
}

[data-scene='snow'] .scene-atmosphere {
  background: linear-gradient(180deg, rgba(104, 142, 194, 0.62) 0%, rgba(158, 190, 226, 0.24) 38%, transparent 72%);
}

[data-scene='leaves'] .scene-atmosphere {
  background: linear-gradient(180deg, rgba(245, 255, 210, 0.36) 0%, transparent 56%);
}

[data-scene='stars'] .scene-atmosphere {
  background: linear-gradient(180deg, rgba(92, 119, 214, 0.26) 0%, transparent 62%);
}

[data-scene='sunbeams'] .scene-atmosphere {
  background: linear-gradient(180deg, rgba(255, 233, 163, 0.36) 0%, transparent 60%);
}

[data-scene='rain'] .scene-atmosphere {
  background: linear-gradient(180deg, rgba(221, 246, 249, 0.28) 0%, transparent 64%);
}

.scene-canvas {
  inset: 0;
  opacity: var(--theme-particle-alpha, 1);
}

/* Edge falloff pulls the eye to the middle of the page; tinted with the theme's own overlay. */
.scene-vignette {
  background: radial-gradient(ellipse at 50% 42%, transparent 38%, rgba(var(--public-overlay-rgb, 12, 20, 28), 0.3) 100%);
  inset: 0;
  opacity: var(--theme-vignette-opacity, 0.42);
}

@media (max-width: 640px) {
    .scene-atmosphere {
    opacity: var(--theme-ambient-mobile-opacity, 0.3);
  }

  .scene-vignette {
    opacity: calc(var(--theme-vignette-opacity, 0.42) * 0.7);
  }
}

@media (prefers-reduced-motion: reduce) {
  .scene-parallax {
    transform: none;
    transition: none;
  }

  /* The simulation never starts under reduced motion; hide the empty canvas too. */
  .scene-canvas {
    display: none;
  }
}
</style>
