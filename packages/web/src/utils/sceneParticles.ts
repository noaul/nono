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
 * A surface rain can interact with — in practice a folder's glass content panel. Water beads on
 * its top border and drips from its bottom edge. No other scene collides with anything.
 */
export type Ledge = {
  id: string;
  x: number;
  y: number;
  width: number;
  /** Needed for side hits: a particle can clip the flank of a card, not just its top. */
  height: number;
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
  /** How strongly this particle answers a gust. Independent of sway and spin. */
  driftBias: number;
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

const GRAVITY: Record<SceneKind, number> = {
  rain: 1500,
  snow: 42,
  leaves: 58,
  bubbles: -95,
  sunbeams: -12,
  stars: 0,
};

/**
 * Rain is the only scene that touches the interface. Snow and leaves are purely airborne: they
 * never settle, bounce, slide, accumulate, or melt on a folder, a tab, or a heading, so an upper
 * row of folders can never shadow the weather below it.
 */
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
 * Horizontal wind in px/s. Two slow sines give a breeze whose direction wanders rather than
 * holding still, and the shaped term adds an occasional gust that builds and fades instead of
 * switching on. The gust takes its own slowly flipping direction, so a squall is as likely to
 * blow one way as the other.
 */
export function windField(time: number): number {
  const breeze = 26 * Math.sin(time / 6.5) + 14 * Math.sin(time / 2.7 + 1.1);
  return breeze + 95 * gustStrength(time) * gustDirection(time);
}

/** 0 at rest, 1 at the peak of a gust. Drives extra tumble and lift while the gust lasts. */
export function gustStrength(time: number): number {
  return Math.max(0, Math.sin(time / 9.5)) ** 6;
}

/** Which way the current gust blows. Turns over far more slowly than the gusts themselves. */
export function gustDirection(time: number): number {
  return Math.sin(time / 37 + 0.6) >= 0 ? 1 : -1;
}

/**
 * Fall speed drifts on its own slow schedule, independent of how heavy the weather is, so snow
 * alternates between lazy and brisk without the density changing in lockstep.
 */
export function speedEnvelope(time: number): number {
  return 1 + 0.3 * (0.62 * Math.sin(time / 29 + 2.3) + 0.38 * Math.sin(time / 11.5 + 0.4));
}

const SIZE_RANGE: Record<SceneKind, [number, number]> = {
  rain: [9, 26],
  // Wide enough at the top end that a foreground flake reads as a crystal rather than a dot.
  snow: [2.4, 11],
  leaves: [7, 15],
  bubbles: [3, 17],
  stars: [0.7, 2.1],
  sunbeams: [0.7, 2.2],
};

/**
 * Where a particle sits between the far layer (0) and the near one (1).
 *
 * Leaves lean toward the distance, because big fast foreground leaves read badly in numbers.
 * Snow wants the midground to carry the snowfall: averaging two draws peaks the population in
 * the middle, and the exponent skews it back down so distant flakes stay the most numerous while
 * large foreground flakes remain rare enough not to sit on top of bookmarks and text.
 */
export function depthDistribution(kind: SceneKind, random: () => number): number {
  if (kind === 'leaves') return random() ** 1.7;
  if (kind === 'snow') return ((random() + random()) / 2) ** 1.3;
  return random();
}

/** How many particles a full-strength field wants at this viewport size. */
export function targetCount(kind: SceneKind, width: number, height: number, intensity: number): number {
  // Small screens should not pay the full desktop simulation cost, while very large monitors
  // need a ceiling so particle-to-ledge collision work stays predictable.
  const area = Math.min(2.5, Math.max(0.4, (width * height) / (1280 * 800)));
  const base: Record<SceneKind, number> = {
    rain: 340,
    // Calm and soft rather than a blizzard: the crystals are larger than the old dots, so fewer
    // of them fill the same amount of sky.
    snow: 108,
    leaves: 40,
    bubbles: 46,
    stars: 130,
    sunbeams: 60,
  };
  return Math.round(base[kind] * area * intensity);
}

export function spawnParticle(field: Field, random: () => number, initial = false): Particle {
  const { kind, width, height } = field;
  const depth = depthDistribution(kind, random);
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
    driftBias: 0.45 + random() * 1.1,
  };
}

