/**
 * 內容完整性測試：用真實內容把整個東方寶船 MVP（序章與第一章）從頭玩到尾，
 * 確認每個任務都能完成、每個目的地都能從海上到達、每個「發現」步驟都真的會觸發。
 */
import { describe, expect, it } from 'vitest';
import type { LonLat } from '@/data/schema';
import { findSeaPath, nearestSea } from '@/geo/seaPath';
import { checkLeg } from './voyage';
import {
  scenarioPorts,
  acceptQuest,
  answerLocate,
  answerQuiz,
  availableQuests,
  finishDialogue,
  newGame,
  pendingInteraction,
  resolveEncounter,
  resolveEvent,
  startVoyage,
  tick,
  tradeBuy,
  type GameState,
} from './state';
import { contentForTests } from './testContent';
import { buildWorld } from './world';
import { distanceKm } from '@/geo/geo';

const world = buildWorld(contentForTests());
const allHarbors = [...world.harbors.values()];

function route(from: LonLat, to: LonLat): LonLat[] {
  const path = findSeaPath(from, to, allHarbors);
  if (!path) throw new Error(`找不到海上航線 ${from} → ${to}`);
  return path;
}

/** 航行到港口；途中的事件與風暴自動以最安全的方式處理 */
function sailTo(s: GameState, portId: string): GameState {
  if (s.dockedAt === portId) return s;
  const port = world.ports.get(portId)!;
  s = startVoyage(s, route(s.ship.position, port.location), portId);
  // 讓測試不受補給與金錢影響
  s = { ...s, gold: Math.max(s.gold, 5000) };
  for (let i = 0; i < 5000 && s.voyage; i++) {
    s = tick(world, s, 0.5).state;
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
    s = {
      ...s,
      condition: { ...s.condition, supplies: { water: 40, food: 40 }, morale: 100, hull: 100 },
    };
  }
  if (s.dockedAt !== portId) throw new Error(`沒有抵達 ${portId}（停在 ${s.ship.position}）`);
  return s;
}

