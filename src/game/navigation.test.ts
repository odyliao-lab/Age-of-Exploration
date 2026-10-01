import { describe, expect, it } from 'vitest';
import { CoastIndex } from '@/geo/coast';
import { distanceKm } from '@/geo/geo';
import { loadDetailedLand } from '@/map/land';
import {
  PIRATE_GIVE_UP_KM,
  PIRATE_SPOT_KM,
  insideStorm,
  spawnStorm,
  insideMist,
  mistZoneAt,
  spawnMist,
  MIST_PIRATE_SPOT_KM,
  stepFleet,
  stepStorm,
  type SeaFleet,
} from './encounters';
import { destinationPoint } from './events';
import {
  darkness,
  hourOfDay,
  isNight,
  judgeSighting,
  nightIndex,
  polarisZhi,
  positionError,
  soundAt,
  soundingText,
  timeLabel,
} from './navigation';
import { motion } from './sailing';
import {
  coastChoices,
  coastSightBlocked,
  coastSighting,
  departPort,
  greetMerchant,
  investigateBlocked,
  merchantInReach,
  envoyInReach,
  armadaInReach,
  greetArmada,
  greetEnvoy,
  ENVOYS,
  merchantOffer,
  sellToMerchant,
  newGame,
  positionErrorKm,
  setHelm,
  sightStars,
  starSightBlocked,
  takeSounding,
  tick,
  type GameState,
} from './state';
import { contentForTests } from './testContent';
import { buildWorld } from './world';

const coast = new CoastIndex(await loadDetailedLand());
const world = buildWorld(contentForTests(), coast);
const ne = { toward: 225, strength: 0.8, name: '東北季風', from: '東北' };
const sea = () => false;

describe('day and night', () => {
  it('starts at 6 in the morning and has nights from 7 pm to 5 am', () => {
    expect(hourOfDay(0)).toBe(6);
    expect(isNight(0)).toBe(false);
    expect(isNight(14 / 24)).toBe(true); // 20:00
    expect(isNight(22 / 24)).toBe(true); // 隔天 04:00
    expect(nightIndex(14 / 24)).toBe(nightIndex(22 / 24));
    expect(nightIndex(14 / 24 + 1)).toBe(nightIndex(14 / 24) + 1);
    expect(darkness(0.25)).toBe(0);
    expect(darkness(0.75)).toBe(1);
    expect(timeLabel(0)).toBe('黎明 06:00');
  });
});

describe('牽星術', () => {
  it('turns Polaris altitude in zhi into latitude', () => {
    // 泉州約北緯 24.9°，北極星約 13 指高
    expect(polarisZhi(24.9)).toBeCloseTo(13.1, 1);
    expect(judgeSighting(24.9, 13).quality).toBe('good');
    expect(judgeSighting(24.9, 12.25).quality).toBe('ok');
    expect(judgeSighting(24.9, 10).quality).toBe('miss');
  });

  it('can only be done at sea, at night, once a night, and reduces the position error', () => {
    let s: GameState = departPort(world, newGame(world, 'treasure-fleet', 2).state);
    expect(starSightBlocked(s)).toContain('白天');
    s = { ...s, day: 14 / 24, nav: { day: 0, errorKm: 2 } };
    const before = positionErrorKm(world, s);
    expect(before).toBeGreaterThan(5);
    expect(starSightBlocked(s)).toBeNull();
    const r = sightStars(world, s, polarisZhi(s.ship.position[1]))!;
    expect(r.result.quality).toBe('good');
    expect(positionErrorKm(world, r.state)).toBeLessThanOrEqual(15);
    expect(r.state.stats.starsCorrect).toBe(1);
    expect(starSightBlocked(r.state)).toContain('已經');
    const miss = sightStars(world, s, 3)!;
    expect(miss.result.quality).toBe('miss');
    expect(positionErrorKm(world, miss.state)).toBeCloseTo(before);
  });
});

describe('dead reckoning', () => {
  it('grows the error with time and blocks investigation when too uncertain', () => {
    expect(positionError({ day: 0, errorKm: 2 }, 3)).toBe(2 + 3 * 14);
    let s: GameState = { ...newGame(world, 'treasure-fleet', 2).state, rumors: ['taiwan'] };
    s = { ...s, helm: { course: 0, sail: 0, anchored: true, blocked: false }, dockedAt: null };
    expect(investigateBlocked(world, s, 'taiwan')).toBeNull();
    s = { ...s, day: 10 };
    expect(investigateBlocked(world, s, 'taiwan')).toContain('誤差');
  });

  it('fixes the position again when a known port is in sight', () => {
    let s: GameState = departPort(world, newGame(world, 'treasure-fleet', 2).state);
    s = { ...s, nav: { day: -5, errorKm: 2 }, eventCooldownUntil: 1e9 };
    s = setHelm(s, { anchored: true });
    s = tick(world, s, 0.05).state;
    expect(positionErrorKm(world, s)).toBeLessThan(10);
  });
});

