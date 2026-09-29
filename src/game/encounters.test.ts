import { describe, expect, it } from 'vitest';
import { bearingDeg } from '@/geo/geo';
import { CoastIndex } from '@/geo/coast';
import { loadDetailedLand } from '@/map/land';
import { destinationPoint } from './events';
import {
  PIRATE_SPOT_KM,
  moveTraffic,
  spawnTraffic,
  type SeaShip,
  type TrafficContext,
} from './traffic';
import { inFog, moveWeather, spawnWeather, stormTrack, type WeatherCell } from './weather';
import {
  departPort,
  enterPort,
  investigate,
  newGame,
  resolveEvent,
  setHelm,
  sightBlocked,
  starSight,
  tick,
  type GameState,
} from './state';
import { degToJiao, navErrorKm } from './navigation';
import { contentForTests } from './testContent';
import { buildWorld } from './world';

const coast = new CoastIndex(await loadDetailedLand());
const world = buildWorld(contentForTests(), coast);

const ne = { toward: 225, strength: 0.8, name: '東北季風', from: '東北' };
const sea = () => false;

function pirateAt(player: [number, number], bearing: number, km: number): SeaShip {
  return {
    id: 1,
    kind: 'pirate',
    position: destinationPoint(player, bearing, km),
    heading: 0,
    expireDay: 99,
    mode: 'roam',
  };
}

describe('pirates', () => {
  const player: [number, number] = [104, 3];
  const ctx = (p: [number, number], day = 0): TrafficContext => ({
    player: p,
    day,
    wind: ne,
    nearPort: false,
    isLand: sea,
  });

  it('spots the player and gives chase', () => {
    const r = moveTraffic([pirateAt(player, 90, PIRATE_SPOT_KM - 5)], 0.01, ctx(player));
    expect(r.events.map((e) => e.type)).toContain('spotted');
    expect(r.ships[0].mode).toBe('chase');
  });

  it('catches a ship that sits still downwind of it', () => {
    // 海盜在玩家東北方（上風處），順風追下來很快
    let ships = [pirateAt(player, 45, 40)];
    let caught = false;
    for (let d = 0; d < 1.5 && !caught; d += 0.02) {
      const r = moveTraffic(ships, 0.02, ctx(player, d));
      ships = r.ships;
      caught = r.events.some((e) => e.type === 'caught');
    }
    expect(caught).toBe(true);
  });

  it('cannot catch a ship that runs upwind of it while the pirate must beat into the wind', () => {
    // 海盜在玩家西南方（下風處）：要頂著東北季風追，只能走之字形
    let ships = [pirateAt(player, 225, 45)];
    let p = player;
    let outcome: string | null = null;
    for (let d = 0; d < 3 && !outcome; d += 0.02) {
      // 玩家以橫風往東南跑（約 150 公里／日）
      p = destinationPoint(p, 135, 150 * 0.02);
      const r = moveTraffic(ships, 0.02, ctx(p, d));
      ships = r.ships;
      outcome = r.events.find((e) => e.type === 'caught' || e.type === 'escaped')?.type ?? null;
    }
    expect(outcome).toBe('escaped');
  });

  it('gives up near a port', () => {
    const chasing = { ...pirateAt(player, 90, 20), mode: 'chase' as const, chaseSince: 0 };
    const r = moveTraffic([chasing], 0.02, { ...ctx(player), nearPort: true });
    expect(r.events[0].type).toBe('escaped');
    expect(r.ships[0].mode).toBe('giveUp');
  });

  it('only spawns in pirate waters', () => {
    const base = {
      ...ctx(player),
      nextId: 1,
      ports: [{ id: 'malacca', location: [102.25, 2.19] as [number, number] }],
      envoyCountries: ['占城'],
      inRegion: false,
    };
    const always = { ...base, rand: () => 0 };
    expect(spawnTraffic([], 1, always).map((s) => s.kind)).toEqual(['pirate']);
    expect(spawnTraffic([], 1, { ...always, player: [119, 24] })).toEqual([]);
  });
});

describe('merchants', () => {
  it('hails when passing close by', () => {
    const player: [number, number] = [112, 15];
    const m: SeaShip = {
      id: 2,
      kind: 'merchant',
      position: destinationPoint(player, 0, 20),
      heading: 180,
      expireDay: 9,
      mode: 'roam',
      from: 'malacca',
    };
    let ships = [m];
    let hailed = false;
    for (let d = 0; d < 0.5 && !hailed; d += 0.01) {
      const r = moveTraffic(ships, 0.01, {
        player,
        day: d,
        wind: ne,
        nearPort: false,
        isLand: sea,
      });
      ships = r.ships;
      hailed = r.events.some((e) => e.type === 'hail');
    }
    expect(hailed).toBe(true);
    expect(ships).toEqual([]);
  });
});

