import { describe, expect, it } from 'vitest';
import { distanceKm } from '@/geo/geo';
import { CoastIndex } from '@/geo/coast';
import { loadDetailedLand } from '@/map/land';
import {
  angleDiff,
  angleOffWind,
  gustyWind,
  knots,
  motion,
  sailPolar,
  turnToward,
} from './sailing';
import { bearingDeg } from '@/geo/geo';
import { findSeaPath } from '@/geo/seaPath';
import { destinationPoint } from './events';
import {
  approachHint,
  autoSail,
  harborEntrance,
  departPort,
  enterPort,
  familiarRoutes,
  hearRumor,
  investigate,
  newGame,
  openRumors,
  portInReach,
  rumorInReach,
  reportFinds,
  reportReward,
  rivalAtTavern,
  rivalShipInReach,
  hailRival,
  RIVAL_BONUS,
  rumorsAt,
  setHelm,
  unreportedFinds,
  tick,
  waitInPort,
  daysUntilMorning,
  daysUntilNextMonth,
  gameDate,
  INN_PRICE_PER_NIGHT,
  FESTIVAL_REWARD,
  type GameState,
} from './state';
import { contentForTests } from './testContent';
import { buildWorld } from './world';

const coast = new CoastIndex(await loadDetailedLand());
const world = buildWorld(contentForTests(), coast);

const ne = { toward: 225, strength: 0.8, name: '東北季風', from: '東北' };

describe('sail physics', () => {
  it('measures angles off the wind', () => {
    expect(angleDiff(10, 350)).toBe(20);
    expect(angleDiff(350, 10)).toBe(-20);
    // 東北季風從 45° 吹來
    expect(angleOffWind(45, ne)).toBe(0);
    expect(angleOffWind(225, ne)).toBe(180);
    expect(angleOffWind(135, ne)).toBe(90);
    expect(turnToward(350, 20, 10)).toBe(0);
    expect(turnToward(350, 20, 90)).toBe(20);
  });

  it('cannot sail into the wind and square rigs need a wider angle', () => {
    expect(sailPolar(30, 'lug')).toBe(0);
    expect(sailPolar(60, 'lug')).toBeGreaterThan(0.4);
    expect(sailPolar(60, 'square')).toBe(0);
    expect(sailPolar(125, 'lug')).toBe(1);
    expect(sailPolar(180, 'square')).toBe(1);
  });

  it('adds sail thrust and current drift', () => {
    const into = motion(45, 2, ne, null, 'lug', 185);
    expect(into.speed).toBe(0);
    expect(into.pointOfSail).toBe('頂風');
    const reach = motion(135, 2, ne, null, 'lug', 185);
    expect(reach.pointOfSail).toBe('橫風');
    expect(knots(reach.speed)).toBeGreaterThan(2.5);
    expect(motion(135, 1, ne, null, 'lug', 185).speed).toBeLessThan(reach.speed);
    // 收帆時只剩洋流：黑潮往北推
    const drift = motion(
      135,
      0,
      ne,
      { id: 'k', name: '黑潮', warm: true, toward: 0, strength: 1 },
      'lug',
      185,
    );
    expect(drift.throughWater).toBe(0);
    expect(drift.course).toBe(0);
    expect(drift.speed).toBeCloseTo(70);
  });

  it('varies the wind a little over time but keeps the monsoon direction', () => {
    const a = gustyWind(ne, [119, 24], 0);
    const b = gustyWind(ne, [119, 24], 3);
    expect(a).toEqual(gustyWind(ne, [119, 24], 0));
    expect(a.toward).not.toBe(b.toward);
    expect(Math.abs(angleDiff(a.toward, 225))).toBeLessThanOrEqual(18);
  });
});

describe('coast', () => {
  it('tells land from sea at 1:50m detail', () => {
    expect(coast.isLand([121, 23.8])).toBe(true); // 台灣中部
    expect(coast.isLand([119.6, 23.9])).toBe(false); // 台灣海峽
    expect(coast.isLand([109.7, 19.2])).toBe(true); // 海南島
    expect(coast.isLand([118.7, 24.3])).toBe(false); // 泉州灣外
  });
});