describe('pirates you can see', () => {
  const pirate = (at: [number, number]): SeaFleet => ({
    id: 1,
    kind: 'pirate',
    position: at,
    heading: 0,
    mode: 'roam',
    spawnDay: 0,
    greeted: false,
  });
  const rand = () => 0.5;

  it('chases when close, gives up when you get away, and catches you when adjacent', () => {
    const player: [number, number] = [120, 20];
    const near = destinationPoint(player, 45, PIRATE_SPOT_KM - 5);
    const r = stepFleet(pirate(near), player, ne, 0.01, 0, rand, sea);
    expect(r.event?.type).toBe('pirateChase');
    expect(r.fleet!.mode).toBe('chase');
    const far = { ...r.fleet!, position: destinationPoint(player, 45, PIRATE_GIVE_UP_KM + 5) };
    const r2 = stepFleet(far, player, ne, 0.01, 0, rand, sea);
    expect(r2.event?.type).toBe('pirateEscaped');
    const close = { ...r.fleet!, position: destinationPoint(player, 45, 2) };
    const r3 = stepFleet(close, player, ne, 0.01, 0, rand, sea);
    expect(r3.event?.type).toBe('pirateContact');
    expect(r3.fleet).toBeNull();
  });

  it('can be outrun by running downwind in a junk', () => {
    // 玩家往西南順風跑，海盜從東北方追來
    const junk = motion(200, 2, ne, null, 'lug', 185).speed;
    const player: [number, number] = [118, 20];
    let f = { ...pirate(destinationPoint(player, 20, 40)), mode: 'chase' as const };
    let p = player;
    for (let t = 0; t < 2; t += 0.02) {
      p = destinationPoint(p, 200, junk * 0.02);
      f = stepFleet(f, p, ne, 0.02, t, rand, sea).fleet as typeof f;
    }
    expect(distanceKm(f.position, p)).toBeGreaterThan(40);
  });
});

describe('storms you can see', () => {
  it('appear upwind, drift, and only hit you inside', () => {
    const risk = { kind: 'typhoon' as const, name: '颱風', chancePerDay: 0.05, lesson: '夏秋颱風' };
    const s = spawnStorm(1, [120, 20], risk, ne, 0, () => 0.5);
    const d0 = distanceKm(s.center, [120, 20]);
    expect(d0).toBeGreaterThan(s.radiusKm);
    expect(insideStorm([s], [120, 20])).toBeNull();
    expect(insideStorm([s], s.center)).toBe(s);
    const later = stepStorm(s, 0.5, 0.5)!;
    expect(distanceKm(later.center, s.center)).toBeCloseTo(70, 0);
    expect(stepStorm(s, 0.1, 10)).toBeNull();
  });

  it('triggers a storm encounter when the ship stays inside a cell', () => {
    let s: GameState = departPort(world, newGame(world, 'treasure-fleet', 4).state);
    s = setHelm({ ...s, eventCooldownUntil: 1e9 }, { anchored: true });
    const cell = {
      id: 99,
      center: s.ship.position,
      radiusKm: 60,
      kind: 'gale' as const,
      name: '強風',
      toward: 0,
      speed: 0,
      endDay: 10,
      lesson: '冬季強風',
    };
    s = { ...s, storms: [cell] };
    let hit = false;
    for (let i = 0; i < 40 && !hit; i++) {
      s = tick(world, s, 0.05).state;
      hit = s.encounter?.kind === 'storm';
    }
    expect(hit).toBe(true);
  });
});

describe('merchant ships', () => {
  it('trade news for an unknown port or sell supplies once', () => {
    let s: GameState = departPort(world, newGame(world, 'treasure-fleet', 4).state);
    const m: SeaFleet = {
      id: 5,
      kind: 'merchant',
      position: destinationPoint(s.ship.position, 90, 3),
      heading: 0,
      mode: 'roam',
      spawnDay: 0,
      greeted: false,
    };
    s = { ...s, fleets: [m] };
    expect(merchantInReach(s)?.id).toBe(5);
    const news = greetMerchant(world, s, 5, 'news')!;
    expect(news.state.unlockedPorts.length).toBe(s.unlockedPorts.length + 1);
    expect(merchantInReach(news.state)).toBeNull();
    expect(greetMerchant(world, news.state, 5, 'supplies')).toBeNull();
    const low = { ...s, condition: { ...s.condition, supplies: { water: 10, food: 10 } } };
    const sup = greetMerchant(world, low, 5, 'supplies')!;
    expect(sup.state.condition.supplies).toEqual({ water: 15, food: 15 });
    expect(sup.state.gold).toBe(s.gold - 20);
  });

  it('buy your whole cargo at the price of the port they are heading to', () => {
    let s: GameState = departPort(world, newGame(world, 'treasure-fleet', 4).state);
    const m: SeaFleet = {
      id: 3,
      kind: 'merchant',
      position: destinationPoint(s.ship.position, 90, 3),
      heading: 0,
      mode: 'roam',
      spawnDay: 0,
      greeted: false,
    };
    s = { ...s, fleets: [m] };
    expect(merchantOffer(world, s, 3)).toBeNull();
    s = { ...s, cargo: { silk: { qty: 10, cost: 250 } } };
    const offer = merchantOffer(world, s, 3)!;
    expect(offer.port.id).not.toBe('quanzhou');
    expect(offer.items).toEqual([{ good: 'silk', qty: 10, price: expect.any(Number) }]);
    const r = sellToMerchant(world, s, 3)!;
    expect(r.state.cargo).toEqual({});
    expect(r.state.gold).toBe(s.gold + offer.total);
    expect(r.text).toContain(offer.port.name);
    // 賣完貨還是可以打聽消息
    expect(merchantInReach(r.state)?.id).toBe(3);
  });
});

