import { describe, expect, it } from 'vitest';
import { GOODS_PRICE, basePrice, cargoUsed, pressureNow, quote } from './trade';
import {
  cargoCapacity,
  checkAchievements,
  marketQuotes,
  newGame,
  buyUpgrade,
  buyShip,
  mods,
  myShip,
  pirateCargoShare,
  greetingQuestion,
  resolveEvent,
  tradeBuy,
  tradeSell,
  type GameState,
} from './state';
import { contentForTests } from './testContent';
import { createEvent, type EventContext } from './events';
import { buildWorld } from './world';

const world = buildWorld(contentForTests());
const ports = world.content.ports;
const port = (id: string) => world.ports.get(id)!;

describe('prices come from geography', () => {
  it('sells goods cheaply where they are produced and dearer far away', () => {
    const atSource = basePrice(ports, port('malacca'), 'pepper');
    const nearby = basePrice(ports, port('singapore'), 'pepper');
    const far = basePrice(ports, port('ningbo'), 'pepper');
    expect(atSource).toBeLessThan(nearby);
    expect(nearby).toBeLessThan(far);
    expect(far).toBeGreaterThan(GOODS_PRICE.pepper * 1.4);
  });

  it('only lets you buy local goods but buys everything', () => {
    const q = quote(ports, port('quanzhou'), 'silk', {}, 0);
    expect(q.buy).not.toBeNull();
    expect(q.buy!).toBeGreaterThan(q.sell);
    expect(quote(ports, port('quanzhou'), 'pepper', {}, 0).buy).toBeNull();
    expect(quote(ports, port('quanzhou'), 'pepper', {}, 0).sell).toBeGreaterThan(0);
  });

  it('every port good has a price', () => {
    for (const p of ports)
      for (const g of p.goods) expect(GOODS_PRICE[g], `${p.id} ${g}`).toBeDefined();
  });
});

describe('trading', () => {
  const docked = (id: string, gold = 1000): GameState => ({
    ...newGame(world, 'treasure-fleet', 1).state,
    dockedAt: id,
    gold,
  });

  it('buys up to what gold and the hold allow, and prices rise as you buy', () => {
    const s = docked('quanzhou', 1000);
    const before = marketQuotes(world, s, 'quanzhou').find((q) => q.good === 'silk')!;
    const r = tradeBuy(world, s, 'silk', 100);
    expect(r.qty).toBe(cargoCapacity(s));
    expect(cargoUsed(r.state.cargo)).toBe(cargoCapacity(s));
    expect(r.state.gold).toBe(1000 - r.amount);
    const after = marketQuotes(world, r.state, 'quanzhou').find((q) => q.good === 'silk')!;
    expect(after.buy!).toBeGreaterThan(before.buy!);
    // 沒錢時買不到
    expect(tradeBuy(world, docked('quanzhou', 5), 'silk', 1).qty).toBe(0);
    // 不是特產就不能買
    expect(tradeBuy(world, s, 'pepper', 1).qty).toBe(0);
  });

  it('sells for a profit far from the source and tracks it for achievements', () => {
    let s = docked('quanzhou', 1000);
    s = tradeBuy(world, s, 'porcelain', 10).state;
    s = { ...s, dockedAt: 'malacca' };
    const r = tradeSell(world, s, 'porcelain', 10);
    expect(r.qty).toBe(10);
    expect(r.profit).toBeGreaterThan(0);
    expect(r.state.cargo.porcelain).toBeUndefined();
    expect(r.state.stats.tradeProfit).toBe(r.profit);
    expect(checkAchievements(world, r.state).state.achievements).toContain('first-profit');
  });

  it('lets prices recover over time', () => {
    let s = docked('quanzhou', 1000);
    s = tradeBuy(world, s, 'silk', 20).state;
    const p0 = pressureNow(s.market, 'quanzhou', 'silk', s.day);
    expect(p0).toBeGreaterThan(0.4);
    expect(pressureNow(s.market, 'quanzhou', 'silk', s.day + 10)).toBeLessThan(p0 / 3);
  });
});

describe('pirates can take cargo instead of gold', () => {
  it('hands over about a third of every good and keeps the gold', () => {
    const base = newGame(world, 'treasure-fleet', 1).state;
    const ev = createEvent(
      'pirates',
      {
        position: [101, 3],
        heading: 0,
        month: 1,
        wind: { toward: 0, speed: 5 },
        daysAtSea: 1,
        lastPort: { name: '泉州', location: [118.6, 24.9] },
        regionName: null,
        otherRegionNames: [],
      } as unknown as EventContext,
      () => 0.3,
    );
    const s: GameState = {
      ...base,
      gold: 500,
      encounter: ev,
      cargo: { silk: { qty: 9, cost: 180 }, tea: { qty: 1, cost: 15 } },
    };
    expect(pirateCargoShare(s.cargo)).toEqual({ silk: 3, tea: 1 });
    const r = resolveEvent(world, s, { choiceId: 'cargo' });
    expect(r.state.gold).toBe(500);
    expect(r.state.encounter).toBeNull();
    expect(r.state.cargo).toEqual({ silk: { qty: 6, cost: 120 } });
  });
});

describe('greeting pirates in their own language', () => {
  it('asks for the local greeting once you have learned it in a nearby port', () => {
    const base = newGame(world, 'treasure-fleet', 1).state;
    expect(greetingQuestion(world, base, [101, 3], () => 0.4)).toBeUndefined();
    const q = greetingQuestion(
      world,
      { ...base, visitedPorts: [...base.visitedPorts, 'malacca'] },
      [101, 3],
      () => 0.4,
    )!;
    expect(q.prompt).toContain('馬來語');
    expect(q.choices[q.answer]).toBe('Apa khabar?');
    expect(new Set(q.choices).size).toBe(3);
  });
});

describe('ship refits', () => {
  it('improve the current ship and stay with it when you buy a new one', () => {
    const s0: GameState = { ...newGame(world, 'treasure-fleet', 1).state, gold: 2000 };
    const cargo0 = cargoCapacity(s0);
    const speed0 = mods(world, s0).speed;
    let s = buyUpgrade(world, s0, 'hold');
    s = buyUpgrade(world, s, 'sails');
    s = buyUpgrade(world, s, 'tanks');
    expect(s.gold).toBeLessThan(s0.gold);
    expect(cargoCapacity(s)).toBe(Math.round(cargo0 * 1.5));
    expect(mods(world, s).speed).toBeCloseTo(speed0 * 1.06);
    expect(myShip(s).supplyDays).toBe(myShip(s0).supplyDays + 15);
    // 同一種改裝不能買兩次
    expect(buyUpgrade(world, s, 'hold')).toBe(s);
    const leveled = { ...s, captain: { ...s.captain, level: 5 } };
    const bought = buyShip(world, leveled, 'fuchuan');
    expect(bought.shipTypeId).toBe('fuchuan');
    expect(bought.upgrades).toEqual([]);
  });
});