describe('hands-on sailing', () => {
  const fresh = (): GameState => {
    const s = newGame(world, 'treasure-fleet', 7).state;
    return { ...s, eventCooldownUntil: 1e9 };
  };
  /** 關掉風暴與事件，只測航行 */
  const sail = (s: GameState, days: number) => {
    let out = s;
    for (let t = 0; t < days; t += 0.05) {
      out = tick(world, out, 0.05).state;
      if (out.encounter) out = { ...out, encounter: null };
    }
    return out;
  };

  it('leaves port onto open water and enters again', () => {
    const s = departPort(world, fresh());
    expect(s.dockedAt).toBeNull();
    expect(s.helm).toMatchObject({ sail: 1, anchored: false });
    expect(coast.isLand(s.ship.position)).toBe(false);
    expect(portInReach(world, s)).toBe('quanzhou');
    const back = enterPort(world, s, 'quanzhou');
    expect(back.state.dockedAt).toBe('quanzhou');
    expect(back.state.helm).toBeNull();
  });

  it('finds open water outside every port and can come back in', () => {
    for (const port of world.content.ports) {
      const docked = { ...fresh(), dockedAt: port.id, unlockedPorts: [port.id] };
      const s = departPort(world, docked);
      expect(s.helm, port.id).not.toBeNull();
      expect(coast.isLand(s.ship.position), port.id).toBe(false);
      expect(portInReach(world, s), port.id).toBe(port.id);
    }
  });

  it('runs downwind with the winter monsoon and passes time at sea', () => {
    let s = departPort(world, fresh());
    s = setHelm(s, { course: 230, sail: 2 });
    const start = s.ship.position;
    s = sail(s, 1);
    expect(s.day).toBeCloseTo(1, 5);
    const km = distanceKm(start, s.ship.position);
    expect(km).toBeGreaterThan(80);
    expect(s.condition.daysAtSea).toBeGreaterThan(0);
    expect(coast.isLand(s.ship.position)).toBe(false);
  });

  it('barely moves when heading into the wind', () => {
    let s = departPort(world, fresh());
    s = setHelm(s, { course: 45, sail: 2 });
    s = sail(s, 0.3); // 先轉到逆風
    const start = s.ship.position;
    s = sail(s, 1);
    expect(distanceKm(start, s.ship.position)).toBeLessThan(40);
  });

  it('never sails across land: slides along the coast or stops', () => {
    let s = departPort(world, fresh());
    // 朝西北的大陸開（橫風，速度夠快），一定會碰到海岸
    s = setHelm(s, { course: 300, sail: 2 });
    for (let t = 0; t < 3; t += 0.05) {
      s = tick(world, s, 0.05).state;
      if (s.encounter) s = { ...s, encounter: null };
      expect(coast.isLand(s.ship.position)).toBe(false);
    }
    // 沒有穿過大陸跑到內陸去（泉州西北方的陸地在東經 118° 附近）
    expect(s.ship.position[0]).toBeGreaterThan(117);
  });

  it('stops when completely boxed in by land', () => {
    let s = departPort(world, fresh());
    // 把船放在海灣裡、船頭正對陸地的死角：左右都偏不出去時就停住並提醒
    s = { ...s, ship: { position: s.ship.position, heading: 300 } };
    const boxed = {
      ...world,
      coast: {
        isLand: (p: [number, number]) =>
          p[0] < s.ship.position[0] - 0.001 || p[1] > s.ship.position[1] + 0.001,
      },
    } as unknown as typeof world;
    s = setHelm(s, { course: 315, sail: 2 });
    const r = tick(boxed, s, 0.05);
    expect(r.state.helm!.blocked).toBe(true);
    expect(r.events.some((e) => e.type === 'warning')).toBe(true);
  });

  it('stays put at anchor', () => {
    let s = departPort(world, fresh());
    s = setHelm(s, { anchored: true });
    const start = s.ship.position;
    s = sail(s, 1);
    expect(s.ship.position).toEqual(start);
    expect(s.day).toBeCloseTo(1, 5);
  });
});

