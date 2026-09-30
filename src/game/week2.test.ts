import { describe, expect, it } from 'vitest';
import { dateOf, formatDate } from './calendar';
import { currentAt, speedFactors, stormRiskAt, windAt } from './environment';
import { nextRandom } from './rng';
import {
  fullCondition,
  passTime,
  repair,
  repairCost,
  resolveStormChoice,
  resupply,
  resupplyCost,
  shipType,
  shipwreckLoss,
} from './ship';
import {
  environmentAt,
  estimateVoyage,
  gameDate,
  newGame,
  portRepair,
  portResupply,
  resolveEncounter,
  resolveEvent,
  startVoyage,
  tick,
  type GameState,
} from './state';
import { contentForTests } from './testContent';
import { checkLeg } from './voyage';
import { buildWorld } from './world';

const world = buildWorld(contentForTests());
const junk = shipType('junk');

/** 自動處理隨機事件（這裡只關心風暴） */
function skipEvents(s: GameState): GameState {
  const ev = s.encounter;
  if (ev?.kind !== 'event') return s;
  return resolveEvent(
    world,
    s,
    ev.choices
      ? { choiceId: ev.choices[0].id }
      : ev.question
        ? { answer: 0 }
        : { choiceId: 'take' },
  ).state;
}

describe('calendar', () => {
  it('converts game days to dates across months and years', () => {
    expect(dateOf('1405-12-15', 0)).toEqual({ year: 1405, month: 12, day: 15 });
    expect(dateOf('1405-12-15', 17)).toEqual({ year: 1406, month: 1, day: 1 });
    expect(dateOf('1405-12-15', 17.9)).toEqual({ year: 1406, month: 1, day: 1 });
    expect(formatDate(dateOf('1492-08-03', 0))).toBe('1492 年 8 月 3 日');
  });
});

describe('winds and currents', () => {
  const southChinaSea: [number, number] = [114, 15];

  it('flips the Asian monsoon between winter and summer', () => {
    const winter = windAt(southChinaSea, 12);
    expect(winter.name).toBe('東北季風');
    expect(winter.toward).toBe(225); // 從東北吹來，吹向西南
    const summer = windAt(southChinaSea, 7);
    expect(summer.name).toBe('西南季風');
    expect(summer.toward).toBe(45);
    expect(windAt(southChinaSea, 4).strength).toBeLessThan(0.2);
  });

  it('follows the planetary wind belts outside the monsoon region', () => {
    expect(windAt([-40, 15], 1).name).toBe('東北信風');
    expect(windAt([-30, -15], 1).name).toBe('東南信風');
    expect(windAt([-150, 2], 1).name).toBe('赤道無風帶');
    expect(windAt([-30, 45], 1).name).toBe('盛行西風');
    expect(windAt([60, -45], 1).name).toContain('咆哮');
    expect(windAt([-30, 70], 1).name).toBe('極地東風');
  });

  it('knows the Kuroshio and seasonal South China Sea currents', () => {
    expect(currentAt([124, 26], 1)?.name).toBe('黑潮');
    expect(currentAt([124, 26], 1)?.warm).toBe(true);
    expect(currentAt([112, 15], 1)?.id).toBe('scs-winter');
    expect(currentAt([112, 15], 1)?.warm).toBeNull();
    expect(currentAt([112, 15], 7)?.id).toBe('scs-summer');
    expect(currentAt([112, 15], 4)).toBeNull();
    expect(currentAt([-75, -20], 1)?.warm).toBe(false); // 秘魯寒流
  });

  it('speeds up with tailwind and slows down against it', () => {
    const ne = windAt([114, 15], 12);
    const downwind = speedFactors(225, ne, null);
    const upwind = speedFactors(45, ne, null);
    expect(downwind.windLabel).toBe('順風');
    expect(upwind.windLabel).toBe('逆風');
    expect(downwind.total).toBeCloseTo(1.24, 2);
    expect(upwind.total).toBeCloseTo(0.76, 2);
    expect(speedFactors(90, windAt([-150, 0], 1), null).windLabel).toBe('無風');
  });
});