describe('the treasure fleet', () => {
  it('refills your water and grain once when you hail it', () => {
    let s: GameState = departPort(world, newGame(world, 'treasure-fleet', 4).state);
    const a: SeaFleet = {
      id: 9,
      kind: 'armada',
      position: destinationPoint(s.ship.position, 90, 15),
      heading: 0,
      mode: 'roam',
      spawnDay: 0,
      greeted: false,
    };
    s = { ...s, fleets: [a], condition: { ...s.condition, supplies: { water: 5, food: 6 } } };
    expect(armadaInReach(s)?.id).toBe(9);
    const r = greetArmada(world, s, 9)!;
    expect(r.state.condition.supplies.water).toBeGreaterThan(30);
    expect(r.state.reputation).toBe(s.reputation + 5);
    expect(armadaInReach(r.state)).toBeNull();
  });
});

describe('envoy ships', () => {
  it('tell where they come from and what tribute they carry, once', () => {
    let s: GameState = departPort(world, newGame(world, 'treasure-fleet', 4).state);
    const e: SeaFleet = {
      id: 7,
      kind: 'envoy',
      position: destinationPoint(s.ship.position, 90, 3),
      heading: 0,
      mode: 'roam',
      spawnDay: 0,
      greeted: false,
    };
    s = { ...s, fleets: [e] };
    expect(envoyInReach(s)?.id).toBe(7);
    expect(merchantInReach(s)).toBeNull();
    const r = greetEnvoy(world, s, 7)!;
    expect(r.title).toContain('琉球');
    expect(r.state.reputation).toBe(s.reputation + 3);
    expect(envoyInReach(r.state)).toBeNull();
    expect(greetEnvoy(world, r.state, 7)).toBeNull();
  });

  it('come from every named sea of the Treasure Fleet except the imagined far south', () => {
    const tiers = world.scenarios.get('treasure-fleet')!.region_tiers;
    for (const r of world.content.regions) {
      if (r.id === 'southern-africa' || tiers[r.id] === undefined) continue;
      expect(ENVOYS[r.id], r.id).toBeDefined();
    }
  });
});

describe('看岸形', () => {
  it('needs daylight and a coast in sight, and fixes the position when right', () => {
    let s: GameState = departPort(world, newGame(world, 'treasure-fleet', 5).state);
    s = { ...s, nav: { day: -3, errorKm: 2 } };
    expect(coastSightBlocked(world, s)).toBeNull();
    const choices = coastChoices(world, s, () => 0.3);
    expect(choices).toHaveLength(3);
    expect(new Set(choices.map((c) => c.name)).size).toBe(3);
    const nearest = [...choices].sort(
      (a, b) => distanceKm(a.location, s.ship.position) - distanceKm(b.location, s.ship.position),
    )[0];
    const wrong = choices.find((c) => c.id !== nearest.id)!;
    const miss = coastSighting(world, s, wrong.id)!;
    expect(miss.correct).toBe(false);
    expect(coastSightBlocked(world, miss.state)).toContain('今天');
    const hit = coastSighting(world, s, nearest.id)!;
    expect(hit.correct).toBe(true);
    expect(positionErrorKm(world, hit.state)).toBeLessThanOrEqual(10);
    // 夜裡或遠洋都不行
    expect(coastSightBlocked(world, { ...s, day: 14 / 24 })).toContain('天黑');
    const ocean = { ...s, ship: { position: [128, 20] as [number, number], heading: 0 } };
    expect(coastSightBlocked(world, ocean)).toContain('海岸');
  });
});

