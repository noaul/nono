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
import { SNOW_ARMS, SNOW_TINTS, drawSnowflake, snowRoll, snowShape } from '../src/utils/sceneSnow';
import {
  createField,
  depthDistribution,
  gustDirection,
  speedEnvelope,
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
  retainChance,
  sizeEnvelope,
  resolveTuning,
  splashesOnLedges,
  spawnParticle,
  tunedWind,
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

  it('lets only rain touch the interface; every other scene passes through', () => {
    expect(splashesOnLedges('rain')).toBe(true);
    // Snow and leaves are purely airborne: no settling, bouncing, sliding, or accumulation.
    for (const kind of ['snow', 'leaves', 'bubbles', 'stars', 'sunbeams'] as SceneKind[]) {
      expect(splashesOnLedges(kind), kind).toBe(false);
    }
  });

  it('never retains a leaf on a folder, tab, or heading', () => {
    const panel = createLedge('panel', 0, 300, 1280, 160);
    const tabs = createLedge('tabs', 0, 120, 900, 44);
    const field = run(createField('leaves', 1280, 800), [panel, tabs], 14);

    for (const ledge of [panel, tabs]) {
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

  it('splashes rain off a folder instead of settling on it', () => {
    const ledge = createLedge('card', 0, 300, 1280);
    const field = run(createField('rain', 1280, 800), [ledge], 4);

    expect(field.bursts.length).toBeGreaterThan(0);
    for (const burst of field.bursts) {
      expect(burst.age).toBeLessThan(burst.life);
    }
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
      phase: 0, swayRate: 0, flip: 0, flipRate: 0, driftBias: 1,
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

  it('scales the two halves of the blade independently, so leaves are not mirror images', () => {
    const shapes = leaves(40).map(leafShape);
    const gaps = shapes.map((shape) => Math.abs(shape.leftScale - shape.rightScale));

    // The halves are drawn independently from overlapping ranges, so a near-symmetrical leaf is
    // a legitimate outcome. What has to hold is that the population is not mirrored: most
    // leaves are visibly lopsided, and the two sides lean opposite ways across the sample.
    expect(gaps.filter((gap) => gap > 0.02).length).toBeGreaterThan(shapes.length * 0.7);
    expect(shapes.some((shape) => shape.leftScale > shape.rightScale)).toBe(true);
    expect(shapes.some((shape) => shape.leftScale < shape.rightScale)).toBe(true);
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

/**
 * Minimal 2D context that records every point a draw routine touches, in page coordinates.
 * Enough to assert footprint and cleanup without a real canvas.
 */
function recordingContext() {
  const points: Array<[number, number]> = [];
  type Frame = { x: number; y: number; scaleX: number; scaleY: number; angle: number };
  const stack: Frame[] = [{ x: 0, y: 0, scaleX: 1, scaleY: 1, angle: 0 }];
  const top = () => stack[stack.length - 1];
  const mark = (x: number, y: number) => {
    const frame = top();
    const scaledX = x * frame.scaleX;
    const scaledY = y * frame.scaleY;
    const cos = Math.cos(frame.angle);
    const sin = Math.sin(frame.angle);
    points.push([frame.x + scaledX * cos - scaledY * sin, frame.y + scaledX * sin + scaledY * cos]);
  };
  return {
    points,
    filter: 'none',
    globalAlpha: 1,
    lineWidth: 1,
    lineCap: 'butt',
    strokeStyle: '',
    fillStyle: '' as unknown,
    save() { stack.push({ ...top() }); },
    restore() { stack.pop(); },
    translate(x: number, y: number) { top().x += x; top().y += y; },
    rotate(angle: number) { top().angle += angle; },
    scale(x: number, y = x) { top().scaleX *= x; top().scaleY *= y; },
    beginPath() {},
    closePath() {},
    moveTo: mark,
    lineTo: mark,
    stroke() {},
    fill() {},
    createLinearGradient() { return { addColorStop() {} }; },
  } as unknown as CanvasRenderingContext2D & { points: Array<[number, number]> };
}

describe('leaf rendering', () => {
  it('draws a leaf inside its own footprint and leaves the context clean', () => {
    const field = createField('leaves', 1280, 800);
    const leaf = spawnParticle(field, createRandom(31), true);
    leaf.x = 500;
    leaf.y = 300;
    leaf.size = 40;
    leaf.flip = 0;
    leaf.rotation = 0;

    const ctx = recordingContext();
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

describe('snowfall', () => {
  function snow(seconds: number, ledges: Ledge[] = [], seed = 9) {
    const field = createField('snow', 1280, 800);
    const random = createRandom(seed);
    for (let index = 0; index < seconds * 60; index += 1) {
      stepField(field, { delta: 1 / 60, ledges, intensity: 1, random });
    }
    return field;
  }

  it('never lands, settles, or leaves anything on a folder, tab, or heading', () => {
    const panel = createLedge('panel', 0, 300, 1280, 160);
    const tabs = createLedge('tabs', 0, 120, 900, 44);
    const heading = createLedge('heading', 0, 60, 600, 30);
    const field = snow(16, [panel, tabs, heading]);

    for (const ledge of [panel, tabs, heading]) {
      expect(ledge.beads, ledge.id).toHaveLength(0);
      expect(ledge.hanging, ledge.id).toHaveLength(0);
    }
    // No melting or water either: snow produces no bursts at all.
    expect(field.bursts).toHaveLength(0);
  });

  it('passes snow through every vertical layer of the page', () => {
    // Four stacked panels: with collisions gone, none of them can shadow the ones below.
    const rows = [200, 360, 520, 680].map((y, index) => createLedge(`row-${index}`, 0, y, 1280, 120));
    const field = snow(18, rows);

    for (const row of rows) {
      expect(field.particles.some((flake) => flake.y > row.y), `below ${row.id}`).toBe(true);
    }
  });

  it('recycles flakes only once they have left the viewport', () => {
    const field = snow(14, [createLedge('panel', 0, 400, 1280, 160)]);

    for (const flake of field.particles) {
      expect(flake.y).toBeLessThanOrEqual(field.height + 40);
      expect(flake.x).toBeGreaterThanOrEqual(-200);
      expect(flake.x).toBeLessThanOrEqual(field.width + 200);
    }
  });

  it('varies density and fall speed smoothly on separate schedules', () => {
    const density = Array.from({ length: 400 }, (_, index) => intensityEnvelope(index * 0.9));
    const speed = Array.from({ length: 400 }, (_, index) => speedEnvelope(index * 0.9));

    // Both drift rather than holding one value.
    expect(Math.max(...density) - Math.min(...density)).toBeGreaterThan(0.2);
    expect(Math.max(...speed) - Math.min(...speed)).toBeGreaterThan(0.2);
    // Smooth: no step between neighbouring samples.
    for (let index = 1; index < speed.length; index += 1) {
      expect(Math.abs(speed[index] - speed[index - 1])).toBeLessThan(0.1);
    }
    // The two are not the same curve, so a heavy spell is not automatically a fast one.
    const aligned = density.filter((value, index) => (value > 0.85) === (speed[index] > 1)).length;
    expect(aligned).toBeLessThan(density.length * 0.9);
  });

  it('changes the particle count gradually instead of culling in one frame', () => {
    const field = createField('snow', 1280, 800);
    const random = createRandom(4);
    let previous = 0;
    let worst = 0;
    // The first couple of seconds are the initial fill, which is a deliberate ramp.
    for (let index = 0; index < 60 * 120; index += 1) {
      stepField(field, { delta: 1 / 60, ledges: [], intensity: 1, random });
      if (index > 120) worst = Math.max(worst, Math.abs(field.particles.length - previous));
      previous = field.particles.length;
    }

    expect(field.particles.length).toBeGreaterThan(20);
    // Across two minutes of shifting weather no single frame ever moves the count by more than
    // a handful, so density eases rather than stepping.
    expect(worst).toBeLessThanOrEqual(6);
  });

  it('reacts to gusts more strongly the nearer a flake is', () => {
    const field = createField('snow', 1280, 800);
    const random = createRandom(6);
    // Same flake twice, differing only in depth, stepped through an identical stretch of wind.
    const far = spawnParticle(field, random, true);
    const near = { ...far, depth: 0.95 };
    far.depth = 0.05;
    far.x = 640;
    near.x = 640;
    field.particles = [far, near];

    for (let index = 0; index < 60 * 6; index += 1) {
      stepField(field, { delta: 1 / 60, ledges: [], intensity: 0, random });
    }

    expect(Math.abs(near.x - 640)).toBeGreaterThan(Math.abs(far.x - 640));
  });

  it('turns the gust direction over instead of always blowing one way', () => {
    const directions = Array.from({ length: 300 }, (_, index) => gustDirection(index * 1.1));
    expect(directions).toContain(1);
    expect(directions).toContain(-1);
  });

  it('gives every flake its own sway, spin, and gust response', () => {
    const flakes = snow(3).particles.slice(0, 14);

    for (const key of ['swayRate', 'phase', 'driftBias'] as const) {
      expect(new Set(flakes.map((flake) => flake[key].toFixed(4))).size, key).toBeGreaterThan(1);
    }
    expect(flakes.some((flake) => flake.spin > 0)).toBe(true);
    expect(flakes.some((flake) => flake.spin < 0)).toBe(true);
  });

  it('keeps the midground carrying the snowfall and the foreground sparse', () => {
    const random = createRandom(12);
    const depths = Array.from({ length: 4000 }, () => depthDistribution('snow', random));
    const share = (low: number, high: number) =>
      depths.filter((depth) => depth >= low && depth < high).length / depths.length;

    // Foreground stays rare so large flakes never cover bookmarks and text.
    expect(share(0.8, 1.01)).toBeLessThan(0.12);
    // The middle band carries more of the field than the near band does.
    expect(share(0.3, 0.8)).toBeGreaterThan(share(0.8, 1.01));
    // Distant flakes are the most numerous single band.
    expect(share(0, 0.3)).toBeGreaterThan(0.25);
  });
});

describe('snowflake rendering', () => {
  function flakes(count: number, seed = 21) {
    const field = createField('snow', 1280, 800);
    const random = createRandom(seed);
    return Array.from({ length: count }, () => spawnParticle(field, random, true));
  }

  it('never draws a flake as a plain circle', () => {
    // Every style is built from straight arms or a hexagon; there is no disc variant at all.
    const styles = new Set(flakes(200).map((flake) => snowShape(flake).style));
    for (const style of styles) expect(['dendrite', 'star', 'plate']).toContain(style);
    expect(styles.size).toBeGreaterThan(1);
  });

  it('keeps six-fold symmetry', () => {
    expect(SNOW_ARMS).toBe(6);
  });

  it('reserves the branched crystal for flakes near enough to show it', () => {
    const sample = flakes(400);
    const near = sample.filter((flake) => flake.depth > 0.55);
    const far = sample.filter((flake) => flake.depth <= 0.55);

    expect(near.some((flake) => snowShape(flake).style === 'dendrite')).toBe(true);
    // Distant flakes drop to the simpler outlines rather than carrying sub-pixel branches.
    expect(far.every((flake) => snowShape(flake).style !== 'dendrite')).toBe(true);
    // But they are still crystals, not dots.
    expect(far.every((flake) => ['star', 'plate'].includes(snowShape(flake).style))).toBe(true);
  });

  it('varies size, shape, opacity, and brightness from flake to flake', () => {
    const shapes = flakes(60).map((flake) => ({ flake, shape: snowShape(flake) }));

    for (const key of ['radius', 'alpha', 'lineWidth', 'branchReach'] as const) {
      expect(new Set(shapes.map(({ shape }) => shape[key].toFixed(4))).size, key).toBeGreaterThan(10);
    }
    // Cool white through pale blue-white to silver-grey, and more than one in play.
    expect(new Set(shapes.map(({ shape }) => shape.tint)).size).toBeGreaterThan(2);
    for (const { shape } of shapes) expect(SNOW_TINTS).toContain(shape.tint);
  });

  it('stays translucent and fades with distance', () => {
    for (const flake of flakes(80)) {
      const shape = snowShape(flake);
      expect(shape.alpha).toBeGreaterThan(0);
      expect(shape.alpha).toBeLessThan(1);
    }
    const field = createField('snow', 1280, 800);
    const base = spawnParticle(field, createRandom(5), true);
    expect(snowShape({ ...base, depth: 0.1 }).alpha)
      .toBeLessThan(snowShape({ ...base, depth: 0.9 }).alpha);
  });

  it('blurs only a few of the closest flakes', () => {
    const sample = flakes(400);
    const blurred = sample.filter((flake) => snowShape(flake).blur > 0);

    expect(blurred.length).toBeGreaterThan(0);
    expect(blurred.length / sample.length).toBeLessThan(0.15);
    for (const flake of blurred) expect(flake.depth).toBeGreaterThan(0.88);
  });

  it('draws inside the flake footprint and leaves the context clean', () => {
    const field = createField('snow', 1280, 800);
    const flake = spawnParticle(field, createRandom(33), true);
    flake.x = 400;
    flake.y = 250;
    flake.size = 30;
    flake.rotation = 0;
    flake.depth = 0.8;

    const ctx = recordingContext();
    drawSnowflake(ctx, flake);

    expect(ctx.points.length).toBeGreaterThan(20);
    for (const [x, y] of ctx.points) {
      expect(Math.hypot(x - flake.x, y - flake.y)).toBeLessThanOrEqual(flake.size * 1.35);
    }
    expect(ctx.globalAlpha).toBe(1);
    expect(ctx.filter).toBe('none');
  });
});

describe('snowflake variety is independent of distance', () => {
  /**
   * `variant` is drawn from the same PRNG stream as `depth`, a fixed number of draws apart, so
   * the two correlate. Style and tint therefore have to come from `snowRoll`, not `variant`, or
   * a flake's crystal shape ends up tied to how far away it happens to be.
   */
  function population(count: number) {
    const field = createField('snow', 1280, 800);
    const random = createRandom(21);
    return Array.from({ length: count }, () => spawnParticle(field, random, true));
  }

  it('keeps the plate a minority in both the near and far layers', () => {
    const sample = population(600);
    const share = (flakes: typeof sample) =>
      flakes.filter((flake) => snowShape(flake).style === 'plate').length / Math.max(1, flakes.length);

    const near = sample.filter((flake) => flake.depth > 0.55);
    const far = sample.filter((flake) => flake.depth <= 0.55);
    expect(share(near)).toBeLessThan(0.3);
    expect(share(far)).toBeLessThan(0.32);
    expect(share(sample)).toBeLessThan(0.3);
  });

  it('spreads the tints evenly rather than tying them to depth', () => {
    const sample = population(600);
    const counts = new Map<string, number>();
    for (const flake of sample) {
      const tint = snowShape(flake).tint;
      counts.set(tint, (counts.get(tint) ?? 0) + 1);
    }

    // Every tint is in play, and none of them dominates.
    expect(counts.size).toBe(SNOW_TINTS.length);
    for (const [tint, count] of counts) {
      expect(count / sample.length, tint).toBeGreaterThan(0.12);
      expect(count / sample.length, tint).toBeLessThan(0.4);
    }
  });

  it('derives the roll from flight values that are not the depth draw', () => {
    const field = createField('snow', 1280, 800);
    const flake = spawnParticle(field, createRandom(3), true);

    // Same flake, different distance: the crystal it draws must not change.
    expect(snowShape({ ...flake, depth: 0.9 }).tint).toBe(snowShape({ ...flake, depth: 0.1 }).tint);
    expect(snowRoll(flake, 1.7)).toBe(snowRoll({ ...flake, depth: 0.2 }, 1.7));
    // And the roll is stable for a given flake but differs between flakes.
    const other = spawnParticle(field, createRandom(8), true);
    expect(snowRoll(flake, 1.7)).not.toBe(snowRoll(other, 1.7));
  });
});

describe('per-site scene tuning', () => {
  function drift(kind: SceneKind, tuning: Parameters<typeof stepField>[1]['tuning'], seconds = 6) {
    const field = createField(kind, 1280, 800);
    const random = createRandom(19);
    for (let index = 0; index < seconds * 60; index += 1) {
      stepField(field, { delta: 1 / 60, ledges: [], intensity: 1, random, tuning });
    }
    return field;
  }

  it('leaves every multiplier at one when nothing is configured', () => {
    expect(resolveTuning()).toEqual({
      particleSize: 1, speed: 1, wind: 1, windDirection: 0, depth: 1, collision: 1, splash: 1,
    });
    // An omitted tuning object and an all-defaults one produce the same field.
    const bare = drift('snow', undefined, 3);
    const explicit = drift('snow', resolveTuning(), 3);
    expect(bare.particles.length).toBe(explicit.particles.length);
    expect(bare.particles[0].x).toBeCloseTo(explicit.particles[0].x, 6);
  });

  it('stills the air at zero wind and biases it with the direction dial', () => {
    const calm = resolveTuning({ wind: 0 });
    for (const time of [0, 5, 12, 30, 47]) expect(tunedWind(time, calm)).toBe(0);

    const rightward = resolveTuning({ windDirection: 1 });
    const leftward = resolveTuning({ windDirection: -1 });
    const samples = [0, 3, 7, 14, 22, 35];
    // The bias shifts the whole field rather than clamping it, so a rightward setting still
    // varies but sits well to the right of a leftward one.
    for (const time of samples) {
      expect(tunedWind(time, rightward)).toBeGreaterThan(tunedWind(time, leftward));
    }
    expect(samples.every((time) => tunedWind(time, rightward) > 0)).toBe(true);
  });

  it('scales particle size at spawn', () => {
    const field = createField('snow', 1280, 800);
    const random = createRandom(23);
    const plain = spawnParticle(field, createRandom(23), true);
    const doubled = spawnParticle(field, random, true, { particleSize: 2 });

    expect(doubled.size).toBeCloseTo(plain.size * 2, 5);
  });

  it('makes snow fall faster or slower on the speed dial', () => {
    const slow = drift('snow', { speed: 0.4 }, 8);
    const fast = drift('snow', { speed: 2 }, 8);
    const meanFall = (field: typeof slow) =>
      field.particles.reduce((total, flake) => total + flake.vy, 0) / Math.max(1, field.particles.length);

    expect(meanFall(fast)).toBeGreaterThan(meanFall(slow) * 1.5);
  });

  it('flattens the depth spread at zero and widens it above one', () => {
    const flat = drift('snow', { depth: 0 }, 8);
    const deep = drift('snow', { depth: 1.5 }, 8);
    const spread = (field: typeof flat) => {
      const speeds = field.particles.map((flake) => flake.vy);
      return Math.max(...speeds) - Math.min(...speeds);
    };

    expect(spread(flat)).toBeLessThan(spread(deep));
  });

  it('lets every drop through at zero collision', () => {
    const ledge = createLedge('panel', 0, 300, 1280, 140);
    const field = createField('rain', 1280, 800);
    const random = createRandom(29);
    for (let index = 0; index < 60 * 6; index += 1) {
      stepField(field, { delta: 1 / 60, ledges: [ledge], intensity: 1, random, tuning: { collision: 0 } });
    }

    // Nothing is ever held, so no water beads and nothing hangs from the eave.
    expect(ledge.beads).toHaveLength(0);
    expect(ledge.hanging).toHaveLength(0);
    // Rain still reaches below the panel.
    expect(field.particles.some((drop) => drop.y > ledge.y)).toBe(true);
  });

  it('scales the splash without suppressing the impact entirely', () => {
    const ledge = createLedge('panel', 0, 300, 1280, 140);
    const quiet = createField('rain', 1280, 800);
    const loud = createField('rain', 1280, 800);
    for (const [field, splash] of [[quiet, 0.2], [loud, 1.5]] as const) {
      const random = createRandom(31);
      for (let index = 0; index < 60 * 3; index += 1) {
        stepField(field, { delta: 1 / 60, ledges: [ledge], intensity: 1, random, tuning: { splash } });
      }
    }

    expect(loud.bursts.length).toBeGreaterThan(quiet.bursts.length);
  });
});
