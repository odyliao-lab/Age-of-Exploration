/**
 * 遊戲狀態與規則（純函式）。
 *
 * 所有函式都回傳新的狀態物件；唯一的例外是迷霧陣列（fog）會就地更新，
 * 以免每一幀複製整張格網。事件（GameEvent）交給介面顯示提示與對話框。
 */
import type { CodexEntry, LonLat, Quest, QuestStep } from '@/data/schema';
import { bearingDeg, compass16, distanceKm } from '@/geo/geo';
import { addXp, newCaptain, type Captain } from './captain';
import { ACHIEVEMENT_MAP, EMPTY_STATS, newlyUnlocked, type AchievementStats } from './achievements';
import { modifiersFor, type Modifiers } from './modifiers';
import {
  COLORS,
  EMBLEMS,
  HATS,
  HULL_PAINTS,
  PAINT_PRICE,
  SAIL_PAINTS,
  SKIN_TONES,
  defaultAppearance,
  optionUnlocked,
  paintOwned,
  type Appearance,
} from './cosmetics';
import {
  DAILY_REWARD,
  answerReview,
  bumpDaily,
  dailyComplete,
  dueReviews,
  localDate,
  newDailyVoyage,
  scheduleReview,
  type DailyVoyage,
  type ReviewItem,
} from './learning';
import type { LearningDomain } from '@/data/schema';
import { SKILLS, shipDef, skillPointsEarned, type Profession } from './progression';
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
  type EventContext,
  type EventEffect,
  type EventId,
  type LocateResult,
  type VoyageEvent,
} from './events';
import { createFog, exploredAreaKm2, exploredFraction, revealAround } from './fog';
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
import { destinationPoint } from './events';
import {
  angleDiff,
  angleOffWind,
  gustyWind,
  motion,
  NO_GO,
  turnToward,
  TURN_DEG_PER_DAY,
  type Helm,
  type Motion,
} from './sailing';
import type { Rig } from './progression';
import { isLand } from '@/geo/landmask';
import type { World } from './world';
import { crewTalk } from './crewTalk';
import {
  HAIL_KM,
  MAX_FLEETS,
  MERCHANT_CHANCE_PER_DAY,
  insideStorm,
  pirateChancePerDay,
  spawnFleet,
  spawnStorm,
  stepFleet,
  stepStorm,
  stormHitChancePerDay,
  stormSpawnChance,
  type SeaFleet,
  type StormCell,
  type MistBank,
  insideMist,
  mistZoneAt,
  spawnMist,
  stepMist,
  MIST_DRIFT_KM_PER_DAY,
  MIST_PIRATE_SPOT_KM,
  MIST_SIGHT_KM,
} from './encounters';
import {
  canSightPolaris,
  isNight,
  judgeSighting,
  nightIndex,
  positionError,
  soundAt,
  soundingText,
  SOUNDING_FIX_ERROR_KM,
  SOUNDING_FIX_KM,
  type NavFix,
  type SightingResult,
  type Sounding,
} from './navigation';
import {
  GOODS_PRICE,
  buyGoods,
  cargoUsed,
  quote,
  sellGoods,
  type Cargo,
  type Market,
  type Quote,
} from './trade';

export const SAVE_VERSION = 7;

/** 航行中需要玩家處理的狀況：風暴或隨機事件 */
export type Encounter = StormEncounter | VoyageEvent;

/** 兩次隨機事件之間至少間隔的天數 */
const EVENT_COOLDOWN_DAYS = 4;
/** 座標定位挑戰最多嘗試次數，之後直接公布答案 */
export const LOCATE_MAX_ATTEMPTS = 3;

/** 基礎航速：每日 100 海里（約 4 節），接近鄭和寶船的歷史估計 */
export const BASE_SPEED_KM_PER_DAY = 185;
/** 船上瞭望的揭霧半徑：桅頂看得到的海岸與山（地圖逐步繪出） */
export const SIGHT_KM = 70;
const HOME_REVEAL_KM = 160;
const PORT_REVEAL_KM = 90;
/** 離港口多近可以入港 */
const PORT_REACH_KM = 30;

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
  /** 自動航行（熟悉航線）；親手駕船時為 null */
  voyage: Voyage | null;
  /** 親手駕船：在海上時不為 null */
  helm: HelmState | null;
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
  /** 已學會的技能 */
  skills: string[];
  /** 尚未使用的技能點 */
  skillPoints: number;
  /** 已招募的船員 id */
  crew: string[];
  /** 已解鎖的成就 id */
  achievements: string[];
  /** 目前顯示的稱號（成就 id） */
  title: string | null;
  stats: AchievementStats;
  /** 錯題回流（間隔重複） */
  reviews: ReviewItem[];
  /** 今日航程 */
  daily: DailyVoyage | null;
  /** 航海紀錄（最近的事件） */
  log: LogEntry[];
  /** 船長頭像、船旗、船身配色 */
  appearance: Appearance;
  /** 聽過的傳聞（codex id） */
  rumors: string[];
  /** 已經向學者回報的發現 */
  reported: string[];
  /** 船上的貨物 */
  cargo: Cargo;
  /** 各港各貨因買賣造成的價格波動 */
  market: Market;
  /** 上次定位（航位推算的誤差從這裡累積） */
  nav: NavFix;
  /** 上次觀星是第幾個夜晚（每晚一次） */
  starNight: number;
  /** 上次看岸形定位是第幾天（每天一次） */
  coastDay: number;
  /** 海上看得見的船隊與風暴雲團 */
  fleets: SeaFleet[];
  storms: StormCell[];
  /** 看得見的海霧 */
  mists: MistBank[];
  nextEntityId: number;
  /** 熟悉航線：「出發港>抵達港」→ 親手開過的航跡 */
  routes: Record<string, LonLat[]>;
  /** 這趟親手駕船的航跡（每約 25 公里記一點） */
  trail: LonLat[];
  /** 夥伴下次可以閒聊的遊戲日、上次所在海域、已給過提示的傳聞 */
  talkDay: number;
  lastRegionId: string | null;
  hinted: string[];
}

export interface HelmState extends Helm {
  /** 下錨：船完全不動 */
  anchored: boolean;
  /** 船頭頂到海岸（用來只提醒一次） */
  blocked: boolean;
}

export interface LogEntry {
  day: number;
  text: string;
  kind: 'arrive' | 'discover' | 'quest' | 'storm' | 'event' | 'level' | 'achievement';
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
  | { type: 'talk'; speaker: string; text: string }
  | { type: 'encounter'; encounter: Encounter }
  | { type: 'stormResolved'; choice: StormChoice; hullLoss: number; days: number }
  | { type: 'eventResolved'; effect: EventEffect }
  | { type: 'achievement'; id: string }
  | { type: 'skillPoint' }
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
    helm: null,
    fog,
    discovered: [...home.goods, ...home.sights],
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
    skills: [],
    skillPoints: 0,
    crew: [],
    achievements: [],
    title: null,
    stats: { ...EMPTY_STATS },
    reviews: [],
    daily: null,
    log: [{ day: 0, text: `從${home.name}出發，展開航海生涯`, kind: 'arrive' }],
    appearance: defaultAppearance(),
    rumors: [],
    reported: [],
    cargo: {},
    market: {},
    nav: { day: 0, errorKm: 2 },
    starNight: -1,
    coastDay: -1,
    fleets: [],
    storms: [],
    mists: [],
    nextEntityId: 1,
    talkDay: 0.5,
    lastRegionId: null,
    hinted: [],
    routes: {},
    trail: [],
  };
  return { state, events: [], fogChanged };
}

// ---------------------------------------------------------------- 航行

/** 屬性、技能、船員、船隻的加成總和 */
export function mods(world: World, state: GameState): Modifiers {
  return modifiersFor({
    captain: state.captain,
    skills: state.skills,
    crewProfessions: state.crew
      .map((id) => world.crew.get(id)?.profession)
      .filter((p): p is Profession => !!p),
    shipTypeId: state.shipTypeId,
  });
}

