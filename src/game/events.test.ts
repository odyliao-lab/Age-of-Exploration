import { describe, expect, it } from 'vitest';
import { distanceKm } from '@/geo/geo';
import { windAt } from './environment';
import {
  checkLocate,
  createEvent,
  destinationPoint,
  eventChances,
  resolveAnswer,
  resolveChoice,
  type EventContext,
} from './events';
import { nextRandom } from './rng';
import { newGame, resolveEvent, startVoyage, tick, type GameState } from './state';
import { contentForTests } from './testContent';
import { buildWorld } from './world';

const world = buildWorld(contentForTests());

function rng(seed = 1) {
  let s = seed;
  return () => {
    const [v, n] = nextRandom(s);
    s = n;
    return v;
  };
}

const ctx = (over: Partial<EventContext> = {}): EventContext => ({
  position: [112, 15],
  heading: 225,
  month: 12,
  wind: windAt([112, 15], 12),
  daysAtSea: 3,
  lastPort: { name: '廣州', location: [113.26, 23.13] },
  regionName: '南海',
  otherRegionNames: ['東海與黃海', '麻六甲與爪哇海'],
  ...over,
});

describe('event chances', () => {
  it('only sends pirates to known pirate waters', () => {
    expect(eventChances(ctx()).pirates).toBeUndefined();
    expect(eventChances(ctx({ position: [101, 3] })).pirates).toBeGreaterThan(0);
  });

  it('calms trigger the doldrums and long voyages trigger scurvy', () => {
    expect(eventChances(ctx()).doldrums).toBeUndefined();
    expect(eventChances(ctx({ wind: windAt([-150, 0], 1) })).doldrums).toBeGreaterThan(0);
    expect(eventChances(ctx({ daysAtSea: 25 })).scurvy).toBeGreaterThan(0);
  });
});

describe('navigation challenges', () => {
  it('asks for latitude from the height of Polaris', () => {
    const ev = createEvent('stargazing', ctx({ position: [112, 15.3] }), rng());
    const q = ev.question!;
    expect(q.prompt).toContain('15°');
    expect(q.choices[q.answer]).toBe('北緯約 15°');
    expect(new Set(q.choices).size).toBe(q.choices.length);
  });

  it('switches to the Southern Cross south of the equator', () => {
    const ev = createEvent('stargazing', ctx({ position: [60, -20] }), rng());
    expect(ev.question!.choices[ev.question!.answer]).toBe('南半球');
    const eq = createEvent('stargazing', ctx({ position: [60, 1] }), rng());
    expect(eq.question!.choices[eq.question!.answer]).toBe('赤道附近');
  });

  it('builds a dead-reckoning question with the true position among decoys', () => {
    const ev = createEvent('lost', ctx(), rng(3));
    const q = ev.question!;
    expect(q.prompt).toContain('廣州');
    expect(q.prompt).toMatch(/往.+方航行了約 \d+ 公里/);
    expect(q.choices[q.answer]).toBe('北緯 15°　東經 112°');
    expect(q.choices.length).toBeGreaterThanOrEqual(2);
  });

  it('asks pirates-style questions about the current sea', () => {
    const ev = createEvent('pirates', ctx(), rng());
    expect(ev.question!.choices[ev.question!.answer]).toBe('南海');
    expect(ev.choices!.map((c) => c.id)).toEqual(['negotiate', 'flee', 'quiz']);
  });

  it('computes destination points', () => {
    const p = destinationPoint([0, 0], 90, 111.19);
    expect(p[0]).toBeCloseTo(1, 2);
    expect(p[1]).toBeCloseTo(0, 5);
    expect(distanceKm([120, 20], destinationPoint([120, 20], 200, 500))).toBeCloseTo(500, 0);
  });

  it('checks map clicks and points toward the answer', () => {
    const miss = checkLocate([118, 26], [120.5, 23.45], 120);
    expect(miss.correct).toBe(false);
    expect(miss.direction).toBe('東南');
    expect(checkLocate([120.4, 23.5], [120.5, 23.45], 120).correct).toBe(true);
  });
});