describe('storm seasons', () => {
  it('has typhoons in the western Pacific in late summer only', () => {
    expect(stormRiskAt([125, 20], 8).kind).toBe('typhoon');
    expect(stormRiskAt([125, 20], 8).chancePerDay).toBeGreaterThan(
      stormRiskAt([125, 20], 6).chancePerDay,
    );
    expect(stormRiskAt([125, 20], 1).kind).toBe('none');
  });

  it('has hurricanes, cyclones and westerly gales in their own seas', () => {
    expect(stormRiskAt([-75, 20], 9).kind).toBe('hurricane');
    expect(stormRiskAt([88, 15], 5).kind).toBe('cyclone');
    expect(stormRiskAt([60, -15], 1).kind).toBe('cyclone');
    expect(stormRiskAt([60, -15], 7).kind).toBe('none');
    expect(stormRiskAt([-30, 50], 3).kind).toBe('gale');
  });
});

describe('ship condition', () => {
  it('consumes supplies and loses morale on long voyages', () => {
    let c = fullCondition(junk);
    c = passTime(c, 10);
    expect(c.supplies.water).toBe(30);
    expect(c.morale).toBe(100);
    c = passTime(c, 10);
    expect(c.morale).toBe(85);
    c = passTime(c, 25);
    expect(c.supplies.water).toBe(0);
    expect(c.morale).toBeLessThan(60);
  });

  it('good leadership slows morale loss', () => {
    const base = { ...fullCondition(junk), daysAtSea: 20 };
    const leader = { supplyUse: 1, moraleDecay: 0.8 };
    expect(passTime(base, 10, leader).morale).toBeGreaterThan(passTime(base, 10).morale);
  });

  it('charges for resupply and repair and stays within budget', () => {
    const worn = { ...passTime(fullCondition(junk), 10), hull: 70 };
    expect(resupplyCost(worn, junk)).toBe(10 * 1 + 10 * 2);
    expect(repairCost(worn)).toBe(60);
    const full = resupply(worn, junk, 1000);
    expect(full.cost).toBe(30);
    expect(full.condition.supplies).toEqual({ water: 40, food: 40 });
    const partial = resupply(worn, junk, 16);
    expect(partial.condition.supplies.water).toBe(40);
    expect(partial.condition.supplies.food).toBe(33);
    expect(partial.cost).toBe(16);
    expect(repair(worn, 20).condition.hull).toBe(80);
  });

  it('makes waiting out a storm safer than pushing through', () => {
    const c = fullCondition(junk);
    const push = resolveStormChoice(c, 'push', 0.5, 1, 1);
    const wait = resolveStormChoice(c, 'wait', 0.5, 1, 1);
    expect(push.hullLoss).toBeGreaterThan(wait.hullLoss);
    expect(wait.days).toBeGreaterThan(push.days);
    expect(wait.condition.supplies.water).toBeLessThan(c.supplies.water);
  });

  it('scales shipwreck losses by tier', () => {
    expect(shipwreckLoss(0)).toBeCloseTo(0.2);
    expect(shipwreckLoss(4)).toBeCloseTo(0.5);
  });

  it('produces a deterministic random sequence', () => {
    const [a, s1] = nextRandom(42);
    const [b] = nextRandom(s1);
    expect(nextRandom(42)[0]).toBe(a);
    expect(a).not.toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(1);
  });
});

