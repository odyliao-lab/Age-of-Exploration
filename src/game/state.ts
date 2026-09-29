/**
 * 遊戲狀態與規則（純函式）。
 *
 * 所有函式都回傳新的狀態物件；唯一的例外是迷霧陣列（fog）會就地更新，
 * 以免每一幀複製整張格網。事件（GameEvent）交給介面顯示提示與對話框。
 */
import type { LonLat, Quest, QuestStep } from '@/data/schema';
import { bearingDeg, compass16, distanceKm } from '@/geo/geo';
import { addXp, newCaptain, type Captain } from './captain';
import { dateOf, type GameDate } from './calendar';
import {
  currentAt,
  speedFactors,
  stormRiskAt,
  windAt,
  type Current,
  type SpeedFactors,
  type StormRisk,
  type Wind,
} from './environment';
import {
  checkLocate,
  createEvent,
  eventChances,
  flotsamEffect,
  resolveAnswer,
  resolveChoice,
  type EventEffect,
  type EventId,
  type LocateResult,
  type VoyageEvent,
} from './events';
import { createFog, exploredFraction, revealAround } from './fog';
import { newSeed, nextRandom } from './rng';
import {
  LOW_MORALE,
  LOW_SUPPLY_DAYS,
  afterShipwreck,
  conditionSpeedFactor,
  fullCondition,
  passTime,
  repair,
  resolveStormChoice,
  resupply,
  rest,
  shipType,
  shipwreckLoss,
  type ShipCondition,
  type StormChoice,
  type StormEncounter,
} from './ship';
import { createVoyage, isFinished, positionAt, type Harbor, type Voyage } from './voyage';
import type { World } from './world';

export const SAVE_VERSION = 3;

/** 航行中需要玩家處理的狀況：風暴或隨機事件 */
export type Encounter = StormEncounter | VoyageEvent;

/** 兩次隨機事件之間至少間隔的天數 */
const EVENT_COOLDOWN_DAYS = 4;
/** 座標定位挑戰最多嘗試次數，之後直接公布答案 */
export const LOCATE_MAX_ATTEMPTS = 3;

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
  /** 劇本開始日期（YYYY-MM-DD），搭配 day 換算月份與季節 */
  startDate: string;
  shipTypeId: string;
  condition: ShipCondition;
  /** 最後停泊的港口：沉船時被救回這裡 */
  lastPortId: string;
  /** 航行中遇到、需要玩家決定的狀況；未處理前船不會前進 */
  encounter: Encounter | null;
  shipwrecks: number;
  /** 可重現亂數的種子 */
  seed: number;
  /** 下一次隨機事件最早可發生的遊戲天數 */
  eventCooldownUntil: number;
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
  | { type: 'portUnlocked'; portId: string }
  | { type: 'warning'; text: string }
  | { type: 'encounter'; encounter: Encounter }
  | { type: 'stormResolved'; choice: StormChoice; hullLoss: number; days: number }
  | { type: 'eventResolved'; effect: EventEffect }
  | {
      type: 'shipwreck';
      cause: StormRisk;
      lostGold: number;
      portId: string;
      month: number;
    };

export interface StepResult {
  state: GameState;
  events: GameEvent[];
  /** 新揭開的迷霧格索引 */
  fogChanged: number[];
}

// ---------------------------------------------------------------- 開局

export function newGame(world: World, scenarioId: string, seed = newSeed()): StepResult {
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
    startDate: scenario.start_date,
    shipTypeId: scenario.starting_ship,
    condition: fullCondition(shipType(scenario.starting_ship)),
    lastPortId: home.id,
    encounter: null,
    shipwrecks: 0,
    seed,
    eventCooldownUntil: 2,
  };
  return { state, events: [], fogChanged };
}

// ---------------------------------------------------------------- 航行

/** 不含風與洋流的基礎航速（船型、航海術、船況） */
export function speedKmPerDay(state: GameState): number {
  return (
    BASE_SPEED_KM_PER_DAY *
    shipType(state.shipTypeId).speed *
    (1 + 0.05 * (state.captain.attrs.navigation - 1)) *
    conditionSpeedFactor(state.condition)
  );
}

export function gameDate(state: GameState, extraDays = 0): GameDate {
  return dateOf(state.startDate, state.day + extraDays);
}

export interface Environment {
  wind: Wind;
  current: Current | null;
  factors: SpeedFactors;
  storm: StormRisk;
}

export function environmentAt(
  state: GameState,
  position: LonLat,
  heading: number,
  extraDays = 0,
): Environment {
  const month = gameDate(state, extraDays).month;
  const wind = windAt(position, month);
  const current = currentAt(position, month);
  return {
    wind,
    current,
    factors: speedFactors(heading, wind, current),
    storm: stormRiskAt(position, month),
  };
}

