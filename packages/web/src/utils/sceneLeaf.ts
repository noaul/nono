import type { Particle } from './sceneParticles';

/**
 * Leaf tints as [shadow, midtone, highlight]. Deep green through fresh and yellow-green, with
 * dry yellow kept to one variant so autumn stays an accent rather than the theme.
 */
export const LEAF_TINTS: Array<[string, string, string]> = [
  ['#2f6b45', '#4b9159', '#7fbe7c'],
  ['#3f8f52', '#63ad6a', '#9ad38c'],
  ['#6ba24a', '#8fbe5c', '#c3dd86'],
  ['#b08a2f', '#c9a640', '#e6cf7a'],
];

/** Points sampled along each side of the blade. Enough to read as a smooth curve at any size. */
const BLADE_SAMPLES = 16;

/**
 * Picks the tint. `variant` alone has four values, which would make dry yellow a quarter of the
 * canopy; requiring the right variant *and* the right jitter keeps it to roughly one leaf in
 * ten, so it reads as a seasonal accent.
 */
export function leafTint(particle: Particle): [string, string, string] {
  const dry = particle.variant % 4 === 3 && particle.phase % 1 > 0.6;
  return LEAF_TINTS[dry ? 3 : particle.variant % 3];
}

export type LeafShape = {
  length: number;
  width: number;
  /** Where along the blade it is widest: < 1 pushes it toward the base, > 1 toward the tip. */
  peak: number;
  /** How fast the blade closes at each end. Higher is a narrower shoulder and a finer point. */
  taper: number;
  /** The two halves are scaled differently, which is what makes the outline asymmetrical. */
  leftScale: number;
  rightScale: number;
  /** Sideways lean of the midrib, accumulating toward the tip. Signed, so leaves curve both ways. */
  lean: number;
};

/**
 * Per-leaf proportions, derived from the particle's own values so every outline differs. The
 * flight fields double as a jitter source: they are already randomised per leaf, so shape
 * variety comes free and stays stable for the life of the leaf.
 */
export function leafShape(particle: Particle): LeafShape {
  const jitterA = particle.phase % 1;
  const jitterB = (particle.swayRate * 0.37) % 1;
  const jitterC = Math.abs(particle.flipRate * 0.29) % 1;
  return {
    length: particle.size,
    width: particle.size * (0.28 + (particle.variant % 3) * 0.05 + jitterA * 0.11),
    peak: 0.6 + jitterB * 0.75,
    taper: 0.8 + jitterC * 0.45,
    leftScale: 0.74 + jitterC * 0.24,
    rightScale: 0.9 + jitterA * 0.2,
    lean: (jitterB - 0.5) * 0.55,
  };
}

/**
 * Half-width of the blade at `u`, measured from base (0) to tip (1). Zero at both ends, so the
 * outline closes to a point at the tip and at the stem no matter how the knobs are set.
 */
export function bladeHalfWidth(shape: LeafShape, u: number): number {
  const clamped = Math.min(1, Math.max(0, u));
  return shape.width * Math.sin(Math.PI * clamped ** shape.peak) ** shape.taper;
}

/** Midrib offset at `u`. The lean builds toward the tip rather than bending the base. */
export function midribOffset(shape: LeafShape, u: number): number {
  return shape.lean * shape.width * u ** 1.5;
}

function bladeY(shape: LeafShape, u: number): number {
  return shape.length * (0.5 - u);
}

/**
 * A leaf seen edge-on is nearly a line and catches little light; face-on it is at its widest
 * and brightest. This is what sells the tumble as rotation in three dimensions rather than a
 * sprite spinning in the plane of the screen.
 */
export function leafFacing(particle: Particle) {
  const facing = Math.abs(Math.cos(particle.flip));
  return { facing, squash: Math.max(0.12, facing), lit: 0.45 + 0.55 * facing };
}

/**
 * Draws one leaf at its own position and attitude. Everything is scaled from `size`, so the
 * same routine draws a distant speck and a foreground leaf.
 */
export function drawLeaf(ctx: CanvasRenderingContext2D, particle: Particle, blurScale = 1): void {
  const [shadow, mid, highlight] = leafTint(particle);
  const shape = leafShape(particle);
  const { length, width } = shape;
  const { facing, squash, lit } = leafFacing(particle);

  ctx.save();
  ctx.translate(particle.x, particle.y);
  ctx.rotate(particle.rotation);
  ctx.scale(squash, 1);
  // Nearby leaves get a touch of blur so the foreground layer reads as closer. A scale of 0
  // turns it off, which is what low-performance mode wants.
  const blur = particle.depth > 0.9 ? 1.1 * blurScale : 0;
  if (blur > 0.05) ctx.filter = `blur(${blur.toFixed(2)}px)`;
  // Translucent, so leaves never look like solid stickers.
  ctx.globalAlpha = (0.32 + 0.5 * particle.depth) * (0.75 + 0.25 * facing);

  // Blade: up one side from the stem to the tip, back down the other. The sides use different
  // scales, so the two halves of the outline do not mirror each other.
  ctx.beginPath();
  ctx.moveTo(midribOffset(shape, 0), bladeY(shape, 0));
  for (let index = 1; index <= BLADE_SAMPLES; index += 1) {
    const u = index / BLADE_SAMPLES;
    ctx.lineTo(midribOffset(shape, u) + bladeHalfWidth(shape, u) * shape.rightScale, bladeY(shape, u));
  }
  for (let index = BLADE_SAMPLES - 1; index >= 0; index -= 1) {
    const u = index / BLADE_SAMPLES;
    ctx.lineTo(midribOffset(shape, u) - bladeHalfWidth(shape, u) * shape.leftScale, bladeY(shape, u));
  }
  ctx.closePath();
  const gradient = ctx.createLinearGradient(-width, 0, width, 0);
  gradient.addColorStop(0, shadow);
  gradient.addColorStop(0.55, mid);
  gradient.addColorStop(1, highlight);
  ctx.fillStyle = gradient;
  ctx.fill();

  // Veins: one midrib, then a few short ribs angled toward the tip. Their ends are taken from
  // the same width envelope as the outline, so a vein can never poke outside the blade.
  ctx.globalAlpha *= 0.5 * lit;
  ctx.strokeStyle = shadow;
  ctx.lineWidth = Math.max(0.4, length * 0.026);
  ctx.beginPath();
  ctx.moveTo(midribOffset(shape, 0.02), bladeY(shape, 0.02));
  for (let index = 1; index <= 8; index += 1) {
    const u = 0.02 + (index / 8) * 0.94;
    ctx.lineTo(midribOffset(shape, u), bladeY(shape, u));
  }
  ctx.stroke();

  ctx.lineWidth = Math.max(0.3, length * 0.016);
  ctx.beginPath();
  for (const u of [0.24, 0.44, 0.64]) {
    const reach = u + 0.13;
    for (const [side, scale] of [[1, shape.rightScale], [-1, shape.leftScale]] as const) {
      ctx.moveTo(midribOffset(shape, u), bladeY(shape, u));
      ctx.lineTo(midribOffset(shape, reach) + side * bladeHalfWidth(shape, reach) * scale * 0.68, bladeY(shape, reach));
    }
  }
  ctx.stroke();

  // Short stem below the base.
  ctx.globalAlpha *= 1.4;
  ctx.lineWidth = Math.max(0.5, length * 0.032);
  ctx.beginPath();
  ctx.moveTo(0, length * 0.5);
  ctx.lineTo(-shape.lean * width * 0.3, length * 0.68);
  ctx.stroke();

  ctx.filter = 'none';
  ctx.restore();
  ctx.globalAlpha = 1;
}