export function createField(kind: SceneKind, width: number, height: number, seed = 1): Field {
  return { kind, particles: [], bursts: [], time: 0, width, height, seed };
}

/** At most this many beads sit on one border at a time. */
export const MAX_DROPLETS = 12;

/** At most this many drops hang from one eave. */
export const MAX_HANGING = 4;

/** Beads closer than this coalesce into one larger bead. */
export const MERGE_DISTANCE = 7;

/** Below this a drop has spent its energy and is absorbed rather than passing on again. */
/**
 * How far over target the field is allowed to run before it is trimmed. Wide enough that a lull
 * in the weather never causes a visible cull, tight enough to reclaim memory after a resize.
 */
export const SURPLUS_TOLERANCE = 1.35;

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
    const surface = ledge.y;
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
 * Advances the field one frame: moves particles, resolves rain against collision surfaces, ages
 * bursts and held water, and tops the field back up to the count the current weather calls for.
 */
export function stepField(field: Field, options: StepOptions): Field {
  const { delta, ledges, intensity, random } = options;
  const { kind } = field;
  field.time += delta;

  const weather = intensityEnvelope(field.time);
  const wanted = targetCount(kind, field.width, field.height, intensity * weather);
  const splashes = splashesOnLedges(kind);

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
      const wind = windField(field.time);
      const gust = gustStrength(field.time);
      // Depth decides how much of the wind a flake actually feels: a distant flake drifts
      // lazily, a near one is visibly shoved around.
      const response = 0.3 + particle.depth * 1.0;
      const drag = 0.9 + particle.depth * 1.3;
      particle.vx += (wind * response - particle.vx) * Math.min(1, drag * delta);
      // Each flake sways on its own period and phase, so nothing moves in formation.
      particle.vx += Math.sin(particle.age * particle.swayRate + particle.phase) * 12 * delta;
      // Terminal speed follows the slow speed envelope, so the whole fall eases between lazy
      // and brisk instead of stepping.
      const terminal = (13 + particle.depth * 34) * speedEnvelope(field.time);
      particle.vy += (terminal - particle.vy) * Math.min(1, 1.2 * delta);
      // A gust lifts some flakes briefly; once it passes, the pull back toward terminal above
      // returns them to a calm descent on its own.
      particle.vy -= gust * response * particle.driftBias * 34 * delta;
      particle.rotation += particle.spin * (1 + gust * 1.8) * delta;
    } else if (kind === 'bubbles') {
      particle.vx += Math.sin(particle.age * 2.1 + particle.depth * 4) * 14 * delta;
    }

    if (kind === 'rain') particle.vy = Math.min(RAIN_TERMINAL, particle.vy + 2600 * delta);

    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;

    if (splashes) {
      // Flanks first: a drop brushing the side of a card is pushed clear of it.
      const flank = findSideHit(ledges, particle, previousX);
      if (flank) {
        particle.vx = -particle.vx * 0.45;
        particle.x = particle.x < flank.x + flank.width / 2 ? flank.x - 1 : flank.x + flank.width + 1;
      }

      const hit = findLedgeHit(ledges, particle, previousY);
      if (hit) {
        const surfaceY = hit.y;
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
  } else if (field.particles.length > wanted * SURPLUS_TOLERANCE + 8) {
    // A passing lull is not trimmed: the count is left to fall on its own as particles leave
    // the bottom, because truncating the list would make a chunk of weather vanish mid-air.
    // Only a real surplus — a viewport that just got much smaller — is cut back.
    field.particles.length = Math.ceil(wanted * SURPLUS_TOLERANCE + 8);
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
        driftBias: 1,
      });
      continue;
    }
    stillHanging.push(drop);
  }
  ledge.hanging = stillHanging;
}

/** A collision surface for rain: water beads on its top border and drips from its bottom edge. */
export function createLedge(id: string, x: number, y: number, width: number, height = 0): Ledge {
  return {
    id,
    x,
    y,
    width,
    height,
    beads: [],
    hanging: [],
  };
}