/** 依目前月份的風與洋流估算航程天數（規劃航線時顯示） */
export function estimateVoyage(state: GameState, waypoints: LonLat[]) {
  const v = createVoyage(waypoints, null);
  const base = speedKmPerDay(state);
  let days = 0;
  let tailwind = 0;
  let headwind = 0;
  let maxStorm: StormRisk | null = null;
  const stepKm = 50;
  for (let km = 0; km < v.totalKm; km += stepKm) {
    const seg = Math.min(stepKm, v.totalKm - km);
    const pos = positionAt(v, km + seg / 2);
    const env = environmentAt(state, pos.position, pos.heading, days);
    days += seg / (base * env.factors.total);
    if (env.factors.windLabel === '順風') tailwind += seg;
    if (env.factors.windLabel === '逆風') headwind += seg;
    if (env.storm.chancePerDay > (maxStorm?.chancePerDay ?? 0)) maxStorm = env.storm;
  }
  return {
    km: v.totalKm,
    days,
    tailwindShare: v.totalKm ? tailwind / v.totalKm : 0,
    headwindShare: v.totalKm ? headwind / v.totalKm : 0,
    storm: maxStorm,
  };
}

export function regionAt(world: World, [lon, lat]: LonLat): string | null {
  const r = world.content.regions.find(
    (x) => lon >= x.bbox[0] && lat >= x.bbox[1] && lon <= x.bbox[2] && lat <= x.bbox[3],
  );
  return r?.id ?? null;
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

/** 推進遊戲時間（天）。航行中才會移動；有待處理的遭遇時暫停。 */
export function tick(world: World, state: GameState, days: number): StepResult {
  if (!state.voyage || state.encounter || days <= 0) {
    return { state, events: [], fogChanged: [] };
  }
  const events: GameEvent[] = [];
  const fogChanged: number[] = [];

  // 以時間分小步前進：每步約 25 公里，避免高速時跳過地標或留下迷霧空洞
  const steps = Math.max(1, Math.ceil((days * BASE_SPEED_KM_PER_DAY * 1.5) / 25));
  const dt = days / steps;
  let s: GameState = state;
  let voyage = state.voyage;
  let discovered = state.discovered;
  let usedDays = 0;
  let encounter: Encounter | null = null;

  for (let i = 0; i < steps && !isFinished(voyage); i++) {
    const here = positionAt(voyage, voyage.traveledKm);
    const env = environmentAt(s, here.position, here.heading, usedDays);
    const speed = speedKmPerDay(s) * env.factors.total;
    const remaining = voyage.totalKm - voyage.traveledKm;
    const km = Math.min(remaining, speed * dt);
    const stepDays = speed > 0 ? km / speed : dt;
    voyage = { ...voyage, traveledKm: voyage.traveledKm + km };
    usedDays += stepDays;

    const pos = positionAt(voyage, voyage.traveledKm);
    const before = s.condition;
    const condition = passTime(before, stepDays, s.captain.attrs.leadership);
    s = { ...s, ship: { position: pos.position, heading: pos.heading }, condition };
    warnConditionChanges(before, condition, events);

    fogChanged.push(...revealAround(state.fog, pos.position, sightKm(s)));
    const found = landmarksInSight(world, discovered, pos.position, s);
    if (found.length) {
      discovered = [...discovered, ...found];
      for (const id of found) events.push({ type: 'discovered', codexId: id });
    }

    // 風暴：依每天的機率換算這一小步的機率
    const chance = 1 - Math.pow(1 - env.storm.chancePerDay, stepDays);
    if (chance > 0) {
      const [r, seed] = nextRandom(s.seed);
      s = { ...s, seed };
      if (r < chance) {
        encounter = {
          kind: 'storm',
          risk: env.storm,
          position: pos.position,
          month: gameDate(s, usedDays).month,
        };
        break;
      }
    }

    // 隨機事件（有冷卻時間，避免太頻繁打斷航行）
    if (state.day + usedDays >= s.eventCooldownUntil) {
      const rolled = rollEvent(world, s, pos.position, pos.heading, stepDays, usedDays);
      s = rolled.state;
      if (rolled.event) {
        encounter = rolled.event;
        s = { ...s, eventCooldownUntil: state.day + usedDays + EVENT_COOLDOWN_DAYS };
        break;
      }
    }
  }

  let next: GameState = { ...s, day: state.day + usedDays, voyage, discovered };
  if (encounter) {
    next = { ...next, encounter };
    events.push({ type: 'encounter', encounter });
  } else if (isFinished(voyage)) {
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

function warnConditionChanges(before: ShipCondition, after: ShipCondition, events: GameEvent[]) {
  const crossed = (a: number, b: number, limit: number) => a > limit && b <= limit;
  if (crossed(before.supplies.water, after.supplies.water, LOW_SUPPLY_DAYS)) {
    events.push({ type: 'warning', text: `淡水只剩 ${LOW_SUPPLY_DAYS} 天份，盡快靠港補給！` });
  }
  if (crossed(before.supplies.food, after.supplies.food, LOW_SUPPLY_DAYS)) {
    events.push({ type: 'warning', text: `糧食只剩 ${LOW_SUPPLY_DAYS} 天份，盡快靠港補給！` });
  }
  if (
    crossed(before.supplies.water, after.supplies.water, 0) ||
    crossed(before.supplies.food, after.supplies.food, 0)
  ) {
    events.push({ type: 'warning', text: '補給耗盡！船員士氣快速下降，航速變慢。' });
  }
  if (crossed(before.morale, after.morale, LOW_MORALE)) {
    events.push({ type: 'warning', text: '船員士氣低落，有人提議返航……' });
  }
}

const EVENT_ORDER: EventId[] = ['pirates', 'doldrums', 'scurvy', 'stargazing', 'lost', 'flotsam'];

function rollEvent(
  world: World,
  state: GameState,
  position: LonLat,
  heading: number,
  stepDays: number,
  usedDays: number,
): { state: GameState; event: VoyageEvent | null } {
  const month = gameDate(state, usedDays).month;
  const env = environmentAt(state, position, heading, usedDays);
  const lastPort = world.ports.get(state.lastPortId);
  const regionId = regionAt(world, position);
  const ctx = {
    position,
    heading,
    month,
    wind: env.wind,
    daysAtSea: state.condition.daysAtSea,
    lastPort: lastPort
      ? { name: lastPort.name, location: lastPort.location }
      : { name: '出發港', location: position },
    regionName: regionId ? (world.regions.get(regionId)?.name ?? null) : null,
    otherRegionNames: world.content.regions.filter((r) => r.id !== regionId).map((r) => r.name),
  };
  // 迷航題需要離開港口一段距離才有意義
  const farEnough = distanceKm(ctx.lastPort.location, position) > 150;
  const chances = eventChances(ctx);
  let seed = state.seed;
  const rand = () => {
    const [v, n] = nextRandom(seed);
    seed = n;
    return v;
  };
  let event: VoyageEvent | null = null;
  for (const id of EVENT_ORDER) {
    const c = chances[id];
    if (!c || (id === 'lost' && !farEnough)) continue;
    if (id === 'pirates' && !ctx.regionName) continue;
    if (rand() < 1 - Math.pow(1 - c, stepDays)) {
      event = createEvent(id, ctx, rand);
      break;
    }
  }
  return { state: { ...state, seed }, event };
}

/** 處理隨機事件：選擇行動（choiceId）或回答問題（answer） */
export function resolveEvent(
  _world: World,
  state: GameState,
  response: { choiceId?: string; answer?: number },
): StepResult {
  const ev = state.encounter;
  if (!ev || ev.kind !== 'event') return { state, events: [], fogChanged: [] };
  const [roll, seed] = nextRandom(state.seed);
  let effect: EventEffect;
  let quizLog = state.quizLog;
  if (response.answer !== undefined && ev.question) {
    const correct = response.answer === ev.question.answer;
    effect = resolveAnswer(ev, correct, state.gold);
    quizLog = [
      ...quizLog,
      {
        questId: `event:${ev.id}`,
        step: Math.floor(state.day),
        domains: ev.id === 'pirates' ? ['B'] : ['A'],
        attempts: 1,
        firstTry: correct,
        day: state.day,
      },
    ];
  } else if (ev.id === 'flotsam') {
    effect = flotsamEffect(ev, roll);
  } else {
    effect = resolveChoice(ev, response.choiceId ?? '', roll, state.captain.attrs, state.gold);
  }

  const events: GameEvent[] = [{ type: 'eventResolved', effect }];
  let condition = state.condition;
  if (effect.days) condition = passTime(condition, effect.days, state.captain.attrs.leadership);
  condition = {
    ...condition,
    morale: Math.max(0, Math.min(100, condition.morale + (effect.morale ?? 0))),
    supplies: {
      water: Math.max(0, condition.supplies.water + (effect.water ?? 0)),
      food: Math.max(0, condition.supplies.food + (effect.food ?? 0)),
    },
  };
  let captain = state.captain;
  if (effect.xp) {
    const r = addXp(captain, effect.xp);
    captain = r.captain;
    for (let i = 1; i <= r.levelsGained; i++) {
      events.push({ type: 'levelUp', level: state.captain.level + i });
    }
  }
  return {
    state: {
      ...state,
      seed,
      encounter: null,
      quizLog,
      captain,
      condition,
      gold: Math.max(0, state.gold + (effect.gold ?? 0)),
      day: state.day + (effect.days ?? 0),
    },
    events,
    fogChanged: [],
  };
}

/** 處理風暴遭遇 */
export function resolveEncounter(world: World, state: GameState, choice: StormChoice): StepResult {
  const enc = state.encounter;
  if (!enc || enc.kind !== 'storm') return { state, events: [], fogChanged: [] };
  const [roll, seed] = nextRandom(state.seed);
  const severity = enc.risk.kind === 'gale' ? 0.8 : 1;
  const out = resolveStormChoice(
    state.condition,
    choice,
    roll,
    state.captain.attrs.leadership,
    severity,
  );
  let next: GameState = {
    ...state,
    seed,
    encounter: null,
    condition: out.condition,
    day: state.day + out.days,
  };
  const events: GameEvent[] = [
    { type: 'stormResolved', choice, hullLoss: out.hullLoss, days: out.days },
  ];
  if (next.condition.hull <= 0) return shipwreck(world, next, enc.risk, enc.month);
  if (next.voyage && isFinished(next.voyage)) {
    const r = tick(world, next, 0.001);
    next = r.state;
    events.push(...r.events);
  }
  return { state: next, events, fogChanged: [] };
}

function shipwreck(world: World, state: GameState, cause: StormRisk, month: number): StepResult {
  const scenario = world.scenarios.get(state.scenarioId)!;
  const region = regionAt(world, state.ship.position);
  const tier = region ? (scenario.region_tiers[region] ?? 3) : 3;
  const lostGold = Math.floor(state.gold * shipwreckLoss(tier));
  const port = world.ports.get(state.lastPortId)!;
  return {
    state: {
      ...state,
      gold: state.gold - lostGold,
      voyage: null,
      encounter: null,
      dockedAt: port.id,
      ship: { position: port.location, heading: state.ship.heading },
      condition: afterShipwreck(shipType(state.shipTypeId)),
      shipwrecks: state.shipwrecks + 1,
    },
    events: [{ type: 'shipwreck', cause, lostGold, portId: port.id, month }],
    fogChanged: [],
  };
}

// ---------------------------------------------------------------- 港口服務

export function portResupply(state: GameState): GameState {
  if (!state.dockedAt) return state;
  const { condition, cost } = resupply(state.condition, shipType(state.shipTypeId), state.gold);
  return { ...state, condition, gold: state.gold - cost };
}

export function portRepair(state: GameState): GameState {
  if (!state.dockedAt) return state;
  const { condition, cost } = repair(state.condition, state.gold);
  return { ...state, condition, gold: state.gold - cost };
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
      lastPortId: portId,
      condition: rest(state.condition),
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
  data: Extract<QuestStep, { type: 'dialogue' | 'quiz' | 'locate' }>;
} | null {
  // 航行途中不打斷；到港或停泊時才進行對話、問答與定位挑戰
  if (state.voyage || state.encounter) return null;
  for (const [questId, p] of Object.entries(state.quests)) {
    if (p.status !== 'active') continue;
    const step = world.quests.get(questId)?.steps[p.step];
    if (step && (step.type === 'dialogue' || step.type === 'quiz' || step.type === 'locate')) {
      return { questId, step: p.step, data: step };
    }
  }
  return null;
}

/**
 * 座標定位挑戰：玩家在海圖上點選位置。
 * 答錯會告訴玩家正確位置在點選處的哪個方位；答錯三次後公布答案並繼續任務。
 */
export function answerLocate(
  world: World,
  state: GameState,
  questId: string,
  guess: LonLat,
): StepResult & { result: LocateResult; attempts: number; revealed: boolean } {
  const p = state.quests[questId];
  const quest = world.quests.get(questId);
  const step = quest?.steps[p?.step ?? -1];
  const none = { correct: false, distanceKm: 0, direction: '' };
  if (!p || !quest || p.status !== 'active' || step?.type !== 'locate') {
    return { state, events: [], fogChanged: [], result: none, attempts: 0, revealed: false };
  }
  const result = checkLocate(guess, step.target, step.tolerance_km);
  const existing = state.quizLog.find((r) => r.questId === questId && r.step === p.step);
  const attempts = (existing?.attempts ?? 0) + 1;
  const record: QuizRecord = existing
    ? { ...existing, attempts }
    : {
        questId,
        step: p.step,
        domains: ['A'],
        attempts: 1,
        firstTry: result.correct,
        day: state.day,
      };
  const next = { ...state, quizLog: [...state.quizLog.filter((r) => r !== existing), record] };
  const revealed = !result.correct && attempts >= LOCATE_MAX_ATTEMPTS;
  if (!result.correct && !revealed) {
    return { state: next, events: [], fogChanged: [], result, attempts, revealed };
  }
  return { ...advanceStep(world, next, questId), result, attempts, revealed };
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
