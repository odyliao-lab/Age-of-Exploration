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
import {
  departPort,
  enterPort,
  hearRumor,
  investigate,
  newGame,
  openRumors,
  portInReach,
  rumorInReach,
  rumorsAt,
  setHelm,
  tick,
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

  it('stops at the coast instead of sailing across land', () => {
    let s = departPort(world, fresh());
    // 朝西北的大陸開（橫風，速度夠快），一定會撞上海岸
    s = setHelm(s, { course: 300, sail: 2 });
    s = sail(s, 3);
    expect(coast.isLand(s.ship.position)).toBe(false);
    expect(s.helm!.blocked).toBe(true);
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
  });
});
