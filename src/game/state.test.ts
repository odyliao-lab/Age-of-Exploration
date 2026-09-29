import { describe, expect, it } from 'vitest';
import type { LonLat } from '@/data/schema';
import { addXp, newCaptain, spendPoint, xpToNext } from './captain';
import {
  acceptQuest,
  answerLocate,
  resolveEncounter,
  resolveEvent,
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
  investigate,
  rumorInReach,
  pendingChallenges,
  answerChallenge,
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
};

function sail(state: GameState, route: LonLat[], dest: string | null) {
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
    // 途中遇到事件或風暴：自動處理，讓測試專注在任務流程
    if (s.encounter?.kind === 'storm') s = resolveEncounter(world, s, 'wait').state;
    else if (s.encounter?.kind === 'event') {
      const ev = s.encounter;
      s = resolveEvent(
        world,
        s,
        ev.choices
          ? { choiceId: ev.choices[0].id }
          : ev.question
            ? { answer: 0 }
            : { choiceId: 'take' },
      ).state;
    }
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
    const { state, fogChanged } = newGame(world, 'treasure-fleet', 1);
    expect(state.dockedAt).toBe('quanzhou');
    expect(fogChanged.length).toBeGreaterThan(50);
    expect(state.discovered).toEqual(expect.arrayContaining(['silk', 'porcelain']));
    expect(visiblePortIds(world, state)).toEqual(['quanzhou']);
  });

  it('plays the first two quests end to end', () => {
    let s = newGame(world, 'treasure-fleet', 1).state;

    // 泉州任務板
    expect(availableQuests(world, s, 'quanzhou').map((q) => q.id)).toEqual([
      'tf-00-first-voyage',
      'tf-r1-changle',
    ]);
    s = acceptQuest(world, s, 'tf-00-first-voyage').state;
    expect(pendingInteraction(world, s)?.data.type).toBe('dialogue');
    s = finishDialogue(world, s, 'tf-00-first-voyage').state;

    // 座標定位挑戰：北回歸線與東經 120.5° 的交會處
    expect(pendingInteraction(world, s)?.data.type).toBe('locate');
    const miss = answerLocate(world, s, 'tf-00-first-voyage', [118, 26]);
    expect(miss.result.correct).toBe(false);
    expect(miss.result.direction).toBe('東南');
    expect(miss.state.quests['tf-00-first-voyage'].step).toBe(1);
    const hit = answerLocate(world, miss.state, 'tf-00-first-voyage', [120.4, 23.5]);
    expect(hit.result.correct).toBe(true);
    expect(hit.attempts).toBe(2);
    s = hit.state;
    expect(s.quests['tf-00-first-voyage'].step).toBe(2);

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

    // 抵達後是故事對話（先鋒哨船與對手登場），講完就完成任務：
    // 問答不再擋住故事（決策 R5），改成書院的選擇性挑戰
    expect(pendingInteraction(world, s)?.data).toMatchObject({ speaker: '船隊書記' });
    s = finishDialogue(world, s, 'tf-00-first-voyage').state;
    expect(pendingInteraction(world, s)?.data).toMatchObject({ speaker: '廣州的年輕船長梁阿水' });
    const told = finishDialogue(world, s, 'tf-00-first-voyage');
    s = told.state;
    expect(pendingInteraction(world, s)).toBeNull();
    expect(s.quests['tf-00-first-voyage'].status).toBe('completed');
    expect(told.events.map((e) => e.type)).toEqual(
      expect.arrayContaining(['questCompleted', 'portUnlocked']),
    );
    expect(s.unlockedPorts).toContain('fuzhou');
    const [challenge] = pendingChallenges(world, s);
    expect(challenge).toMatchObject({ questId: 'tf-00-first-voyage', step: 5 });
    // 答錯可以重試，排進錯題回流；答對拿到較少的獎勵
    const wrong = answerChallenge(world, s, challenge.key, 0);
    expect(wrong.correct).toBe(false);
    expect(wrong.state.reviews.map((r) => r.key)).toContain(challenge.key);
    const right = answerChallenge(world, wrong.state, challenge.key, 1);
    expect(right.correct).toBe(true);
    expect(right.state.captain.xp).toBeGreaterThan(wrong.state.captain.xp);
    s = right.state;
    expect(pendingChallenges(world, s)).toEqual([]);
    expect(s.quizLog.find((q) => q.step === 5)).toMatchObject({ attempts: 2, firstTry: false });

    // 第一章：廣州 → 占城，途經海南島
    expect(availableQuests(world, s, 'guangzhou').map((q) => q.id)).toEqual([
      'tf-01-champa',
      'tf-r6-luzon',
    ]);
    s = acceptQuest(world, s, 'tf-01-champa').state;
    s = finishDialogue(world, s, 'tf-01-champa').state;
    // 先找到海南島（任務的「發現」步驟），占城這個目的地才會出現在海圖上。
    // 海南島是傳聞地點：任務把線索記進航海日誌，要開到東岸附近調查
    expect(visiblePortIds(world, s)).not.toContain('champa');
    expect(s.rumors).toContain('hainan');
    const leg2 = sail(s, [...ROUTES.toChampa.slice(0, 4), [110.75, 18.6]], null);
    expect(leg2.state.discovered).not.toContain('hainan');
    expect(rumorInReach(world, leg2.state)).toBe('hainan');
    const found = investigate(world, leg2.state, 'hainan');
    expect(found.events).toContainEqual({ type: 'discovered', codexId: 'hainan' });
    expect(visiblePortIds(world, found.state)).toContain('champa');
    s = sail(found.state, [found.state.ship.position, ...ROUTES.toChampa.slice(4)], 'champa').state;
    expect(s.dockedAt).toBe('champa');
    expect(s.discovered).toContain('agarwood');
    expect(pendingInteraction(world, s)?.data).toMatchObject({ speaker: '梁阿水' });
    s = finishDialogue(world, s, 'tf-01-champa').state;
    expect(s.quests['tf-01-champa'].status).toBe('completed');
    expect(s.discovered).toContain('monsoon');
    // 占城的問答留在書院，一次答對有額外獎勵
    const champaQuiz = pendingChallenges(world, s).find((c) => c.questId === 'tf-01-champa')!;
    const gold = s.gold;
    const first = answerChallenge(world, s, champaQuiz.key, champaQuiz.quiz.answer);
    expect(first.state.gold).toBe(gold + 20);
    expect(first.state.quizLog.at(-1)).toMatchObject({ firstTry: true });
  });

  it('hides the name of a hint-level-2 destination until visited', () => {
    let s = newGame(world, 'treasure-fleet', 1).state;
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
