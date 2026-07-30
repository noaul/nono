/**
 * Pure particle simulation for the theme scenes. No DOM, no canvas: ThemeScene.vue owns
 * rendering and feeds this module the viewport size and the folder ledges to collide with.
 * Keeping it pure is what makes the physics testable.
 */

export type SceneKind = 'bubbles' | 'snow' | 'leaves' | 'stars' | 'sunbeams' | 'rain';

/**
 * A bead of water sitting on a panel's top border. It slides slowly along the border, can
 * merge with a neighbour, and eventually either evaporates or runs off toward the eave.
 */
export type Bead = {
  x: number;
  /** Roughly the radius in px. Merging adds volume, not radius. */
  size: number;
  /** Slide speed along the border; varies per bead so nothing marches in step. */
  vx: number;
  age: number;
  life: number;
  /** Per-bead shape jitter, so beads are not identical circles. */
  squash: number;
  fate: 'evaporate' | 'runoff';
};

/**
 * A drop hanging from a panel's bottom edge, fed by run-off. It grows, stretches, wobbles,
 * and once heavy enough lets go and falls — the eave behaviour.
 */
export type HangingDrop = {
  x: number;
  size: number;
  /** Size at which surface tension gives up and the drop detaches. */
  detachAt: number;
  age: number;
  /** Wobble phase, offset per drop so neighbours are never synchronised. */
  phase: number;
};

/**
 * A surface a particle can interact with — in practice a folder's glass content panel. Rain
 * beads on its top border and drips from its bottom edge; snow drifts on top of it.
 */
export type Ledge = {
  id: string;
  x: number;
  y: number;
  width: number;
  /** Needed for side hits: a particle can clip the flank of a card, not just its top. */
  height: number;
  /** Settled depth per bucket across the ledge, in pixels. Snow forms a continuous drift. */
  piles: Float32Array;
  /** Rain beaded on the top border before it evaporates or runs off. */
  beads: Bead[];
  /** Run-off hanging from the bottom edge, waiting to get heavy enough to fall. */
  hanging: HangingDrop[];
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
  /** Layers already passed through; drives energy loss for rain. */
  passes: number;
  /** Sway phase, so no two leaves swing together. */
  phase: number;
  /** Sway frequency in rad/s; randomised per leaf. */
  swayRate: number;
  /** Rotation about the viewing axis, used to compress width as a leaf turns edge-on. */
  flip: number;
  /** Flip speed, signed so leaves tumble both ways. */
  flipRate: number;
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
  leaves: 0,
  bubbles: 0,
  sunbeams: 0,
  stars: 0,
};

/**
 * Particles that come to rest on ledges rather than passing through. Leaves deliberately do
 * not: they drift through folders, tabs, and headings without settling, bouncing, or sticking.
 */
