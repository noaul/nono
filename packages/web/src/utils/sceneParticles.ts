/**
 * Pure particle simulation for the theme scenes. No DOM, no canvas: ThemeScene.vue owns
 * rendering and feeds this module the viewport size and the folder ledges to collide with.
 * Keeping it pure is what makes the physics testable.
 */

export type SceneKind = 'bubbles' | 'snow' | 'leaves' | 'stars' | 'sunbeams' | 'rain';

/** A horizontal surface a particle can land on — in practice the top edge of a folder card. */
/** A leaf that has come to rest on a ledge, kept so it can be drawn as a leaf, not a ridge. */
export type RestedItem = {
  x: number;
  rotation: number;
  size: number;
  variant: number;
};

export type Ledge = {
  id: string;
  x: number;
  y: number;
  width: number;
  /** Needed for side hits: a particle can clip the flank of a card, not just its top. */
  height: number;
  /** Settled depth per bucket across the ledge, in pixels. Snow forms a continuous drift. */
  piles: Float32Array;
  /** Individual settled leaves; a ridge would not read as foliage. */
  rested: RestedItem[];
};

export type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  /** 0 = far (small, slow, faint), 1 = near. */
  depth: number;
  rotation: number;
  spin: number;
  /** Seconds lived; drives twinkle phase and fade-in. */
  age: number;
  /** Seconds before the particle is recycled. Infinity for endless fields like stars. */
  life: number;
  variant: number;
};

/** A short-lived splash or pop, spawned when a particle hits something. */
export type Burst = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
};

export type Field = {
  kind: SceneKind;
  particles: Particle[];
  bursts: Burst[];
  /** Seconds since the field was created; drives the intensity envelope. */
  time: number;
  width: number;
  height: number;
  seed: number;
};

/** Pixels per accumulation bucket. Narrow enough to read as a drift, wide enough to stay cheap. */
export const PILE_BUCKET = 8;

const GRAVITY: Record<SceneKind, number> = {
  rain: 1500,
  snow: 42,
  leaves: 58,
  bubbles: -95,
  sunbeams: -12,
  stars: 0,
};

const MAX_PILE: Record<SceneKind, number> = {
  rain: 0,
  snow: 14,
  leaves: 9,
  bubbles: 0,
  sunbeams: 0,
  stars: 0,
};

/** Particles that come to rest on ledges rather than passing through. */
export function settlesOnLedges(kind: SceneKind): boolean {
  return kind === 'snow' || kind === 'leaves';
}

export function splashesOnLedges(kind: SceneKind): boolean {
  return kind === 'rain';
}

/** Deterministic PRNG so a given seed always produces the same field (and the same test run). */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

function lerp(from: number, to: number, t: number) {
  return from + (to - from) * t;
}

/**
 * Slow multi-period envelope in [0.35, 1]. Two incommensurable periods mean the weather never
 * repeats on an obvious cycle: rain builds to a downpour, eases to a drizzle, and builds again.
 */
export function intensityEnvelope(time: number): number {
  const slow = Math.sin(time / 17);
  const slower = Math.sin(time / 41 + 1.7);
  return 0.675 + 0.325 * (slow * 0.6 + slower * 0.4);
}

/**
 * Particle size drifts too, so a squall brings visibly fatter drops. The period is short
 * enough (~2.5 min) that the change is noticeable within a single sitting, and the ±25% swing
 * is wide enough to read without making the small end look broken.
 */
export function sizeEnvelope(time: number): number {
  return 1 + 0.25 * Math.sin(time / 23 + 0.6);
}

const SIZE_RANGE: Record<SceneKind, [number, number]> = {
  rain: [9, 26],
  snow: [1.6, 4.6],
  leaves: [7, 15],
  bubbles: [3, 17],
  stars: [0.7, 2.1],
  sunbeams: [0.7, 2.2],
};

/** How many particles a full-strength field wants at this viewport size. */
export function targetCount(kind: SceneKind, width: number, height: number, intensity: number): number {
  // Small screens should not pay the full desktop simulation cost, while very large monitors
  // need a ceiling so particle-to-ledge collision work stays predictable.
  const area = Math.min(2.5, Math.max(0.4, (width * height) / (1280 * 800)));
  const base: Record<SceneKind, number> = {
    rain: 340,
    snow: 150,
    leaves: 40,
    bubbles: 46,
    stars: 130,
    sunbeams: 60,
  };
  return Math.round(base[kind] * area * intensity);
}