describe('event outcomes', () => {
  const pirates = createEvent('pirates', ctx({ position: [101, 3] }), rng());

  it('lets diplomacy lower the pirate toll', () => {
    const low = resolveChoice(pirates, 'negotiate', 0.5, { pirateToll: 1, fleeBonus: 0 }, 1000);
    const high = resolveChoice(pirates, 'negotiate', 0.5, { pirateToll: 0.52, fleeBonus: 0 }, 1000);
    expect(low.gold).toBe(-250);
    expect(high.gold!).toBeGreaterThan(low.gold!);
  });

  it('rewards knowledge and seamanship without any fighting', () => {
    expect(resolveAnswer(pirates, true, 500).gold).toBe(20);
    expect(resolveAnswer(pirates, false, 500).gold).toBe(-150);
    expect(resolveChoice(pirates, 'flee', 0.1, { pirateToll: 1, fleeBonus: 0 }, 500).title).toBe(
      '成功脫逃',
    );
    expect(resolveChoice(pirates, 'flee', 0.99, { pirateToll: 1, fleeBonus: 0 }, 500).gold).toBe(
      -175,
    );
  });

  it('trades time against morale in the doldrums', () => {
    const ev = createEvent('doldrums', ctx(), rng());
    expect(resolveChoice(ev, 'row', 0.5, { pirateToll: 1, fleeBonus: 0 }, 0)).toMatchObject({
      days: 1,
      morale: -10,
    });
    expect(
      resolveChoice(ev, 'wait', 0.5, { pirateToll: 1, fleeBonus: 0 }, 0).days,
    ).toBeGreaterThanOrEqual(2);
  });
});

describe('events during voyages', () => {
  it('interrupts long voyages, records answers, and respects the cooldown', () => {
    let s: GameState = newGame(world, 'treasure-fleet', 11).state;
    s = { ...s, gold: 500, eventCooldownUntil: 0 };
    // 從泉州繞過台灣南端，進入太平洋再南下赤道（冬季，沒有颱風）
    s = startVoyage(
      s,
      [
        [118.67, 24.87],
        [119.6, 24.0],
        [119.8, 22.0],
        [121.0, 21.0],
        [130.0, 15.0],
        [150.0, 2.0],
        [170.0, 0.0],
      ],
      null,
    );
    const seen: { id: string; day: number }[] = [];
    let answered = 0;
    for (let i = 0; i < 3000 && s.voyage; i++) {
      s = tick(world, s, 0.25).state;
      const ev = s.encounter;
      if (ev?.kind !== 'event') continue;
      seen.push({ id: ev.id, day: s.day });
      if (ev.question && !ev.choices) {
        s = resolveEvent(world, s, { answer: ev.question.answer }).state;
        answered++;
      } else {
        s = resolveEvent(
          world,
          s,
          ev.choices ? { choiceId: ev.choices[0].id } : { choiceId: 'take' },
        ).state;
      }
      expect(s.encounter).toBeNull();
    }
    expect(seen.length).toBeGreaterThan(0);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i].day - seen[i - 1].day).toBeGreaterThanOrEqual(4 - 1e-9);
    }
    const logged = s.quizLog.filter((q) => q.questId.startsWith('event:'));
    expect(logged.length).toBe(answered);
    expect(logged.every((q) => q.firstTry)).toBe(true);
  });
});

describe('castaways', () => {
  it('can be rescued for reputation, or left with a little water', () => {
    const ev = createEvent('castaway', ctx({ position: [115, 15] }), rng());
    expect(ev.choices?.map((c) => c.id)).toEqual(['rescue', 'pass']);
    const rescue = resolveChoice(ev, 'rescue', 0.5, { pirateToll: 1, fleeBonus: 0 }, 500);
    expect(rescue.reputation).toBeGreaterThan(0);
    expect(rescue.morale).toBeGreaterThan(0);
    const pass = resolveChoice(ev, 'pass', 0.5, { pirateToll: 1, fleeBonus: 0 }, 500);
    expect(pass.morale).toBeLessThan(0);
  });

  it('only drift by in named seas', () => {
    expect(eventChances(ctx({ regionName: null })).castaway).toBeUndefined();
    expect(eventChances(ctx()).castaway).toBeGreaterThan(0);
  });
});
