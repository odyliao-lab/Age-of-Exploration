import { describe, expect, it } from 'vitest';
import { getLandRings } from './land';
import { WORLD_HEIGHT, WORLD_WIDTH } from './projection';

describe('getLandRings', () => {
  const rings = getLandRings();

  it('produces many land polygons and at least one hole', () => {
    expect(rings.filter((r) => r.outer).length).toBeGreaterThan(100);
    expect(rings.some((r) => !r.outer)).toBe(true);
  });

  it('keeps every point inside the world bounds', () => {
    for (const r of rings)
      for (let i = 0; i < r.points.length; i += 2) {
        expect(r.points[i]).toBeGreaterThanOrEqual(-0.5);
        expect(r.points[i]).toBeLessThanOrEqual(WORLD_WIDTH + 0.5);
        expect(r.points[i + 1]).toBeGreaterThanOrEqual(-0.5);
        expect(r.points[i + 1]).toBeLessThanOrEqual(WORLD_HEIGHT + 0.5);
      }
  });

  it('has no segment spanning half the world (antimeridian is cut)', () => {
    // 南極洲的外環會沿著南極點（y = WORLD_HEIGHT）閉合，這些沿極點邊緣的線段是正確的幾何
    const onPoleEdge = (y1: number, y2: number) =>
      (y1 === 0 && y2 === 0) || (y1 === WORLD_HEIGHT && y2 === WORLD_HEIGHT);
    for (const r of rings)
      for (let i = 2; i < r.points.length; i += 2) {
        if (onPoleEdge(r.points[i - 1], r.points[i + 1])) continue;
        expect(Math.abs(r.points[i] - r.points[i - 2])).toBeLessThan(WORLD_WIDTH / 2);
      }
  });
});