export function spawnParticle(field: Field, random: () => number, initial = false): Particle {
  const { kind, width, height } = field;
  const depth = random();
  const [minSize, maxSize] = SIZE_RANGE[kind];
  const size = lerp(minSize, maxSize, depth) * sizeEnvelope(field.time);

  // Stars and dust live in place; everything else enters from off-screen.
  const startY = kind === 'stars'
    ? random() * height
    : kind === 'bubbles' || kind === 'sunbeams'
      ? (initial ? random() * height : height + size * 2)
      : (initial ? random() * height : -size * 2 - random() * height * 0.35);

  const wind = kind === 'rain' ? -60 - depth * 90 : kind === 'snow' ? -14 + random() * 28 : -8 + random() * 16;

  return {
    x: random() * (width + 240) - 120,
    y: startY,
    vx: kind === 'stars' ? 0 : wind,
    vy: kind === 'stars' ? 0 : GRAVITY[kind] * (0.45 + depth * 0.55),
    size,
    depth,
    rotation: random() * Math.PI * 2,
    spin: kind === 'leaves' ? (random() - 0.5) * 2.4 : (random() - 0.5) * 0.6,
    age: initial ? random() * 4 : 0,
    life: kind === 'stars' ? Infinity : 60,
    variant: Math.floor(random() * 4),
  };
}

export function createField(kind: SceneKind, width: number, height: number, seed = 1): Field {
  return { kind, particles: [], bursts: [], time: 0, width, height, seed };
}

function bucketIndex(ledge: Ledge, x: number): number {
  const local = Math.floor((x - ledge.x) / PILE_BUCKET);
  return Math.min(ledge.piles.length - 1, Math.max(0, local));
}

/** Adds settled depth at `x`, spilling a little into the neighbours so piles look drifted. */
export function addToPile(ledge: Ledge, x: number, amount: number, max: number): void {
  const index = bucketIndex(ledge, x);
  ledge.piles[index] = Math.min(max, ledge.piles[index] + amount);
  if (index > 0) ledge.piles[index - 1] = Math.min(max, ledge.piles[index - 1] + amount * 0.35);
  if (index < ledge.piles.length - 1) ledge.piles[index + 1] = Math.min(max, ledge.piles[index + 1] + amount * 0.35);
}

/** Within this distance of an edge a particle slips off instead of balancing on the corner. */
export const EDGE_SLIP = 7;

/** Impact speed above which a particle bounces before it settles. */
const BOUNCE_SPEED: Record<SceneKind, number> = {
  rain: Infinity,
  snow: 70,
  leaves: 90,
  bubbles: Infinity,
  stars: Infinity,
  sunbeams: Infinity,
};

/**
 * Returns the surface whose vertical flank the particle just crossed. Only counts when the
 * particle is beside the card body, so it does not fire for something dropping onto the top.
 */
export function findSideHit(ledges: Ledge[], particle: Particle, previousX: number): Ledge | null {
  for (const ledge of ledges) {
    if (ledge.height <= 0) continue;
    if (particle.y < ledge.y + 2 || particle.y > ledge.y + ledge.height) continue;
    const left = ledge.x;
    const right = ledge.x + ledge.width;
    const wasOutside = previousX <= left || previousX >= right;
    const isInside = particle.x > left && particle.x < right;
    if (wasOutside && isInside) return ledge;
  }
  return null;
}

/** Returns the ledge a particle just crossed into, or null. */
export function findLedgeHit(ledges: Ledge[], particle: Particle, previousY: number): Ledge | null {
  for (const ledge of ledges) {
    if (particle.x < ledge.x || particle.x > ledge.x + ledge.width) continue;
    const surface = ledge.y - ledge.piles[bucketIndex(ledge, particle.x)];
    if (previousY <= surface && particle.y >= surface) return ledge;
  }
  return null;
}

export type StepOptions = {
  /** Seconds since the previous frame, already clamped by the caller. */
  delta: number;
  ledges: Ledge[];
  intensity: number;
  random: () => number;
};

/**
 * Advances the field one frame: moves particles, resolves ledge collisions (splash or settle),
 * ages bursts and piles, and tops the field back up to the count the current weather calls for.
 */
