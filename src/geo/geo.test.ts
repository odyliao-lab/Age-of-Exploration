import { describe, expect, it } from 'vitest';
import { bearingDeg, compass16, distanceKm, legLengthKm } from './geo';
import { isLand } from './landmask';
import { checkLeg, createVoyage, isFinished, positionAt } from '@/game/voyage';
import { createFog, decodeFog, encodeFog, exploredFraction, revealAround } from '@/game/fog';

describe('geo', () => {
  it('measures great-circle distance', () => {
    // 泉州 → 廣州 直線約 520 公里
    expect(distanceKm([118.67, 24.87], [113.26, 23.13])).toBeGreaterThan(500);
    expect(distanceKm([118.67, 24.87], [113.26, 23.13])).toBeLessThan(600);
    // 赤道上 1 度約 111 公里
    expect(distanceKm([0, 0], [1, 0])).toBeCloseTo(111.19, 1);
  });

  it('leg length matches great circle for short legs', () => {
    expect(legLengthKm([0, 0], [1, 0])).toBeCloseTo(111.19, 1);
  });

  it('names the 16 compass points', () => {
    expect(compass16(0)).toBe('北');
    expect(compass16(45)).toBe('東北');
    expect(compass16(225)).toBe('西南');
    expect(compass16(350)).toBe('北');
    // 泉州往廣州的方位約 252°
    expect(compass16(bearingDeg([118.67, 24.87], [113.26, 23.13]))).toBe('西南西');
  });
});

describe('land mask', () => {
  it('knows land from sea', () => {
    expect(isLand([105, 35])).toBe(true); // 中國內陸
    expect(isLand([-40, 30])).toBe(false); // 大西洋
    expect(isLand([20, 0])).toBe(true); // 剛果盆地
    expect(isLand([150, 0])).toBe(false); // 太平洋
  });

  it('keeps key straits open', () => {
    expect(isLand([119.8, 24.3])).toBe(false); // 台灣海峽
    expect(isLand([100.8, 3.2])).toBe(false); // 麻六甲海峽
    expect(isLand([110.2, 20.2])).toBe(false); // 瓊州海峽
    expect(isLand([-5.6, 35.95])).toBe(false); // 直布羅陀海峽
  });
});

describe('voyage', () => {
  const quanzhou: [number, number] = [118.67, 24.87];
  const harbor = { center: quanzhou, radiusKm: 60 };

  it('rejects a leg across a continent', () => {
    const r = checkLeg([121, 25], [100, 25], []);
    expect(r.ok).toBe(false);
    expect(r.landAt).toBeDefined();
  });

  it('accepts open-sea legs and harbor exits', () => {
    expect(checkLeg([150, 0], [160, 5], []).ok).toBe(true);
    expect(checkLeg(quanzhou, [119.6, 24.2], [harbor]).ok).toBe(true);
    expect(checkLeg(quanzhou, [119.6, 24.2], []).ok).toBe(false);
  });

  it('moves along the legs', () => {
    const v = createVoyage(
      [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
      null,
    );
    expect(v.totalKm).toBeCloseTo(222.4, 0);
    const mid = positionAt(v, v.legKm[0] / 2);
    expect(mid.position[0]).toBeCloseTo(0.5);
    expect(mid.heading).toBeCloseTo(90);
    const second = positionAt(v, v.legKm[0] + v.legKm[1] / 2);
    expect(second.legIndex).toBe(1);
    expect(second.position[1]).toBeCloseTo(0.5);
    expect(second.heading).toBeCloseTo(0);
    expect(isFinished({ ...v, traveledKm: v.totalKm })).toBe(true);
  });
});

describe('fog', () => {
  it('reveals a disc and round-trips through base64', () => {
    const fog = createFog();
    const changed = revealAround(fog, [118.67, 24.87], 300);
    expect(changed.length).toBeGreaterThan(20);
    expect(revealAround(fog, [118.67, 24.87], 300)).toEqual([]);
    expect(exploredFraction(fog)).toBeGreaterThan(0);
    expect(decodeFog(encodeFog(fog))).toEqual(fog);
  });

  it('wraps around the antimeridian', () => {
    const fog = createFog();
    expect(revealAround(fog, [179.9, 0], 200).length).toBeGreaterThan(10);
  });
});