describe('rumors and investigation', () => {
  it('hears a rumor in port, sails there by hand and investigates', () => {
    let s: GameState = { ...newGame(world, 'treasure-fleet', 3).state, eventCooldownUntil: 1e9 };
    expect(rumorsAt(world, s, 'quanzhou').map((c) => c.id)).toContain('taiwan');
    s = hearRumor(world, s, 'taiwan');
    expect(openRumors(world, s).map((c) => c.id)).toEqual(['taiwan']);
    expect(rumorsAt(world, s, 'quanzhou').map((c) => c.id)).not.toContain('taiwan');

    // 傳聞的地點不會因為路過就自動發現
    const target = world.codex.get('taiwan')!.location!;
    s = setHelm(departPort(world, s), { sail: 2 });
    for (let t = 0; t < 12 && !rumorInReach(world, s); t += 0.05) {
      s = setHelm(s, { course: bearingDeg(s.ship.position, target) });
      s = tick(world, s, 0.05).state;
      if (s.encounter) s = { ...s, encounter: null };
    }
    expect(rumorInReach(world, s)).toBe('taiwan');
    expect(s.discovered).not.toContain('taiwan');
    expect(s.day).toBeLessThan(6);

    const xp = s.captain.xp;
    const r = investigate(world, s, 'taiwan');
    expect(r.state.discovered).toContain('taiwan');
    expect(r.events).toContainEqual({ type: 'discovered', codexId: 'taiwan' });
    expect(r.state.captain.xp).toBeGreaterThan(xp);
    expect(r.state.reputation).toBe(s.reputation + 5);
    expect(openRumors(world, r.state)).toEqual([]);
    expect(investigate(world, r.state, 'taiwan').state).toBe(r.state);

    // 回港向學者回報，拿賞金；只能回報一次
    const docked = { ...r.state, helm: null, dockedAt: 'quanzhou' };
    expect(unreportedFinds(world, docked).map((c) => c.id)).toEqual(['taiwan']);
    const rep = reportFinds(world, docked);
    expect(rep.count).toBe(1);
    expect(rep.state.gold).toBe(docked.gold + reportReward(world, world.codex.get('taiwan')!).gold);
    expect(reportFinds(world, rep.state).count).toBe(0);
  });
});

describe('rumor content', () => {
  it('puts every rumored place on open water within reach of its port', () => {
    expect(world.rumors.length).toBeGreaterThanOrEqual(10);
    for (const c of world.rumors) {
      expect(coast.isLand(c.location!), c.id).toBe(false);
      const port = world.ports.get(c.rumor!.port)!;
      expect(distanceKm(port.location, c.location!), c.id).toBeLessThan(1800);
      // 傳聞地點不能被路過自動發現
      expect(world.landmarks.map((l) => l.id)).not.toContain(c.id);
    }
  });
});

describe('familiar routes', () => {
  it('remembers a hand-sailed route both ways and can sail it automatically', () => {
    let s: GameState = departPort(world, newGame(world, 'treasure-fleet', 11).state);
    const gz = world.ports.get('guangzhou')!;
    // 模擬一趟親手駕船的航跡：沿著海上航線前進，最後抵達廣州附近
    const path = findSeaPath(s.ship.position, gz.location, [...world.harbors.values()])!;
    s = { ...s, trail: path.slice(0, -1), ship: { position: path[path.length - 2], heading: 230 } };
    s = {
      ...s,
      unlockedPorts: [...s.unlockedPorts, 'guangzhou'],
      ship: { position: destinationPoint(gz.location, 150, 10), heading: 0 },
    };
    expect(portInReach(world, s)).toBe('guangzhou');
    s = enterPort(world, s, 'guangzhou').state;
    expect(Object.keys(s.routes).sort()).toEqual(['guangzhou>quanzhou', 'quanzhou>guangzhou']);
    const back = familiarRoutes(world, s, 'guangzhou');
    expect(back.map((r) => r.to)).toEqual(['quanzhou']);
    expect(back[0].days).toBeGreaterThan(1);
    s = autoSail(world, { ...s, eventCooldownUntil: 1e9 }, 'quanzhou');
    expect(s.voyage?.destinationPortId).toBe('quanzhou');
    for (let i = 0; i < 400 && s.voyage; i++) {
      s = tick(world, s, 0.1).state;
      if (s.encounter) s = { ...s, encounter: null };
    }
    expect(s.dockedAt).toBe('quanzhou');
  });
});

