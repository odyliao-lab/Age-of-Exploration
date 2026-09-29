/**
 * 遊戲狀態與規則（純函式）。
 *
 * 所有函式都回傳新的狀態物件；唯一的例外是迷霧陣列（fog）會就地更新，
 * 以免每一幀複製整張格網。事件（GameEvent）交給介面顯示提示與對話框。
 */
import type { LonLat, Quest, QuestStep } from '@/data/schema';
import { bearingDeg, compass16, distanceKm } from '@/geo/geo';
import { addXp, newCaptain, type Captain } from './captain';
import { createFog, exploredFraction, revealAround } from './fog';
import { createVoyage, isFinished, positionAt, type Harbor, type Voyage } from './voyage';
import type { World } from './world';

export const SAVE_VERSION = 1;

/** 基礎航速：每日 100 海里（約 4 節），接近鄭和寶船的歷史估計 */
export const BASE_SPEED_KM_PER_DAY = 185;
/** 船上瞭望的揭霧半徑 */
export const SIGHT_KM = 220;
const HOME_REVEAL_KM = 450;
const PORT_REVEAL_KM = 260;

export interface QuestProgress {
  status: 'active' | 'completed';
  step: number;
}

export interface QuizRecord {
  questId: string;
  step: number;
  domains: string[];
  attempts: number;
  /** 第一次就答對 */
  firstTry: boolean;
  day: number;
}

export interface GameState {
  version: number;
  scenarioId: string;
  /** 遊戲開始後經過的天數 */
  day: number;
  ship: { position: LonLat; heading: number };
  dockedAt: string | null;
  voyage: Voyage | null;
  fog: Uint8Array;
  discovered: string[];
  visitedPorts: string[];
  unlockedPorts: string[];
  quests: Record<string, QuestProgress>;
  captain: Captain;
  gold: number;
  reputation: number;
  quizLog: QuizRecord[];
}

export interface QuestReward {
  xp: number;
  gold: number;
  reputation: number;
  unlockPorts: string[];
  codex: string[];
}

export type GameEvent =
  | { type: 'arrived'; portId: string; firstVisit: boolean }
  | { type: 'anchored'; position: LonLat }
  | { type: 'discovered'; codexId: string }
  | { type: 'questAccepted'; questId: string }
  | { type: 'questCompleted'; questId: string; reward: QuestReward }
  | { type: 'levelUp'; level: number }
  | { type: 'portUnlocked'; portId: string };

export interface StepResult {
  state: GameState;
  events: GameEvent[];
  /** 新揭開的迷霧格索引 */
  fogChanged: number[];
}

// ---------------------------------------------------------------- 開局

export function newGame(world: World, scenarioId: string): StepResult {
  const scenario = world.scenarios.get(scenarioId);
  if (!scenario) throw new Error(`未知的劇本：${scenarioId}`);
  const home = world.ports.get(scenario.home_port)!;
  const fog = createFog();
  const fogChanged = revealAround(fog, home.location, HOME_REVEAL_KM);
  const unlocked = [...new Set([home.id, ...scenario.starting_ports])];
  for (const id of unlocked) {
    fogChanged.push(...revealAround(fog, world.ports.get(id)!.location, PORT_REVEAL_KM));
  }
  const state: GameState = {
    version: SAVE_VERSION,
    scenarioId,
    day: 0,
    ship: { position: home.location, heading: 180 },
    dockedAt: home.id,
    voyage: null,
    fog,
    discovered: [...home.goods],
    visitedPorts: [home.id],
    unlockedPorts: unlocked,
    quests: {},
    captain: newCaptain(),
    gold: 200,
    reputation: 0,
    quizLog: [],
  };
  return { state, events: [], fogChanged };
}

// ---------------------------------------------------------------- 航行

export function speedKmPerDay(state: GameState): number {
  return BASE_SPEED_KM_PER_DAY * (1 + 0.05 * (state.captain.attrs.navigation - 1));
}

export function sightKm(state: GameState): number {
  return SIGHT_KM * (1 + 0.1 * (state.captain.attrs.geography - 1));
}

/** 規劃航線時可以使用的港區（所有海圖上顯示的港口） */
export function harborsFor(world: World, state: GameState): Harbor[] {
  return visiblePortIds(world, state).map((id) => world.harbors.get(id)!);
}

