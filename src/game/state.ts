/**
 * 遊戲狀態與規則（純函式）。
 *
 * 所有函式都回傳新的狀態物件；唯一的例外是迷霧陣列（fog）會就地更新，
 * 以免每一幀複製整張格網。事件（GameEvent）交給介面顯示提示與對話框。
 */
import type { CodexEntry, LonLat, Port, Quest, QuestStep, Scenario } from '@/data/schema';
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
  SHIP_NAME_MAX,
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
import {
  SKILLS,
  UPGRADES,
  shipDef,
  shipWithUpgrades,
  skillPointsEarned,
  type Profession,
  type ShipDef,
} from './progression';
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
  mcq,
  type EventContext,
  type EventQuestion,
  type EventEffect,
  type EventId,
  type LocateResult,
  type VoyageEvent,
} from './events';
import { greetingFor } from '@/town/folkTalk';
import { festivalAt } from '@/town/festivals';

/** 參加節慶的收穫：和當地人一起慶祝，學到東西、也交到朋友 */
export const FESTIVAL_REWARD = { xp: 25, reputation: 3 };
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
import { crewTalk, type SeaSight } from './crewTalk';
import { castNet, GROUND_LESSON, type Catch } from './fishing';
import { contractOffers, MAX_CONTRACTS, type Contract } from './contracts';
import { CONTRACT_BONUS_PER_RANK, reputationRank } from './reputation';
import { scholarQuestion, SCHOLAR_PER_DAY, SCHOLAR_REWARD, type ScholarQuestion } from './scholar';
import {
  HAIL_KM,
  MAX_FLEETS,
  MERCHANT_CHANCE_PER_DAY,
  ENVOY_CHANCE_PER_DAY,
  ARMADA_CHANCE_PER_DAY,
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
  hourOfDay,
  isNight,
  isWhiteNight,
  type SunInfo,
  isNoon,
  judgeSighting,
  noonSunAltitude,
  solarDeclination,
  SUN_FIX_KM,
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
/** 航行經過多近，瞭望員會看見沿岸的港口 */
export const PORT_SIGHT_KM = 40;
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
  /** 造船廠的改裝（裝在目前這艘船上） */
  upgrades: string[];
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
  /** 上次正午量太陽的遊戲日 */
  sunDay: number;
  /** 上次看岸形定位是第幾天（每天一次） */
  coastDay: number;
  /** 上次撒網捕魚的遊戲日（每天一次） */
  fishDay: number;
  /** 上次上岸取水的遊戲日 */
  waterDay: number;
  /** 海上看得見的船隊與風暴雲團 */
  fleets: SeaFleet[];
  storms: StormCell[];
  /** 看得見的海霧 */
  mists: MistBank[];
  /** 對手船長的比賽 */
  rival: RivalState;
  /** 接下的商人委託 */
  contracts: Contract[];
  /** 參加過的節慶（港口:年:節慶名） */
  festivalsSeen: string[];
  /** 學者每日小考：哪一天、答了幾題 */
  scholar: { day: number; count: number };
  /** 玩家自己寫在海圖上的註記 */
  notes: { id: number; at: LonLat; text: string }[];
  /** 完成或過期的委託（不再出現） */
  contractsDone: string[];
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
  | { type: 'talk'; speaker: string; text: string; sight?: SeaSight }
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
    upgrades: [],
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
    appearance: { ...defaultAppearance(), hat: scenario.start_hat ?? defaultAppearance().hat },
    rumors: [],
    reported: [],
    cargo: {},
    market: {},
    nav: { day: 0, errorKm: 2 },
    starNight: -1,
    sunDay: -1,
    coastDay: -1,
    fishDay: -1,
    waterDay: -99,
    fleets: [],
    storms: [],
    mists: [],
    rival: { ...EMPTY_RIVAL },
    contracts: [],
    contractsDone: [],
    festivalsSeen: [],
    notes: [],
    scholar: { day: -1, count: 0 },
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
    upgrades: state.upgrades,
  });
}

