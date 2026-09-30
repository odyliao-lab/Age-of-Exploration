import { describe, expect, it } from 'vitest';
import { crewTalk, type TalkContext } from './crewTalk';
import { departPort, hearRumor, newGame, setHelm, tick, type GameState } from './state';
import { contentForTests } from './testContent';
import { buildWorld } from './world';

const world = buildWorld(contentForTests());
const ne = { toward: 225, strength: 0.8, name: '東北季風', from: '東北' };
const base: TalkContext = {
  position: [120, 24],
  wind: ne,
  current: null,
  night: false,
  region: null,
  lastRegionId: null,
  openRumors: [],
  hinted: [],
  speakers: [],
  roll: 0.1,
  chatReady: false,
};

describe('crew talk', () => {
  it('introduces a new sea once', () => {
    const region = world.regions.get('east-china-sea')!;
    const t = crewTalk({ ...base, region })!;
    expect(t.region).toBe('east-china-sea');
    expect(t.text).toContain(region.name);
    expect(crewTalk({ ...base, region, lastRegionId: 'east-china-sea' })).toBeNull();
  });

  it('tags sightings of sea life so the chart can draw them', () => {
    const seen = new Set<string>();
    const region = world.regions.get('east-china-sea')!;
    for (let r = 0; r < 1; r += 0.02) {
      const t = crewTalk({ ...base, region, lastRegionId: region.id, chatReady: true, roll: r })!;
      if (t.text.includes('海豚')) expect(t.sight).toBe('dolphins');
      if (t.text.includes('鯨魚')) expect(t.sight).toBe('whale');
      if (t.text.includes('季風')) expect(t.sight).toBeUndefined();
      if (t.sight) seen.add(t.sight);
    }
    expect(seen).toContain('dolphins');
    expect(seen).toContain('whale');
  });

  it('lets each crew member talk about home in their own voice', () => {
    const personal = [{ speaker: '法麗達', text: '忽魯謨斯那座島上幾乎沒有淡水。' }];
    let found = false;
    for (let r = 0; r < 1; r += 0.01) {
      const t = crewTalk({ ...base, chatReady: true, roll: r, speakers: ['阿福'], personal })!;
      if (t.text === personal[0].text) {
        expect(t.speaker).toBe('法麗達');
        found = true;
      }
    }
    expect(found).toBe(true);
    for (const c of world.content.crew) expect(c.lines.length, c.id).toBeGreaterThanOrEqual(2);
  });

  it('hints the direction of a rumored place without naming it', () => {
    const taiwan = world.codex.get('taiwan')!;
    const t = crewTalk({ ...base, position: [119.6, 23.6], openRumors: [taiwan] })!;
    expect(t.hintFor).toBe('taiwan');
    expect(t.text).not.toContain('台灣');
    expect(
      crewTalk({ ...base, position: [119.6, 23.6], openRumors: [taiwan], hinted: ['taiwan'] }),
    ).toBeNull();
  });

  it('chats about wind, currents and latitude when the crew is ready', () => {
    const t = crewTalk({ ...base, position: [120, 23.5], chatReady: true, speakers: ['阿福'] })!;
    expect(t.chat).toBe(true);
    expect(t.speaker).toBe('阿福');
    expect(t.text.length).toBeGreaterThan(10);
  });

  it('talks while sailing but not every moment', () => {
    let s: GameState = hearRumor(world, newGame(world, 'treasure-fleet', 9).state, 'taiwan');
    s = setHelm(departPort(world, { ...s, eventCooldownUntil: 1e9 }), { anchored: true });
    let talks = 0;
    for (let i = 0; i < 100; i++) {
      const r = tick(world, s, 0.05);
      s = { ...r.state, encounter: null };
      talks += r.events.filter((e) => e.type === 'talk').length;
    }
    expect(talks).toBeGreaterThanOrEqual(2);
    expect(talks).toBeLessThanOrEqual(6);
  });
});