describe('weather cells', () => {
  it('spawns typhoons upstream that drift toward the player', () => {
    const player: [number, number] = [118, 20];
    const risk = {
      chancePerDay: 0.07,
      kind: 'typhoon' as const,
      name: '颱風',
      lesson: '',
    };
    const cells = spawnWeather([], 30, {
      player,
      day: 0,
      month: 8,
      wind: ne,
      risk,
      rand: () => 0.5,
      nextId: 1,
    });
    expect(cells).toHaveLength(1);
    const c = cells[0];
    expect(c.kind).toBe('storm');
    expect(stormTrack('typhoon', 20)).toBe(300);
    // 在玩家的東南方（上游）生成
    const b = bearingDeg(player, c.center);
    expect(b).toBeGreaterThan(90);
    expect(b).toBeLessThan(150);
    // 一天後更接近玩家，最後掃過玩家時要面對風暴
    let cs: WeatherCell[] = cells;
    const events: string[] = [];
    for (let d = 0; d < 4; d += 0.05) {
      const r = moveWeather(cs, 0.05, player, d);
      cs = r.cells;
      events.push(...r.events.map((e) => e.type));
    }
    expect(events[0]).toBe('stormNear');
    expect(events).toContain('enterStorm');
  });

  it('fog is common in the East China Sea in spring', () => {
    const cells = spawnWeather([], 1, {
      player: [121, 26],
      day: 0,
      month: 4,
      wind: ne,
      risk: { chancePerDay: 0, kind: 'none', name: '', lesson: '' },
      rand: () => 0.1,
      nextId: 1,
    });
    expect(cells[0].kind).toBe('fog');
    expect(inFog(cells, cells[0].center)).toBe(true);
  });
});

describe('navigation in the game', () => {
  const atSea = (): GameState => {
    const s = newGame(world, 'treasure-fleet', 11).state;
    return setHelm(departPort(world, { ...s, eventCooldownUntil: 1e9 }), { sail: 2 });
  };

  it('grows position error far from land and fixes latitude with a star sight', () => {
    // 放到南海中央，看不到陸地
    let s: GameState = { ...atSea(), ship: { position: [115, 16], heading: 225 } };
    s = setHelm(s, { course: 225 });
    for (let t = 0; t < 3; t += 0.05) {
      s = tick(world, s, 0.05).state;
      if (s.encounter) s = { ...s, encounter: null };
    }
    expect(navErrorKm(s.nav)).toBeGreaterThan(15);

    // 白天不能觀星
    const noon = { ...s, day: Math.floor(s.day) + 0.5 };
    expect(sightBlocked(noon)).toBe('daytime');
    expect(starSight(world, noon, 40).sight).toBeNull();

    const night = { ...s, day: Math.floor(s.day) + 0.9, weather: [] };
    expect(sightBlocked(night)).toBeNull();
    const lat = night.ship.position[1];
    const r = starSight(world, night, degToJiao(lat));
    expect(r.sight!.quality).toBe('exact');
    expect(Math.abs(r.state.nav.errorN)).toBeLessThan(60);
    expect(r.state.nav.errorE).toBe(night.nav.errorE);
    expect(r.state.captain.xp).toBeGreaterThan(night.captain.xp);
    expect(r.state.stats.starsCorrect).toBe(night.stats.starsCorrect + 1);
    // 同一晚只能量一次
    expect(sightBlocked(r.state)).toBe('done-tonight');
  });

  it('cannot confirm a rumor site while badly lost', () => {
    let s = atSea();
    s = { ...s, rumors: ['taiwan'], ship: { position: [120.1, 23], heading: 90 } };
    s = { ...s, nav: { ...s.nav, errorE: 90, errorN: 40 } };
    const r = investigate(world, s, 'taiwan');
    expect(r.state.discovered).not.toContain('taiwan');
    expect(r.events[0].type).toBe('warning');
    const fixed = { ...s, nav: { ...s.nav, errorE: 3, errorN: 2 } };
    expect(investigate(world, fixed, 'taiwan').state.discovered).toContain('taiwan');
  });

  it('meets merchants and envoys while sailing and can answer them', () => {
    let s = atSea();
    s = setHelm(s, { course: 220 });
    const seen = new Set<string>();
    for (let t = 0; t < 30 && seen.size < 2; t += 0.05) {
      s = tick(world, s, 0.05).state;
      const e = s.encounter;
      if (e?.kind === 'event' && (e.id === 'merchant' || e.id === 'envoy')) {
        seen.add(e.id);
        const rep = s.reputation;
        s = resolveEvent(world, s, { answer: e.question!.answer }).state;
        expect(s.reputation).toBeGreaterThanOrEqual(rep);
      }
      if (s.encounter) s = { ...s, encounter: null };
      if (s.dockedAt || s.helm?.blocked) {
        s = setHelm({ ...s, dockedAt: null }, { course: (s.ship.heading + 120) % 360 });
      }
    }
    expect(seen.has('merchant')).toBe(true);
  });

  it('clears traffic, weather and error in port', () => {
    const s: GameState = {
      ...atSea(),
      nav: { errorE: 50, errorN: 50, lastSightDay: -1 },
      traffic: [pirateAt([119, 24], 0, 30)],
    };
    const r = enterPort(world, s, 'quanzhou');
    expect(r.state.dockedAt).toBe('quanzhou');
    expect(navErrorKm(r.state.nav)).toBe(0);
    expect(r.state.traffic).toEqual([]);
    expect(r.state.weather).toEqual([]);
  });
});