export function stepField(field: Field, options: StepOptions): Field {
  const { delta, ledges, intensity, random } = options;
  const { kind } = field;
  field.time += delta;

  const weather = intensityEnvelope(field.time);
  const wanted = targetCount(kind, field.width, field.height, intensity * weather);
  const settles = settlesOnLedges(kind);
  const splashes = splashesOnLedges(kind);
  const maxPile = MAX_PILE[kind];

  const survivors: Particle[] = [];
  for (const particle of field.particles) {
    particle.age += delta;

    if (kind === 'stars') {
      // Stars hold position; only their twinkle phase advances.
      survivors.push(particle);
      continue;
    }

    const previousY = particle.y;
    const previousX = particle.x;

    // Leaves and snow wander sideways; rain is driven almost straight by the wind.
    if (kind === 'leaves') {
      particle.vx += Math.sin(particle.age * 1.7 + particle.rotation) * 26 * delta;
      particle.rotation += particle.spin * delta;
    } else if (kind === 'snow') {
      particle.vx += Math.sin(particle.age * 0.9 + particle.depth * 6) * 9 * delta;
      particle.rotation += particle.spin * delta;
    } else if (kind === 'bubbles') {
      particle.vx += Math.sin(particle.age * 2.1 + particle.depth * 4) * 14 * delta;
    }

    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;

    if (settles || splashes) {
      // Flanks first: a particle brushing the side of a card is pushed clear of it.
      const flank = findSideHit(ledges, particle, previousX);
      if (flank) {
        particle.vx = -particle.vx * 0.45;
        particle.x = particle.x < flank.x + flank.width / 2 ? flank.x - 1 : flank.x + flank.width + 1;
      }
    }

    const hit = settles || splashes ? findLedgeHit(ledges, particle, previousY) : null;
    if (hit) {
      const surfaceY = hit.y - hit.piles[bucketIndex(hit, particle.x)];
      const nearEdge = Math.min(particle.x - hit.x, hit.x + hit.width - particle.x) < EDGE_SLIP;

      if (splashes) {
        // Faster, fatter drops throw more and further; the spray fans away from impact.
        const energy = Math.min(1, Math.abs(particle.vy) / 1400) * (0.5 + particle.depth);
        const count = 2 + Math.round(energy * 3);
        for (let index = 0; index < count; index += 1) {
          const outward = random() < 0.5 ? -1 : 1;
          field.bursts.push({
            x: particle.x,
            y: surfaceY,
            vx: outward * (35 + random() * 150 * energy),
            vy: -45 - random() * 130 * energy,
            age: 0,
            life: 0.3 + random() * 0.28,
            size: 0.9 + random() * 1.5,
          });
        }
        continue;
      }

      // A fast, glancing hit bounces before it settles; a soft landing sticks first time.
      const impact = Math.abs(particle.vy);
      if (impact > BOUNCE_SPEED[kind] && particle.age < particle.life - 1) {
        particle.y = surfaceY - 1;
        particle.vy = -impact * 0.28;
        particle.vx += (random() - 0.5) * 40;
        continue;
      }

      // Landing on the lip slides off rather than balancing on the corner.
      if (nearEdge && random() < 0.55) {
        particle.x += particle.x < hit.x + hit.width / 2 ? -EDGE_SLIP : EDGE_SLIP;
        particle.vy = Math.abs(particle.vy) * 0.4;
        continue;
      }

      if (kind === 'leaves') {
        hit.rested.push({
          x: particle.x,
          // Leaves come to rest lying flat-ish, not standing on edge.
          rotation: particle.rotation * 0.25 + (random() - 0.5) * 0.5,
          size: particle.size,
          variant: particle.variant,
        });
        if (hit.rested.length > MAX_RESTED) hit.rested.shift();
      } else {
        addToPile(hit, particle.x, particle.size * 0.5, maxPile);
      }
      continue;
    }

    const offScreen = particle.y > field.height + 40 || particle.y < -field.height * 0.6 - 40
      || particle.x < -200 || particle.x > field.width + 200;
    if (offScreen || particle.age > particle.life) continue;
    survivors.push(particle);
  }

  field.particles = survivors;

  // Top up gradually rather than in one burst, so a change in weather eases in.
  const deficit = wanted - field.particles.length;
  if (deficit > 0) {
    const admitted = Math.min(deficit, Math.max(1, Math.ceil(wanted * delta * 1.6)));
    for (let index = 0; index < admitted; index += 1) {
      field.particles.push(spawnParticle(field, random, field.time < 0.1));
    }
  } else if (deficit < 0) {
    field.particles.length = wanted;
  }

  field.bursts = field.bursts.filter((burst) => {
    burst.age += delta;
    burst.vy += 900 * delta;
    burst.x += burst.vx * delta;
    burst.y += burst.vy * delta;
    return burst.age < burst.life;
  });

  // Settled snow compacts, and a drift that gets too steep slumps into its neighbour
  // instead of standing up as a wall.
  if (kind === 'snow') {
    for (const ledge of ledges) {
      relaxPile(ledge, delta);
    }
  }

  return field;
}

/**
 * Compacts a drift and lets steep neighbouring columns slump into each other, so snow settles
 * into rounded banks rather than isolated spikes.
 */
export function relaxPile(ledge: Ledge, delta: number, angleOfRepose = 2.4): void {
  const piles = ledge.piles;
  for (let index = 0; index < piles.length; index += 1) {
    piles[index] = Math.max(0, piles[index] - 0.35 * delta);
  }
  for (let index = 0; index < piles.length - 1; index += 1) {
    const difference = piles[index] - piles[index + 1];
    if (Math.abs(difference) <= angleOfRepose) continue;
    const move = (Math.abs(difference) - angleOfRepose) * 0.5;
    const direction = difference > 0 ? 1 : -1;
    piles[index] -= move * direction;
    piles[index + 1] += move * direction;
  }
}

/** Allocates the pile buckets for a ledge of the given width. */
export function createLedge(id: string, x: number, y: number, width: number, height = 0): Ledge {
  return {
    id,
    x,
    y,
    width,
    height,
    piles: new Float32Array(Math.max(1, Math.ceil(width / PILE_BUCKET))),
    rested: [],
  };
}

/** How many leaves a ledge holds before the oldest is blown off. */
export const MAX_RESTED = 14;
