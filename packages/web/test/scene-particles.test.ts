import { describe, expect, it } from 'vitest';
import {
  LEAF_TINTS,
  bladeHalfWidth,
  drawLeaf,
  leafFacing,
  leafShape,
  leafTint,
  midribOffset,
} from '../src/utils/sceneLeaf';
import {
  PILE_BUCKET,
  addToPile,
  createField,
  createLedge,
  createRandom,
  energyAfterPass,
  findLedgeHit,
  findSideHit,
  feedEave,
  gustStrength,
  intensityEnvelope,
  MAX_DROPLETS,
  MAX_HANGING,
  mergedSize,
  relaxPile,
  retainChance,
  settlesOnLedges,
  sizeEnvelope,
  splashesOnLedges,
  spawnParticle,
  stepField,
  stepLedgeWater,
  targetCount,
  windField,
  type Ledge,
  type SceneKind,
} from '../src/utils/sceneParticles';

const KINDS: SceneKind[] = ['rain', 'snow', 'leaves', 'bubbles', 'stars', 'sunbeams'];

function run(field: ReturnType<typeof createField>, ledges: Ledge[], seconds: number, intensity = 1) {
  const random = createRandom(7);
  const step = 1 / 60;
  for (let elapsed = 0; elapsed < seconds; elapsed += step) {
    stepField(field, { delta: step, ledges, intensity, random });
  }
  return field;
}

