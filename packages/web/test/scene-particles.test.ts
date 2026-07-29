import { describe, expect, it } from 'vitest';
import {
  PILE_BUCKET,
  addToPile,
  createField,
  createLedge,
  createRandom,
  findLedgeHit,
  findSideHit,
  intensityEnvelope,
  relaxPile,
  settlesOnLedges,
  sizeEnvelope,
  splashesOnLedges,
  spawnParticle,
  stepField,
  targetCount,
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

  it('only lands snow and leaves; rain splashes and the rest pass through', () => {
    expect(settlesOnLedges('snow')).toBe(true);
    expect(settlesOnLedges('leaves')).toBe(true);
    expect(settlesOnLedges('rain')).toBe(false);
    expect(splashesOnLedges('rain')).toBe(true);
    for (const kind of ['bubbles', 'stars', 'sunbeams'] as SceneKind[]) {
      expect(settlesOnLedges(kind), kind).toBe(false);
      expect(splashesOnLedges(kind), kind).toBe(false);
    }
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

  it('floats bubbles upward', () => {
    const field = run(createField('bubbles', 1280, 800), [], 1);
    expect(field.particles.every((particle) => particle.vy < 0)).toBe(true);
  });
});