export function startVoyage(
  state: GameState,
  waypoints: LonLat[],
  destinationPortId: string | null,
): GameState {
  if (waypoints.length < 2) return state;
  return {
    ...state,
    dockedAt: null,
    voyage: createVoyage([state.ship.position, ...waypoints.slice(1)], destinationPortId),
  };
}

/** 在海上停船下錨 */
export function stopVoyage(state: GameState): StepResult {
  if (!state.voyage) return { state, events: [], fogChanged: [] };
  return {
    state: { ...state, voyage: null },
    events: [{ type: 'anchored', position: state.ship.position }],
    fogChanged: [],
  };
}

/** 推進遊戲時間（天）。航行中才會移動。 */
export function tick(world: World, state: GameState, days: number): StepResult {
  if (!state.voyage || days <= 0) return { state, events: [], fogChanged: [] };
  const events: GameEvent[] = [];
  const fogChanged: number[] = [];

  const speed = speedKmPerDay(state);
  const remainingKm = state.voyage.totalKm - state.voyage.traveledKm;
  const moveKm = Math.min(remainingKm, speed * days);
  const usedDays = speed > 0 ? moveKm / speed : days;

  // 分小步前進，避免高速時跳過地標或留下迷霧空洞
  const stepKm = 25;
  const steps = Math.max(1, Math.ceil(moveKm / stepKm));
  let voyage = state.voyage;
  let discovered = state.discovered;
  let ship = state.ship;
  for (let i = 1; i <= steps; i++) {
    const traveledKm = state.voyage.traveledKm + (moveKm * i) / steps;
    voyage = { ...voyage, traveledKm };
    const pos = positionAt(voyage, traveledKm);
    ship = { position: pos.position, heading: pos.heading };
    fogChanged.push(...revealAround(state.fog, pos.position, sightKm(state)));
    const found = landmarksInSight(world, discovered, pos.position, state);
    if (found.length) {
      discovered = [...discovered, ...found];
      for (const id of found) events.push({ type: 'discovered', codexId: id });
    }
  }

  let next: GameState = { ...state, day: state.day + usedDays, voyage, ship, discovered };

  if (isFinished(voyage)) {
    const dest = voyage.destinationPortId;
    if (dest) {
      const arrived = arrive(world, next, dest);
      next = arrived.state;
      events.push(...arrived.events);
      fogChanged.push(...arrived.fogChanged);
    } else {
      next = { ...next, voyage: null };
      events.push({ type: 'anchored', position: next.ship.position });
    }
  }
  // 發現地標也可能完成任務步驟
  const progressed = progressQuests(world, next);
  return {
    state: progressed.state,
    events: [...events, ...progressed.events],
    fogChanged: [...fogChanged, ...progressed.fogChanged],
  };
}

function landmarksInSight(
  world: World,
  discovered: string[],
  pos: LonLat,
  state: GameState,
): string[] {
  const bonus = 1 + 0.1 * (state.captain.attrs.geography - 1);
  return world.landmarks
    .filter(
      (c) =>
        !discovered.includes(c.id) &&
        distanceKm(pos, c.location!) <= (c.discover_radius_km ?? 0) * bonus,
    )
    .map((c) => c.id);
}

function arrive(world: World, state: GameState, portId: string): StepResult {
  const port = world.ports.get(portId)!;
  const firstVisit = !state.visitedPorts.includes(portId);
  const events: GameEvent[] = [{ type: 'arrived', portId, firstVisit }];
  const newGoods = port.goods.filter((g) => !state.discovered.includes(g));
  for (const g of newGoods) events.push({ type: 'discovered', codexId: g });
  const fogChanged = revealAround(state.fog, port.location, PORT_REVEAL_KM);
  return {
    state: {
      ...state,
      voyage: null,
      dockedAt: portId,
      ship: { position: port.location, heading: state.ship.heading },
      discovered: [...state.discovered, ...newGoods],
      visitedPorts: firstVisit ? [...state.visitedPorts, portId] : state.visitedPorts,
      unlockedPorts: state.unlockedPorts.includes(portId)
        ? state.unlockedPorts
        : [...state.unlockedPorts, portId],
    },
    events,
    fogChanged,
  };
}

// ---------------------------------------------------------------- 港口顯示

