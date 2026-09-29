import { describe, expect, it } from 'vitest';
import {
  DAY_MS,
  answerReview,
  bumpDaily,
  dailyComplete,
  domainStats,
  dueReviews,
  localDate,
  newDailyVoyage,
  scheduleReview,
} from './learning';
import {
  acceptQuest,
  answerQuiz,
  answerReviewItem,
  appendLog,
  claimDaily,
  ensureDaily,
  finishDialogue,
  newGame,
  trackDaily,
  type GameState,
} from './state';
import { contentForTests } from './testContent';
import { buildWorld } from './world';

const world = buildWorld(contentForTests());
const T0 = new Date(2026, 8, 29, 9, 0).getTime();
const q = { prompt: '赤道是幾度？', choices: ['0°', '23.5°'], answer: 0 };

describe('spaced repetition', () => {
  it('brings a missed question back after 1, 3 and 7 days', () => {
    let items = scheduleReview([], 'k', q, ['A'], T0);
    expect(scheduleReview(items, 'k', q, ['A'], T0)).toBe(items);
    expect(dueReviews(items, T0)).toEqual([]);
    expect(dueReviews(items, T0 + DAY_MS)).toHaveLength(1);

    items = answerReview(items, 'k', true, T0 + DAY_MS);
    expect(items[0].due).toBe(T0 + DAY_MS + 3 * DAY_MS);
    items = answerReview(items, 'k', true, T0 + 4 * DAY_MS);
    expect(items[0].due).toBe(T0 + 11 * DAY_MS);
    items = answerReview(items, 'k', true, T0 + 11 * DAY_MS);
    expect(items[0].mastered).toBe(true);
    expect(dueReviews(items, T0 + 100 * DAY_MS)).toEqual([]);
  });

  it('starts over when a review is answered wrong', () => {
    let items = scheduleReview([], 'k', q, ['A'], T0);
    items = answerReview(items, 'k', true, T0 + DAY_MS);
    items = answerReview(items, 'k', false, T0 + 4 * DAY_MS);
    expect(items[0]).toMatchObject({ stage: 0, lapses: 1, due: T0 + 5 * DAY_MS });
  });
});

describe('daily voyage', () => {
  it('creates three goals and tracks completion', () => {
    let d = newDailyVoyage(T0, 5);
    expect(d.date).toBe(localDate(T0));
    expect(d.goals.map((g) => g.kind)).toEqual(['review', 'explore', 'story']);
    expect(d.goals[0].target).toBe(3);
    expect(newDailyVoyage(T0, 0).goals[0].label).toBe('答對 1 題問答');
    d = bumpDaily(d, 'review', 3)!;
    d = bumpDaily(d, 'explore')!;
    expect(dailyComplete(d)).toBe(false);
    d = bumpDaily(d, 'story', 5)!;
    expect(dailyComplete(d)).toBe(true);
    expect(d.goals[2].progress).toBe(1);
  });

  it('rolls over at midnight and pays out once', () => {
    let s = ensureDaily(newGame(world, 'treasure-fleet', 1).state, T0);
    expect(ensureDaily(s, T0 + 3600_000)).toBe(s);
    expect(ensureDaily(s, T0 + DAY_MS).daily!.date).not.toBe(s.daily!.date);
    s = {
      ...s,
      daily: { ...s.daily!, goals: s.daily!.goals.map((g) => ({ ...g, progress: g.target })) },
    };
    const r = claimDaily(s);
    expect(r.state.gold).toBe(s.gold + 50);
    expect(r.state.captain.xp).toBe(30);
    expect(claimDaily(r.state).state).toBe(r.state);
  });

  it('counts quest steps, discoveries and correct answers', () => {
    let s: GameState = ensureDaily(newGame(world, 'treasure-fleet', 1).state, T0);
    const before = s;
    s = acceptQuest(world, s, 'tf-00-first-voyage').state;
    s = finishDialogue(world, s, 'tf-00-first-voyage').state;
    s = trackDaily(before, s, [{ type: 'discovered', codexId: 'penghu' }]);
    expect(s.daily!.goals.find((g) => g.kind === 'story')!.progress).toBe(1);
    expect(s.daily!.goals.find((g) => g.kind === 'explore')!.progress).toBe(1);
  });
});

describe('reviews from quests', () => {
  it('schedules a review when a quest quiz is missed on the first try', () => {
    let s = newGame(world, 'treasure-fleet', 1).state;
    s = {
      ...s,
      quests: { 'tf-00-first-voyage': { status: 'completed', step: 4 } },
      dockedAt: 'guangzhou',
      visitedPorts: [...s.visitedPorts, 'guangzhou'],
      discovered: [...s.discovered, 'hainan'],
    };
    s = acceptQuest(world, s, 'tf-a2-monsoon').state;
    s = finishDialogue(world, s, 'tf-a2-monsoon').state;
    const miss = answerQuiz(world, s, 'tf-a2-monsoon', 0, T0);
    expect(miss.state.reviews).toHaveLength(1);
    expect(miss.state.reviews[0].question.prompt).toContain('夏季');
    // 同一題答錯第二次不重複加入
    expect(answerQuiz(world, miss.state, 'tf-a2-monsoon', 2, T0).state.reviews).toHaveLength(1);

    const later = ensureDaily(miss.state, T0 + DAY_MS);
    expect(later.daily!.goals[0].label).toBe('複習 1 題錯題');
    const r = answerReviewItem(later, miss.state.reviews[0].key, 1, T0 + DAY_MS);
    expect(r.correct).toBe(true);
    expect(r.state.reviews[0].stage).toBe(1);
    expect(r.state.daily!.goals[0].progress).toBe(1);
  });
});

describe('logbook', () => {
  it('summarizes mastery by learning domain', () => {
    const stats = domainStats(
      [
        { domains: ['A'], firstTry: true },
        { domains: ['A'], firstTry: true },
        { domains: ['D'], firstTry: false },
      ],
      scheduleReview([], 'k', q, ['D'], T0),
      [['F'], ['F', 'C']],
    );
    const by = Object.fromEntries(stats.map((s) => [s.domain, s.mastery]));
    expect(by).toEqual({
      A: 'mastered',
      B: 'untouched',
      C: 'learning',
      D: 'needs-work',
      E: 'untouched',
      F: 'learning',
    });
  });

  it('writes voyage events into the log', () => {
    const s = newGame(world, 'treasure-fleet', 1).state;
    const next = appendLog(world, s, [
      { type: 'arrived', portId: 'guangzhou', firstVisit: true },
      { type: 'discovered', codexId: 'hainan' },
    ]);
    expect(next.log.slice(-2).map((e) => e.text)).toEqual(['首次抵達廣州', '發現：海南島']);
  });
});
