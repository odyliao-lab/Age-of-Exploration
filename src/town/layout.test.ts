import { describe, expect, it } from 'vitest';
import {
  BUILDINGS,
  DOCK_SPOT,
  SPAWN,
  TOWN_H,
  TOWN_W,
  buildingAt,
  cultureOf,
  destinationFor,
  findPath,
  isWalkable,
  terrainAt,
} from './layout';

describe('town layout', () => {
  it('has a rectangular map', () => {
    for (let y = 0; y < TOWN_H; y++)
      for (let x = 0; x < TOWN_W; x++) expect(terrainAt(x, y)).toBeTruthy();
  });

  it('can walk from the pier to every door and back to the ship', () => {
    expect(isWalkable(SPAWN.x, SPAWN.y)).toBe(true);
    for (const b of BUILDINGS) {
      const path = findPath(SPAWN, b.door);
      expect(path, b.kind).not.toBeNull();
      // 門以外的建築格都不能走
      expect(isWalkable(b.x, b.y)).toBe(false);
    }
    expect(findPath(SPAWN, DOCK_SPOT)).not.toBeNull();
  });

  it('does not overlap buildings or put them on water', () => {
    for (const a of BUILDINGS) {
      for (let y = a.y; y < a.y + a.h; y++) {
        for (let x = a.x; x < a.x + a.w; x++) {
          expect(buildingAt(x, y)).toBe(a);
          expect(terrainAt(x, y)).not.toBe('water');
        }
      }
      expect(a.door.y).toBe(a.y + a.h - 1);
    }
  });

  it('turns a tap on a building or the ship into a walk target', () => {
    const tavern = BUILDINGS.find((b) => b.kind === 'tavern')!;
    expect(destinationFor(tavern.x + 1, tavern.y + 1)).toEqual({
      target: tavern.door,
      enter: 'tavern',
    });
    expect(destinationFor(DOCK_SPOT.x, DOCK_SPOT.y + 1)).toEqual({
      target: DOCK_SPOT,
      enter: 'dock',
    });
    expect(destinationFor(0, 0)).toBeNull();
  });

  it('maps countries to cultures', () => {
    expect(cultureOf('中國')).toBe('minnan');
    expect(cultureOf('琉球')).toBe('ryukyu');
    expect(cultureOf('滿剌加（麻六甲）')).toBe('nanyang');
    expect(cultureOf('中國', 'guangzhou')).toBe('guangfu');
    expect(cultureOf('中國', 'ningbo')).toBe('jiangnan');
    expect(cultureOf('馬來西亞', 'malacca')).toBe('malay');
    expect(cultureOf('印尼', 'semarang')).toBe('java');
  });
});
