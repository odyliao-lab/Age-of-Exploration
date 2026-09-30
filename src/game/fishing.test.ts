import { describe, expect, it } from 'vitest';
import { castNet } from './fishing';
import type { Sounding } from './navigation';

const deep: Sounding = { tuo: null, bottom: null, landKm: null, landBearing: null, shelf: null };
const shelf: Sounding = {
  tuo: 20,
  bottom: '灰黑色的軟泥',
  landKm: 60,
  landBearing: 270,
  shelf: '東海與臺灣海峽的大陸棚',
};

describe('castNet', () => {
  it('大陸棚上的漁獲比遠洋多', () => {
    const onShelf = castNet([122, 29], shelf, 3, 0.5);
    const ocean = castNet([80, 0], deep, 3, 0.5);
    expect(onShelf.ground).toBe('shelf');
    expect(onShelf.fish).toBe('黃魚');
    expect(ocean.ground).toBe('ocean');
    expect(onShelf.food).toBeGreaterThan(ocean.food);
  });

  it('夏季西南季風時，阿拉伯海西側有湧升流', () => {
    expect(castNet([55, 14], deep, 7, 0.5).ground).toBe('upwelling');
    expect(castNet([55, 14], deep, 1, 0.5).ground).toBe('ocean');
  });
});

describe('stormOmen', () => {
  it('颱風的前兆是長浪，並指出方向', async () => {
    const { stormOmen } = await import('./state');
    const storm = {
      id: 1,
      center: [122, 20] as [number, number],
      radiusKm: 60,
      kind: 'typhoon' as const,
      name: '颱風',
      toward: 300,
      speed: 140,
      endDay: 10,
      lesson: '',
    };
    const text = stormOmen(storm, [122, 21.5], false);
    expect(text).toContain('長浪');
    expect(text).toContain('南方');
  });
});