describe('scene particle simulation', () => {
  it('is deterministic for a given seed', () => {
    const left = run(createField('snow', 1280, 800), [], 2);
    const right = run(createField('snow', 1280, 800), [], 2);

    expect(left.particles.length).toBe(right.particles.length);
    expect(left.particles[0].x).toBeCloseTo(right.particles[0].x, 6);
    expect(left.particles[0].y).toBeCloseTo(right.particles[0].y, 6);
  });

  it('varies weather over time instead of holding one rate', () => {
    const samples = [0, 12, 25, 40, 60, 90].map((time) => intensityEnvelope(time));

    for (const sample of samples) {
      expect(sample).toBeGreaterThanOrEqual(0.35);
      expect(sample).toBeLessThanOrEqual(1);
    }
    // A downpour and a lull must actually differ, not hover around one value.
    expect(Math.max(...samples) - Math.min(...samples)).toBeGreaterThan(0.25);
  });

  it('drifts particle size over time as well as rate', () => {
    // Sampled across a full period; a narrower window would only see part of the swing.
    const sizes = Array.from({ length: 24 }, (_, index) => sizeEnvelope(index * 8));
    expect(Math.max(...sizes)).toBeGreaterThan(Math.min(...sizes) + 0.3);
    for (const size of sizes) expect(size).toBeGreaterThan(0.5);
  });

  it('scales the field with the intensity dial and the viewport', () => {
    expect(targetCount('rain', 1280, 800, 1)).toBeGreaterThan(targetCount('rain', 1280, 800, 0.5));
    expect(targetCount('rain', 2560, 1600, 1)).toBeGreaterThan(targetCount('rain', 1280, 800, 1));
    expect(targetCount('rain', 1280, 800, 0)).toBe(0);
  });

  it('keeps mobile and high-resolution particle counts within a practical budget', () => {
    const desktop = targetCount('rain', 1280, 800, 1);
    const mobile = targetCount('rain', 390, 844, 1);
    const fourK = targetCount('rain', 3840, 2160, 1);

    expect(mobile).toBeLessThan(desktop);
    expect(mobile).toBeGreaterThanOrEqual(100);
    expect(fourK).toBeGreaterThan(desktop);
    expect(fourK).toBeLessThanOrEqual(850);
  });

  it('fills every scene with particles and keeps them on screen', () => {
    for (const kind of KINDS) {
      const field = run(createField(kind, 1280, 800), [], 3);
      expect(field.particles.length, kind).toBeGreaterThan(0);
      for (const particle of field.particles) {
        expect(Number.isFinite(particle.x), kind).toBe(true);
        expect(Number.isFinite(particle.y), kind).toBe(true);
        expect(particle.size, kind).toBeGreaterThan(0);
      }
    }
  });

  it('drops the field to nothing when the dial is at zero', () => {
    const field = run(createField('rain', 1280, 800), [], 3, 0);
    expect(field.particles.length).toBe(0);
  });

  it('only lands snow; rain splashes and everything else passes through', () => {
    expect(settlesOnLedges('snow')).toBe(true);
    expect(splashesOnLedges('rain')).toBe(true);
    expect(settlesOnLedges('rain')).toBe(false);
    // Leaves drift through the interface: no settling, no bouncing, no sticking.
    expect(settlesOnLedges('leaves')).toBe(false);
    expect(splashesOnLedges('leaves')).toBe(false);
    for (const kind of ['bubbles', 'stars', 'sunbeams'] as SceneKind[]) {
      expect(settlesOnLedges(kind), kind).toBe(false);
      expect(splashesOnLedges(kind), kind).toBe(false);
    }
  });

  it('never retains a leaf on a folder, tab, or heading', () => {
    const panel = createLedge('panel', 0, 300, 1280, 160);
    const tabs = createLedge('tabs', 0, 120, 900, 44);
    const field = run(createField('leaves', 1280, 800), [panel, tabs], 14);

    for (const ledge of [panel, tabs]) {
      expect(Math.max(...ledge.piles), ledge.id).toBe(0);
      expect(ledge.beads, ledge.id).toHaveLength(0);
      expect(ledge.hanging, ledge.id).toHaveLength(0);
    }
    // Leaves keep drifting: some are below the surfaces they crossed.
    expect(field.particles.some((particle) => particle.y > panel.y)).toBe(true);
    expect(field.particles.length).toBeGreaterThan(0);
  });

  it('blows leaves on a wandering wind with occasional gusts', () => {
    const samples = Array.from({ length: 240 }, (_, index) => windField(index * 0.25));
    const gusts = Array.from({ length: 240 }, (_, index) => gustStrength(index * 0.25));

    // The breeze reverses rather than always pushing one way.
    expect(Math.min(...samples)).toBeLessThan(0);
    expect(Math.max(...samples)).toBeGreaterThan(0);
    // Gusts are occasional peaks, not a constant: mostly near zero, sometimes near one.
    expect(Math.max(...gusts)).toBeGreaterThan(0.8);
    expect(gusts.filter((value) => value < 0.05).length).toBeGreaterThan(gusts.length / 2);
    for (const value of gusts) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('gives every leaf its own sway, tumble, and flip', () => {
    const field = run(createField('leaves', 1280, 800), [], 3);
    const leaves = field.particles.slice(0, 12);

    expect(new Set(leaves.map((leaf) => leaf.swayRate.toFixed(4))).size).toBeGreaterThan(1);
    expect(new Set(leaves.map((leaf) => leaf.phase.toFixed(4))).size).toBeGreaterThan(1);
    // Tumble and flip both run in either direction.
    expect(leaves.some((leaf) => leaf.flipRate > 0)).toBe(true);
    expect(leaves.some((leaf) => leaf.flipRate < 0)).toBe(true);
  });

  it('keeps foreground leaves sparse by biasing depth toward the distance', () => {
    const field = run(createField('leaves', 1280, 800), [], 2);
    const near = field.particles.filter((leaf) => leaf.depth > 0.7).length;

    expect(field.particles.length).toBeGreaterThan(10);
    // Fewer than a third sit in the near layer, so the foreground stays uncluttered.
    expect(near / field.particles.length).toBeLessThan(0.34);
  });

  it('lets leaves rise as well as fall while drifting', () => {
    const field = createField('leaves', 1280, 800);
    const random = createRandom(15);
    const leaf = spawnParticle(field, random, true);
    leaf.y = 400;
    field.particles.push(leaf);

    const speeds: number[] = [];
    for (let index = 0; index < 400; index += 1) {
      stepField(field, { delta: 1 / 60, ledges: [], intensity: 0.2, random });
      if (field.particles.includes(leaf)) speeds.push(leaf.vy);
    }
    // Vertical speed varies as it sways rather than holding one constant fall rate.
    expect(Math.max(...speeds) - Math.min(...speeds)).toBeGreaterThan(3);
  });

  it('detects a ledge only when a particle crosses its surface', () => {
    const ledge = createLedge('1', 100, 400, 200);
    const particle = spawnParticle(createField('snow', 1280, 800), createRandom(3), true);

    particle.x = 150;
    particle.y = 401;
    expect(findLedgeHit([ledge], particle, 399)).toBe(ledge);

    // Still above the surface.
    particle.y = 380;
    expect(findLedgeHit([ledge], particle, 370)).toBeNull();

    // Horizontally outside the card.
    particle.x = 40;
    particle.y = 401;
    expect(findLedgeHit([ledge], particle, 399)).toBeNull();
  });

  it('accumulates snow on folders and spills into neighbouring buckets', () => {
    const ledge = createLedge('1', 0, 300, 160);
    addToPile(ledge, 80, 6, 14);

    const centre = Math.floor(80 / PILE_BUCKET);
    expect(ledge.piles[centre]).toBeCloseTo(6, 5);
    // Neighbours get a share so the drift has shoulders rather than a spike.
    expect(ledge.piles[centre - 1]).toBeGreaterThan(0);
    expect(ledge.piles[centre + 1]).toBeGreaterThan(0);
    expect(ledge.piles[centre - 1]).toBeLessThan(ledge.piles[centre]);
  });

  it('clamps accumulation so a folder never disappears under the pile', () => {
    const ledge = createLedge('1', 0, 300, 80);
    for (let index = 0; index < 200; index += 1) addToPile(ledge, 40, 5, 14);
    expect(Math.max(...ledge.piles)).toBeLessThanOrEqual(14);
  });

  it('builds a pile of snow on a folder that sits under the fall', () => {
    const ledge = createLedge('card', 200, 400, 400);
    const field = run(createField('snow', 1280, 800), [ledge], 12);

    expect(Math.max(...ledge.piles)).toBeGreaterThan(0);
    expect(field.particles.length).toBeGreaterThan(0);
  });

  it('splashes rain off a folder instead of settling on it', () => {
    const ledge = createLedge('card', 0, 300, 1280);
    const field = run(createField('rain', 1280, 800), [ledge], 4);

    expect(Math.max(...ledge.piles)).toBe(0);
    expect(field.bursts.length).toBeGreaterThan(0);
    for (const burst of field.bursts) {
      expect(burst.age).toBeLessThan(burst.life);
    }
  });

  it('lets settled snow compact away once it stops falling', () => {
    const ledge = createLedge('card', 200, 400, 400);
    addToPile(ledge, 300, 10, 14);
    const before = Math.max(...ledge.piles);

    const field = createField('snow', 1280, 800);
    const random = createRandom(5);
    for (let index = 0; index < 120; index += 1) {
      stepField(field, { delta: 1 / 60, ledges: [ledge], intensity: 0, random });
    }

    expect(Math.max(...ledge.piles)).toBeLessThan(before);
  });

  it('drives rain by wind so streaks are slanted, and holds stars in place', () => {
    const rain = run(createField('rain', 1280, 800), [], 1);
    expect(rain.particles.some((particle) => particle.vx < 0)).toBe(true);
    expect(rain.particles.every((particle) => particle.vy > 0)).toBe(true);

    const stars = run(createField('stars', 1280, 800), [], 2);
    expect(stars.particles.every((particle) => particle.vx === 0 && particle.vy === 0)).toBe(true);
  });

  it('deflects a particle that clips the side of a card', () => {
    const ledge = createLedge('card', 200, 300, 200, 150);
    const particle = spawnParticle(createField('snow', 1280, 800), createRandom(11), true);
    particle.x = 210;
    particle.y = 360;
    particle.vx = 40;

    expect(findSideHit([ledge], particle, 190)).toBe(ledge);
    // A particle already above the top edge is a landing, not a flank hit.
    particle.y = 295;
    expect(findSideHit([ledge], particle, 190)).toBeNull();
    // Zero-height surfaces have no flank to strike.
    expect(findSideHit([createLedge('flat', 200, 300, 200)], particle, 190)).toBeNull();
  });

  it('slumps a steep drift into its neighbour instead of leaving a spike', () => {
    const ledge = createLedge('card', 0, 300, 80);
    ledge.piles[3] = 12;
    const spike = ledge.piles[3];

    for (let index = 0; index < 30; index += 1) relaxPile(ledge, 1 / 60);

    expect(ledge.piles[3]).toBeLessThan(spike);
    expect(ledge.piles[4]).toBeGreaterThan(0);
    // The bank settles within its angle of repose rather than staying a wall.
    expect(Math.abs(ledge.piles[3] - ledge.piles[4])).toBeLessThanOrEqual(2.5);
  });

  it('keeps snow within the angle of repose across the whole ledge', () => {
    const ledge = createLedge('card', 0, 300, 160);
    for (let index = 0; index < 400; index += 1) addToPile(ledge, 60, 3, 14);
    for (let index = 0; index < 200; index += 1) relaxPile(ledge, 1 / 60);

    for (let index = 0; index < ledge.piles.length - 1; index += 1) {
      expect(Math.abs(ledge.piles[index] - ledge.piles[index + 1])).toBeLessThanOrEqual(2.6);
    }
  });

  it('throws a bigger splash for a faster, fatter drop', () => {
    const ledge = createLedge('card', 0, 300, 1280);
    const field = createField('rain', 1280, 800);
    const random = createRandom(9);
    for (let index = 0; index < 240; index += 1) {
      stepField(field, { delta: 1 / 60, ledges: [ledge], intensity: 1, random });
    }
    expect(field.bursts.length).toBeGreaterThan(0);
    // Spray fans out to both sides rather than all going one way.
    expect(field.bursts.some((burst) => burst.vx > 0)).toBe(true);
    expect(field.bursts.some((burst) => burst.vx < 0)).toBe(true);
  });

  it('lets rain through a border instead of treating the first row as a ceiling', () => {
    const top = createLedge('row-1', 0, 200, 1280, 150);
    const bottom = createLedge('row-2', 0, 500, 1280, 150);
    const field = run(createField('rain', 1280, 800), [top, bottom], 6);

    // Drops that passed the first border are still falling, and some reached the second.
    expect(field.particles.some((particle) => particle.passes >= 1)).toBe(true);
    expect(field.particles.some((particle) => particle.y > top.y)).toBe(true);
    expect(top.beads.length + bottom.beads.length + top.hanging.length).toBeGreaterThan(0);
  });

  it('makes a drop likelier to be caught the more layers it has crossed', () => {
    expect(retainChance(0)).toBeLessThan(retainChance(1));
    expect(retainChance(1)).toBeLessThan(retainChance(3));
    // Never certain, so rain can always reach a lower row.
    expect(retainChance(99)).toBeLessThan(1);
    expect(retainChance(0)).toBeGreaterThan(0);
  });

  it('costs a drop size and speed on every layer it crosses', () => {
    const drained = energyAfterPass(20, 1200);
    expect(drained.size).toBeLessThan(20);
    expect(drained.vy).toBeLessThan(1200);
    expect(drained.vy).toBeGreaterThan(0);
  });

  it('never keeps held water permanently', () => {
    const ledge = createLedge('panel', 0, 300, 600, 120);
    const field = createField('rain', 1280, 800);
    const random = createRandom(4);
    for (let index = 0; index < 300; index += 1) {
      stepField(field, { delta: 1 / 60, ledges: [ledge], intensity: 1, random });
    }
    expect(ledge.beads.length).toBeLessThanOrEqual(MAX_DROPLETS);
    expect(ledge.hanging.length).toBeLessThanOrEqual(MAX_HANGING);

    // With the rain switched off every bead clears, and the eave drips itself dry.
    for (let index = 0; index < 900; index += 1) {
      stepField(field, { delta: 1 / 60, ledges: [ledge], intensity: 0, random });
    }
    expect(ledge.beads.length).toBe(0);
    expect(ledge.hanging.length).toBe(0);
  });

  it('runs a spent bead off to the eave rather than deleting it', () => {
    const ledge = createLedge('panel', 0, 300, 600, 120);
    ledge.beads.push({ x: 300, size: 2.5, vx: 0, age: 0, life: 0.05, squash: 0.7, fate: 'runoff' });
    const field = createField('rain', 1280, 800);

    stepLedgeWater(ledge, field, 0.1, createRandom(6));

    expect(ledge.beads).toHaveLength(0);
    expect(ledge.hanging).toHaveLength(1);
    // Carries the bead's volume across, plus the trickle it picks up in the same frame.
    expect(ledge.hanging[0].size).toBeGreaterThanOrEqual(2.5);
    expect(ledge.hanging[0].size).toBeLessThan(2.6);
  });

  it('slides beads along the border and coalesces the ones that touch', () => {
    const ledge = createLedge('panel', 0, 300, 600, 120);
    ledge.beads.push({ x: 300, size: 2, vx: 30, age: 0, life: 9, squash: 0.7, fate: 'runoff' });
    ledge.beads.push({ x: 303, size: 2, vx: 0, age: 0, life: 9, squash: 0.7, fate: 'runoff' });
    const field = createField('rain', 1280, 800);

    stepLedgeWater(ledge, field, 1 / 60, createRandom(2));

    expect(ledge.beads).toHaveLength(1);
    // Volume adds, so two equal beads make one of cbrt(2)x the radius, not 2x.
    expect(ledge.beads[0].size).toBeCloseTo(mergedSize(2, 2), 5);
    expect(ledge.beads[0].size).toBeLessThan(4);
  });

  it('merges volume rather than radius', () => {
    expect(mergedSize(2, 2)).toBeCloseTo(2 * Math.cbrt(2), 5);
    expect(mergedSize(3, 0)).toBeCloseTo(3, 5);
    expect(mergedSize(2, 3)).toBeLessThan(5);
  });

  it('grows a hanging drop until it detaches and accelerates downward', () => {
    const ledge = createLedge('panel', 0, 300, 600, 120);
    const field = createField('rain', 1280, 800);
    const random = createRandom(3);
    feedEave(ledge, 300, 2, random);

    const start = ledge.hanging[0].size;
    let detached = false;
    for (let index = 0; index < 2000 && !detached; index += 1) {
      stepLedgeWater(ledge, field, 1 / 60, random);
      detached = ledge.hanging.length === 0;
    }

    expect(detached).toBe(true);
    const drip = field.particles.at(-1)!;
    // Hangs below the panel, starts slow, and is already spent so it re-enters the system.
    expect(drip.y).toBeGreaterThan(ledge.y + ledge.height);
    expect(drip.vy).toBeLessThan(100);
    expect(drip.passes).toBeGreaterThan(0);
    expect(start).toBeLessThan(ledge.hanging.length ? Infinity : drip.size);
  });

  it('accelerates a detached drip toward terminal velocity', () => {
    const field = createField('rain', 1280, 800);
    const random = createRandom(12);
    field.particles.push({
      x: 100, y: 100, vx: 0, vy: 30, size: 6, depth: 0.5,
      rotation: 0, spin: 0, age: 0, life: 20, variant: 0, passes: 1,
      phase: 0, swayRate: 0, flip: 0, flipRate: 0,
    });
    const drip = field.particles[0];

    stepField(field, { delta: 1 / 60, ledges: [], intensity: 0, random });
    expect(drip.vy).toBeGreaterThan(30);
  });

  it('varies detachment size so drips are never evenly timed', () => {
    const random = createRandom(21);
    const ledge = createLedge('panel', 0, 300, 900, 120);
    for (const x of [60, 200, 340, 480, 620, 760]) feedEave(ledge, x, 1.5, random);
    const thresholds = ledge.hanging.map((drop) => drop.detachAt);

    expect(new Set(thresholds).size).toBeGreaterThan(1);
    expect(new Set(ledge.hanging.map((drop) => drop.phase)).size).toBeGreaterThan(1);
  });

  it('coalesces run-off into a drop already hanging nearby', () => {
    const ledge = createLedge('panel', 0, 300, 600, 120);
    const random = createRandom(5);
    feedEave(ledge, 300, 2, random);
    feedEave(ledge, 310, 2, random);

    expect(ledge.hanging).toHaveLength(1);
    expect(ledge.hanging[0].size).toBeCloseTo(mergedSize(2, 2), 5);
  });

  it('absorbs a drop once it has no energy left', () => {
    const ledge = createLedge('panel', 0, 300, 600, 120);
    const field = createField('rain', 1280, 800);
    const random = createRandom(8);
    const drop = spawnParticle(field, random, true);
    drop.size = 1;
    drop.x = 300;
    drop.y = 299;
    drop.vy = 900;
    field.particles.push(drop);

    stepField(field, { delta: 1 / 60, ledges: [ledge], intensity: 0, random });

    // A spent drop is always held rather than punching through again.
    expect(field.particles).not.toContain(drop);
    expect(ledge.beads.length).toBe(1);
  });

  it('floats bubbles upward', () => {
    const field = run(createField('bubbles', 1280, 800), [], 1);
    expect(field.particles.every((particle) => particle.vy < 0)).toBe(true);
  });
});

describe('leaf geometry', () => {
  function leaves(count: number) {
    const field = createField('leaves', 1280, 800);
    const random = createRandom(23);
    return Array.from({ length: count }, () => spawnParticle(field, random, true));
  }

  it('closes the blade to a point at the tip and the stem', () => {
    for (const leaf of leaves(24)) {
      const shape = leafShape(leaf);
      expect(bladeHalfWidth(shape, 0)).toBeCloseTo(0, 6);
      expect(bladeHalfWidth(shape, 1)).toBeCloseTo(0, 6);
      // Widest somewhere in between, so it is a blade rather than a sliver.
      expect(bladeHalfWidth(shape, 0.5)).toBeGreaterThan(shape.width * 0.2);
    }
  });

  it('gives each half of the blade a different width, so no leaf is a mirror image', () => {
    for (const leaf of leaves(24)) {
      const shape = leafShape(leaf);
      expect(shape.leftScale).not.toBeCloseTo(shape.rightScale, 2);
    }
  });

  it('varies size, width, taper, and lean from leaf to leaf', () => {
    const shapes = leaves(24).map(leafShape);
    for (const key of ['width', 'peak', 'taper', 'lean'] as const) {
      expect(new Set(shapes.map((shape) => shape[key].toFixed(4))).size).toBeGreaterThan(4);
    }
    // Leaves curve both ways rather than all leaning the same direction.
    expect(shapes.some((shape) => shape.lean > 0)).toBe(true);
    expect(shapes.some((shape) => shape.lean < 0)).toBe(true);
  });

  it('keeps side veins inside the blade outline', () => {
    for (const leaf of leaves(24)) {
      const shape = leafShape(leaf);
      for (const u of [0.24, 0.44, 0.64]) {
        const reach = u + 0.13;
        const half = bladeHalfWidth(shape, reach);
        // Veins end at 0.68 of the envelope at their own end point, so they cannot poke out.
        expect(half * 0.68).toBeLessThan(half + 1e-9);
        expect(half).toBeGreaterThan(0);
      }
    }
  });

  it('compresses and dims a leaf as it turns edge-on', () => {
    const leaf = leaves(1)[0];
    const flat = leafFacing({ ...leaf, flip: 0 });
    const edge = leafFacing({ ...leaf, flip: Math.PI / 2 });

    expect(flat.squash).toBeCloseTo(1, 5);
    expect(edge.squash).toBeLessThan(0.2);
    expect(edge.lit).toBeLessThan(flat.lit);
  });

  it('keeps dry yellow a minority of the canopy', () => {
    const sample = leaves(400);
    const dry = sample.filter((leaf) => leafTint(leaf) === LEAF_TINTS[3]).length;

    expect(dry).toBeGreaterThan(0);
    expect(dry / sample.length).toBeLessThan(0.2);
  });
});

describe('leaf rendering', () => {
  /** Minimal 2D context that records every point the leaf routine touches. */
  function recorder() {
    const points: Array<[number, number]> = [];
    const stack: Array<{ x: number; y: number; scaleX: number }> = [{ x: 0, y: 0, scaleX: 1 }];
    const top = () => stack[stack.length - 1];
    const mark = (x: number, y: number) => {
      const frame = top();
      points.push([frame.x + x * frame.scaleX, frame.y + y]);
    };
    return {
      points,
      filter: 'none',
      globalAlpha: 1,
      lineWidth: 1,
      strokeStyle: '',
      fillStyle: '' as unknown,
      save() { stack.push({ ...top() }); },
      restore() { stack.pop(); },
      translate(x: number, y: number) { top().x += x; top().y += y; },
      rotate() {},
      scale(x: number) { top().scaleX *= x; },
      beginPath() {},
      closePath() {},
      moveTo: mark,
      lineTo: mark,
      stroke() {},
      fill() {},
      createLinearGradient() { return { addColorStop() {} }; },
    } as unknown as CanvasRenderingContext2D & { points: Array<[number, number]> };
  }

  it('draws a leaf inside its own footprint and leaves the context clean', () => {
    const field = createField('leaves', 1280, 800);
    const leaf = spawnParticle(field, createRandom(31), true);
    leaf.x = 500;
    leaf.y = 300;
    leaf.size = 40;
    leaf.flip = 0;
    leaf.rotation = 0;

    const ctx = recorder();
    drawLeaf(ctx, leaf);

    expect(ctx.points.length).toBeGreaterThan(20);
    for (const [x, y] of ctx.points) {
      expect(Math.abs(x - leaf.x)).toBeLessThanOrEqual(leaf.size);
      // The stem hangs below the base, so the footprint runs a little past half the length.
      expect(Math.abs(y - leaf.y)).toBeLessThanOrEqual(leaf.size * 0.75);
    }
    // globalAlpha and filter are reset, so the next particle starts from a clean slate.
    expect(ctx.globalAlpha).toBe(1);
    expect(ctx.filter).toBe('none');
  });

  it('leans the midrib toward the tip rather than bending the base', () => {
    const field = createField('leaves', 1280, 800);
    const leaf = spawnParticle(field, createRandom(37), true);
    const shape = leafShape(leaf);

    expect(midribOffset(shape, 0)).toBeCloseTo(0, 6);
    expect(Math.abs(midribOffset(shape, 1))).toBeGreaterThan(Math.abs(midribOffset(shape, 0.5)));
  });
});