/** 海圖上顯示的港口：已解鎖、已造訪，以及進行中任務的航行目的地 */
export function visiblePortIds(world: World, state: GameState): string[] {
  const ids = new Set([...state.unlockedPorts, ...state.visitedPorts]);
  for (const t of activeNavigateTargets(world, state)) ids.add(t.portId);
  return [...ids].filter((id) => world.ports.has(id));
}

export interface NavigateTarget {
  questId: string;
  portId: string;
  hintLevel: number;
  text?: string;
}

export function activeNavigateTargets(world: World, state: GameState): NavigateTarget[] {
  const out: NavigateTarget[] = [];
  for (const [questId, p] of Object.entries(state.quests)) {
    if (p.status !== 'active') continue;
    const step = world.quests.get(questId)?.steps[p.step];
    if (step?.type === 'navigate') {
      out.push({ questId, portId: step.target, hintLevel: step.hint_level, text: step.text });
    }
  }
  return out;
}

/**
 * 港口名稱是否顯示在海圖上。
 * 高提示等級（2 以上）的任務目的地在抵達前只顯示為「？」，讓學生依座標或線索找到它。
 */
export function portNameKnown(world: World, state: GameState, portId: string): boolean {
  if (state.visitedPorts.includes(portId)) return true;
  const target = activeNavigateTargets(world, state).find((t) => t.portId === portId);
  if (target) return target.hintLevel <= 1;
  return state.unlockedPorts.includes(portId);
}

/** 任務追蹤列上顯示的航行提示（企畫書 2.4 鷹架） */
export function navigateHint(world: World, state: GameState, t: NavigateTarget): string {
  const port = world.ports.get(t.portId)!;
  const [lon, lat] = port.location;
  let hint: string;
  if (t.hintLevel <= 1) {
    hint = `前往${port.name}（海圖上已標示）`;
  } else if (t.hintLevel === 2) {
    const la = `${lat >= 0 ? '北' : '南'}緯 ${Math.abs(lat).toFixed(0)}°`;
    const lo = `${lon >= 0 ? '東' : '西'}經 ${Math.abs(lon).toFixed(0)}°`;
    hint = `前往約 ${la}、${lo} 的港口`;
  } else if (t.hintLevel === 3) {
    const from = state.ship.position;
    const km = Math.round(distanceKm(from, port.location) / 10) * 10;
    hint = `目的地在目前位置的${compass16(bearingDeg(from, port.location))}方，直線約 ${km} 公里`;
  } else {
    hint = '依照線索找出目的地';
  }
  return t.text ? `${hint}。${t.text}` : hint;
}

// ---------------------------------------------------------------- 任務

export function availableQuests(world: World, state: GameState, portId: string): Quest[] {
  return world.content.quests.filter(
    (q) =>
      q.scenario === state.scenarioId &&
      q.giver_port === portId &&
      !state.quests[q.id] &&
      q.prerequisites.every((p) => state.quests[p]?.status === 'completed'),
  );
}

export function acceptQuest(world: World, state: GameState, questId: string): StepResult {
  if (state.quests[questId]) return { state, events: [], fogChanged: [] };
  const next = {
    ...state,
    quests: { ...state.quests, [questId]: { status: 'active' as const, step: 0 } },
  };
  const progressed = progressQuests(world, next);
  return {
    state: progressed.state,
    events: [{ type: 'questAccepted', questId }, ...progressed.events],
    fogChanged: progressed.fogChanged,
  };
}

/** 需要玩家互動（對話或問答）的任務步驟；一次處理一個 */
export function pendingInteraction(
  world: World,
  state: GameState,
): {
  questId: string;
  step: number;
  data: Extract<QuestStep, { type: 'dialogue' | 'quiz' }>;
} | null {
  // 航行途中不打斷；到港或停泊時才進行對話與問答
  if (state.voyage) return null;
  for (const [questId, p] of Object.entries(state.quests)) {
    if (p.status !== 'active') continue;
    const step = world.quests.get(questId)?.steps[p.step];
    if (step && (step.type === 'dialogue' || step.type === 'quiz')) {
      return { questId, step: p.step, data: step };
    }
  }
  return null;
}

export function finishDialogue(world: World, state: GameState, questId: string): StepResult {
  const p = state.quests[questId];
  const step = world.quests.get(questId)?.steps[p?.step ?? -1];
  if (!p || p.status !== 'active' || step?.type !== 'dialogue') {
    return { state, events: [], fogChanged: [] };
  }
  return advanceStep(world, state, questId);
}

