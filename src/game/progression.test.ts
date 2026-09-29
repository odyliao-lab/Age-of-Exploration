import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from './achievements';
import { newCaptain } from './captain';
import { modifiersFor } from './modifiers';
import { SHIPS, SKILLS, skillPointsEarned } from './progression';
import {
  availableCrew,
  buyShip,
  checkAchievements,
  dismissCrew,
  hireCrew,
  learnSkill,
  mods,
  newGame,
  setTitle,
  shipyardOffers,
  skillStatus,
  speedKmPerDay,
  startVoyage,
  stopVoyage,
  tick,
  type GameState,
} from './state';
import { contentForTests } from './testContent';
import { buildWorld } from './world';

const world = buildWorld(contentForTests());
const fresh = (): GameState => newGame(world, 'treasure-fleet', 5).state;

describe('modifiers', () => {
  const base = { captain: newCaptain(), skills: [], crewProfessions: [], shipTypeId: 'junk' };

  it('has neutral values for a new captain on a junk', () => {
    const m = modifiersFor(base);
    expect(m.speed).toBe(1);
    expect(m.sight).toBe(1);
    expect(m.price).toBe(1);
    expect(m.stormDamage).toBe(1);
    expect(m.eliminateOption).toBe(false);
  });

  it('stacks crew, skills and ships', () => {
    const m = modifiersFor({
      ...base,
      skills: ['eagle-eye', 'bargain', 'deduction'],
      crewProfessions: ['helmsman', 'cook', 'doctor', 'interpreter'],
      shipTypeId: 'baochuan',
    });
    expect(m.speed).toBeCloseTo(0.95 * 1.05);
    expect(m.sight).toBeCloseTo(1.5);
    expect(m.supplyUse).toBeCloseTo(0.85);
    expect(m.moraleDecay).toBeCloseTo(0.75);
    expect(m.scurvyImmune).toBe(true);
    expect(m.price).toBeCloseTo(0.8 * 0.9);
    expect(m.stormDamage).toBeCloseTo(1 / 1.5);
    expect(m.eliminateOption).toBe(true);
  });

  it('makes astronomy and the star-reading skill prevent getting lost', () => {
    const c = newCaptain();
    const lvl3 = modifiersFor({ ...base, captain: { ...c, attrs: { ...c.attrs, astronomy: 3 } } });
    expect(lvl3.lostChance).toBeCloseTo(0.7);
    expect(modifiersFor({ ...base, skills: ['navigator-scholar'] }).lostChance).toBe(0);
  });
});

describe('skills', () => {
  it('grants skill points from level 3 every two levels', () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(skillPointsEarned)).toEqual([0, 0, 1, 1, 2, 2, 3]);
  });

  it('requires level, prerequisite and a point', () => {
    let s = fresh();
    expect(skillStatus(s, 'eagle-eye')).toBe('locked');
    s = { ...s, captain: { ...s.captain, level: 5 }, skillPoints: 2 };
    expect(skillStatus(s, 'eagle-eye')).toBe('available');
    expect(skillStatus(s, 'surveyor')).toBe('locked');
    s = learnSkill(s, 'eagle-eye');
    expect(s.skills).toEqual(['eagle-eye']);
    expect(skillStatus(s, 'surveyor')).toBe('available');
    s = learnSkill(s, 'surveyor');
    expect(s.skillPoints).toBe(0);
    expect(learnSkill(s, 'bargain')).toBe(s);
    expect(mods(world, s).sight).toBeCloseTo(1.5);
  });

  it('defines three paths of three skills', () => {
    expect(SKILLS).toHaveLength(9);
    for (const path of ['explorer', 'scholar', 'merchant']) {
      expect(SKILLS.filter((s) => s.path === path)).toHaveLength(3);
    }
  });
});

describe('crew', () => {
  it('recruits locals at their home port within slots and budget', () => {
    let s = fresh();
    expect(
      availableCrew(world, s)
        .map((c) => c.id)
        .sort(),
    ).toEqual(['afu', 'chen-boren']);
    s = hireCrew(world, s, 'afu');
    expect(s.crew).toEqual(['afu']);
    expect(s.gold).toBe(80);
    expect(hireCrew(world, s, 'chen-boren')).toBe(s); // 錢不夠
    s = hireCrew(world, { ...s, gold: 1000 }, 'chen-boren');
    expect(s.crew).toHaveLength(2);
    expect(hireCrew(world, { ...s, dockedAt: 'guangzhou' }, 'mai-asi').crew).toHaveLength(2); // 戎克船只有 2 個位子
    expect(hireCrew(world, s, 'hassan')).toBe(s); // 不在麻六甲
    expect(speedKmPerDay(world, s)).toBeGreaterThan(speedKmPerDay(world, fresh()));
    s = dismissCrew(s, 'afu');
    expect(availableCrew(world, s).map((c) => c.id)).toContain('afu');
  });
});

describe('ships', () => {
  it('sells scenario ships at hub ports with a trade-in', () => {
    let s = fresh();
    const offers = shipyardOffers(world, s);
    expect(offers.map((o) => o.def.id)).toEqual(['fuchuan', 'baochuan']);
    expect(offers[0].reason).toBe('需要船長等級 3');
    expect(shipyardOffers(world, { ...s, dockedAt: 'guangzhou' })).toEqual([]);
    s = { ...s, gold: 700, captain: { ...s.captain, level: 3 } };
    s = buyShip(world, s, 'fuchuan');
    expect(s.shipTypeId).toBe('fuchuan');
    expect(s.gold).toBe(100);
    const offer = shipyardOffers(world, s).find((o) => o.def.id === 'baochuan')!;
    expect(offer.cost).toBe(SHIPS.baochuan.price - SHIPS.fuchuan.price / 2);
  });
});

describe('achievements', () => {
  it('unlocks voyage, tropic and title achievements', () => {
    let s = fresh();
    s = startVoyage(
      s,
      [
        [118.67, 24.87],
        [118.9, 24.3],
        [116.5, 22.7],
        [114.2, 22.0],
        [113.26, 23.13],
      ],
      'guangzhou',
    );
    for (let i = 0; i < 200 && s.voyage; i++) s = tick(world, s, 0.25).state;
    expect(s.stats.voyages).toBe(1);
    expect(s.stats.crossedTropic).toBe(true);
    expect(s.stats.crossedEquator).toBe(false);
    const r = checkAchievements(world, s);
    const ids = r.events.map((e) => (e.type === 'achievement' ? e.id : ''));
    expect(ids).toEqual(expect.arrayContaining(['first-voyage', 'tropic']));
    expect(checkAchievements(world, r.state).events).toEqual([]);
    s = setTitle(r.state, 'first-voyage');
    expect(s.title).toBe('first-voyage');
    expect(setTitle(s, 'equator').title).toBe('first-voyage');
  });

  it('finds the hidden "here be dragons" achievement at the edge of the map', () => {
    let s = fresh();
    s = startVoyage(
      s,
      [
        [118.67, 24.87],
        [119.6, 24.0],
        [119.8, 22.0],
        [121.0, 21.0],
        [128.0, 18.0],
      ],
      null,
    );
    for (let i = 0; i < 200 && s.voyage; i++) {
      s = tick(world, s, 0.25).state;
      if (s.encounter) s = { ...s, encounter: null };
    }
    s = stopVoyage(s).state;
    expect(checkAchievements(world, s).state.achievements).toContain('here-be-dragons');
  });

  it('gives every titled achievement a unique title', () => {
    const titles = ACHIEVEMENTS.flatMap((a) => (a.title ? [a.title] : []));
    expect(new Set(titles).size).toBe(titles.length);
  });
});