describe('harbor entrances', () => {
  it('points the way into river ports like Guangzhou', () => {
    let s: GameState = departPort(world, newGame(world, 'treasure-fleet', 12).state);
    s = {
      ...s,
      unlockedPorts: [...s.unlockedPorts, 'guangzhou'],
      ship: { position: [114.3, 22.2], heading: 0 },
    };
    expect(portInReach(world, s)).toBeNull();
    const hint = approachHint(world, s)!;
    expect(hint.portId).toBe('guangzhou');
    const entrance = harborEntrance(world, 'guangzhou')!;
    expect(coast.isLand(entrance)).toBe(false);
    expect(portInReach(world, { ...s, ship: { position: entrance, heading: 0 } })).toBe(
      'guangzhou',
    );
  });
});

describe('sighting ports along the coast', () => {
  it('marks an unknown port on the chart when you sail close by', () => {
    const s0 = departPort(world, newGame(world, 'treasure-fleet', 1).state);
    const fuzhou = world.ports.get('fuzhou')!;
    expect(s0.unlockedPorts).not.toContain('fuzhou');
    const near = destinationPoint(fuzhou.location, 100, 30);
    const s: GameState = {
      ...s0,
      ship: { position: near, heading: 0 },
      helm: { ...s0.helm!, anchored: true },
    };
    const r = tick(world, s, 0.05);
    expect(r.state.unlockedPorts).toContain('fuzhou');
    expect(r.events.some((e) => e.type === 'portUnlocked' && e.portId === 'fuzhou')).toBe(true);
  });
});

describe('rival captain', () => {
  const docked = (): GameState => ({
    ...newGame(world, 'treasure-fleet', 1).state,
    rumors: ['taiwan'],
  });

  it('challenges you to find a rumored place first, and pays a bonus if you win', () => {
    const a = rivalAtTavern(world, docked());
    expect(a.news?.type).toBe('challenge');
    expect(a.state.rival.target).toBe('taiwan');
    // 同一天再進酒館不會重複下戰帖
    expect(rivalAtTavern(world, a.state).news).toBeNull();
    const found = { ...a.state, discovered: [...a.state.discovered, 'taiwan'] };
    const plain = reportFinds(world, { ...found, rival: { ...found.rival, target: null } });
    const r = reportFinds(world, found);
    expect(r.raceWon).toBe(true);
    expect(r.gold).toBe(plain.gold + RIVAL_BONUS.gold);
    expect(r.state.rival).toMatchObject({ target: null, wins: 1 });
  });

  it('wins the race if you are too slow, without any penalty', () => {
    const a = rivalAtTavern(world, docked()).state;
    const late = { ...a, day: a.rival.due + 1 };
    const r = rivalAtTavern(world, late);
    expect(r.news?.type).toBe('lost');
    expect(r.state.rival).toMatchObject({ target: null, losses: 1 });
    expect(r.state.gold).toBe(late.gold);
  });
});