/** 不含風與洋流的基礎航速（船型、航海術、技能、船員、船況） */
export function speedKmPerDay(world: World, state: GameState): number {
  return BASE_SPEED_KM_PER_DAY * mods(world, state).speed * conditionSpeedFactor(state.condition);
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
export function estimateVoyage(world: World, state: GameState, waypoints: LonLat[]) {
  const v = createVoyage(waypoints, null);
  const base = speedKmPerDay(world, state);
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

export function sightKm(world: World, state: GameState): number {
  return SIGHT_KM * mods(world, state).sight;
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

/** 這個位置是不是陸地：有精確海岸就用海岸，否則用陸地遮罩 */
export function landAt(world: World, p: LonLat): boolean {
  return world.coast ? world.coast.isLand(p) : isLand(p);
}

/** 推進遊戲時間（天）。在海上（自動航行或親手駕船）才會移動；有待處理的遭遇時暫停。 */
export function tick(world: World, state: GameState, days: number): StepResult {
  if ((!state.voyage && !state.helm) || state.encounter || days <= 0) {
    return { state, events: [], fogChanged: [] };
  }
  const events: GameEvent[] = [];
  const fogChanged: number[] = [];
  const m = mods(world, state);
  const sight = SIGHT_KM * m.sight;
  const base = BASE_SPEED_KM_PER_DAY * m.speed;
  const rig = shipDef(state.shipTypeId).rig;

  // 分小步前進：親手駕船每步約 2 公里（貼近海岸也不會穿過陸地），自動航行每步約 25 公里
  const stepKm = state.helm ? 2 : 25;
  const maxKmPerDay = BASE_SPEED_KM_PER_DAY * 1.5 + (state.helm ? 80 : 0);
  const steps = Math.max(1, Math.ceil((days * maxKmPerDay) / stepKm));
  const dt = days / steps;
  let s: GameState = state;
  let voyage = state.voyage;
  let helm = state.helm;
  let trail = state.trail;
  let discovered = state.discovered;
  let usedDays = 0;
  let encounter: Encounter | null = null;

  for (let i = 0; i < steps && !(voyage && isFinished(voyage)); i++) {
    const from = s.ship.position;
    let to: LonLat;
    let heading: number;
    let stepDays = dt;
    if (helm) {
      // 親手駕船：轉向、依風與帆計算船速、洋流推送、撞到海岸就停住
      heading = turnToward(s.ship.heading, helm.course, TURN_DEG_PER_DAY * dt);
      to = from;
      if (!helm.anchored) {
        const env = environmentAt(s, from, heading, usedDays);
        const wind = gustyWind(env.wind, from, s.day + usedDays);
        const mv = motion(
          heading,
          helm.sail,
          wind,
          env.current,
          rig,
          base * conditionSpeedFactor(s.condition),
        );
        const step = mv.speed * dt;
        let next: LonLat | null = destinationPoint(from, mv.course, step);
        if (step > 0 && landAt(world, next)) {
          // 碰到海岸時沿著岸邊滑行：試著往左右偏一點前進（速度打折），都不行才停下
          next = null;
          for (const d of [25, -25, 50, -50, 75, -75]) {
            const q = destinationPoint(from, mv.course + d, step * Math.cos((d * Math.PI) / 180));
            if (!landAt(world, q)) {
              next = q;
              break;
            }
          }
        }
        const blocked = step > 0 && next === null;
        if (next) to = next;
        if (blocked && !helm.blocked) {
          events.push({ type: 'warning', text: '船頭頂到海岸了！轉個方向離開淺灘。' });
        }
        if (blocked !== helm.blocked) helm = { ...helm, blocked };
      }
    } else {
      const v = voyage!;
      const here = positionAt(v, v.traveledKm);
      const env = environmentAt(s, here.position, here.heading, usedDays);
      const speed = base * conditionSpeedFactor(s.condition) * env.factors.total;
      const km = Math.min(v.totalKm - v.traveledKm, speed * dt);
      stepDays = speed > 0 ? km / speed : dt;
      voyage = { ...v, traveledKm: v.traveledKm + km };
      const pos = positionAt(voyage, voyage.traveledKm);
      to = pos.position;
      heading = pos.heading;
    }
    usedDays += stepDays;
    // 記錄親手開過的航跡，入港時存成熟悉航線
    if (helm && trail.length && trail.length < TRAIL_MAX) {
      if (distanceKm(trail[trail.length - 1], to) > TRAIL_STEP_KM) trail = [...trail, to];
    }

    const before = s.condition;
    const condition = passTime(before, stepDays, m);
    const stats = trackCrossings(s.stats, from[1], to[1]);
    s = { ...s, ship: { position: to, heading }, condition, stats };
    for (const id of linesCrossed(world, from[1], to[1])) {
      if (!discovered.includes(id)) {
        discovered = [...discovered, id];
        events.push({ type: 'discovered', codexId: id });
      }
    }
    warnConditionChanges(before, condition, events);

    const seeKm = insideMist(s.mists, to) ? Math.min(sight, MIST_SIGHT_KM) : sight;
    fogChanged.push(...revealAround(state.fog, to, seeKm));
    const found = landmarksInSight(world, discovered, to, m.discovery);
    if (found.length) {
      discovered = [...discovered, ...found];
      for (const id of found) events.push({ type: 'discovered', codexId: id });
    }

    // 親手駕船：看得見的船隊、風暴雲團與定位（取代隨機的海盜與風暴）
    if (helm) {
      const life = seaLife(world, { ...s, helm, discovered }, stepDays, usedDays);
      s = { ...life.state, helm: s.helm, discovered: s.discovered };
      events.push(...life.events);
      if (life.encounter) {
        encounter = life.encounter;
        break;
      }
    }

    // 風暴：依每天的機率換算這一小步的機率（自動航行）
    const storm = stormRiskAt(to, gameDate(s, usedDays).month);
    const chance = helm ? 0 : 1 - Math.pow(1 - storm.chancePerDay, stepDays);
    if (chance > 0) {
      const [r, seed] = nextRandom(s.seed);
      s = { ...s, seed };
      if (r < chance) {
        encounter = {
          kind: 'storm',
          risk: storm,
          position: to,
          month: gameDate(s, usedDays).month,
        };
        break;
      }
    }

    // 隨機事件（有冷卻時間，避免太頻繁打斷航行）
    if (state.day + usedDays >= s.eventCooldownUntil) {
      const rolled = rollEvent(world, s, to, heading, stepDays, usedDays, !!helm);
      s = rolled.state;
      if (rolled.event) {
        encounter = rolled.event;
        s = { ...s, eventCooldownUntil: state.day + usedDays + EVENT_COOLDOWN_DAYS };
        break;
      }
    }
  }

  let next: GameState = { ...s, day: state.day + usedDays, voyage, helm, discovered, trail };
  if (encounter) {
    next = { ...next, encounter };
    events.push({ type: 'encounter', encounter });
  } else if (voyage && isFinished(voyage)) {
    next = { ...next, stats: { ...next.stats, voyages: next.stats.voyages + 1 } };
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

// ---------------------------------------------------------------- 海上的船隊、風暴與定位

/** 離認得的港口這麼近時，看得到岸上的地標，可以重新定位 */
const COAST_FIX_KM = 45;

/** 目前的位置誤差（公里）：天文學與觀星相關技能會讓誤差累積得慢 */
export function positionErrorKm(world: World, state: GameState): number {
  return positionError(state.nav, state.day, Math.max(0.4, mods(world, state).lostChance));
}

/**
 * 親手駕船的每一小步：看岸定位、船隊與風暴的出現與移動。
 * 回傳需要玩家處理的遭遇（被海盜追上、進入風暴）。
 */
function seaLife(
  world: World,
  state: GameState,
  stepDays: number,
  usedDays: number,
): { state: GameState; events: GameEvent[]; encounter: Encounter | null } {
  const events: GameEvent[] = [];
  const day = state.day + usedDays;
  const pos = state.ship.position;
  const month = gameDate(state, usedDays).month;
  let seed = state.seed;
  const rand = () => {
    const [v, n] = nextRandom(seed);
    seed = n;
    return v;
  };
  const isLand = (p: LonLat) => landAt(world, p);
  const perStep = (perDay: number) => 1 - Math.exp(-perDay * stepDays);
  let { nav, fleets, storms, mists, nextEntityId, stats } = state;
  const misty = !!insideMist(mists, pos);

  // 看岸定位：看得到去過的港口，就知道自己在哪裡
  if (positionError(nav, day) > 5) {
    const near = state.visitedPorts.some(
      (id) => distanceKm(world.ports.get(id)!.location, pos) <= COAST_FIX_KM,
    );
    if (near) nav = { day, errorKm: 3 };
  }

  // 新船隊出現
  const regionId = regionAt(world, pos);
  if (fleets.length < MAX_FLEETS) {
    const kind =
      rand() < perStep(pirateChancePerDay(pos, !!regionId))
        ? 'pirate'
        : rand() < perStep(regionId ? MERCHANT_CHANCE_PER_DAY : 0)
          ? 'merchant'
          : null;
    if (kind) {
      const f = spawnFleet(kind, nextEntityId, pos, day, rand, isLand);
      if (f) {
        nextEntityId++;
        fleets = [...fleets, f];
        if (kind === 'pirate') {
          events.push({
            type: 'warning',
            text: `瞭望員：${compass16(bearingDeg(pos, f.position))}方遠處有一艘陌生的快船！`,
          });
        }
      }
    }
  }

  // 船隊移動
  let encounter: Encounter | null = null;
  const moved: SeaFleet[] = [];
  for (const f of fleets) {
    const w = gustyWind(windAt(f.position, month), f.position, day);
    const r = stepFleet(
      f,
      pos,
      w,
      stepDays,
      day,
      rand,
      isLand,
      misty ? MIST_PIRATE_SPOT_KM : undefined,
    );
    if (r.event?.type === 'pirateChase') {
      events.push({ type: 'warning', text: '海盜船朝我們追來了！轉到順風的方向，拉開距離！' });
    } else if (r.event?.type === 'pirateEscaped') {
      events.push({ type: 'warning', text: '甩掉海盜了！懂得利用風向，就是最好的武器。' });
      stats = { ...stats, piratesOutwitted: stats.piratesOutwitted + 1 };
    } else if (r.event?.type === 'pirateContact' && !encounter) {
      // 被追上：只能交涉或用知識化解（已經逃過一次了）
      const ctx = eventContext(world, state, pos, state.ship.heading, usedDays);
      const ev = createEvent('pirates', ctx, rand);
      encounter = {
        ...ev,
        text: '海盜快船追上來了，鉤索搭上船舷，船上的人高聲喊話，要你們交出貨物。',
        choices: [
          ...(ev.choices ?? []).filter((c) => c.id !== 'flee'),
          ...(cargoUsed(state.cargo) > 0
            ? [
                {
                  id: 'cargo',
                  label: '分一些貨物給他們',
                  hint: '交出約三分之一的貨物，保住金幣',
                },
              ]
            : []),
        ],
      };
    }
    if (r.fleet) moved.push(r.fleet);
  }
  fleets = moved;

  // 風暴雲團
  if (storms.length === 0) {
    const risk = stormRiskAt(pos, month);
    if (rand() < perStep(stormSpawnChance(risk))) {
      const w = windAt(pos, month);
      storms = [spawnStorm(nextEntityId++, pos, risk, w, day, rand)];
    }
  }
  storms = storms.map((c) => stepStorm(c, stepDays, day)).filter((c): c is StormCell => !!c);
  const inStorm = insideStorm(storms, pos);
  if (inStorm && !encounter && rand() < perStep(stormHitChancePerDay(inStorm, pos))) {
    encounter = {
      kind: 'storm',
      risk: { kind: inStorm.kind, name: inStorm.name, chancePerDay: 1, lesson: inStorm.lesson },
      position: pos,
      month,
    };
    // 撐過之後雲團就過去了
    storms = storms.filter((c) => c.id !== inStorm.id);
  }

  // 海霧：跟著風飄；進到霧裡看不遠，推算誤差累積更快
  if (mists.length === 0) {
    const zone = mistZoneAt(pos, month);
    if (zone && rand() < perStep(zone.chancePerDay)) {
      mists = [spawnMist(nextEntityId++, pos, zone, windAt(pos, month), day, rand)];
    }
  }
  mists = mists.map((c) => stepMist(c, stepDays, day)).filter((c): c is MistBank => !!c);
  const mistNow = insideMist(mists, pos);
  if (mistNow) {
    nav = { ...nav, errorKm: nav.errorKm + MIST_DRIFT_KM_PER_DAY * stepDays };
    if (!misty) {
      events.push({
        type: 'warning',
        text: '起霧了！四周白茫茫一片，看不到岸也看不到星星。放慢一點，用測深探探水深吧。',
      });
      events.push({ type: 'talk', speaker: '水手長', text: mistNow.lesson });
    }
  } else if (misty) {
    events.push({ type: 'warning', text: '霧散了，視野又清楚起來。' });
  }

  // 夥伴說話
  let { talkDay, lastRegionId, hinted } = state;
  if (!encounter) {
    const region = regionId ? (world.regions.get(regionId) ?? null) : null;
    const env = environmentAt(state, pos, state.ship.heading, usedDays);
    const talk = crewTalk({
      position: pos,
      wind: gustyWind(env.wind, pos, day),
      current: env.current,
      night: isNight(day),
      region,
      lastRegionId,
      openRumors: openRumors(world, state),
      hinted,
      speakers: state.crew.map((id) => world.crew.get(id)?.name).filter((n): n is string => !!n),
      roll: rand(),
      chatReady: day >= talkDay,
    });
    if (talk) {
      events.push({ type: 'talk', speaker: talk.speaker, text: talk.text });
      if (talk.region) lastRegionId = talk.region;
      if (talk.hintFor) hinted = [...hinted, talk.hintFor];
      if (talk.chat) talkDay = day + 1.2 + rand() * 1.2;
    }
    // 離開有名字的海域時也要記住，下次進來才會再介紹
    if (!region && lastRegionId) lastRegionId = null;
  }

  return {
    state: {
      ...state,
      seed,
      nav,
      fleets,
      storms,
      mists,
      nextEntityId,
      stats,
      talkDay,
      lastRegionId,
      hinted,
    },
    events,
    encounter,
  };
}

/** 附近可以打招呼的商船 */
export function merchantInReach(state: GameState): SeaFleet | null {
  if (!state.helm) return null;
  return (
    state.fleets.find(
      (f) =>
        f.kind === 'merchant' &&
        !f.greeted &&
        distanceKm(f.position, state.ship.position) <= HAIL_KM,
    ) ?? null
  );
}

export const MERCHANT_SUPPLY_COST = 20;

export interface GreetResult {
  state: GameState;
  title: string;
  text: string;
  lesson?: string;
}

/**
 * 和商船打招呼：
 * - news：商人說出附近一個還沒去過的港口在哪裡（海圖上會出現），並透露那裡的特產；
 * - supplies：用較高的價錢買一些淡水和糧食。
 */
export function greetMerchant(
  world: World,
  state: GameState,
  fleetId: number,
  choice: 'news' | 'supplies',
): GreetResult | null {
  const f = state.fleets.find((x) => x.id === fleetId);
  if (!f || f.greeted || merchantInReach(state)?.id !== fleetId) return null;
  const fleets = state.fleets.map((x) => (x.id === fleetId ? { ...x, greeted: true } : x));
  if (choice === 'supplies') {
    if (state.gold < MERCHANT_SUPPLY_COST) return null;
    const cap = shipType(state.shipTypeId).supplyDays;
    const add = (v: number) => Math.min(cap, v + 5);
    return {
      state: {
        ...state,
        fleets,
        gold: state.gold - MERCHANT_SUPPLY_COST,
        condition: {
          ...state.condition,
          supplies: {
            water: add(state.condition.supplies.water),
            food: add(state.condition.supplies.food),
          },
        },
      },
      title: '向商船買補給',
      text: `商人賣給你 5 天份的淡水和糧食，收了 ${MERCHANT_SUPPLY_COST} 金幣。「海上的東西總是比較貴啦！」`,
    };
  }
  const pos = state.ship.position;
  const unknown = world.content.ports
    .filter((p) => !state.unlockedPorts.includes(p.id) && !state.visitedPorts.includes(p.id))
    .sort((a, b) => distanceKm(a.location, pos) - distanceKm(b.location, pos));
  const target = unknown[0];
  if (!target) {
    return {
      state: { ...state, fleets },
      title: '和商船交換消息',
      text: '商人笑著說：「這一帶的港口你都去過了，看來你比我還熟呢！」',
    };
  }
  const km = Math.round(distanceKm(pos, target.location) / 10) * 10;
  const dir = compass16(bearingDeg(pos, target.location));
  const goods = target.goods
    .map((g) => world.codex.get(g)?.name)
    .filter(Boolean)
    .join('、');
  return {
    state: {
      ...state,
      fleets,
      unlockedPorts: [...state.unlockedPorts, target.id],
    },
    title: '和商船交換消息',
    text: `商人說：「往${dir}方大約 ${km} 公里，有個港口叫${target.name}${goods ? `，那裡產${goods}` : ''}。」${target.name}已經標在海圖上了。`,
    lesson:
      '在沒有地圖和網路的年代，航海者靠彼此交換消息認識世界。港口、物產與航路的知識，都是一點一點累積起來的。',
  };
}

// ---------------------------------------------------------------- 看岸形辨位

/** 附近有沒有陸地：在船的四周 10、20、35 公里取樣 */
function coastNearby(world: World, p: LonLat): boolean {
  for (const km of [10, 20, 35]) {
    for (let b = 0; b < 360; b += 30) if (landAt(world, destinationPoint(p, b, km))) return true;
  }
  return false;
}

/** 為什麼現在不能看岸形（可以時回傳 null） */
export function coastSightBlocked(world: World, state: GameState): string | null {
  if (!state.helm) return '要在海上才能看岸形';
  if (isNight(state.day)) return '天黑了看不清海岸，改用牽星術吧';
  if (insideMist(state.mists, state.ship.position)) return '霧太濃，看不到海岸';
  if (state.coastDay === Math.floor(state.day)) return '今天已經看過岸形了';
  if (!coastNearby(world, state.ship.position)) return '附近看不到海岸';
  return null;
}

export interface CoastChoice {
  /** 地點（港口或地標）id */
  id: string;
  name: string;
  location: LonLat;
}

/**
 * 看岸形的選項：離船最近的已知地點（答案），加上兩個遠一點的干擾選項。
 * 候選是所有港口與有位置的圖鑑地點。
 */
export function coastChoices(world: World, state: GameState, rand: () => number): CoastChoice[] {
  const pos = state.ship.position;
  const all: CoastChoice[] = [
    ...world.content.ports.map((p) => ({ id: p.id, name: p.name, location: p.location })),
    ...world.content.codex
      .filter((c) => c.location && c.category !== 'goods')
      .map((c) => ({ id: c.id, name: c.name, location: c.location! })),
  ];
  const byDist = [...all].sort((a, b) => distanceKm(a.location, pos) - distanceKm(b.location, pos));
  const answer = byDist[0];
  const decoys = byDist.filter((c) => {
    const d = distanceKm(c.location, pos);
    return d > 300 && d < 2500 && c.name !== answer.name;
  });
  const picked: CoastChoice[] = [];
  while (picked.length < 2 && decoys.length) {
    picked.push(decoys.splice(Math.floor(rand() * decoys.length), 1)[0]);
  }
  const choices = [answer, ...picked];
  for (let i = choices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [choices[i], choices[j]] = [choices[j], choices[i]];
  }
  return choices;
}

/** 看岸形定位：選對了就重新定位 */
export function coastSighting(
  world: World,
  state: GameState,
  choiceId: string,
): { state: GameState; correct: boolean; answer: CoastChoice; events: GameEvent[] } | null {
  if (coastSightBlocked(world, state)) return null;
  const answer = coastChoices(world, state, () => 0)
    .slice()
    .sort(
      (a, b) =>
        distanceKm(a.location, state.ship.position) - distanceKm(b.location, state.ship.position),
    )[0];
  const correct = answer.id === choiceId;
  let next: GameState = { ...state, coastDay: Math.floor(state.day) };
  const events: GameEvent[] = [];
  if (correct) {
    const xp = gainXp(next, 10);
    events.push(...xp.events);
    next = {
      ...next,
      nav: { day: state.day, errorKm: Math.min(positionErrorKm(world, state), 10) },
      captain: xp.captain,
      skillPoints: xp.skillPoints,
    };
  }
  return { state: next, correct, answer, events };
}

export interface StarSighting {
  state: GameState;
  result: SightingResult;
  events: GameEvent[];
}

/** 為什麼現在不能觀星（可以時回傳 null） */
export function starSightBlocked(state: GameState): string | null {
  if (!state.helm) return '要在海上才能觀星定位';
  if (!isNight(state.day)) return '白天看不到星星，等天黑再觀星';
  if (insideMist(state.mists, state.ship.position)) return '霧太濃，看不到星星';
  if (!canSightPolaris(state.ship.position[1])) return '北極星太低，貼在海平面上量不準';
  if (state.starNight === nightIndex(state.day)) return '今晚已經觀星定位過了';
  return null;
}

/** 牽星術：玩家量出北極星有幾指高，換算成緯度並重新定位 */
export function sightStars(
  world: World,
  state: GameState,
  measuredZhi: number,
): StarSighting | null {
  if (starSightBlocked(state)) return null;
  const result = judgeSighting(state.ship.position[1], measuredZhi);
  const events: GameEvent[] = [];
  let next: GameState = { ...state, starNight: nightIndex(state.day) };
  if (result.quality !== 'miss') {
    const now = positionErrorKm(world, state);
    next = { ...next, nav: { day: state.day, errorKm: Math.min(now, result.errorKm) } };
    const xp = gainXp(next, result.quality === 'good' ? 20 : 10);
    events.push(...xp.events);
    next = { ...next, captain: xp.captain, skillPoints: xp.skillPoints };
  }
  if (result.quality === 'good') {
    next = { ...next, stats: { ...next.stats, starsCorrect: next.stats.starsCorrect + 1 } };
  }
  return { state: next, result, events };
}

/**
 * 測深（打水）：放下測深錘量水深、看底質。隨時可以做；
 * 離陸地夠近時，水深與底質能幫忙確認位置（誤差不超過 25 公里）。
 * 第一次測深會附上地理小教室。
 */
export function takeSounding(
  world: World,
  state: GameState,
): {
  state: GameState;
  sounding: Sounding;
  text: string;
  fixed: boolean;
  lesson: string | null;
} | null {
  if (!state.helm) return null;
  const sounding = soundAt(state.ship.position, (p) => landAt(world, p));
  let next = state;
  let fixed = false;
  const now = positionErrorKm(world, state);
  if (
    sounding.landKm !== null &&
    sounding.landKm <= SOUNDING_FIX_KM &&
    now > SOUNDING_FIX_ERROR_KM
  ) {
    next = { ...next, nav: { day: state.day, errorKm: SOUNDING_FIX_ERROR_KM } };
    fixed = true;
  }
  let lesson: string | null = null;
  if (!state.hinted.includes('sounding')) {
    next = { ...next, hinted: [...next.hinted, 'sounding'] };
    lesson =
      '明代的針路簿（例如《順風相送》）常記下「打水幾托」和海底是泥還是沙。' +
      '大陸旁邊常有一片較淺的海底，叫做大陸棚，水深多在 200 公尺以內；' +
      '離開大陸棚，海底就陡降成深海。航海者靠水深和底質，就能在看不到岸時判斷離陸地多遠。';
  }
  return { state: next, sounding, text: soundingText(sounding), fixed, lesson };
}

// ---------------------------------------------------------------- 親手駕船

/** 從港口出海：找到港外最近的海面，升半帆，船頭朝向外海 */
export function departPort(world: World, state: GameState): GameState {
  if (!state.dockedAt || state.voyage || state.helm) return state;
  const port = world.ports.get(state.dockedAt)!;
  const start = seaNear(world, port.location);
  if (!start) return state;
  const heading = start.bearing;
  return {
    ...state,
    dockedAt: null,
    ship: { position: start.point, heading },
    helm: { course: heading, sail: 1, anchored: false, blocked: false },
    nav: { day: state.day, errorKm: 2 },
    fleets: [],
    storms: [],
    mists: [],
    trail: [start.point],
  };
}

/**
 * 由近而遠繞圈尋找開闊的海面（周圍 6 公里都是海），避免把船放進河口或窄灣卡住。
 * 回傳位置與從港口出發的方位。
 */
function seaNear(world: World, p: LonLat): { point: LonLat; bearing: number } | null {
  const open = (q: LonLat) =>
    !landAt(world, q) &&
    [0, 45, 90, 135, 180, 225, 270, 315].every((b) => !landAt(world, destinationPoint(q, b, 6)));
  let fallback: { point: LonLat; bearing: number } | null = null;
  for (let km = 4; km <= 90; km += 3) {
    for (let b = 0; b < 360; b += 10) {
      const q = destinationPoint(p, b, km);
      if (open(q)) return { point: q, bearing: b };
      if (!fallback && !landAt(world, q)) fallback = { point: q, bearing: b };
    }
  }
  return fallback;
}

export interface SailingStatus {
  /** 此時此地的風（含緩慢變化） */
  wind: Wind;
  current: Current | null;
  /** 以目前船頭與帆計算的運動 */
  motion: Motion;
  rig: Rig;
  /** 頂風區的半角：船頭與風吹來方向的夾角小於此值就開不動 */
  noGo: number;
  /** 風吹向相對於船頭的角度 */
  windRel: number;
  angleOffWind: number;
}

/** 介面與畫面用：和航行物理使用同一套風與帆的計算 */
export function sailingStatus(world: World, state: GameState): SailingStatus | null {
  const helm = state.helm;
  if (!helm) return null;
  const { position, heading } = state.ship;
  const env = environmentAt(state, position, heading);
  const wind = gustyWind(env.wind, position, state.day);
  const rig = shipDef(state.shipTypeId).rig;
  const base = speedKmPerDay(world, state);
  const mv = helm.anchored
    ? { ...motion(heading, 0, wind, null, rig, base), speed: 0, throughWater: 0 }
    : motion(heading, helm.sail, wind, env.current, rig, base);
  return {
    wind,
    current: env.current,
    motion: mv,
    rig,
    noGo: NO_GO[rig],
    windRel: angleDiff(wind.toward, heading),
    angleOffWind: angleOffWind(heading, wind),
  };
}

/** 調整航向、帆或下錨 */
export function setHelm(state: GameState, patch: Partial<Omit<HelmState, 'blocked'>>): GameState {
  if (!state.helm) return state;
  const helm = { ...state.helm, ...patch };
  if (patch.course !== undefined) helm.course = ((patch.course % 360) + 360) % 360;
  // 升帆就自動起錨
  if (patch.sail) helm.anchored = false;
  return { ...state, helm };
}

// ---------------------------------------------------------------- 祈福

export const PRAY_COST = 10;
export const PRAY_MORALE = 15;

/** 在天妃宮（媽祖廟）祈求航海平安：花一點香油錢，船員士氣回升 */
export function pray(state: GameState): GameState {
  if (!state.dockedAt || state.gold < PRAY_COST || state.condition.morale >= 100) return state;
  return {
    ...state,
    gold: state.gold - PRAY_COST,
    condition: {
      ...state.condition,
      morale: Math.min(100, state.condition.morale + PRAY_MORALE),
    },
  };
}

// ---------------------------------------------------------------- 貿易

export function cargoCapacity(state: GameState): number {
  return shipDef(state.shipTypeId).cargo;
}

export { cargoUsed };

/** 港口市場的報價：這裡的特產可以買，所有貨物都可以賣 */
export function marketQuotes(world: World, state: GameState, portId: string): Quote[] {
  const port = world.ports.get(portId);
  if (!port) return [];
  return Object.keys(GOODS_PRICE)
    .filter((g) => world.codex.has(g))
    .map((g) => quote(world.content.ports, port, g, state.market, state.day));
}

export interface TradeResult {
  state: GameState;
  /** 成交數量 */
  qty: number;
  /** 買進花費或賣出收入 */
  amount: number;
  /** 賣出時這批貨的利潤 */
  profit: number;
}

export function tradeBuy(world: World, state: GameState, good: string, qty: number): TradeResult {
  const port = state.dockedAt ? world.ports.get(state.dockedAt) : null;
  if (!port) return { state, qty: 0, amount: 0, profit: 0 };
  const r = buyGoods(world.content.ports, port, state, good, qty, cargoCapacity(state), state.day);
  if (!r.bought) return { state, qty: 0, amount: 0, profit: 0 };
  return {
    state: { ...state, gold: r.gold, cargo: r.cargo, market: r.market },
    qty: r.bought,
    amount: r.spent,
    profit: 0,
  };
}

export function tradeSell(world: World, state: GameState, good: string, qty: number): TradeResult {
  const port = state.dockedAt ? world.ports.get(state.dockedAt) : null;
  if (!port) return { state, qty: 0, amount: 0, profit: 0 };
  const r = sellGoods(world.content.ports, port, state, good, qty, state.day);
  if (!r.sold) return { state, qty: 0, amount: 0, profit: 0 };
  return {
    state: {
      ...state,
      gold: r.gold,
      cargo: r.cargo,
      market: r.market,
      stats: { ...state.stats, tradeProfit: state.stats.tradeProfit + Math.max(0, r.profit) },
    },
    qty: r.sold,
    amount: r.earned,
    profit: r.profit,
  };
}

// ---------------------------------------------------------------- 傳聞與調查

/** 在這個港口可以聽到、還沒聽過也還沒發現的傳聞 */
export function rumorsAt(world: World, state: GameState, portId: string): CodexEntry[] {
  return world.rumors.filter(
    (c) =>
      c.rumor!.port === portId && !state.rumors.includes(c.id) && !state.discovered.includes(c.id),
  );
}

export function hearRumor(world: World, state: GameState, id: string): GameState {
  const c = world.codex.get(id);
  if (!c?.rumor || state.rumors.includes(id) || state.dockedAt !== c.rumor.port) return state;
  return { ...state, rumors: [...state.rumors, id] };
}

/** 聽過、還沒發現的傳聞 */
export function openRumors(world: World, state: GameState): CodexEntry[] {
  return state.rumors
    .filter((id) => !state.discovered.includes(id))
    .map((id) => world.codex.get(id)!)
    .filter(Boolean);
}

/** 船附近可以調查的傳聞地點 */
export function rumorInReach(world: World, state: GameState): string | null {
  if (!state.helm) return null;
  for (const c of openRumors(world, state)) {
    if (distanceKm(state.ship.position, c.location!) <= c.rumor!.investigate_km) return c.id;
  }
  return null;
}

/** 為什麼現在不能調查：位置誤差太大時，就算真的到了也無法確認 */
export function investigateBlocked(world: World, state: GameState, id: string): string | null {
  const c = world.codex.get(id);
  if (!c?.rumor) return '沒有這個傳聞';
  const err = positionErrorKm(world, state);
  if (err > c.rumor.investigate_km * 1.5) {
    return `位置誤差約 ±${Math.round(err)} 公里，無法確認是不是傳聞中的地方。先在夜裡觀星，或靠近認得的港口定位。`;
  }
  return null;
}

/** 調查發現傳聞中的地點：登錄圖鑑、獲得經驗與名聲 */
export const INVESTIGATE_REWARD = { xp: 60, reputation: 5 };

export function investigate(world: World, state: GameState, id: string): StepResult {
  if (rumorInReach(world, state) !== id || investigateBlocked(world, state, id)) {
    return { state, events: [], fogChanged: [] };
  }
  const events: GameEvent[] = [{ type: 'discovered', codexId: id }];
  const xp = gainXp(state, INVESTIGATE_REWARD.xp);
  events.push(...xp.events);
  const next: GameState = {
    ...state,
    discovered: [...state.discovered, id],
    reputation: state.reputation + INVESTIGATE_REWARD.reputation,
    captain: xp.captain,
    skillPoints: xp.skillPoints,
  };
  const progressed = progressQuests(world, next);
  return {
    state: progressed.state,
    events: [...events, ...progressed.events],
    fogChanged: progressed.fogChanged,
  };
}

/** 已經調查發現、還沒回報的傳聞地點 */
export function unreportedFinds(world: World, state: GameState): CodexEntry[] {
  return world.rumors.filter(
    (c) => state.discovered.includes(c.id) && !state.reported.includes(c.id),
  );
}

/** 回報的賞金：離傳聞來源港越遠越多 */
export function reportReward(world: World, c: CodexEntry): { gold: number; reputation: number } {
  const port = world.ports.get(c.rumor!.port);
  const km = port ? distanceKm(port.location, c.location!) : 300;
  return { gold: Math.min(220, 50 + Math.round(km / 12)), reputation: 5 };
}

/** 在書院向學者回報所有新發現 */
export function reportFinds(
  world: World,
  state: GameState,
): { state: GameState; gold: number; count: number } {
  if (!state.dockedAt) return { state, gold: 0, count: 0 };
  const finds = unreportedFinds(world, state);
  if (!finds.length) return { state, gold: 0, count: 0 };
  let gold = 0;
  let reputation = 0;
  for (const c of finds) {
    const r = reportReward(world, c);
    gold += r.gold;
    reputation += r.reputation;
  }
  return {
    state: {
      ...state,
      gold: state.gold + gold,
      reputation: state.reputation + reputation,
      reported: [...state.reported, ...finds.map((c) => c.id)],
    },
    gold,
    count: finds.length,
  };
}

const entrances = new WeakMap<World, Map<string, LonLat | null>>();

/** 港口的入口：出港時船會出現的那片開闊海面（河港就在河口） */
export function harborEntrance(world: World, portId: string): LonLat | null {
  let m = entrances.get(world);
  if (!m) entrances.set(world, (m = new Map()));
  if (!m.has(portId)) {
    const port = world.ports.get(portId);
    m.set(portId, port ? (seaNear(world, port.location)?.point ?? null) : null);
  }
  return m.get(portId)!;
}

export interface ApproachHint {
  portId: string;
  /** 往入口的方位與距離 */
  bearing: number;
  km: number;
}

/** 接近看得到的港口、但還不能入港時：告訴玩家港口入口在哪個方向 */
export function approachHint(world: World, state: GameState): ApproachHint | null {
  if (!state.helm || portInReach(world, state)) return null;
  const pos = state.ship.position;
  let best: ApproachHint | null = null;
  for (const id of visiblePortIds(world, state)) {
    if (distanceKm(pos, world.ports.get(id)!.location) > 220) continue;
    const entrance = harborEntrance(world, id);
    if (!entrance) continue;
    const km = distanceKm(pos, entrance);
    if (!best || km < best.km) best = { portId: id, bearing: bearingDeg(pos, entrance), km };
  }
  return best;
}

/** 附近可以入港的港口（海圖上看得到、距離夠近） */
export function portInReach(world: World, state: GameState): string | null {
  if (!state.helm) return null;
  let best: string | null = null;
  let bestKm = Infinity;
  for (const id of visiblePortIds(world, state)) {
    const port = world.ports.get(id)!;
    const reach = Math.max(PORT_REACH_KM, world.harbors.get(id)!.radiusKm);
    const km = distanceKm(state.ship.position, port.location);
    if (km <= reach && km < bestKm) {
      best = id;
      bestKm = km;
    }
  }
  return best;
}

const TRAIL_STEP_KM = 25;
const TRAIL_MAX = 500;

function pathKm(pts: LonLat[]): number {
  let km = 0;
  for (let i = 1; i < pts.length; i++) km += distanceKm(pts[i - 1], pts[i]);
  return km;
}

/** 入港時把這趟航跡存成兩個方向的熟悉航線（已有更短的就保留舊的） */
function learnRoute(state: GameState, portId: string): Record<string, LonLat[]> {
  const from = state.lastPortId;
  if (!from || from === portId || state.trail.length < 2) return state.routes;
  const path = [...state.trail, state.ship.position];
  const key = `${from}>${portId}`;
  const old = state.routes[key];
  if (old && pathKm(old) <= pathKm(path)) return state.routes;
  const back = [...path].reverse();
  return { ...state.routes, [key]: path, [`${portId}>${from}`]: back };
}

export interface FamiliarRoute {
  to: string;
  waypoints: LonLat[];
  km: number;
  days: number;
}

/** 從這個港口出發、親手開過的航線 */
export function familiarRoutes(world: World, state: GameState, portId: string): FamiliarRoute[] {
  return Object.entries(state.routes)
    .filter(([k]) => k.startsWith(`${portId}>`))
    .map(([k, waypoints]) => {
      const to = k.split('>')[1];
      const est = estimateVoyage(world, state, [state.ship.position, ...waypoints]);
      return {
        to,
        waypoints,
        km: Math.round(pathKm(waypoints)),
        days: Math.round(est.days * 10) / 10,
      };
    })
    .filter((r) => world.ports.has(r.to))
    .sort((a, b) => a.km - b.km);
}

/** 沿熟悉航線自動航行（途中仍可能遇到風暴與隨機事件） */
export function autoSail(world: World, state: GameState, to: string): GameState {
  if (!state.dockedAt || state.helm || state.voyage) return state;
  const r = familiarRoutes(world, state, state.dockedAt).find((x) => x.to === to);
  if (!r) return state;
  return startVoyage(
    state,
    [state.ship.position, ...r.waypoints, world.ports.get(to)!.location],
    to,
  );
}

export function enterPort(world: World, state: GameState, portId: string): StepResult {
  if (portInReach(world, state) !== portId || state.encounter) {
    return { state, events: [], fogChanged: [] };
  }
  const routes = learnRoute(state, portId);
  const arrived = arrive(world, { ...state, helm: null, routes, trail: [] }, portId);
  const next = {
    ...arrived.state,
    stats: { ...arrived.state.stats, voyages: arrived.state.stats.voyages + 1 },
  };
  const progressed = progressQuests(world, next);
  return {
    state: progressed.state,
    events: [...arrived.events, ...progressed.events],
    fogChanged: [...arrived.fogChanged, ...progressed.fogChanged],
  };
}

const LINE_LATITUDES = {
  equator: 0,
  'tropic-of-cancer': 23.44,
  'tropic-of-capricorn': -23.44,
  'arctic-circle': 66.56,
  'antarctic-circle': -66.56,
} as const;

/** 這一小步穿越的緯線所對應的知識卡 */
function linesCrossed(world: World, fromLat: number, toLat: number): string[] {
  return world.content.codex
    .filter((c) => {
      if (!c.line) return false;
      const line = LINE_LATITUDES[c.line];
      return (fromLat - line) * (toLat - line) < 0;
    })
    .map((c) => c.id);
}

/** 記錄是否航行穿越赤道或回歸線（成就用） */
function trackCrossings(stats: AchievementStats, fromLat: number, toLat: number): AchievementStats {
  const crossed = (line: number) => (fromLat - line) * (toLat - line) < 0;
  const equator = stats.crossedEquator || crossed(0);
  const tropic = stats.crossedTropic || crossed(23.44) || crossed(-23.44);
  return equator === stats.crossedEquator && tropic === stats.crossedTropic
    ? stats
    : { ...stats, crossedEquator: equator, crossedTropic: tropic };
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
  handsOn = false,
): { state: GameState; event: VoyageEvent | null } {
  const ctx = eventContext(world, state, position, heading, usedDays);
  // 迷航題需要離開港口一段距離才有意義
  const farEnough = distanceKm(ctx.lastPort.location, position) > 150;
  const chances = eventChances(ctx);
  // 親手駕船時海盜改成看得見的船；觀星改由玩家自己用牽星板
  if (handsOn) {
    delete chances.pirates;
    delete chances.stargazing;
  }
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

function eventContext(
  world: World,
  state: GameState,
  position: LonLat,
  heading: number,
  usedDays: number,
): EventContext {
  const month = gameDate(state, usedDays).month;
  const env = environmentAt(state, position, heading, usedDays);
  const lastPort = world.ports.get(state.lastPortId);
  const regionId = regionAt(world, position);
  return {
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
    lostChance: mods(world, state).lostChance,
    scurvyImmune: mods(world, state).scurvyImmune,
  };
}

/** 被海盜追上時「以貨換路」：每種貨交出約三分之一（至少一擔） */
export function pirateCargoShare(cargo: Cargo): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [good, lot] of Object.entries(cargo)) {
    if (lot.qty > 0) out[good] = Math.max(1, Math.ceil(lot.qty / 3));
  }
  return out;
}

/** 處理隨機事件：選擇行動（choiceId）或回答問題（answer） */
export function resolveEvent(
  world: World,
  state: GameState,
  response: { choiceId?: string; answer?: number },
  now = Date.now(),
): StepResult {
  const ev = state.encounter;
  if (!ev || ev.kind !== 'event') return { state, events: [], fogChanged: [] };
  const [roll, seed] = nextRandom(state.seed);
  const m = mods(world, state);
  let effect: EventEffect;
  let quizLog = state.quizLog;
  let stats = state.stats;
  let reviews = state.reviews;
  if (response.answer !== undefined && ev.question) {
    const correct = response.answer === ev.question.answer;
    if (!correct) {
      reviews = scheduleReview(
        reviews,
        `event:${ev.id}:${Math.floor(state.day)}`,
        {
          prompt: ev.question.prompt,
          choices: ev.question.choices,
          answer: ev.question.answer,
          explanation: ev.question.explanation,
        },
        ev.id === 'pirates' ? ['B'] : ['A'],
        now,
      );
    }
    effect = resolveAnswer(ev, correct, state.gold, m.starXp);
    if (correct && ev.id === 'stargazing')
      stats = { ...stats, starsCorrect: stats.starsCorrect + 1 };
    if (correct && ev.id === 'pirates') {
      stats = { ...stats, piratesOutwitted: stats.piratesOutwitted + 1 };
    }
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
  } else if (ev.id === 'pirates' && response.choiceId === 'cargo') {
    const given = pirateCargoShare(state.cargo);
    const cargo: Cargo = {};
    for (const [good, lot] of Object.entries(state.cargo)) {
      const qty = lot.qty - (given[good] ?? 0);
      if (qty > 0) cargo[good] = { qty, cost: (lot.cost * qty) / lot.qty };
    }
    const list = Object.entries(given)
      .map(([g, n]) => `${world.codex.get(g)?.name ?? g} ${n} 擔`)
      .join('、');
    effect = {
      title: '以貨換路',
      text: `你讓船員搬出${list}。海盜清點過後滿意地收下，讓出了航道。`,
      lesson: ev.lesson,
    };
    state = { ...state, cargo };
  } else {
    effect = resolveChoice(ev, response.choiceId ?? '', roll, m, state.gold);
  }

  const events: GameEvent[] = [{ type: 'eventResolved', effect }];
  let condition = state.condition;
  if (effect.days) condition = passTime(condition, effect.days, m);
  condition = {
    ...condition,
    morale: Math.max(0, Math.min(100, condition.morale + (effect.morale ?? 0))),
    supplies: {
      water: Math.max(0, condition.supplies.water + (effect.water ?? 0)),
      food: Math.max(0, condition.supplies.food + (effect.food ?? 0)),
    },
  };
  const xp = effect.xp ? gainXp(state, effect.xp) : null;
  if (xp) events.push(...xp.events);
  return {
    state: {
      ...state,
      seed,
      encounter: null,
      quizLog,
      reviews,
      stats,
      captain: xp?.captain ?? state.captain,
      skillPoints: xp?.skillPoints ?? state.skillPoints,
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
  const m = mods(world, state);
  const out = resolveStormChoice(state.condition, choice, roll, m.stormDamage, severity, m);
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
  next = { ...next, stats: { ...next.stats, stormsSurvived: next.stats.stormsSurvived + 1 } };
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
      helm: null,
      encounter: null,
      dockedAt: port.id,
      ship: { position: port.location, heading: state.ship.heading },
      condition: afterShipwreck(shipType(state.shipTypeId)),
      shipwrecks: state.shipwrecks + 1,
      // 貨物隨船沉沒
      cargo: {},
    },
    events: [{ type: 'shipwreck', cause, lostGold, portId: port.id, month }],
    fogChanged: [],
  };
}

// ---------------------------------------------------------------- 港口服務

export function portResupply(world: World, state: GameState): GameState {
  if (!state.dockedAt) return state;
  const { condition, cost } = resupply(
    state.condition,
    shipType(state.shipTypeId),
    state.gold,
    mods(world, state).price,
  );
  return { ...state, condition, gold: state.gold - cost };
}

export function portRepair(world: World, state: GameState): GameState {
  if (!state.dockedAt) return state;
  const { condition, cost } = repair(state.condition, state.gold, mods(world, state).price);
  return { ...state, condition, gold: state.gold - cost };
}

function landmarksInSight(
  world: World,
  discovered: string[],
  pos: LonLat,
  discovery: number,
): string[] {
  return world.landmarks
    .filter(
      (c) =>
        !discovered.includes(c.id) &&
        distanceKm(pos, c.location!) <= (c.discover_radius_km ?? 0) * discovery,
    )
    .map((c) => c.id);
}

function arrive(world: World, state: GameState, portId: string): StepResult {
  const port = world.ports.get(portId)!;
  const firstVisit = !state.visitedPorts.includes(portId);
  const events: GameEvent[] = [{ type: 'arrived', portId, firstVisit }];
  const newGoods = [...port.goods, ...port.sights].filter((g) => !state.discovered.includes(g));
  for (const g of newGoods) events.push({ type: 'discovered', codexId: g });
  const fogChanged = revealAround(state.fog, port.location, PORT_REVEAL_KM);
  const gift = firstVisit ? mods(world, state).firstVisitGold : 0;
  return {
    state: {
      ...state,
      gold: state.gold + gift,
      voyage: null,
      helm: null,
      nav: { day: state.day, errorKm: 2 },
      fleets: [],
      storms: [],
      mists: [],
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
  now = Date.now(),
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
  let next = { ...state, quizLog };
  // 第一次就答錯的題目加入錯題回流
  if (!correct && !existing) {
    next = {
      ...next,
      reviews: scheduleReview(
        next.reviews,
        `${questId}#${p.step}`,
        {
          prompt: step.question,
          choices: step.choices,
          answer: step.answer,
          explanation: step.explanation,
        },
        quest.objectives.map((o) => o.domain),
        now,
      ),
    };
  }
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
  reward.xp = Math.round(reward.xp * mods(world, state).questXp);

  const xp = gainXp(state, reward.xp);
  const captain = xp.captain;
  const events: GameEvent[] = [{ type: 'questCompleted', questId: quest.id, reward }, ...xp.events];
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
      skillPoints: xp.skillPoints,
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

/** 海圖上畫出的面積（萬平方公里，取一位小數） */
export function chartedArea(state: GameState): number {
  return Math.round(exploredAreaKm2(state.fog) / 1000) / 10;
}

// ---------------------------------------------------------------- 成長：經驗、技能、船員、船隻、成就

/** 加經驗：處理升級事件與技能點（3 級起每升 2 級 1 點） */
function gainXp(
  state: GameState,
  amount: number,
): { captain: Captain; skillPoints: number; events: GameEvent[] } {
  const { captain, levelsGained } = addXp(state.captain, amount);
  const events: GameEvent[] = [];
  for (let i = 1; i <= levelsGained; i++) {
    events.push({ type: 'levelUp', level: state.captain.level + i });
  }
  const newPoints = skillPointsEarned(captain.level) - skillPointsEarned(state.captain.level);
  if (newPoints > 0) events.push({ type: 'skillPoint' });
  return { captain, skillPoints: state.skillPoints + newPoints, events };
}

export type SkillStatus = 'learned' | 'available' | 'locked';

export function skillStatus(state: GameState, id: string): SkillStatus {
  const def = SKILLS.find((s) => s.id === id);
  if (!def) return 'locked';
  if (state.skills.includes(id)) return 'learned';
  const ok =
    state.captain.level >= def.minLevel && (!def.requires || state.skills.includes(def.requires));
  return ok ? 'available' : 'locked';
}

export function learnSkill(state: GameState, id: string): GameState {
  if (state.skillPoints <= 0 || skillStatus(state, id) !== 'available') return state;
  return { ...state, skills: [...state.skills, id], skillPoints: state.skillPoints - 1 };
}

export function crewSlots(state: GameState): number {
  return shipDef(state.shipTypeId).crewSlots;
}

/** 目前停泊港口的酒館裡可以招募的船員 */
export function availableCrew(world: World, state: GameState) {
  if (!state.dockedAt) return [];
  return world.content.crew.filter(
    (c) => c.home_port === state.dockedAt && !state.crew.includes(c.id),
  );
}

export function hireCrew(world: World, state: GameState, id: string): GameState {
  const c = world.crew.get(id);
  if (
    !c ||
    state.dockedAt !== c.home_port ||
    state.crew.includes(id) ||
    state.crew.length >= crewSlots(state) ||
    state.gold < c.hire_cost
  ) {
    return state;
  }
  return { ...state, crew: [...state.crew, id], gold: state.gold - c.hire_cost };
}

/** 解散船員：他會回到家鄉港口，之後可以再招募 */
export function dismissCrew(state: GameState, id: string): GameState {
  return { ...state, crew: state.crew.filter((c) => c !== id) };
}

/** 主港的造船廠可以買新船；舊船折價一半 */
export function shipyardOffers(world: World, state: GameState) {
  const port = state.dockedAt ? world.ports.get(state.dockedAt) : null;
  if (port?.kind !== 'hub') return [];
  const scenario = world.scenarios.get(state.scenarioId)!;
  const tradeIn = Math.floor(shipDef(state.shipTypeId).price / 2);
  return scenario.ships
    .filter((id) => id !== state.shipTypeId)
    .map((id) => {
      const def = shipDef(id);
      const cost = Math.max(0, def.price - tradeIn);
      const reason =
        state.captain.level < def.minLevel
          ? `需要船長等級 ${def.minLevel}`
          : state.crew.length > def.crewSlots
            ? `船員太多（最多 ${def.crewSlots} 人）`
            : state.gold < cost
              ? '金幣不足'
              : null;
      return { def, cost, reason };
    });
}

export function buyShip(world: World, state: GameState, id: string): GameState {
  const offer = shipyardOffers(world, state).find((o) => o.def.id === id);
  if (!offer || offer.reason) return state;
  const cap = offer.def.supplyDays;
  return {
    ...state,
    shipTypeId: id,
    gold: state.gold - offer.cost,
    condition: {
      ...state.condition,
      hull: 100,
      supplies: {
        water: Math.min(cap, state.condition.supplies.water),
        food: Math.min(cap, state.condition.supplies.food),
      },
    },
  };
}

export function setTitle(state: GameState, achievementId: string | null): GameState {
  if (achievementId && !state.achievements.includes(achievementId)) return state;
  if (achievementId && !ACHIEVEMENT_MAP.get(achievementId)?.title) return state;
  return { ...state, title: achievementId };
}

/** 檢查並解鎖新成就（每次狀態變化後呼叫） */
export function checkAchievements(world: World, state: GameState): StepResult {
  const scenario = world.scenarios.get(state.scenarioId);
  const ids = newlyUnlocked(
    { ...state, startingShip: scenario?.starting_ship ?? state.shipTypeId },
    state.achievements,
  );
  if (!ids.length) return { state, events: [], fogChanged: [] };
  return {
    state: { ...state, achievements: [...state.achievements, ...ids] },
    events: ids.map((id) => ({ type: 'achievement' as const, id })),
    fogChanged: [],
  };
}

// ---------------------------------------------------------------- 自學：今日航程、錯題回流、航海紀錄

/** 換日時產生新的今日航程 */
export function ensureDaily(state: GameState, now: number): GameState {
  if (state.daily?.date === localDate(now)) return state;
  return { ...state, daily: newDailyVoyage(now, dueReviews(state.reviews, now).length) };
}

/** 依狀態變化推進今日航程：發現圖鑑、任務步驟前進、問答答對 */
export function trackDaily(prev: GameState, next: GameState, events: GameEvent[]): GameState {
  let daily = next.daily;
  const found = events.filter((e) => e.type === 'discovered').length;
  if (found) daily = bumpDaily(daily, 'explore', found);
  const steps = Object.entries(next.quests).reduce((n, [id, q]) => {
    const before = prev.quests[id];
    return n + Math.max(0, q.step - (before?.step ?? 0));
  }, 0);
  if (steps) daily = bumpDaily(daily, 'story', steps);
  const newCorrect =
    next.quizLog.filter((q) => q.firstTry).length - prev.quizLog.filter((q) => q.firstTry).length;
  // 沒有錯題可複習時，「答對一題問答」也算複習目標
  if (
    newCorrect > 0 &&
    daily?.goals.some((g) => g.kind === 'review' && g.label.startsWith('答對'))
  ) {
    daily = bumpDaily(daily, 'review', newCorrect);
  }
  return daily === next.daily ? next : { ...next, daily };
}

export function claimDaily(state: GameState): StepResult {
  if (!state.daily || state.daily.claimed || !dailyComplete(state.daily)) {
    return { state, events: [], fogChanged: [] };
  }
  const xp = gainXp(state, DAILY_REWARD.xp);
  return {
    state: {
      ...state,
      daily: { ...state.daily, claimed: true },
      captain: xp.captain,
      skillPoints: xp.skillPoints,
      gold: state.gold + DAILY_REWARD.gold,
    },
    events: xp.events,
    fogChanged: [],
  };
}

/** 回答一題錯題複習；答對加 5 經驗 */
export function answerReviewItem(
  state: GameState,
  key: string,
  choice: number,
  now: number,
): StepResult & { correct: boolean } {
  const item = state.reviews.find((r) => r.key === key);
  if (!item) return { state, events: [], fogChanged: [], correct: false };
  const correct = choice === item.question.answer;
  let next: GameState = { ...state, reviews: answerReview(state.reviews, key, correct, now) };
  let events: GameEvent[] = [];
  if (correct) {
    const xp = gainXp(next, 5);
    next = {
      ...next,
      captain: xp.captain,
      skillPoints: xp.skillPoints,
      daily: bumpDaily(next.daily, 'review'),
    };
    events = xp.events;
  }
  return { state: next, events, fogChanged: [], correct };
}

const LOG_LIMIT = 200;

/** 把重要事件寫進航海紀錄 */
export function appendLog(world: World, state: GameState, events: GameEvent[]): GameState {
  const entries: LogEntry[] = [];
  const day = Math.floor(state.day) + 1;
  for (const e of events) {
    if (e.type === 'arrived') {
      const p = world.ports.get(e.portId);
      entries.push({
        day,
        kind: 'arrive',
        text: `${e.firstVisit ? '首次抵達' : '抵達'}${p?.name ?? e.portId}`,
      });
    } else if (e.type === 'discovered') {
      entries.push({
        day,
        kind: 'discover',
        text: `發現：${world.codex.get(e.codexId)?.name ?? e.codexId}`,
      });
    } else if (e.type === 'questCompleted') {
      entries.push({
        day,
        kind: 'quest',
        text: `完成任務：${world.quests.get(e.questId)?.title ?? e.questId}`,
      });
    } else if (e.type === 'stormResolved') {
      entries.push({ day, kind: 'storm', text: `度過風暴，船體受損 ${e.hullLoss}` });
    } else if (e.type === 'shipwreck') {
      entries.push({
        day,
        kind: 'storm',
        text: `遭遇${e.cause.name}沉船，被救回${world.ports.get(e.portId)?.name ?? ''}`,
      });
    } else if (e.type === 'eventResolved' && e.effect.title) {
      entries.push({ day, kind: 'event', text: e.effect.title });
    } else if (e.type === 'levelUp') {
      entries.push({ day, kind: 'level', text: `船長升到第 ${e.level} 級` });
    } else if (e.type === 'achievement') {
      entries.push({
        day,
        kind: 'achievement',
        text: `成就：${ACHIEVEMENT_MAP.get(e.id)?.name ?? e.id}`,
      });
    }
  }
  if (!entries.length) return state;
  return { ...state, log: [...state.log, ...entries].slice(-LOG_LIMIT) };
}

export type { LearningDomain };

// ---------------------------------------------------------------- 外觀

/** 更新頭像、船旗或已擁有的塗裝；未解鎖的樣式不會套用 */
export function setAppearance(
  state: GameState,
  patch: Partial<Omit<Appearance, 'paints'>>,
): GameState {
  const a = { ...state.appearance };
  const ach = state.achievements;
  if (patch.skin !== undefined && patch.skin >= 0 && patch.skin < SKIN_TONES.length)
    a.skin = patch.skin;
  const pick = (list: typeof HATS, id: string | undefined) => {
    const o = id ? list.find((x) => x.id === id) : undefined;
    return o && optionUnlocked(o, ach) ? o.id : undefined;
  };
  a.hat = pick(HATS, patch.hat) ?? a.hat;
  a.coat = pick(COLORS, patch.coat) ?? a.coat;
  a.flagColor = pick(COLORS, patch.flagColor) ?? a.flagColor;
  a.emblem = pick(EMBLEMS, patch.emblem) ?? a.emblem;
  if (patch.hull) {
    const o = HULL_PAINTS.find((x) => x.id === patch.hull);
    if (o && paintOwned('hull', o, a, ach)) a.hull = o.id;
  }
  if (patch.sail) {
    const o = SAIL_PAINTS.find((x) => x.id === patch.sail);
    if (o && paintOwned('sail', o, a, ach)) a.sail = o.id;
  }
  return { ...state, appearance: a };
}

/** 在主港造船廠購買塗裝並立刻套用 */
export function buyPaint(
  world: World,
  state: GameState,
  kind: 'hull' | 'sail',
  id: string,
): GameState {
  const port = state.dockedAt ? world.ports.get(state.dockedAt) : null;
  const list = kind === 'hull' ? HULL_PAINTS : SAIL_PAINTS;
  const o = list.find((x) => x.id === id);
  if (port?.kind !== 'hub' || !o || o.achievement || state.gold < PAINT_PRICE) return state;
  if (paintOwned(kind, o, state.appearance, state.achievements)) return state;
  const appearance = {
    ...state.appearance,
    paints: [...state.appearance.paints, `${kind}:${id}`],
    [kind]: id,
  };
  return { ...state, gold: state.gold - PAINT_PRICE, appearance };
}