/** 目前這艘船（含改裝）的數值 */
export function myShip(state: Pick<GameState, 'shipTypeId' | 'upgrades'>): ShipDef {
  return shipWithUpgrades(state.shipTypeId, state.upgrades);
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

  // 沿岸航行時看見還沒標在海圖上的港口
  let unlockedPorts = state.unlockedPorts;
  for (const p of scenarioPorts(world, state)) {
    if (unlockedPorts.includes(p.id) || state.visitedPorts.includes(p.id)) continue;
    if (distanceKm(p.location, pos) > PORT_SIGHT_KM) continue;
    unlockedPorts = [...unlockedPorts, p.id];
    events.push({ type: 'portUnlocked', portId: p.id });
    events.push({
      type: 'talk',
      speaker: '瞭望員',
      text: `${compass16(bearingDeg(pos, p.location))}方的岸邊有船桅和房子——是${p.name}！已經標在海圖上了。`,
    });
  }

  // 新船隊出現
  const regionId = regionAt(world, pos);
  const treasureEra = treasureFleetSeas(state, regionId, usedDays);
  if (fleets.length < MAX_FLEETS) {
    const kind =
      rand() <
      perStep(NO_PIRATE_SEAS.includes(regionId ?? '') ? 0 : pirateChancePerDay(pos, !!regionId))
        ? 'pirate'
        : rand() <
            perStep(regionId && !UNSAILED_SEAS.includes(regionId) ? MERCHANT_CHANCE_PER_DAY : 0)
          ? 'merchant'
          : rand() < perStep(treasureEra && regionId && ENVOYS[regionId] ? ENVOY_CHANCE_PER_DAY : 0)
            ? 'envoy'
            : rand() <
                perStep(
                  treasureEra && !fleets.some((x) => x.kind === 'armada')
                    ? ARMADA_CHANCE_PER_DAY
                    : 0,
                )
              ? 'armada'
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
        } else if (kind === 'armada') {
          events.push({
            type: 'talk',
            speaker: '瞭望員',
            text: `${compass16(bearingDeg(pos, f.position))}方的海面上一大片帆影……是寶船艦隊！快靠過去看看！`,
          });
        } else if (kind === 'envoy') {
          events.push({
            type: 'talk',
            speaker: '瞭望員',
            text: `${compass16(bearingDeg(pos, f.position))}方有一艘掛滿彩旗的大船，看起來像是外國的使節船！`,
          });
        }
      }
    }
  }

  // 比賽中的對手船長偶爾會出現在附近
  if (
    state.rival.target &&
    fleets.length < MAX_FLEETS + 1 &&
    !fleets.some((f) => f.kind === 'rival') &&
    rand() < perStep(RIVAL_SIGHT_CHANCE_PER_DAY)
  ) {
    const f = spawnFleet('rival', nextEntityId, pos, day, rand, isLand);
    if (f) {
      nextEntityId++;
      fleets = [...fleets, f];
      events.push({
        type: 'talk',
        speaker: '瞭望員',
        text: `${compass16(bearingDeg(pos, f.position))}方那艘藍色船身的船……是${rivalOf(world, state).name}！他也在找同一個地方！`,
      });
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
        question: greetingQuestion(world, state, pos, rand) ?? ev.question,
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
      events.push({
        type: 'talk',
        speaker: crewSpeaker(world, state),
        text: stormOmen(storms[0], pos, isNight(day, sunOf(state, usedDays))),
      });
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
      events.push({ type: 'talk', speaker: crewSpeaker(world, state), text: mistNow.lesson });
    }
  } else if (misty) {
    events.push({ type: 'warning', text: '霧散了，視野又清楚起來。' });
    stats = { ...stats, mistsCrossed: stats.mistsCrossed + 1 };
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
      night: isNight(day, sunOf(state, usedDays)),
      region,
      lastRegionId,
      openRumors: openRumors(world, state),
      hinted,
      speakers: state.crew.map((id) => world.crew.get(id)?.name).filter((n): n is string => !!n),
      personal: state.crew.flatMap((id) => {
        const c = world.crew.get(id);
        return c ? c.lines.map((text) => ({ speaker: c.name, text })) : [];
      }),
      roll: rand(),
      chatReady: day >= talkDay,
    });
    if (talk) {
      events.push({ type: 'talk', speaker: talk.speaker, text: talk.text, sight: talk.sight });
      if (talk.region) lastRegionId = talk.region;
      if (talk.hintFor) hinted = [...hinted, talk.hintFor];
      if (talk.chat) talkDay = day + 1.2 + rand() * 1.2;
    }
    // 離開有名字的海域時也要記住，下次進來才會再介紹
    if (!region && lastRegionId) lastRegionId = null;
    // 第一次碰到新狀況時，提醒可以用的航海方法
    if (!hinted.includes('polaris-low') && !canSightPolaris(pos[1])) {
      hinted = [...hinted, 'polaris-low'];
      events.push({
        type: 'talk',
        speaker: crewSpeaker(world, state),
        text: '北極星已經貼在海平面上，快看不見了。從現在起，中午太陽最高的時候量太陽的高度，一樣能算出緯度。',
      });
    } else if (
      !hinted.includes('water-low') &&
      state.helm &&
      state.condition.supplies.water < myShip(state).supplyDays * 0.3 &&
      !desertCoastAt(state.ship.position) &&
      !fetchWaterBlocked(world, state)
    ) {
      hinted = [...hinted, 'water-low'];
      events.push({
        type: 'talk',
        speaker: crewSpeaker(world, state),
        text: '水桶快見底了。岸就在附近，要不要派小艇上岸找找河流或泉水？',
      });
    }
  }

  return {
    state: {
      ...state,
      seed,
      nav,
      unlockedPorts,
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

/**
 * 風暴的前兆：雲團剛出現在上游時，船員從海象、天色看出來，並指出方向。
 * 颱風外圍的長浪跑得比颱風本身快，所以「無風起長浪」是古老的預警。
 */
export function stormOmen(storm: StormCell, pos: LonLat, night: boolean): string {
  const dir = compass16(bearingDeg(pos, storm.center));
  if (storm.kind === 'typhoon' || storm.kind === 'hurricane' || storm.kind === 'cyclone') {
    return (
      `長浪從${dir}方一波一波湧過來，浪很長，風卻不大。老船員說「無風起長浪，風暴在後頭」——` +
      `${storm.name}的長浪跑得比風暴本身快，${dir}方大概有${storm.name}，快想辦法避開！`
    );
  }
  return night
    ? `${dir}方的星星一顆顆被雲吞掉，閃電在雲裡亮個不停——那邊的天氣要變壞了，繞開走吧。`
    : `${dir}方的天邊堆起又高又黑的雲，海鳥都往岸邊飛，風向也亂了——那邊要起大風，繞開走吧。`;
}

/**
 * 被海盜追上時的知識挑戰：如果在附近港口學過當地的問候語，
 * 就改成「用對方的語言回應」（語言也是文化地理）。
 */
export function greetingQuestion(
  world: World,
  state: GameState,
  pos: LonLat,
  rand: () => number,
): EventQuestion | undefined {
  const near = [...world.content.ports].sort(
    (a, b) => distanceKm(a.location, pos) - distanceKm(b.location, pos),
  )[0];
  const g = near && distanceKm(near.location, pos) < 1500 ? greetingFor(near.id) : null;
  const hasInterpreter = state.crew.some((id) => world.crew.get(id)?.profession === 'interpreter');
  if (!g || !(hasInterpreter || state.visitedPorts.some((id) => greetingFor(id)?.lang === g.lang)))
    return undefined;
  const others = [
    ...new Map(
      world.content.ports
        .map((p) => greetingFor(p.id))
        .filter(
          (x): x is NonNullable<typeof x> => !!x && x.lang !== g.lang && x.phrase !== g.phrase,
        )
        .map((x) => [x.phrase, x]),
    ).values(),
  ];
  const wrong: string[] = [];
  while (wrong.length < 2 && others.length) {
    wrong.push(others.splice(Math.floor(rand() * others.length), 1)[0].phrase);
  }
  return mcq(
    `海盜船長用${g.lang}大聲喊話。想起在港口學過的問候，你要怎麼回應他？`,
    g.phrase,
    wrong,
    `「${g.phrase}」是${g.lang}的問候，意思是「${g.meaning}」。會說對方的語言，是化解緊張的第一步。`,
    rand,
  );
}

/** 各海域遇得到的朝貢使節：從哪裡來、帶了什麼（都依史料中各國的貢品） */
export const ENVOYS: Record<string, { from: string; text: string }> = {
  'east-china-sea': {
    from: '琉球中山國',
    text: '我們是琉球中山王派出的使節，船上載著馬匹和硫磺，要到泉州上岸，再前往京城朝貢。',
  },
  'south-china-sea': {
    from: '占城國',
    text: '我們奉占城國王之命前往大明，貢品有象牙、犀角和上好的沉香。',
  },
  'malacca-java': {
    from: '滿剌加國',
    text: '滿剌加國王派我們到大明朝貢，船上有瑪瑙、玳瑁和犀角，也要請皇帝保護我們不受鄰國欺負。',
  },
  'bengal-malabar': {
    from: '榜葛剌國',
    text: '我們是榜葛剌國的使節。船上最寶貝的是一頭脖子好長的「麒麟」——其實是從非洲麻林來的長頸鹿，要獻給大明皇帝！',
  },
  'arabian-sea': {
    from: '忽魯謨斯國',
    text: '我們從忽魯謨斯來，船上有獅子、駿馬和波斯灣的珍珠，要跟著寶船的航路前往大明。',
  },
  'east-africa': {
    from: '麻林國',
    text: '麻林國的使節向你行禮。船艙裡載著長頸鹿，要送到遙遠的大明，聽說那裡的人會把它當成傳說中的麒麟。',
  },
};

export const ENVOY_REWARD = { xp: 15, reputation: 3 };

/** 附近可以致意的使節船 */
export function envoyInReach(state: GameState): SeaFleet | null {
  if (!state.helm) return null;
  return (
    state.fleets.find(
      (f) =>
        f.kind === 'envoy' && !f.greeted && distanceKm(f.position, state.ship.position) <= HAIL_KM,
    ) ?? null
  );
}

/** 向使節船致意：聽他們說來自哪裡、帶了什麼貢品，得到名聲 */
export function greetEnvoy(
  world: World,
  state: GameState,
  fleetId: number,
): (GreetResult & { events: GameEvent[] }) | null {
  const f = envoyInReach(state);
  if (!f || f.id !== fleetId) return null;
  const regionId = regionAt(world, f.position);
  const envoy = (regionId && ENVOYS[regionId]) || ENVOYS['south-china-sea'];
  const fleets = state.fleets.map((x) => (x.id === fleetId ? { ...x, greeted: true } : x));
  const xp = gainXp(state, ENVOY_REWARD.xp);
  return {
    state: {
      ...state,
      fleets,
      captain: xp.captain,
      skillPoints: xp.skillPoints,
      reputation: state.reputation + ENVOY_REWARD.reputation,
    },
    events: xp.events,
    title: `${envoy.from}的使節船`,
    text: `${envoy.text}（名聲 +${ENVOY_REWARD.reputation}）`,
    lesson:
      '明朝用「朝貢」和各國往來：外國派使節帶著貢品來，皇帝回贈豐厚的禮物，並承認對方的國王。鄭和下西洋之後，來朝貢的國家大增，還帶來了長頸鹿、獅子等珍奇動物。',
  };
}

export const ARMADA_REWARD = { xp: 20, reputation: 5 };

/** 鄭和第一次下西洋出發的那一年 */
export const TREASURE_FLEET_FIRST_YEAR = 1405;
/** 鄭和最後一次下西洋回國的那一年 */
export const TREASURE_FLEET_LAST_YEAR = 1433;
/**
 * 15 世紀末還沒有商船往來的大洋（大西洋中部、加勒比海）：不會遇到商船與海盜。
 * 幾內亞灣有葡萄牙商船，但還沒有海盜。
 */
const UNSAILED_SEAS = ['central-atlantic', 'caribbean', 'vinland'];
const NO_PIRATE_SEAS = [...UNSAILED_SEAS, 'gulf-of-guinea', 'iceland', 'greenland'];

/** 大西洋的海域：寶船艦隊與朝貢使節船不會出現 */
const ATLANTIC_REGIONS = [
  'north-sea',
  'iceland',
  'greenland',
  'vinland',
  'iberian-atlantic',
  'west-africa',
  'gulf-of-guinea',
  'central-atlantic',
  'caribbean',
];

/** 鄭和的寶船艦隊與前往明朝的朝貢使節船，只出現在下西洋的年代（1405–1433）與亞洲的海上 */
export function treasureFleetSeas(
  state: GameState,
  regionId: string | null,
  extraDays = 0,
): boolean {
  if (!regionId || ATLANTIC_REGIONS.includes(regionId)) return false;
  const year = gameDate(state, extraDays).year;
  return year >= TREASURE_FLEET_FIRST_YEAR && year <= TREASURE_FLEET_LAST_YEAR;
}

/** 附近可以致意的寶船艦隊（船隊很大，遠一點也喊得到） */
export function armadaInReach(state: GameState): SeaFleet | null {
  if (!state.helm) return null;
  return (
    state.fleets.find(
      (f) =>
        f.kind === 'armada' &&
        !f.greeted &&
        distanceKm(f.position, state.ship.position) <= HAIL_KM * 3,
    ) ?? null
  );
}

/** 向寶船艦隊致意：艦隊的水船與糧船把你的淡水、糧食補滿，名聲提高 */
export function greetArmada(
  world: World,
  state: GameState,
  fleetId: number,
): (GreetResult & { events: GameEvent[] }) | null {
  const f = armadaInReach(state);
  if (!f || f.id !== fleetId) return null;
  const cap = myShip(state).supplyDays;
  const fleets = state.fleets.map((x) => (x.id === fleetId ? { ...x, greeted: true } : x));
  const xp = gainXp(state, ARMADA_REWARD.xp);
  return {
    state: {
      ...state,
      fleets,
      captain: xp.captain,
      skillPoints: xp.skillPoints,
      reputation: state.reputation + ARMADA_REWARD.reputation,
      condition: { ...state.condition, supplies: { water: cap, food: cap } },
    },
    events: xp.events,
    title: '寶船艦隊',
    text: `幾十艘大船排成長長的隊伍，最大的寶船像一座會走的城。旗艦傳來號令：「是${world.ports.get(world.scenarios.get(state.scenarioId)?.home_port ?? '')?.name ?? '遠方'}來的船吧？辛苦了！」艦隊的水船和糧船把你的淡水、糧食都補滿了。（名聲 +${ARMADA_REWARD.reputation}）`,
    lesson:
      '據《明史》等記載，鄭和船隊有六十多艘大船，加上許多小船，共兩萬多人。除了寶船，還有運馬的馬船、運糧的糧船、專門載淡水的水船，以及保護船隊的戰船，就像一座在海上移動的城市。',
  };
}

/** 船上說話的人：第一位船員，沒有船員時是老舵工 */
export function crewSpeaker(world: World, state: GameState): string {
  return world.crew.get(state.crew[0] ?? '')?.name ?? '老舵工';
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

/** 商船收購貨物的價格：目的港收購價的幾成（他們要賺一手） */
export const MERCHANT_BUY_FACTOR = 0.8;

/** 商船要開往哪個港口：依船的編號，從附近 3000 公里內的港口挑一個（固定不變） */
export function merchantDestination(world: World, state: GameState, f: SeaFleet): Port | null {
  const near = scenarioPorts(world, state)
    .map((p) => ({ p, km: distanceKm(p.location, f.position) }))
    .filter((x) => x.km > 150 && x.km < 3000)
    .sort((a, b) => a.km - b.km)
    .slice(0, 8);
  return near.length ? near[f.id % near.length].p : null;
}

export interface MerchantOffer {
  port: Port;
  items: { good: string; qty: number; price: number }[];
  total: number;
  profit: number;
}

/** 商船願意用什麼價錢收下你船上所有的貨 */
export function merchantOffer(
  world: World,
  state: GameState,
  fleetId: number,
): MerchantOffer | null {
  const f = state.fleets.find((x) => x.id === fleetId);
  if (!f || f.kind !== 'merchant' || cargoUsed(state.cargo) === 0) return null;
  if (distanceKm(f.position, state.ship.position) > HAIL_KM) return null;
  const port = merchantDestination(world, state, f);
  if (!port) return null;
  const items = Object.entries(state.cargo)
    .filter(([, lot]) => lot.qty > 0)
    .map(([good, lot]) => ({
      good,
      qty: lot.qty,
      price: Math.max(
        1,
        Math.round(
          quote(scenarioPorts(world, state), port, good, state.market, state.day).sell *
            MERCHANT_BUY_FACTOR *
            (state.crew.some((id) => world.crew.get(id)?.profession === 'interpreter') ? 1.1 : 1),
        ),
      ),
    }));
  const total = items.reduce((n, i) => n + i.price * i.qty, 0);
  const cost = Object.values(state.cargo).reduce((n, l) => n + l.cost, 0);
  return { port, items, total, profit: total - cost };
}

/** 把船上的貨全部賣給商船 */
export function sellToMerchant(
  world: World,
  state: GameState,
  fleetId: number,
): GreetResult | null {
  const offer = merchantOffer(world, state, fleetId);
  if (!offer) return null;
  const list = offer.items
    .map((i) => `${world.codex.get(i.good)?.name ?? i.good} ${i.qty} 擔`)
    .join('、');
  return {
    state: {
      ...state,
      cargo: {},
      gold: state.gold + offer.total,
      stats: { ...state.stats, tradeProfit: state.stats.tradeProfit + Math.max(0, offer.profit) },
    },
    title: '和商船做買賣',
    text: `商船要開往${offer.port.name}。他們收下${list}，付了你 ${offer.total} 金幣（${offer.profit >= 0 ? `賺 ${offer.profit}` : `虧 ${-offer.profit}`}）。「${offer.port.name}缺這些貨，我們到了還有得賺！」`,
    lesson:
      '貨物離產地越遠越值錢。商人在海上轉手，雖然價錢比親自運到目的港低一些，卻省下了航程的時間與風險，這就是「轉口貿易」。',
  };
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
    const cap = myShip(state).supplyDays;
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
  // 只打聽這個劇本範圍內的港口，免得指向遠在另一個大洋的地方
  const unknown = scenarioPorts(world, state)
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
  if (isNight(state.day, sunOf(state))) return '天黑了看不清海岸，改用觀星定位吧';
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

/** 船所在位置的太陽：緯度與今天太陽直射的緯度（決定日出日落、白夜與永夜） */
export function sunOf(state: GameState, extraDays = 0): SunInfo {
  const d = gameDate(state, extraDays);
  return { lat: state.ship.position[1], decl: solarDeclination(d.month, d.day) };
}

/** 為什麼現在不能量正午太陽（可以時回傳 null） */
export function sunSightBlocked(state: GameState): string | null {
  if (!state.helm) return '要在海上才能量太陽';
  if (!isNoon(state.day)) return '要等正午（11～13 點）太陽最高的時候';
  const sun = sunOf(state);
  if (noonSunAltitude(sun.lat, sun.decl) < 0) return '這裡現在是永夜，太陽整天都不會升起';
  // 看得到北極星、晚上也夠黑的地方，還是用觀星定位
  if (canSightPolaris(sun.lat) && !isWhiteNight(sun)) return '這裡晚上看得到北極星，用觀星定位吧';
  if (insideMist(state.mists, state.ship.position)) return '霧太濃，看不到太陽';
  if (state.sunDay === Math.floor(state.day)) return '今天已經量過太陽了';
  return null;
}

/**
 * 正午量太陽：量出太陽的高度，再查「太陽今天直射哪個緯度」的表，就能算出緯度。
 * 越過赤道看不到北極星以後，葡萄牙的領航員就是這樣定位的。
 */
export function sightSun(
  world: World,
  state: GameState,
): { state: GameState; text: string; lesson: string | null; events: GameEvent[] } | null {
  if (sunSightBlocked(state)) return null;
  const d = gameDate(state);
  const decl = solarDeclination(d.month, d.day);
  const lat = state.ship.position[1];
  const alt = noonSunAltitude(lat, decl);
  const ns = (x: number) => `${x >= 0 ? '北' : '南'}緯 ${Math.abs(x).toFixed(0)}°`;
  const now = positionErrorKm(world, state);
  const xp = gainXp(state, 5);
  let next: GameState = {
    ...state,
    sunDay: Math.floor(state.day),
    nav: { day: state.day, errorKm: Math.min(now, SUN_FIX_KM) },
    stats: { ...state.stats, sunSights: state.stats.sunSights + 1 },
    captain: xp.captain,
    skillPoints: xp.skillPoints,
  };
  const sunSide = lat >= decl ? '南' : '北';
  const text =
    `正午的太陽在我們的${sunSide}方，離海平面約 ${alt.toFixed(0)}°。` +
    `查表：今天太陽直射在${ns(decl)}附近，所以我們大約在${ns(lat)}。`;
  let lesson: string | null = null;
  if (!state.hinted.includes('sun-sight')) {
    next = { ...next, hinted: [...next.hinted, 'sun-sight'] };
    lesson =
      '太陽直射的緯度會隨季節在南北回歸線之間移動：夏至直射北回歸線、冬至直射南回歸線，春分秋分直射赤道。' +
      '正午太陽的高度 = 90° −（所在緯度與太陽直射緯度的差）。葡萄牙的領航員帶著記錄每天太陽位置的表，用星盤量出正午太陽的高度，就能在看不到北極星的南半球算出緯度。';
  }
  return { state: next, text, lesson, events: xp.events };
}

/** 為什麼現在不能觀星（可以時回傳 null） */
export function starSightBlocked(state: GameState): string | null {
  if (!state.helm) return '要在海上才能觀星定位';
  if (!isNight(state.day, sunOf(state))) {
    const sun = sunOf(state);
    const h = hourOfDay(state.day);
    if ((h >= 20 || h < 4) && isWhiteNight(sun))
      return '夏天的高緯度地區，半夜天空還是亮的（白夜），看不到星星';
    if (noonSunAltitude(sun.lat, sun.decl) < 0)
      return '極地的冬天中午還有一點微光，等天色更暗再觀星';
    return '白天看不到星星，等天黑再觀星';
  }
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
  let next: GameState = {
    ...state,
    stats: { ...state.stats, soundings: state.stats.soundings + 1 },
  };
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

/** 上岸取水：一次補幾天份的淡水、多久才能再取一次 */
export const WATER_FETCH_DAYS = 12;
export const WATER_FETCH_COOLDOWN = 3;
export const WATER_FETCH_KM = 20;

/** 沙漠海岸：岸上找不到淡水（撒哈拉、納米比、阿拉伯半島、非洲之角） */
const DESERT_COASTS: [number, number, number, number][] = [
  [-18, 16, -9, 31],
  [8, -30, 16, -16],
  [34, 12, 60, 31],
  [42, 2, 52, 12],
];

export function desertCoastAt([lon, lat]: LonLat): boolean {
  return DESERT_COASTS.some(([w, so, e, n]) => lon >= w && lon <= e && lat >= so && lat <= n);
}

/** 這個距離內有沒有陸地 */
function landWithin(world: World, pos: LonLat, km: number): boolean {
  for (const d of [km / 2, km]) {
    for (let b = 0; b < 360; b += 45) if (landAt(world, destinationPoint(pos, b, d))) return true;
  }
  return false;
}

/** 為什麼現在不能上岸取水；可以時回傳 null */
export function fetchWaterBlocked(world: World, state: GameState): string | null {
  if (!state.helm) return '要在海上才能派小艇上岸';
  if (state.day - state.waterDay < WATER_FETCH_COOLDOWN) return '才剛取過水';
  if (!landWithin(world, state.ship.position, WATER_FETCH_KM)) return '離岸太遠了';
  return null;
}

/**
 * 上岸取水：派小艇到岸邊找河流或泉水，把水桶裝滿。
 * 沙漠海岸找不到淡水——這正是古代航海者最怕的海岸。
 */
export function fetchWater(
  world: World,
  state: GameState,
): { state: GameState; found: boolean; text: string; lesson: string | null } | null {
  if (fetchWaterBlocked(world, state)) return null;
  const desert = desertCoastAt(state.ship.position);
  const cap = myShip(state).supplyDays;
  const sup = state.condition.supplies;
  const water = desert ? sup.water : Math.min(cap, sup.water + WATER_FETCH_DAYS);
  const gained = Math.round(water - sup.water);
  let next: GameState = {
    ...state,
    waterDay: state.day,
    condition: { ...state.condition, supplies: { ...sup, water } },
    stats: desert ? state.stats : { ...state.stats, watering: state.stats.watering + 1 },
  };
  let lesson: string | null = null;
  const key = desert ? 'water-desert' : 'water';
  if (!state.hinted.includes(key)) {
    next = { ...next, hinted: [...next.hinted, key] };
    lesson = desert
      ? '這一段海岸是沙漠：副熱帶高壓帶的空氣下沉、很少下雨，外海又常有寒流，岸上沒有河流也沒有泉水。古代航海者最怕這種海岸，出發前一定要把水桶裝滿，或是先找好下一個有淡水的港口。'
      : '古代的船沒辦法把海水變成淡水，只能靠岸補給。在雨量多的海岸，河流和泉水會流到海邊；水手划小艇上岸，把一個個木桶裝滿再運回船上。葡萄牙船隊繞過非洲南端後，就是在一處海灣的泉水邊補充淡水。';
  }
  return {
    state: next,
    found: !desert,
    text: desert
      ? '小艇在岸邊找了一整天，只看到黃沙和乾河床，一滴淡水也沒有。'
      : water >= cap
        ? `小艇找到一條流進海裡的小河，把水桶全裝滿了。（淡水 +${gained} 天）`
        : `小艇找到一條流進海裡的小河，運回好幾桶淡水。（淡水 +${gained} 天）`,
    lesson,
  };
}

/** 為什麼現在不能撒網；可以時回傳 null */
export function fishBlocked(state: GameState): string | null {
  if (!state.helm) return '要在海上才能撒網';
  if (state.fishDay === Math.floor(state.day)) return '今天已經撒過網了';
  return null;
}

/**
 * 撒網捕魚：每天一次，補一點糧食（不超過船能裝的量）。
 * 漁獲依漁場而定；每種漁場第一次撒網時附上地理小教室。
 */
export function goFishing(
  world: World,
  state: GameState,
): { state: GameState; catch: Catch; lesson: string | null } | null {
  if (fishBlocked(state)) return null;
  const sounding = soundAt(state.ship.position, (p) => landAt(world, p));
  const [luck, seed] = nextRandom(state.seed);
  const c = castNet(state.ship.position, sounding, gameDate(state).month, luck);
  const cap = myShip(state).supplyDays;
  const sup = state.condition.supplies;
  let next: GameState = {
    ...state,
    seed,
    fishDay: Math.floor(state.day),
    condition: {
      ...state.condition,
      supplies: { ...sup, food: Math.min(cap, sup.food + c.food) },
    },
  };
  let lesson: string | null = null;
  const key = `fish-${c.ground}`;
  if (!state.hinted.includes(key)) {
    lesson = GROUND_LESSON[c.ground];
    next = { ...next, hinted: [...next.hinted, key] };
  }
  return { state: next, catch: c, lesson };
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
  return myShip(state).cargo;
}

export { cargoUsed };

/** 港口市場的報價：這裡的特產可以買，所有貨物都可以賣 */
/** 名聲等級（影響買賣價格與委託酬勞） */
export function standing(state: GameState): number {
  return reputationRank(state.reputation).index;
}

export function marketQuotes(world: World, state: GameState, portId: string): Quote[] {
  const port = world.ports.get(portId);
  if (!port) return [];
  // 只列出這個劇本範圍內買得到的貨（西元 1000 年的挪威不會出現美洲的樹薯）
  const ports = scenarioPorts(world, state);
  const goods = new Set(ports.flatMap((p) => p.goods));
  return Object.keys(GOODS_PRICE)
    .filter(
      (g) => world.codex.has(g) && (goods.has(g) || port.goods.includes(g) || !!state.cargo[g]),
    )
    .map((g) => quote(ports, port, g, state.market, state.day, standing(state)));
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
  const r = buyGoods(
    scenarioPorts(world, state),
    port,
    state,
    good,
    qty,
    cargoCapacity(state),
    state.day,
    standing(state),
  );
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
  const r = sellGoods(
    scenarioPorts(world, state),
    port,
    state,
    good,
    qty,
    state.day,
    standing(state),
  );
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
): { state: GameState; gold: number; count: number; raceWon: boolean } {
  if (!state.dockedAt) return { state, gold: 0, count: 0, raceWon: false };
  const finds = unreportedFinds(world, state);
  if (!finds.length) return { state, gold: 0, count: 0, raceWon: false };
  let gold = 0;
  let reputation = 0;
  for (const c of finds) {
    const r = reportReward(world, c);
    gold += r.gold;
    reputation += r.reputation;
  }
  // 和對手比賽的地點：搶先回報有額外獎勵
  let rival = state.rival;
  const raceWon = !!rival.target && finds.some((c) => c.id === rival.target);
  if (raceWon) {
    gold += RIVAL_BONUS.gold;
    reputation += RIVAL_BONUS.reputation;
    rival = { ...rival, target: null, wins: rival.wins + 1, lastSeenDay: state.day };
  }
  return {
    state: {
      ...state,
      gold: state.gold + gold,
      reputation: state.reputation + reputation,
      reported: [...state.reported, ...finds.map((c) => c.id)],
      rival,
    },
    gold,
    count: finds.length,
    raceWon,
  };
}

// ---------------------------------------------------------------- 對手船長

/**
 * 對手船長（虛構人物）：在酒館遇到時，會挑一個你聽過、還沒找到的傳聞跟你比賽，
 * 看誰先回報給學者。贏了有額外獎勵；輸了沒有懲罰，只會被他笑一下。
 */
/** 這個劇本的對手船長 */
export function rivalOf(world: World, state: GameState): Scenario['rival'] {
  return world.scenarios.get(state.scenarioId)!.rival;
}

/** 完成這個任務時的劇本結局（沒有則為 null） */
export function endingFor(
  world: World,
  state: GameState,
  questId: string,
): { title: string; text: string } | null {
  return world.scenarios.get(state.scenarioId)?.endings[questId] ?? null;
}

export interface RivalState {
  /** 正在比賽的傳聞地點 */
  target: string | null;
  /** 對手預計回報的日子 */
  due: number;
  wins: number;
  losses: number;
  /** 上次見面（比完或下戰帖）的日子 */
  lastSeenDay: number;
}

export const EMPTY_RIVAL: RivalState = {
  target: null,
  due: 0,
  wins: 0,
  losses: 0,
  lastSeenDay: -99,
};

export const RIVAL_BONUS = { gold: 120, reputation: 5 };
/** 比賽期間，對手的船每天出現在附近的機率 */
const RIVAL_SIGHT_CHANCE_PER_DAY = 0.12;

/** 附近可以喊話的對手船 */
export function rivalShipInReach(state: GameState): SeaFleet | null {
  if (!state.helm) return null;
  return (
    state.fleets.find(
      (f) =>
        f.kind === 'rival' &&
        !f.greeted &&
        !!state.rival.target &&
        distanceKm(f.position, state.ship.position) <= HAIL_KM * 2,
    ) ?? null
  );
}

/** 向對手喊話：他會炫耀一下，也提醒你比賽還剩幾天 */
export function hailRival(world: World, state: GameState, fleetId: number): GreetResult | null {
  const f = rivalShipInReach(state);
  if (!f || f.id !== fleetId || !state.rival.target) return null;
  const c = world.codex.get(state.rival.target);
  const left = Math.max(0, Math.ceil(state.rival.due - state.day));
  return {
    state: {
      ...state,
      fleets: state.fleets.map((x) => (x.id === fleetId ? { ...x, greeted: true } : x)),
    },
    title: `${rivalOf(world, state).name}的船`,
    text: `${rivalOf(world, state).name}站在船頭大喊：「還在找${c?.rumor?.from ?? '傳聞'}說的那個地方嗎？我看就在前面不遠了！」照他的速度，大約 ${left} 天內就會回報給學者。`,
  };
}
/** 比完之後隔幾天才會再下戰帖 */
const RIVAL_COOLDOWN_DAYS = 3;

export type RivalNews =
  | { type: 'challenge'; target: CodexEntry; days: number }
  | { type: 'lost'; target: CodexEntry }
  | null;

/** 走進酒館時：比賽到期就算對手贏；沒在比賽時，可能下新的戰帖 */
export function rivalAtTavern(
  world: World,
  state: GameState,
): { state: GameState; news: RivalNews } {
  const port = state.dockedAt ? world.ports.get(state.dockedAt) : null;
  if (!port) return { state, news: null };
  const r = state.rival;
  if (r.target) {
    const c = world.codex.get(r.target);
    if (!c || state.reported.includes(r.target)) {
      return { state: { ...state, rival: { ...r, target: null } }, news: null };
    }
    if (state.day > r.due) {
      return {
        state: {
          ...state,
          rival: { ...r, target: null, losses: r.losses + 1, lastSeenDay: state.day },
        },
        news: { type: 'lost', target: c },
      };
    }
    return { state, news: null };
  }
  if (state.day < r.lastSeenDay + RIVAL_COOLDOWN_DAYS) return { state, news: null };
  const open = openRumors(world, state)
    .filter((c) => c.location && !state.reported.includes(c.id))
    .sort(
      (a, b) => distanceKm(a.location!, port.location) - distanceKm(b.location!, port.location),
    );
  const target = open[0];
  if (!target) return { state, news: null };
  const days = Math.round(10 + distanceKm(target.location!, port.location) / 100);
  return {
    state: {
      ...state,
      rival: { ...r, target: target.id, due: state.day + days, lastSeenDay: state.day },
    },
    news: { type: 'challenge', target, days },
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

const EVENT_ORDER: EventId[] = [
  'pirates',
  'doldrums',
  'scurvy',
  'stargazing',
  'lost',
  'castaway',
  'flotsam',
];

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
      reputation: state.reputation + (effect.reputation ?? 0),
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
      condition: afterShipwreck(myShip(state)),
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
    myShip(state),
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
  // 碰上港口的節慶：上岸同樂，得到經驗與名聲（每個節慶每年一次）
  const condition = rest(state.condition);
  let festivalsSeen = state.festivalsSeen;
  let reputation = state.reputation;
  let captain = state.captain;
  let skillPoints = state.skillPoints;
  const date = gameDate(state);
  const festival = festivalAt(portId, date);
  const festivalKey = festival ? `${portId}:${date.year}:${festival.name}` : null;
  if (festival && festivalKey && !festivalsSeen.includes(festivalKey)) {
    festivalsSeen = [...festivalsSeen, festivalKey];
    reputation += FESTIVAL_REWARD.reputation;
    const xp = gainXp(state, FESTIVAL_REWARD.xp);
    captain = xp.captain;
    skillPoints = xp.skillPoints;
    events.push(...xp.events);
    events.push({
      type: 'talk',
      speaker: crewSpeaker(world, state),
      text: `${port.name}正在過${festival.name}！大家上岸和當地人一起慶祝，聽了好多故事（經驗 +${FESTIVAL_REWARD.xp}、名聲 +${FESTIVAL_REWARD.reputation}）。`,
    });
  }
  return {
    state: {
      ...state,
      festivalsSeen,
      reputation,
      captain,
      skillPoints,
      gold: state.gold + gift,
      voyage: null,
      helm: null,
      nav: { day: state.day, errorKm: 2 },
      fleets: [],
      storms: [],
      mists: [],
      dockedAt: portId,
      lastPortId: portId,
      condition,
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
    } else if (step?.type === 'deliver') {
      out.push({ questId, portId: step.target, hintLevel: 1, text: step.text });
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

// ---------------------------------------------------------------- 商人的委託

/** 這個港口本週可以接的委託（已經接過、做完或過期的不再出現） */
export function availableContracts(world: World, state: GameState, portId: string): Contract[] {
  return contractOffers(
    scenarioPorts(world, state),
    portId,
    state.day,
    [...new Set([...state.visitedPorts, ...state.unlockedPorts])],
    state.market,
    [...state.contracts.map((c) => c.id), ...state.contractsDone],
  );
}

export function acceptContract(world: World, state: GameState, id: string): GameState {
  if (!state.dockedAt || state.contracts.length >= MAX_CONTRACTS) return state;
  const c = availableContracts(world, state, state.dockedAt).find((x) => x.id === id);
  if (!c) return state;
  return { ...state, contracts: [...state.contracts, c] };
}

/** 靠港時交付委託的貨；過了期限的委託作廢（沒有懲罰） */
function settleContracts(
  world: World,
  state: GameState,
): { state: GameState; events: GameEvent[] } {
  if (!state.contracts.length) return { state, events: [] };
  const events: GameEvent[] = [];
  let { cargo, gold, reputation, stats } = state;
  const keep: Contract[] = [];
  const done: string[] = [];
  for (const c of state.contracts) {
    const name = world.codex.get(c.good)?.name ?? c.good;
    const port = world.ports.get(c.portId)?.name ?? c.portId;
    const lot = cargo[c.good];
    if (state.dockedAt === c.portId && lot && lot.qty >= c.qty && state.day <= c.due) {
      const left = lot.qty - c.qty;
      cargo = { ...cargo };
      if (left > 0) cargo[c.good] = { qty: left, cost: (lot.cost * left) / lot.qty };
      else delete cargo[c.good];
      const reward = Math.round(c.reward * (1 + CONTRACT_BONUS_PER_RANK * standing(state)));
      gold += reward;
      reputation += 2;
      stats = { ...stats, contracts: stats.contracts + 1 };
      done.push(c.id);
      events.push({
        type: 'warning',
        text: `委託完成！${name} ${c.qty} 擔交給${port}的商人，收到 ${reward} 金幣。`,
      });
    } else if (state.day > c.due) {
      done.push(c.id);
      events.push({ type: 'warning', text: `${port}的${name}委託過期了，商人另外找人送貨。` });
    } else {
      keep.push(c);
    }
  }
  if (!done.length) return { state, events };
  return {
    state: {
      ...state,
      cargo,
      gold,
      reputation,
      stats,
      contracts: keep,
      contractsDone: [...state.contractsDone, ...done].slice(-200),
    },
    events,
  };
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
      if (
        step.type === 'deliver' &&
        s.dockedAt === step.target &&
        (s.cargo[step.good]?.qty ?? 0) >= step.qty
      ) {
        // 交貨：從船艙搬下約定的數量
        const lot = s.cargo[step.good];
        const left = lot.qty - step.qty;
        const cargo = { ...s.cargo };
        if (left > 0) cargo[step.good] = { qty: left, cost: (lot.cost * left) / lot.qty };
        else delete cargo[step.good];
        s = { ...s, cargo, quests: { ...s.quests, [questId]: { ...p, step: p.step + 1 } } };
        events.push({
          type: 'warning',
          text: `交貨完成：${world.codex.get(step.good)?.name ?? step.good} ${step.qty} 擔已經送到${world.ports.get(step.target)?.name}。`,
        });
        changed = true;
        continue;
      }
      const satisfied =
        (step.type === 'navigate' && s.dockedAt === step.target) ||
        (step.type === 'discover' && s.discovered.includes(step.target));
      if (satisfied) {
        s = { ...s, quests: { ...s.quests, [questId]: { ...p, step: p.step + 1 } } };
        changed = true;
      }
    }
  }
  // 任務交貨優先，剩下的貨再交給商人的委託
  const settled = settleContracts(world, s);
  s = settled.state;
  events.push(...settled.events);
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
  return myShip(state).crewSlots;
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

/** 這個劇本航行範圍內的港口（劇本有設定 Tier 的海域） */
const scenarioPortCache = new WeakMap<World, Map<string, Port[]>>();

export function scenarioPorts(world: World, state: GameState): Port[] {
  let cache = scenarioPortCache.get(world);
  if (!cache) scenarioPortCache.set(world, (cache = new Map()));
  const hit = cache.get(state.scenarioId);
  if (hit) return hit;
  const tiers = world.scenarios.get(state.scenarioId)?.region_tiers ?? {};
  const ports = world.content.ports.filter((p) => tiers[p.region] !== undefined);
  cache.set(state.scenarioId, ports);
  return ports;
}

/** 主港：各地的大港，加上這個劇本的家鄉港口（造船廠可以買船、買塗裝） */
export function isMainPort(world: World, state: GameState, portId: string | null): boolean {
  if (!portId) return false;
  return (
    world.ports.get(portId)?.kind === 'hub' ||
    world.scenarios.get(state.scenarioId)?.home_port === portId
  );
}

export function mainPortNames(world: World, state: GameState): string[] {
  return scenarioPorts(world, state)
    .filter((p) => isMainPort(world, state, p.id))
    .map((p) => p.name);
}

/** 這個劇本範圍內聽得到的傳聞地點 */
export function scenarioRumors(world: World, state: GameState): CodexEntry[] {
  const ports = new Set(scenarioPorts(world, state).map((p) => p.id));
  return world.rumors.filter((c) => ports.has(c.rumor!.port));
}

/** 這個劇本範圍內去過幾個港口、共有幾個 */
export function portsProgress(world: World, state: GameState): { visited: number; total: number } {
  const ports = scenarioPorts(world, state);
  return {
    visited: ports.filter((p) => state.visitedPorts.includes(p.id)).length,
    total: ports.length,
  };
}

/** 主港的造船廠可以買新船；舊船折價一半 */
export function shipyardOffers(world: World, state: GameState) {
  if (!isMainPort(world, state, state.dockedAt)) return [];
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
    // 改裝留在舊船上
    upgrades: [],
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

/** 造船廠可以做的改裝：主港與一般港口都可以 */
export function upgradeOffers(world: World, state: GameState) {
  if (!state.dockedAt) return [];
  const price = mods(world, state).price;
  return UPGRADES.map((u) => {
    const cost = Math.round(u.price * price);
    const done = state.upgrades.includes(u.id);
    const reason = done ? '已經改裝' : state.gold < cost ? '金幣不足' : null;
    return { upgrade: u, cost, done, reason };
  });
}

export function buyUpgrade(world: World, state: GameState, id: string): GameState {
  const offer = upgradeOffers(world, state).find((o) => o.upgrade.id === id);
  if (!offer || offer.reason) return state;
  return { ...state, upgrades: [...state.upgrades, id], gold: state.gold - offer.cost };
}

// ---------------------------------------------------------------- 在港口等待

/** 客棧一晚的價錢 */
export const INN_PRICE_PER_NIGHT = 3;

/** 住到明天早上要幾天（遊戲日從早上 6 點開始，整數就是早上 6 點） */
export function daysUntilMorning(state: GameState): number {
  return Math.floor(state.day) + 1 - state.day;
}

/** 住到下個月一號早上要幾天 */
export function daysUntilNextMonth(state: GameState): number {
  const today = Math.floor(state.day);
  const month = gameDate(state).month;
  let d = 1;
  while (gameDate({ ...state, day: today + d }).month === month) d++;
  return today + d - state.day;
}

/**
 * 在港口的客棧住下，等天亮或等季風轉向。港口裡不消耗補給；
 * 期間過期的委託會作廢，等完之後照常檢查任務與委託。
 */
export function waitInPort(world: World, state: GameState, days: number): StepResult {
  if (!state.dockedAt || days <= 0) return { state, events: [], fogChanged: [] };
  const nights = Math.max(1, Math.round(days));
  const cost = nights * INN_PRICE_PER_NIGHT;
  if (state.gold < cost) return { state, events: [], fogChanged: [] };
  return progressQuests(world, { ...state, day: state.day + days, gold: state.gold - cost });
}

// ---------------------------------------------------------------- 學者的每日小考

/** 今天還能答的題目（沒有題目或今天答完了回傳 null） */
export function scholarToday(
  world: World,
  state: GameState,
): { question: ScholarQuestion; remaining: number } | null {
  const today = Math.floor(state.day);
  const count = state.scholar.day === today ? state.scholar.count : 0;
  if (count >= SCHOLAR_PER_DAY) return null;
  const known = [...new Set([...state.visitedPorts, ...state.unlockedPorts])]
    .map((id) => world.ports.get(id))
    .filter((p): p is Port => !!p);
  const question = scholarQuestion(known, (g) => world.codex.get(g)?.name ?? g, today, count);
  return question ? { question, remaining: SCHOLAR_PER_DAY - count } : null;
}

/** 回答學者的題目：答對得經驗與金幣，答錯排進錯題複習 */
export function answerScholar(
  world: World,
  state: GameState,
  choice: number,
  now = Date.now(),
): { state: GameState; correct: boolean; question: ScholarQuestion; events: GameEvent[] } | null {
  const t = scholarToday(world, state);
  if (!t) return null;
  const q = t.question;
  const today = Math.floor(state.day);
  const count = state.scholar.day === today ? state.scholar.count : 0;
  const correct = choice === q.answer;
  let next: GameState = {
    ...state,
    scholar: { day: today, count: count + 1 },
    quizLog: [
      ...state.quizLog,
      {
        questId: 'scholar',
        step: today * 10 + count,
        domains: [q.domain],
        attempts: 1,
        firstTry: correct,
        day: state.day,
      },
    ],
  };
  const events: GameEvent[] = [];
  if (correct) {
    const xp = gainXp(next, SCHOLAR_REWARD.xp);
    events.push(...xp.events);
    next = {
      ...next,
      captain: xp.captain,
      skillPoints: xp.skillPoints,
      gold: next.gold + SCHOLAR_REWARD.gold,
    };
  } else {
    next = {
      ...next,
      reviews: scheduleReview(
        next.reviews,
        `scholar:${today}:${count}`,
        { prompt: q.prompt, choices: q.choices, answer: q.answer, explanation: q.explanation },
        [q.domain],
        now,
      ),
    };
  }
  return { state: next, correct, question: q, events };
}

// ---------------------------------------------------------------- 海圖註記

export const NOTE_MAX_CHARS = 12;
export const MAX_NOTES = 40;

function cleanNote(text: string): string {
  return [...text.replace(/\s+/g, ' ').trim()].slice(0, NOTE_MAX_CHARS).join('');
}

/** 在海圖上寫一個註記（空白不寫；超過上限時不再增加） */
export function addNote(state: GameState, at: LonLat, text: string): GameState {
  const t = cleanNote(text);
  if (!t || state.notes.length >= MAX_NOTES) return state;
  const id = state.notes.reduce((m, n) => Math.max(m, n.id), 0) + 1;
  return { ...state, notes: [...state.notes, { id, at, text: t }] };
}

/** 修改註記；改成空白就刪掉 */
export function editNote(state: GameState, id: number, text: string): GameState {
  const t = cleanNote(text);
  return {
    ...state,
    notes: t
      ? state.notes.map((n) => (n.id === id ? { ...n, text: t } : n))
      : state.notes.filter((n) => n.id !== id),
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
  if (patch.shipName !== undefined) {
    a.shipName = [...patch.shipName.replace(/\s+/g, ' ').trim()].slice(0, SHIP_NAME_MAX).join('');
  }
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
  const list = kind === 'hull' ? HULL_PAINTS : SAIL_PAINTS;
  const o = list.find((x) => x.id === id);
  if (!isMainPort(world, state, state.dockedAt) || !o || o.achievement || state.gold < PAINT_PRICE)
    return state;
  if (paintOwned(kind, o, state.appearance, state.achievements)) return state;
  const appearance = {
    ...state.appearance,
    paints: [...state.appearance.paints, `${kind}:${id}`],
    [kind]: id,
  };
  return { ...state, gold: state.gold - PAINT_PRICE, appearance };
}