describe('測深', () => {
  const isLand = (p: [number, number]) => coast.isLand(p);

  it('finds no bottom in the open ocean', () => {
    const r = soundAt([80, -10], isLand);
    expect(r.tuo).toBeNull();
    expect(soundingText(r)).toContain('深海');
  });

  it('is shallow and flat on the East China Sea shelf even out of sight of land', () => {
    const r = soundAt([124.5, 30], isLand);
    expect(r.shelf).toContain('大陸棚');
    expect(r.tuo).not.toBeNull();
    expect(r.tuo!).toBeLessThanOrEqual(45);
  });

  it('near the coast tells how far land is and fixes the position once lost', () => {
    let s = departPort(world, newGame(world, 'treasure-fleet', 1).state);
    s = { ...s, nav: { day: s.day, errorKm: 120 } };
    const r = takeSounding(world, s)!;
    expect(r.sounding.landKm).not.toBeNull();
    expect(r.sounding.landKm!).toBeLessThanOrEqual(25);
    expect(r.fixed).toBe(true);
    expect(positionErrorKm(world, r.state)).toBeLessThanOrEqual(25);
    expect(r.lesson).toContain('大陸棚');
    // 第二次不再附小教室
    expect(takeSounding(world, r.state)!.lesson).toBeNull();
  });
});

describe('海霧', () => {
  it('rolls in over cold seas in the right season only', () => {
    expect(mistZoneAt([122, 29], 4)).not.toBeNull();
    expect(mistZoneAt([122, 29], 11)).toBeNull();
    expect(mistZoneAt([54.5, 16.5], 7)).not.toBeNull();
    expect(mistZoneAt([90, 10], 7)).toBeNull();
  });

  it('drifts in from upwind, and inside it you cannot see coast or stars', () => {
    const zone = mistZoneAt([122, 29], 4)!;
    const m = spawnMist(1, [122, 29], zone, ne, 0, () => 0.5);
    // 東北季風往西南吹：霧從東北方飄過來
    expect(distanceKm(m.center, [122, 29])).toBeGreaterThan(40);
    expect(m.lesson).toContain('霧');

    let s: GameState = departPort(world, newGame(world, 'treasure-fleet', 5).state);
    s = { ...s, nav: { day: s.day, errorKm: 2 } };
    const fogged = { ...s, mists: [{ ...m, center: s.ship.position, endDay: 99 }] };
    expect(insideMist(fogged.mists, s.ship.position)).not.toBeNull();
    expect(coastSightBlocked(world, fogged)).toContain('霧');
    expect(starSightBlocked({ ...fogged, day: 14 / 24 })).toContain('霧');
  });

  it('hides you from pirates until they are very close', () => {
    const pirate: SeaFleet = {
      id: 1,
      kind: 'pirate',
      position: [120.3, 20],
      heading: 0,
      mode: 'roam',
      spawnDay: 0,
      greeted: false,
    };
    const clear = stepFleet(pirate, [120, 20], ne, 0.01, 0, () => 0.5, sea);
    const misty = stepFleet(pirate, [120, 20], ne, 0.01, 0, () => 0.5, sea, MIST_PIRATE_SPOT_KM);
    expect(clear.fleet?.mode).toBe('chase');
    expect(misty.fleet?.mode).toBe('roam');
  });
});

describe('treasure fleet era', () => {
  it('only sails Asian waters during the Ming voyages', async () => {
    const { treasureFleetSeas } = await import('./state');
    const tf = newGame(world, 'treasure-fleet', 1).state;
    const iu = newGame(world, 'into-the-unknown', 1).state;
    expect(treasureFleetSeas(tf, 'arabian-sea')).toBe(true);
    expect(treasureFleetSeas(tf, 'west-africa')).toBe(false);
    expect(treasureFleetSeas(tf, null)).toBe(false);
    // 1487 年，鄭和下西洋已經結束半個多世紀
    expect(treasureFleetSeas(iu, 'arabian-sea')).toBe(false);
  });
});

describe('日出日落依緯度與季節', () => {
  it('has white nights in the far north in summer and polar night in winter', async () => {
    const { daylightHours, isNight, darkness, solarDeclination } = await import('./navigation');
    const june = solarDeclination(6, 21);
    const dec = solarDeclination(12, 21);
    // 赤道附近一年到頭白天約 12 小時
    expect(daylightHours(0, june)).toBeCloseTo(12, 0);
    // 北極圈以北：夏至永晝、冬至永夜
    expect(daylightHours(70, june)).toBe(24);
    expect(daylightHours(70, dec)).toBe(0);
    // 北緯 63° 的初夏半夜：白夜，看不到星星
    const midnight = (24 - 6) / 24;
    expect(isNight(midnight, { lat: 63, decl: june })).toBe(false);
    expect(darkness(midnight, { lat: 63, decl: june })).toBeLessThan(0.6);
    // 同一時間在低緯度就是黑夜
    expect(isNight(midnight, { lat: 20, decl: june })).toBe(true);
  });
});