describe('sailing with weather', () => {
  const summer = (s: GameState): GameState => ({ ...s, startDate: '1405-08-15' });
  // 繞過台灣南端進入西太平洋（每段都通過陸地檢查）
  const openSea: [number, number][] = [
    [118.67, 24.87],
    [119.6, 24.0],
    [119.8, 22.0],
    [121.0, 21.0],
    [125.0, 20.0],
    [130.0, 20.0],
    [140.0, 20.0],
  ];

  it('uses a legal route for the weather tests', () => {
    const harbors = [world.harbors.get('quanzhou')!];
    for (let i = 1; i < openSea.length; i++) {
      expect(checkLeg(openSea[i - 1], openSea[i], harbors)).toEqual({ ok: true });
    }
  });

  it('starts the Treasure Fleet in winter', () => {
    const { state } = newGame(world, 'treasure-fleet', 1);
    expect(gameDate(state)).toEqual({ year: 1405, month: 12, day: 15 });
    const env = environmentAt(state, [114, 18], 225);
    expect(env.wind.name).toBe('東北季風');
    expect(env.factors.windLabel).toBe('順風');
  });

  it('estimates faster voyages with the monsoon than against it', () => {
    const { state } = newGame(world, 'treasure-fleet', 1);
    const south: [number, number][] = [
      [116, 22],
      [110, 12],
    ];
    const winter = estimateVoyage(world, state, south);
    const inSummer = estimateVoyage(world, summer(state), south);
    expect(winter.days).toBeLessThan(inSummer.days);
    expect(winter.tailwindShare).toBeGreaterThan(0.9);
    expect(inSummer.headwindShare).toBeGreaterThan(0.9);
    expect(inSummer.storm?.kind).toBe('typhoon');
  });

  it('meets a typhoon in August, and pushing through repeatedly sinks the ship', () => {
    let s = summer(newGame(world, 'treasure-fleet', 7).state);
    s = { ...s, gold: 1000 };
    s = startVoyage(s, openSea, null);
    let storms = 0;
    for (let i = 0; i < 2000 && s.voyage; i++) {
      const r = tick(world, s, 0.25);
      s = skipEvents(r.state);
      if (s.encounter) {
        storms++;
        const goldBefore = s.gold;
        const res = resolveEncounter(world, s, 'push');
        s = res.state;
        const wreck = res.events.find((e) => e.type === 'shipwreck');
        if (wreck && wreck.type === 'shipwreck') {
          expect(wreck.cause.kind).toBe('typhoon');
          expect(wreck.portId).toBe('quanzhou');
          expect(wreck.lostGold).toBeGreaterThan(0);
          expect(s.dockedAt).toBe('quanzhou');
          expect(s.condition.hull).toBe(60);
          expect(s.shipwrecks).toBe(1);
          expect(s.gold).toBe(goldBefore - wreck.lostGold);
          return;
        }
      }
      // 為了測試沉船，把船體耐久壓低
      if (storms === 0 && s.condition.hull > 30)
        s = { ...s, condition: { ...s.condition, hull: 30 } };
    }
    throw new Error(`沒有沉船（遇到 ${storms} 次風暴）`);
  });

  it('never meets typhoons in the winter monsoon', () => {
    let s = newGame(world, 'treasure-fleet', 7).state;
    s = startVoyage(s, openSea, null);
    for (let i = 0; i < 2000 && s.voyage; i++) {
      s = tick(world, s, 0.25).state;
      expect(s.encounter?.kind).not.toBe('storm');
      s = skipEvents(s);
    }
    expect(s.voyage).toBeNull();
  });

  it('restores morale on arrival and sells supplies and repairs at port', () => {
    let s = newGame(world, 'treasure-fleet', 1).state;
    s = {
      ...s,
      gold: 100,
      condition: { supplies: { water: 5, food: 5 }, morale: 20, hull: 50, daysAtSea: 30 },
    };
    s = portResupply(world, s);
    // 淡水 35 天 × 1 = 35；剩 65 金幣可買 32 天糧食（每天 2），剩 1 金幣
    expect(s.condition.supplies).toEqual({ water: 40, food: 37 });
    expect(s.gold).toBe(1);
    s = portRepair(world, { ...s, gold: 40 });
    expect(s.condition.hull).toBe(70);
    const undocked = { ...s, dockedAt: null };
    expect(portResupply(world, undocked)).toBe(undocked);
  });
});
