import { describe, expect, it } from 'vitest';
import { PAINT_PRICE } from './cosmetics';
import { deserialize, serialize } from './save';
import { buyPaint, newGame, setAppearance } from './state';
import { contentForTests } from './testContent';
import { buildWorld } from './world';

const world = buildWorld(contentForTests());
const fresh = () => newGame(world, 'treasure-fleet', 1).state;

describe('appearance', () => {
  it('applies unlocked styles and ignores locked ones', () => {
    let s = fresh();
    s = setAppearance(s, { hat: 'douli', coat: 'jade', emblem: 'anchor', skin: 3 });
    expect(s.appearance).toMatchObject({ hat: 'douli', coat: 'jade', emblem: 'anchor', skin: 3 });
    s = setAppearance(s, { hat: 'captain', emblem: 'dragon', skin: 99 });
    expect(s.appearance).toMatchObject({ hat: 'douli', emblem: 'anchor', skin: 3 });
    s = { ...s, achievements: ['level-5', 'here-be-dragons'] };
    s = setAppearance(s, { hat: 'captain', emblem: 'dragon' });
    expect(s.appearance).toMatchObject({ hat: 'captain', emblem: 'dragon' });
  });

  it('sells paints only at a hub and only once', () => {
    let s = { ...fresh(), gold: 200 };
    expect(setAppearance(s, { hull: 'lacquer' }).appearance.hull).toBe('wood');
    const hub = world.content.ports.find((p) => p.kind === 'hub')!;
    const other = world.content.ports.find((p) => p.kind !== 'hub')!;
    expect(buyPaint(world, { ...s, dockedAt: other.id }, 'hull', 'lacquer').gold).toBe(200);
    s = buyPaint(world, { ...s, dockedAt: hub.id }, 'hull', 'lacquer');
    expect(s.gold).toBe(200 - PAINT_PRICE);
    expect(s.appearance.hull).toBe('lacquer');
    expect(buyPaint(world, s, 'hull', 'lacquer')).toBe(s);
    // 成就解鎖的塗裝不能用買的
    expect(buyPaint(world, s, 'hull', 'jade')).toBe(s);
    s = setAppearance(s, { hull: 'wood' });
    s = setAppearance(s, { hull: 'lacquer' });
    expect(s.appearance.hull).toBe('lacquer');
  });

  it('fills a default appearance for version 5 saves', () => {
    const old = serialize(fresh()) as unknown as Record<string, unknown>;
    delete old.appearance;
    old.version = 5;
    expect(deserialize(old as never).appearance.hull).toBe('wood');
  });
});
