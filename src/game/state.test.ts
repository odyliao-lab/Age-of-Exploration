import { describe, expect, it } from 'vitest';
import type { LonLat } from '@/data/schema';
import { addXp, newCaptain, spendPoint, xpToNext } from './captain';
import {
  acceptQuest,
  answerQuiz,
  availableQuests,
  finishDialogue,
  harborsFor,
  navigateHint,
  activeNavigateTargets,
  newGame,
  pendingInteraction,
  portNameKnown,
  startVoyage,
  stopVoyage,
  tick,
  visiblePortIds,
  type GameEvent,
  type GameState,
} from './state';
import { contentForTests } from './testContent';
import { checkLeg } from './voyage';
import { buildWorld } from './world';

const world = buildWorld(contentForTests());

/** 沿真實海岸線的航線（已確認不穿越陸地） */
const ROUTES: Record<string, LonLat[]> = {
  toGuangzhou: [
    [118.67, 24.87],
    [118.9, 24.3],
    [116.5, 22.7],
    [114.2, 22.0],
    [113.26, 23.13],
  ],
  toChampa: [
    [113.26, 23.13],
    [113.8, 21.9],
    [111.5, 20.9],
    [111.2, 18.5],
    [109.8, 16.5],
    [109.22, 13.78],
  ],
  toMalacca: [
    [109.22, 13.78],
    [109.6, 11.5],
    [106.5, 6.5],
    [104.6, 1.4],
    [103.9, 1.12],
    [102.9, 1.12],
    [102.25, 2.19],
  ],
};

function sail(state: GameState, route: LonLat[], dest: string) {
  const harbors = harborsFor(world, state);
  for (let i = 1; i < route.length; i++) {
    expect(checkLeg(route[i - 1], route[i], harbors), `leg ${i} of ${dest}`).toEqual({ ok: true });
  }
  let s = startVoyage(state, route, dest);
  const events: GameEvent[] = [];
  for (let i = 0; i < 1000 && s.voyage; i++) {
    const r = tick(world, s, 0.25);
    s = r.state;
    events.push(...r.events);
  }
  return { state: s, events };
}

describe('captain', () => {
  it('levels up and grants points', () => {
    const { captain, levelsGained } = addXp(newCaptain(), xpToNext(1) + xpToNext(2) + 5);
    expect(levelsGained).toBe(2);
    expect(captain.level).toBe(3);
    expect(captain.xp).toBe(5);
    expect(captain.points).toBe(2);
    const spent = spendPoint(captain, 'navigation');
    expect(spent.attrs.navigation).toBe(2);
    expect(spent.points).toBe(1);
    expect(spendPoint({ ...captain, points: 0 }, 'geography').attrs.geography).toBe(1);
  });
});