export function settlesOnLedges(kind: SceneKind): boolean {
  return kind === 'snow';
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

/**
 * Horizontal wind in px/s. Two slow sines give a wandering breeze; the shaped term adds an
 * occasional gust that builds and fades rather than switching on.
 */
export function windField(time: number): number {
  const breeze = 26 * Math.sin(time / 6.5) + 14 * Math.sin(time / 2.7 + 1.1);
  const gust = 95 * Math.max(0, Math.sin(time / 9.5)) ** 6;
  return breeze - gust;
}

/** 0 at rest, 1 at the peak of a gust. Drives extra tumble while the gust lasts. */
export function gustStrength(time: number): number {
  return Math.max(0, Math.sin(time / 9.5)) ** 6;
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
  // Leaves lean toward the far layer: big fast foreground leaves read badly if there are many.
  const depth = kind === 'leaves' ? random() ** 1.7 : random();
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
    passes: 0,
    phase: random() * Math.PI * 2,
    swayRate: 0.7 + random() * 1.9,
    flip: random() * Math.PI * 2,
    flipRate: (random() < 0.5 ? -1 : 1) * (0.5 + random() * 2.1),
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

/** At most this many beads sit on one border at a time. */
export const MAX_DROPLETS = 12;

/** At most this many drops hang from one eave. */
export const MAX_HANGING = 4;

/** Beads closer than this coalesce into one larger bead. */
export const MERGE_DISTANCE = 7;

/** Below this a drop has spent its energy and is absorbed rather than passing on again. */
const MIN_RAIN_SIZE = 4;

/** Rain accelerates toward this instead of falling at a fixed rate. */
const RAIN_TERMINAL = 1600;

/**
 * Volume-preserving merge: two beads of radius a and b make one of radius cbrt(a^3 + b^3), so
 * combining does not balloon the result the way adding radii would.
 */
export function mergedSize(a: number, b: number): number {
  return Math.cbrt(a ** 3 + b ** 3);
}

/**
 * Odds a drop is held by the border it hits rather than passing through. Rises with each
 * layer already crossed, so a drop that has lost energy is likelier to be caught — which is
 * what keeps lower rows lit without the top row acting as a ceiling.
 */
export function retainChance(passes: number): number {
  return Math.min(0.72, 0.3 + passes * 0.16);
}

/** Each crossing costs size and speed. */
export function energyAfterPass(size: number, vy: number): { size: number; vy: number } {
  return { size: size * 0.78, vy: vy * 0.86 };
}

/** Impact speed above which a particle bounces before it settles. */
const BOUNCE_SPEED: Record<SceneKind, number> = {
  rain: Infinity,
  snow: 70,
  leaves: Infinity,
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

    // Leaves ride the wind and tumble, snow wanders gently, rain falls almost straight.
    if (kind === 'leaves') {
      const wind = windField(field.time);
      const gust = gustStrength(field.time);
      // Air resistance: horizontal speed eases toward the wind rather than snapping to it,
      // and a bigger leaf has more drag, so it is pushed around more.
      const drag = 0.9 + particle.size * 0.05;
      particle.vx += (wind - particle.vx) * Math.min(1, drag * delta);
      // Sway on the leaf's own period, plus a little lift so it rises and falls as it drifts.
      particle.vx += Math.sin(particle.age * particle.swayRate + particle.phase) * 34 * delta;
      const terminal = 26 + particle.depth * 46;
      particle.vy += (terminal - particle.vy) * Math.min(1, 1.4 * delta);
      particle.vy += Math.cos(particle.age * particle.swayRate * 0.6 + particle.phase) * 22 * delta;
      // A gust spins leaves faster as well as blowing them sideways.
      particle.rotation += particle.spin * (1 + gust * 2.4) * delta;
      particle.flip += particle.flipRate * (1 + gust * 1.6) * delta;
    } else if (kind === 'snow') {
      particle.vx += Math.sin(particle.age * 0.9 + particle.depth * 6) * 9 * delta;
      particle.rotation += particle.spin * delta;
    } else if (kind === 'bubbles') {
      particle.vx += Math.sin(particle.age * 2.1 + particle.depth * 4) * 14 * delta;
    }

    if (kind === 'rain') particle.vy = Math.min(RAIN_TERMINAL, particle.vy + 2600 * delta);

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

        // A border either holds the drop for a moment or lets it through. Without this the
        // first row of folders would be an impermeable ceiling and nothing below would rain.
        const spent = particle.size <= MIN_RAIN_SIZE;
        if (spent || random() < retainChance(particle.passes)) {
          if (hit.beads.length < MAX_DROPLETS) {
            hit.beads.push({
              x: particle.x,
              size: 1.1 + particle.size * 0.075 + random() * 0.9,
              // Slide direction and speed both vary, so beads never travel in formation.
              vx: (random() < 0.5 ? -1 : 1) * (4 + random() * 16),
              age: 0,
              life: 0.9 + random() * 3.2,
              squash: 0.55 + random() * 0.35,
              // Most water works its way to the eave; the rest simply dries.
              fate: random() < 0.62 ? 'runoff' : 'evaporate',
            });
          }
          continue;
        }

        // Passes through, poorer for it, and resumes below the border so it cannot
        // immediately re-collide with the same surface.
        const drained = energyAfterPass(particle.size, particle.vy);
        particle.size = drained.size;
        particle.vy = drained.vy;
        particle.passes += 1;
        particle.y = surfaceY + 1.5;
        particle.x += (random() - 0.5) * 6;
        survivors.push(particle);
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

      addToPile(hit, particle.x, particle.size * 0.5, maxPile);
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

  // Held water is always temporary. Beads slide along the top border, merge with neighbours,
  // then either dry out or run off to the eave, where a drop hangs and grows until it is heavy
  // enough to let go.
  if (kind === 'rain') {
    for (const ledge of ledges) {
      stepLedgeWater(ledge, field, delta, random);
    }
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

/** Feeds run-off into the eave, merging into a drop already hanging nearby. */
export function feedEave(ledge: Ledge, x: number, volume: number, random: () => number): void {
  const clamped = Math.min(ledge.x + ledge.width - 2, Math.max(ledge.x + 2, x));
  const near = ledge.hanging.find((drop) => Math.abs(drop.x - clamped) < 26);
  if (near) {
    near.size = mergedSize(near.size, volume);
    return;
  }
  if (ledge.hanging.length >= MAX_HANGING) return;
  ledge.hanging.push({
    x: clamped,
    size: volume,
    // Detach threshold varies, so drips are never evenly timed across cards. Large enough
    // that a drop visibly swells and stretches before surface tension gives up.
    detachAt: 5.5 + random() * 3.6,
    age: 0,
    phase: random() * Math.PI * 2,
  });
}

/**
 * Advances one panel's water: beads slide and coalesce on the top border, run-off gathers at
 * the eave, and a hanging drop detaches once it outgrows surface tension.
 */
export function stepLedgeWater(ledge: Ledge, field: Field, delta: number, random: () => number): void {
  // Slide, age, and retire the beads on the top border.
  const surviving: Bead[] = [];
  for (const bead of ledge.beads) {
    bead.age += delta;
    bead.x += bead.vx * delta;
    // Drag makes a bead ease to a halt rather than gliding forever.
    bead.vx *= 1 - Math.min(0.9, 1.6 * delta);

    const pastEdge = bead.x <= ledge.x + 1 || bead.x >= ledge.x + ledge.width - 1;
    if (pastEdge || bead.age >= bead.life) {
      if (bead.fate === 'runoff' || pastEdge) feedEave(ledge, bead.x, bead.size, random);
      continue;
    }
    surviving.push(bead);
  }

  // Coalesce neighbours: the larger bead absorbs the smaller one's volume.
  surviving.sort((left, right) => left.x - right.x);
  const merged: Bead[] = [];
  for (const bead of surviving) {
    const previous = merged[merged.length - 1];
    if (previous && bead.x - previous.x < MERGE_DISTANCE) {
      previous.size = mergedSize(previous.size, bead.size);
      // A heavier bead keeps moving, and its clock restarts.
      previous.vx = (previous.vx + bead.vx) * 0.5;
      previous.age = Math.min(previous.age, bead.age);
      continue;
    }
    merged.push(bead);
  }
  ledge.beads = merged;

  // The eave: grow, wobble, and eventually drip.
  const stillHanging: HangingDrop[] = [];
  for (const drop of ledge.hanging) {
    drop.age += delta;
    // A slow trickle keeps a fed drop growing even between bead arrivals.
    drop.size += 0.62 * delta;
    if (drop.size >= drop.detachAt) {
      field.particles.push({
        x: drop.x,
        y: ledge.y + ledge.height + drop.size,
        vx: (random() - 0.5) * 18,
        // Starts nearly at rest and accelerates under gravity, like a real drip.
        vy: 24 + random() * 34,
        size: MIN_RAIN_SIZE + drop.size * 1.6,
        depth: 0.4 + random() * 0.35,
        rotation: 0,
        spin: 0,
        age: 0,
        life: 20,
        variant: 0,
        // Already spent, so it behaves like run-off rather than fresh rain, and can still
        // pass through, bead up, or splash on the panels below.
        passes: 1,
        phase: 0,
        swayRate: 0,
        flip: 0,
        flipRate: 0,
      });
      continue;
    }
    stillHanging.push(drop);
  }
  ledge.hanging = stillHanging;
}

/**
 * Compacts a drift and lets steep neighbouring columns slump into each other, so snow settles
 * into rounded banks rather than isolated spikes.
 */
export function relaxPile(ledge: Ledge, delta: number, angleOfRepose = 2.4): void {
  const piles = ledge.piles;
  for (let index = 0; index < piles.length; index += 1) {
    // Compaction is mostly proportional to depth: a deep drift settles under its own weight,
    // a thin dusting barely moves. A flat rate would instead scrub thin cover off wide
    // surfaces faster than any plausible snowfall could lay it down.
    piles[index] = Math.max(0, piles[index] - (0.015 + piles[index] * 0.03) * delta);
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
    beads: [],
    hanging: [],
  };
}