export function answerQuiz(
  world: World,
  state: GameState,
  questId: string,
  choice: number,
): StepResult & { correct: boolean } {
  const p = state.quests[questId];
  const quest = world.quests.get(questId);
  const step = quest?.steps[p?.step ?? -1];
  if (!p || !quest || p.status !== 'active' || step?.type !== 'quiz') {
    return { state, events: [], fogChanged: [], correct: false };
  }
  const correct = choice === step.answer;
  const existing = state.quizLog.find((r) => r.questId === questId && r.step === p.step);
  const record: QuizRecord = existing
    ? { ...existing, attempts: existing.attempts + 1 }
    : {
        questId,
        step: p.step,
        domains: quest.objectives.map((o) => o.domain),
        attempts: 1,
        firstTry: correct,
        day: state.day,
      };
  const quizLog = [...state.quizLog.filter((r) => r !== existing), record];
  const next = { ...state, quizLog };
  if (!correct) return { state: next, events: [], fogChanged: [], correct };
  return { ...advanceStep(world, next, questId), correct };
}

function advanceStep(world: World, state: GameState, questId: string): StepResult {
  const p = state.quests[questId];
  const next = {
    ...state,
    quests: { ...state.quests, [questId]: { ...p, step: p.step + 1 } },
  };
  return progressQuests(world, next);
}

/** 自動推進已滿足的步驟（航行抵達、已發現），並結算完成的任務 */
export function progressQuests(world: World, state: GameState): StepResult {
  let s = state;
  const events: GameEvent[] = [];
  const fogChanged: number[] = [];
  let changed = true;
  while (changed) {
    changed = false;
    for (const [questId, p] of Object.entries(s.quests)) {
      if (p.status !== 'active') continue;
      const quest = world.quests.get(questId);
      if (!quest) continue;
      if (p.step >= quest.steps.length) {
        const done = completeQuest(world, s, quest);
        s = done.state;
        events.push(...done.events);
        fogChanged.push(...done.fogChanged);
        changed = true;
        continue;
      }
      const step = quest.steps[p.step];
      const satisfied =
        (step.type === 'navigate' && s.dockedAt === step.target) ||
        (step.type === 'discover' && s.discovered.includes(step.target));
      if (satisfied) {
        s = { ...s, quests: { ...s.quests, [questId]: { ...p, step: p.step + 1 } } };
        changed = true;
      }
    }
  }
  return { state: s, events, fogChanged };
}

function completeQuest(world: World, state: GameState, quest: Quest): StepResult {
  const r = quest.reward;
  const reward: QuestReward = {
    xp: r.xp,
    gold: r.gold,
    reputation: r.reputation,
    unlockPorts: r.unlock_ports.filter((id) => !state.unlockedPorts.includes(id)),
    codex: r.codex.filter((id) => !state.discovered.includes(id)),
  };
  // 問答全部一次答對，額外獎勵經驗
  const quizzes = state.quizLog.filter((q) => q.questId === quest.id);
  const perfect = quizzes.length > 0 && quizzes.every((q) => q.firstTry);
  if (perfect) reward.xp += 10;

  const { captain, levelsGained } = addXp(state.captain, reward.xp);
  const events: GameEvent[] = [{ type: 'questCompleted', questId: quest.id, reward }];
  for (let i = 1; i <= levelsGained; i++) {
    events.push({ type: 'levelUp', level: state.captain.level + i });
  }
  const fogChanged: number[] = [];
  for (const id of reward.unlockPorts) {
    events.push({ type: 'portUnlocked', portId: id });
    fogChanged.push(...revealAround(state.fog, world.ports.get(id)!.location, PORT_REVEAL_KM));
  }
  for (const id of reward.codex) events.push({ type: 'discovered', codexId: id });
  return {
    state: {
      ...state,
      captain,
      gold: state.gold + reward.gold,
      reputation: state.reputation + reward.reputation,
      unlockedPorts: [...state.unlockedPorts, ...reward.unlockPorts],
      discovered: [...state.discovered, ...reward.codex],
      quests: { ...state.quests, [quest.id]: { status: 'completed', step: quest.steps.length } },
    },
    events,
    fogChanged,
  };
}

// ---------------------------------------------------------------- 統計

export function explorationPercent(state: GameState): number {
  return Math.round(exploredFraction(state.fog) * 1000) / 10;
}