describe('Treasure Fleet prologue and chapter 1', () => {
  it('starts docked at home with the home region revealed', () => {
    const { state, fogChanged } = newGame(world, 'treasure-fleet');
    expect(state.dockedAt).toBe('quanzhou');
    expect(fogChanged.length).toBeGreaterThan(50);
    expect(state.discovered).toEqual(expect.arrayContaining(['silk', 'porcelain']));
    expect(visiblePortIds(world, state)).toEqual(['quanzhou']);
  });

  it('plays the first two quests end to end', () => {
    let s = newGame(world, 'treasure-fleet').state;

    // 泉州任務板
    expect(availableQuests(world, s, 'quanzhou').map((q) => q.id)).toEqual(['tf-00-first-voyage']);
    s = acceptQuest(world, s, 'tf-00-first-voyage').state;
    expect(pendingInteraction(world, s)?.data.type).toBe('dialogue');
    s = finishDialogue(world, s, 'tf-00-first-voyage').state;

    // 目的地廣州出現在海圖上，提示等級 1 顯示名稱
    expect(visiblePortIds(world, s)).toContain('guangzhou');
    expect(portNameKnown(world, s, 'guangzhou')).toBe(true);
    const target = activeNavigateTargets(world, s)[0];
    expect(navigateHint(world, s, target)).toContain('廣州');

    // 航行中不跳出問答
    const partial = startVoyage(s, ROUTES.toGuangzhou, 'guangzhou');
    expect(pendingInteraction(world, partial)).toBeNull();
    const anchored = stopVoyage(tick(world, partial, 0.5).state);
    expect(anchored.state.voyage).toBeNull();
    expect(anchored.events[0].type).toBe('anchored');

    const leg1 = sail(s, ROUTES.toGuangzhou, 'guangzhou');
    s = leg1.state;
    expect(s.dockedAt).toBe('guangzhou');
    expect(s.day).toBeGreaterThan(2);
    expect(s.day).toBeLessThan(6);
    expect(leg1.events).toContainEqual({ type: 'arrived', portId: 'guangzhou', firstVisit: true });
    expect(leg1.events).toContainEqual({ type: 'discovered', codexId: 'taiwan-strait' });

    // 抵達後進行問答：答錯可重試，不會完成任務
    expect(pendingInteraction(world, s)?.data.type).toBe('quiz');
    const wrong = answerQuiz(world, s, 'tf-00-first-voyage', 0);
    expect(wrong.correct).toBe(false);
    expect(wrong.state.quests['tf-00-first-voyage'].status).toBe('active');
    const right = answerQuiz(world, wrong.state, 'tf-00-first-voyage', 1);
    expect(right.correct).toBe(true);
    s = right.state;
    expect(s.quests['tf-00-first-voyage'].status).toBe('completed');
    expect(right.events.map((e) => e.type)).toEqual(
      expect.arrayContaining(['questCompleted', 'portUnlocked']),
    );
    expect(s.unlockedPorts).toContain('champa');
    expect(s.quizLog[0]).toMatchObject({ attempts: 2, firstTry: false });

    // 第一章：廣州 → 占城，途經海南島
    expect(availableQuests(world, s, 'guangzhou').map((q) => q.id)).toEqual(['tf-01-champa']);
    s = acceptQuest(world, s, 'tf-01-champa').state;
    s = finishDialogue(world, s, 'tf-01-champa').state;
    const leg2 = sail(s, ROUTES.toChampa, 'champa');
    s = leg2.state;
    expect(leg2.events).toContainEqual({ type: 'discovered', codexId: 'hainan' });
    expect(s.dockedAt).toBe('champa');
    expect(s.discovered).toContain('agarwood');
    const done = answerQuiz(world, s, 'tf-01-champa', 1);
    s = done.state;
    expect(s.quests['tf-01-champa'].status).toBe('completed');
    expect(s.discovered).toContain('monsoon');
    expect(s.unlockedPorts).toContain('malacca');
    expect(s.captain.level).toBe(2);
    // 一次答對的額外經驗
    const reward = done.events.find((e) => e.type === 'questCompleted');
    expect(reward && reward.type === 'questCompleted' && reward.reward.xp).toBe(90);

    // 通過新加坡海峽抵達麻六甲
    s = sail(s, ROUTES.toMalacca, 'malacca').state;
    expect(s.dockedAt).toBe('malacca');
  });

  it('hides the name of a hint-level-2 destination until visited', () => {
    let s = newGame(world, 'treasure-fleet').state;
    s = {
      ...s,
      quests: { 'tf-00-first-voyage': { status: 'completed', step: 3 } },
      dockedAt: 'guangzhou',
      visitedPorts: [...s.visitedPorts, 'guangzhou'],
      // 已經見過海南島：接受任務後「發現海南島」步驟會自動完成
      discovered: [...s.discovered, 'hainan'],
    };
    s = acceptQuest(world, s, 'tf-01-champa').state;
    s = finishDialogue(world, s, 'tf-01-champa').state;
    expect(s.quests['tf-01-champa'].step).toBe(2);

    const target = activeNavigateTargets(world, s)[0];
    expect(target).toMatchObject({ portId: 'champa', hintLevel: 2 });
    expect(portNameKnown(world, s, 'champa')).toBe(false);
    expect(navigateHint(world, s, target)).toBe('前往約 北緯 14°、東經 109° 的港口');

    const visited = { ...s, visitedPorts: [...s.visitedPorts, 'champa'] };
    expect(portNameKnown(world, visited, 'champa')).toBe(true);
  });
});