/** 開到海上某點下錨 */
function sailToPoint(s: GameState, p: LonLat): GameState {
  s = startVoyage(s, route(s.ship.position, p), null);
  for (let i = 0; i < 5000 && s.voyage; i++) {
    s = tick(world, s, 0.5).state;
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
  return s;
}

/** 完成一個任務：處理所有需要互動的步驟，navigate 步驟就開船過去 */
function playQuest(s: GameState, questId: string): GameState {
  const quest = world.quests.get(questId)!;
  s = sailTo(s, quest.giver_port);
  expect(availableQuests(world, s, quest.giver_port).map((q) => q.id)).toContain(questId);
  s = acceptQuest(world, s, questId).state;
  for (let guard = 0; guard < 50 && s.quests[questId].status === 'active'; guard++) {
    const pending = pendingInteraction(world, s);
    const step = quest.steps[s.quests[questId].step];
    if (pending && pending.questId === questId) {
      const d = pending.data;
      if (d.type === 'dialogue') s = finishDialogue(world, s, questId).state;
      else if (d.type === 'quiz') s = answerQuiz(world, s, questId, d.answer).state;
      else s = answerLocate(world, s, questId, d.target).state;
    } else if (step?.type === 'navigate') {
      s = sailTo(s, step.target);
    } else if (step?.type === 'deliver') {
      // 到產地買貨，再運到目的港
      // 到最近的產地買（例如加勒比海的棉布就在身邊，不必跑去印度）
      const source = world.content.ports
        .filter((p) => p.goods.includes(step.good))
        .sort(
          (a, b) =>
            distanceKm(a.location, s.ship.position) - distanceKm(b.location, s.ship.position),
        )[0];
      s = sailTo(s, source.id);
      s = { ...s, gold: Math.max(s.gold, 5000), cargo: {} };
      s = tradeBuy(world, s, step.good, step.qty).state;
      expect(s.cargo[step.good]?.qty, `${questId}：買不到 ${step.good}`).toBeGreaterThanOrEqual(
        step.qty,
      );
      s = sailTo(s, step.target);
    } else if (step?.type === 'discover') {
      // 地標在任務航線之外：開到地標旁的海面去找它
      const codex = world.codex.get(step.target)!;
      if (!codex.location)
        throw new Error(`${questId}：「${step.target}」無法靠航行發現，玩家會卡住`);
      const sea = nearestSea(codex.location);
      if (!sea) throw new Error(`${questId}：「${step.target}」附近沒有海面`);
      s = sailToPoint(s, sea);
      if (!s.discovered.includes(step.target)) {
        throw new Error(`${questId}：開到「${step.target}」旁邊仍沒有發現，發現半徑太小`);
      }
    } else {
      throw new Error(`${questId}：步驟 ${s.quests[questId].step} 無法推進`);
    }
  }
  expect(s.quests[questId].status, questId).toBe('completed');
  return s;
}

describe('Treasure Fleet MVP content', () => {
  it('has the MVP amount of content (GDD 16.1)', () => {
    const quests = world.content.quests.filter((q) => q.scenario === 'treasure-fleet');
    expect(world.content.ports.length).toBeGreaterThanOrEqual(12);
    expect(quests.length).toBeGreaterThanOrEqual(15);
    expect(world.content.codex.length).toBeGreaterThanOrEqual(40);
  });

  it('can reach every port by sea from the nearest scenario home', () => {
    const homes = world.content.scenarios.map((sc) => world.ports.get(sc.home_port)!);
    for (const p of world.content.ports) {
      const home = homes.reduce((a, b) =>
        distanceKm(a.location, p.location) <= distanceKm(b.location, p.location) ? a : b,
      );
      const path = route(home.location, p.location);
      for (let i = 1; i < path.length; i++) {
        expect(checkLeg(path[i - 1], path[i], allHarbors).ok, `${p.id} 第 ${i} 段`).toBe(true);
      }
    }
  });

  it('has an acyclic quest graph where every prerequisite exists', () => {
    const ids = new Set(world.content.quests.map((q) => q.id));
    const visiting = new Set<string>();
    const done = new Set<string>();
    const visit = (id: string) => {
      if (done.has(id)) return;
      expect(visiting.has(id), `循環前置任務：${id}`).toBe(false);
      visiting.add(id);
      for (const p of world.quests.get(id)!.prerequisites) {
        expect(ids.has(p)).toBe(true);
        visit(p);
      }
      visiting.delete(id);
      done.add(id);
    };
    ids.forEach(visit);
  });

  it('plays every quest from start to finish', () => {
    let s = newGame(world, 'treasure-fleet', 2024).state;
    const remaining = new Set(
      world.content.quests.filter((q) => q.scenario === 'treasure-fleet').map((q) => q.id),
    );
    // 依前置任務順序完成全部任務
    for (let round = 0; round < 30 && remaining.size; round++) {
      const ready = [...remaining].filter((id) =>
        world.quests.get(id)!.prerequisites.every((p) => s.quests[p]?.status === 'completed'),
      );
      expect(ready.length, `卡住的任務：${[...remaining].join(', ')}`).toBeGreaterThan(0);
      for (const id of ready) {
        s = playQuest(s, id);
        remaining.delete(id);
      }
    }
    expect(remaining.size).toBe(0);
    expect(s.visitedPorts.length).toBeGreaterThanOrEqual(12);
    expect(s.discovered).toEqual(
      expect.arrayContaining(['equator', 'strait-of-malacca', 'kuroshio']),
    );
    expect(s.captain.level).toBeGreaterThanOrEqual(5);
  });
});

describe('Monsoon Merchant content', () => {
  it('plays every quest from start to finish', () => {
    let s = newGame(world, 'monsoon-merchant', 2025).state;
    expect(s.dockedAt).toBe('aden');
    expect(s.shipTypeId).toBe('sewn-dhow');
    expect(s.appearance.hat).toBe('turban');
    expect(world.scenarios.get('monsoon-merchant')!.first_voyage_lesson).toContain('西南季風');
    const remaining = new Set(
      world.content.quests.filter((q) => q.scenario === 'monsoon-merchant').map((q) => q.id),
    );
    for (let round = 0; round < 30 && remaining.size; round++) {
      const ready = [...remaining].filter((id) =>
        world.quests.get(id)!.prerequisites.every((p) => s.quests[p]?.status === 'completed'),
      );
      expect(ready.length, `卡住的任務：${[...remaining].join(', ')}`).toBeGreaterThan(0);
      for (const id of ready) {
        s = playQuest(s, id);
        remaining.delete(id);
      }
    }
    expect(remaining.size).toBe(0);
    expect(s.visitedPorts).toEqual(
      expect.arrayContaining(['aden', 'calicut', 'kilwa', 'quanzhou']),
    );
  });
});

describe('historic routes', () => {
  it('every leg of every scenario route has a sea path', () => {
    for (const sc of world.content.scenarios) {
      for (const r of sc.historic_routes) {
        for (let k = 1; k < r.ports.length; k++) {
          const at = (x: string | LonLat) =>
            typeof x === 'string' ? world.ports.get(x)!.location : x;
          const a = at(r.ports[k - 1]);
          const b = at(r.ports[k]);
          expect(findSeaPath(a, b, allHarbors), `${sc.id} ${r.name} 第 ${k} 段`).not.toBeNull();
        }
      }
    }
  });
});

describe('Into the Unknown content', () => {
  it('plays every quest from start to finish', () => {
    let s = newGame(world, 'into-the-unknown', 2026).state;
    expect(s.dockedAt).toBe('lisbon');
    expect(s.shipTypeId).toBe('caravel');
    expect(s.appearance.hat).toBe('barrete');
    const remaining = new Set(
      world.content.quests.filter((q) => q.scenario === 'into-the-unknown').map((q) => q.id),
    );
    for (let round = 0; round < 30 && remaining.size; round++) {
      const ready = [...remaining].filter((id) =>
        world.quests.get(id)!.prerequisites.every((p) => s.quests[p]?.status === 'completed'),
      );
      expect(ready.length, `卡住的任務：${[...remaining].join(', ')}`).toBeGreaterThan(0);
      for (const id of ready) {
        s = playQuest(s, id);
        remaining.delete(id);
      }
    }
    expect(remaining.size).toBe(0);
    expect(s.visitedPorts).toEqual(
      expect.arrayContaining(['lisbon', 'elmina', 'malindi', 'calicut']),
    );
    expect(s.discovered).toEqual(expect.arrayContaining(['equator', 'cape-of-good-hope']));
  });
});

describe('Westward Gamble content', () => {
  it('plays every quest from start to finish', () => {
    let s = newGame(world, 'westward-gamble', 1492).state;
    expect(s.dockedAt).toBe('palos');
    const remaining = new Set(
      world.content.quests.filter((q) => q.scenario === 'westward-gamble').map((q) => q.id),
    );
    for (let round = 0; round < 30 && remaining.size; round++) {
      const ready = [...remaining].filter((id) =>
        world.quests.get(id)!.prerequisites.every((p) => s.quests[p]?.status === 'completed'),
      );
      expect(ready.length, `卡住的任務：${[...remaining].join(', ')}`).toBeGreaterThan(0);
      for (const id of ready) {
        s = playQuest(s, id);
        remaining.delete(id);
      }
    }
    expect(remaining.size).toBe(0);
    expect(s.visitedPorts).toEqual(expect.arrayContaining(['palos', 'guanahani', 'marien']));
    expect(s.discovered).toEqual(expect.arrayContaining(['sargasso-sea', 'columbian-exchange']));
  });
});

describe('Northern Longship content', () => {
  it('plays every quest from start to finish', () => {
    let s = newGame(world, 'northern-longship', 1000).state;
    expect(s.dockedAt).toBe('nidaros');
    expect(s.shipTypeId).toBe('knarr');
    const remaining = new Set(
      world.content.quests.filter((q) => q.scenario === 'northern-longship').map((q) => q.id),
    );
    for (let round = 0; round < 30 && remaining.size; round++) {
      const ready = [...remaining].filter((id) =>
        world.quests.get(id)!.prerequisites.every((p) => s.quests[p]?.status === 'completed'),
      );
      expect(ready.length, `卡住的任務：${[...remaining].join(', ')}`).toBeGreaterThan(0);
      for (const id of ready) {
        s = playQuest(s, id);
        remaining.delete(id);
      }
    }
    expect(remaining.size).toBe(0);
    expect(s.visitedPorts).toEqual(
      expect.arrayContaining(['reykjavik', 'brattahlid', 'leifsbudir']),
    );
  });
});

describe('Star Navigators content', () => {
  it('plays every quest from start to finish', () => {
    let s = newGame(world, 'star-navigators', 1200).state;
    expect(s.dockedAt).toBe('raiatea');
    expect(s.shipTypeId).toBe('vaka');
    const sc = world.scenarios.get('star-navigators')!;
    expect(sc.wayfinding).toBe(true);
    expect(sc.currency).toBe('珍寶');
    // 奧特亞羅瓦在換日線的另一邊（東經）
    expect(scenarioPorts(world, s).some((p) => p.location[0] > 0)).toBe(true);
    const remaining = new Set(
      world.content.quests.filter((q) => q.scenario === 'star-navigators').map((q) => q.id),
    );
    for (let round = 0; round < 30 && remaining.size; round++) {
      const ready = [...remaining].filter((id) =>
        world.quests.get(id)!.prerequisites.every((p) => s.quests[p]?.status === 'completed'),
      );
      expect(ready.length, `卡住的任務：${[...remaining].join(', ')}`).toBeGreaterThan(0);
      for (const id of ready) {
        s = playQuest(s, id);
        remaining.delete(id);
      }
    }
    expect(remaining.size).toBe(0);
    expect(s.visitedPorts).toEqual(
      expect.arrayContaining(['kealakekua', 'rapa-nui', 'nuku-hiva', 'pewhairangi']),
    );
  });
});
