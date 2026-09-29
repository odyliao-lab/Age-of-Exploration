import { describe, expect, it } from 'vitest';
import { distanceKm } from '@/geo/geo';
import {
  NAV_FIXED,
  advanceNav,
  applySight,
  canSightTonight,
  darkness,
  daysUntilNight,
  degToJiao,
  estimatedPosition,
  formatZhi,
  isNight,
  jiaoToDeg,
  navErrorKm,
  starTarget,
  takeSight,
  timeLabel,
} from './navigation';

describe('dead reckoning', () => {
  it('drifts away from the truth out of sight of land', () => {
    let nav = { ...NAV_FIXED };
    for (let d = 0; d < 5; d += 0.1) nav = advanceNav(nav, d, 0.1, 1, false);
    const km = navErrorKm(nav);
    expect(km).toBeGreaterThan(20);
    expect(km).toBeLessThanOrEqual(14 * 5 + 1e-6);
    // 推算位置與真實位置相差的公里數就是誤差
    const est = estimatedPosition([115, 15], nav);
    expect(distanceKm(est, [115, 15])).toBeCloseTo(km, 0);
  });

  it('settles quickly when land is in sight', () => {
    let nav = { ...NAV_FIXED, errorE: 60, errorN: -80 };
    nav = advanceNav(nav, 0, 1, 1, true);
    expect(navErrorKm(nav)).toBeLessThan(10);
    nav = advanceNav(nav, 1, 5, 1, true);
    expect(navErrorKm(nav)).toBeCloseTo(4, 5);
  });
});

describe('star sights with the qianxing board', () => {
  it('uses Polaris in the north and the south celestial pole in the south', () => {
    expect(starTarget(24.9)).toMatchObject({ kind: 'polaris', altitude: 24.9 });
    expect(starTarget(-6)).toMatchObject({ kind: 'crux', altitude: 6 });
  });

  it('converts zhi and jiao', () => {
    expect(jiaoToDeg(4)).toBeCloseTo(1.9);
    expect(degToJiao(24.9)).toBe(52);
    expect(formatZhi(52)).toBe('13 指');
    expect(formatZhi(49)).toBe('12 指 1 角');
    expect(formatZhi(2)).toBe('2 角');
  });

  it('grades the sight and fixes latitude but not longitude', () => {
    const lat = 18.2;
    const good = takeSight(lat, degToJiao(lat));
    expect(good.quality).toBe('exact');
    expect(Math.abs(good.measuredLat - lat)).toBeLessThan(0.5);
    const poor = takeSight(lat, degToJiao(lat) + 8);
    expect(poor.quality).toBe('poor');
    expect(poor.errorDeg).toBeGreaterThan(3);

    const nav = { ...NAV_FIXED, errorE: 70, errorN: 90 };
    const fixed = applySight(nav, lat, good, 3.9);
    expect(Math.abs(fixed.errorN)).toBeLessThan(50);
    expect(fixed.errorE).toBe(70);
    expect(canSightTonight(fixed, 3.95)).toBe(false);
    expect(canSightTonight(fixed, 4.9)).toBe(true);
  });

  it('southern sights measure south latitude', () => {
    const s = takeSight(-6.9, degToJiao(6.9));
    expect(s.measuredLat).toBeLessThan(-6);
    expect(s.quality).toBe('exact');
  });
});

describe('day and night', () => {
  it('knows when it is dark enough for stars', () => {
    expect(isNight(0.1)).toBe(true); // 凌晨 2 點
    expect(isNight(0.5)).toBe(false); // 中午
    expect(isNight(2.85)).toBe(true); // 晚上 8 點多
    expect(daysUntilNight(0.5)).toBeCloseTo(7 / 24);
    expect(daysUntilNight(0.9)).toBe(0);
    expect(darkness(0.5)).toBe(0);
    expect(darkness(0.0)).toBe(1);
    expect(darkness(19 / 24)).toBeCloseTo(0.5);
    expect(timeLabel(0.5)).toBe('中午 12 點');
    expect(timeLabel(20.5 / 24)).toBe('晚上 8 點');
  });
});
