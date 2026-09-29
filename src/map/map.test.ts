import { describe, expect, it } from 'vitest';
import {
  DEG_PX,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  formatLonLat,
  lonLatToWorld,
  worldProjection,
  worldToLonLat,
} from './projection';
import { centerOn, clampView, minScale, screenToWorld, zoomAt, MAX_SCALE } from './viewport';

describe('projection', () => {
  it('maps corners and origin', () => {
    expect(lonLatToWorld([-180, 90])).toEqual({ x: 0, y: 0 });
    expect(lonLatToWorld([180, -90])).toEqual({ x: WORLD_WIDTH, y: WORLD_HEIGHT });
    expect(lonLatToWorld([0, 0])).toEqual({ x: WORLD_WIDTH / 2, y: WORLD_HEIGHT / 2 });
  });

  it('round-trips', () => {
    const [lon, lat] = worldToLonLat(lonLatToWorld([118.67, 24.87]));
    expect(lon).toBeCloseTo(118.67);
    expect(lat).toBeCloseTo(24.87);
  });

  it('agrees with the d3 projection used for coastlines', () => {
    for (const p of [
      [118.67, 24.87],
      [-70, -33],
      [0, 0],
    ] as const) {
      const [x, y] = worldProjection([p[0], p[1]])!;
      const w = lonLatToWorld([p[0], p[1]]);
      expect(x).toBeCloseTo(w.x, 6);
      expect(y).toBeCloseTo(w.y, 6);
    }
  });

  it('formats with Chinese hemispheres', () => {
    expect(formatLonLat([118.67, 24.87])).toBe('北緯 24.9°\u3000東經 118.7°');
    expect(formatLonLat([-43.2, -22.9])).toBe('南緯 22.9°\u3000西經 43.2°');
    expect(formatLonLat([0, 0])).toBe('緯度 0°\u3000經度 0°');
    expect(formatLonLat([180, 10])).toBe('北緯 10.0°\u3000經度 180°');
  });
});

describe('viewport', () => {
  const size = { width: 1000, height: 600 };

  it('never zooms out past the whole world', () => {
    const v = clampView({ x: 0, y: 0, scale: 0.01 }, size);
    expect(v.scale).toBe(minScale(size));
    expect(WORLD_WIDTH * v.scale).toBeGreaterThanOrEqual(size.width - 1e-9);
    expect(WORLD_HEIGHT * v.scale).toBeGreaterThanOrEqual(size.height - 1e-9);
  });

  it('caps zoom in', () => {
    expect(clampView({ x: 0, y: 0, scale: 999 }, size).scale).toBe(MAX_SCALE);
  });

  it('keeps the map covering the screen when panned too far', () => {
    const v = clampView({ x: 500, y: 500, scale: 2 }, size);
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
    const v2 = clampView({ x: -1e6, y: -1e6, scale: 2 }, size);
    expect(v2.x).toBe(size.width - WORLD_WIDTH * 2);
    expect(v2.y).toBe(size.height - WORLD_HEIGHT * 2);
  });

  it('zooms around the anchor point', () => {
    const start = centerOn({ x: 1500, y: 600 }, 2, size);
    const anchor = { x: 300, y: 200 };
    const before = screenToWorld(anchor, start);
    const after = screenToWorld(anchor, zoomAt(start, 1.5, anchor, size));
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('centers on a world point', () => {
    const quanzhou = lonLatToWorld([118.67, 24.87]);
    const v = centerOn(quanzhou, 4, size);
    const c = screenToWorld({ x: size.width / 2, y: size.height / 2 }, v);
    expect(c.x).toBeCloseTo(quanzhou.x);
    expect(c.y).toBeCloseTo(quanzhou.y);
    expect(DEG_PX).toBe(8);
  });
});