describe('festivals in port', () => {
  it('reward joining the celebration once when you arrive during one', () => {
    let s = departPort(world, newGame(world, 'treasure-fleet', 1).state);
    // 1406 年 2 月：泉州的元宵節
    s = { ...s, day: 55, condition: { ...s.condition, morale: 40 } };
    s = { ...s, ship: { position: harborEntrance(world, 'quanzhou')!, heading: 0 } };
    const r = enterPort(world, s, 'quanzhou');
    expect(r.state.dockedAt).toBe('quanzhou');
    expect(r.state.reputation).toBe(s.reputation + FESTIVAL_REWARD.reputation);
    expect(r.state.festivalsSeen).toHaveLength(1);
    expect(r.events.some((e) => e.type === 'talk' && e.text.includes('元宵節'))).toBe(true);
    // 同一年再進港不會重複
    const again = enterPort(
      world,
      {
        ...departPort(world, r.state),
        ship: { position: harborEntrance(world, 'quanzhou')!, heading: 0 },
      },
      'quanzhou',
    );
    expect(again.state.festivalsSeen).toHaveLength(1);
  });
});

describe('the rival at sea', () => {
  it('can be hailed while racing, and reminds you of the deadline', () => {
    let s = departPort(world, newGame(world, 'treasure-fleet', 1).state);
    s = {
      ...s,
      rumors: ['taiwan'],
      rival: { ...s.rival, target: 'taiwan', due: s.day + 9 },
      fleets: [
        {
          id: 4,
          kind: 'rival',
          position: destinationPoint(s.ship.position, 90, 5),
          heading: 0,
          mode: 'roam',
          spawnDay: 0,
          greeted: false,
        },
      ],
    };
    expect(rivalShipInReach(s)?.id).toBe(4);
    const r = hailRival(world, s, 4)!;
    expect(r.text).toContain('9 天');
    expect(rivalShipInReach(r.state)).toBeNull();
  });
});

describe('waiting in port', () => {
  it('passes the night or the rest of the month at the inn', () => {
    const s = newGame(world, 'treasure-fleet', 1).state;
    const night = waitInPort(world, s, daysUntilMorning(s)).state;
    expect(night.day).toBe(1);
    expect(night.gold).toBe(s.gold - INN_PRICE_PER_NIGHT);
    const month = waitInPort(world, s, daysUntilNextMonth(s)).state;
    expect(gameDate(month).day).toBe(1);
    expect(gameDate(month).month).toBe(1);
    expect(month.condition.supplies).toEqual(s.condition.supplies);
    // 錢不夠就住不了
    expect(waitInPort(world, { ...s, gold: 0 }, 1).state.day).toBe(s.day);
  });
});

describe('上岸取水', () => {
  it('fills the water casks near a green coast but finds nothing on a desert coast', async () => {
    const { fetchWater, fetchWaterBlocked, WATER_FETCH_DAYS } = await import('./state');
    const s0 = departPort(world, newGame(world, 'into-the-unknown', 3).state);
    const low = { ...s0.condition, supplies: { water: 5, food: 5 } };
    // 幾內亞灣的海岸：雨量多，找得到河流
    const green: GameState = {
      ...s0,
      ship: { position: [-1.3, 4.95], heading: 90 },
      condition: low,
    };
    expect(fetchWaterBlocked(world, green)).toBeNull();
    const r = fetchWater(world, green)!;
    expect(r.found).toBe(true);
    expect(r.state.condition.supplies.water).toBe(5 + WATER_FETCH_DAYS);
    expect(fetchWaterBlocked(world, r.state)).not.toBeNull();
    // 納米比沙漠的海岸：找不到淡水
    const desert: GameState = {
      ...s0,
      ship: { position: [14.3, -22.9], heading: 180 },
      condition: low,
    };
    expect(fetchWaterBlocked(world, desert)).toBeNull();
    const d = fetchWater(world, desert)!;
    expect(d.found).toBe(false);
    expect(d.state.condition.supplies.water).toBe(5);
    // 大洋中央看不到岸
    const ocean: GameState = { ...s0, ship: { position: [-30, 0], heading: 180 } };
    expect(fetchWaterBlocked(world, ocean)).toBe('離岸太遠了');
  });
});
