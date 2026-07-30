import type { Particle } from './sceneParticles';

/**
 * Snow crystals. A flake is drawn as six arms around a hexagonal core rather than a filled
 * circle, because a white dot at any size reads as a bubble instead of snow.
 */

/** Cool white through pale blue-white to a faint silver-grey. */
export const SNOW_TINTS = ['#f4f9ff', '#e2ecfb', '#dbe4ef', '#c9d3e0'];

/** Six-fold symmetry: the arm count is what makes a snowflake read as a snowflake. */
export const SNOW_ARMS = 6;

export type SnowStyle = 'dendrite' | 'star' | 'plate';

export type SnowShape = {
  radius: number;
  style: SnowStyle;
  tint: string;
  alpha: number;
  lineWidth: number;
  /** Fraction of the arm length the side branches reach. */
  branchReach: number;
  /** Angle of the side branches away from the arm, in radians. */
  branchAngle: number;
  blur: number;
};

/**
 * Everything about how one flake looks, derived from its own values so size, shape, opacity and
 * brightness all vary independently from flake to flake.
 *
 * Distant flakes drop to the simpler outlines — a plain six-arm star or a hexagonal plate — but
 * never to a circle, so even the far layer still reads as snow.
 */
/**
 * A stable pseudo-random in [0, 1) for this flake, mixed from several of its flight values.
 *
 * `variant` is not used on its own: it is drawn from the same PRNG stream as `depth`, a fixed
 * number of draws apart, so the two correlate — leaning on it tied the crystal style and tint to
 * how far away a flake happened to be, and pushed the plate share well past its intended share.
 */
export function snowRoll(particle: Particle, salt: number): number {
  const mixed = Math.sin(
    particle.phase * 12.9898 + particle.driftBias * 78.233 + particle.swayRate * 37.719 + salt,
  ) * 43758.5453;
  return mixed - Math.floor(mixed);
}

export function snowShape(particle: Particle): SnowShape {
  const styleRoll = snowRoll(particle, 1.7);
  const tintRoll = snowRoll(particle, 5.3);
  const jitterA = snowRoll(particle, 9.1);
  const jitterB = snowRoll(particle, 14.6);
  const radius = particle.size;

  // Only the nearer half of the field earns the branched crystal; further back the branches
  // would be sub-pixel anyway. The plate is kept to a minority in both layers: at small sizes a
  // hexagon outline starts to read as a ring, which is the one thing snow must not look like.
  const style: SnowStyle = particle.depth > 0.55
    ? (styleRoll < 0.18 ? 'plate' : 'dendrite')
    : (styleRoll < 0.2 ? 'plate' : 'star');

  return {
    radius,
    style,
    tint: SNOW_TINTS[Math.min(SNOW_TINTS.length - 1, Math.floor(tintRoll * SNOW_TINTS.length))],
    // Translucent throughout, and fainter with distance.
    alpha: (0.3 + 0.45 * particle.depth) * (0.75 + jitterA * 0.25),
    lineWidth: Math.max(0.6, radius * (0.1 + jitterB * 0.07)),
    branchReach: 0.3 + jitterA * 0.18,
    branchAngle: 0.75 + jitterB * 0.45,
    // Only a few of the closest flakes are softened, which is what gives the field depth
    // without smearing the whole scene.
    blur: particle.depth > 0.88 ? 0.6 + (particle.depth - 0.88) * 12 : 0,
  };
}

/** Traces the six arms with their side branches. Caller owns stroke style and transform. */
function traceArms(ctx: CanvasRenderingContext2D, shape: SnowShape, branched: boolean): void {
  const { radius, branchReach, branchAngle } = shape;
  for (let arm = 0; arm < SNOW_ARMS; arm += 1) {
    const angle = (arm / SNOW_ARMS) * Math.PI * 2;
    const tipX = Math.cos(angle) * radius;
    const tipY = Math.sin(angle) * radius;
    ctx.moveTo(0, 0);
    ctx.lineTo(tipX, tipY);
    if (!branched) continue;

    // Two pairs of branches per arm, the outer pair shorter than the inner one.
    for (const [along, scale] of [[0.45, 1], [0.72, 0.66]] as const) {
      const baseX = Math.cos(angle) * radius * along;
      const baseY = Math.sin(angle) * radius * along;
      const reach = radius * branchReach * scale;
      for (const side of [1, -1]) {
        const branch = angle + side * branchAngle;
        ctx.moveTo(baseX, baseY);
        ctx.lineTo(baseX + Math.cos(branch) * reach, baseY + Math.sin(branch) * reach);
      }
    }
  }
}

/** Traces a hexagon of the given radius. */
function traceHexagon(ctx: CanvasRenderingContext2D, radius: number): void {
  for (let corner = 0; corner < SNOW_ARMS; corner += 1) {
    const angle = (corner / SNOW_ARMS) * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    if (corner === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

/** Draws one snowflake at its own position, size and rotation. */
export function drawSnowflake(ctx: CanvasRenderingContext2D, particle: Particle): void {
  const shape = snowShape(particle);

  ctx.save();
  ctx.translate(particle.x, particle.y);
  ctx.rotate(particle.rotation);
  if (shape.blur > 0) ctx.filter = `blur(${shape.blur.toFixed(2)}px)`;
  ctx.globalAlpha = shape.alpha;
  ctx.strokeStyle = shape.tint;
  ctx.fillStyle = shape.tint;
  ctx.lineWidth = shape.lineWidth;
  ctx.lineCap = 'round';

  if (shape.style === 'plate') {
    // A hexagonal plate. The spokes out to its corners are what stop the outline reading as a
    // plain ring — a bare hexagon at a few pixels across looks like a bubble.
    ctx.beginPath();
    traceHexagon(ctx, shape.radius * 0.82);
    ctx.stroke();
    ctx.globalAlpha *= 0.6;
    ctx.beginPath();
    for (let corner = 0; corner < SNOW_ARMS; corner += 1) {
      const angle = (corner / SNOW_ARMS) * Math.PI * 2;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(angle) * shape.radius * 0.78, Math.sin(angle) * shape.radius * 0.78);
    }
    ctx.stroke();
  } else {
    ctx.beginPath();
    traceArms(ctx, shape, shape.style === 'dendrite');
    ctx.stroke();
    // Small solid core, so the centre of the crystal catches the light.
    ctx.globalAlpha *= 0.8;
    ctx.beginPath();
    traceHexagon(ctx, Math.max(0.5, shape.radius * 0.16));
    ctx.fill();
  }

  ctx.filter = 'none';
  ctx.restore();
  ctx.globalAlpha = 1;
}
