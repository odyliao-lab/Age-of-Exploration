/**
 * 介面狀態（Zustand）：包住純函式的遊戲引擎，負責時間推進、
 * 航線規劃、事件轉提示、對話框佇列與自動存檔。
 */
import { create } from 'zustand';
import type { LonLat } from '@/data/schema';
import { KM_PER_NM } from '@/geo/geo';
import { formatLonLat } from '@/map/projection';
import type { StormRisk } from '@/game/environment';
import type { StormChoice } from '@/game/ship';
import { STORM_CHOICES } from '@/game/ship';
import { spendPoint, type AttributeKey } from '@/game/captain';
import { deleteSave, listSaves, loadSave, writeSave } from '@/game/save';
import {
  acceptQuest,
  answerReviewItem,
  appendLog,
  claimDaily,
  ensureDaily,
  trackDaily,
  buyShip,
  departPort,
  greetMerchant,
  sightStars,
  pray,
  tradeBuy,
  tradeSell,
  hearRumor,
  investigate,
  enterPort,
  setHelm,
  buyPaint,
  setAppearance,
  checkAchievements,
  dismissCrew,
  hireCrew,
  learnSkill,
  setTitle,
  answerLocate,
  answerQuiz,
  pendingInteraction,
  resolveEvent,
  estimateVoyage,
  finishDialogue,
  harborsFor,
  newGame,
  portRepair,
  portResupply,
  resolveEncounter,
  startVoyage,
  stopVoyage,
  tick,
  type GameEvent,
  type GameState,
  type QuestReward,
  type StepResult,
} from '@/game/state';
import { checkLeg } from '@/game/voyage';
import type { EventEffect } from '@/game/events';
import { ACHIEVEMENT_MAP } from '@/game/achievements';
import { SKILLS } from '@/game/progression';
import { findSeaPath } from '@/geo/seaPath';
import { play } from './sound';
import type { World } from '@/game/world';
import type { Appearance } from '@/game/cosmetics';
import type { SailSetting } from '@/game/sailing';
import type { SightingResult } from '@/game/navigation';
import type { BuildingKind } from '@/town/layout';

/** 1 倍速時，現實 1.2 秒 = 遊戲 1 天 */
export const SECONDS_PER_DAY = 1.2;
/** 親手駕船時時間走得慢一些，才來得及掌舵、看海岸 */
export const SAIL_SECONDS_PER_DAY = 6;
const AUTOSAVE_MS = 4000;

type Screen = 'menu' | 'map';
export type Panel = 'codex' | 'captain' | 'fleet' | 'logbook' | null;

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'discover' | 'success' | 'warn';
  codexId?: string;
}

export type Modal =
  | { type: 'questComplete'; questId: string; reward: QuestReward }
  | { type: 'levelUp'; level: number }
  | { type: 'shipwreck'; cause: StormRisk; lostGold: number; portId: string; month: number }
  | { type: 'info'; title: string; text: string; lesson?: string; stats?: string[] };

export interface MapMark {
  lonLat: LonLat;
  kind: 'guess' | 'answer';
}

export interface Planning {
  waypoints: LonLat[];
  destinationPortId: string | null;
  error: string | null;
  invalidAt?: LonLat;
}

export interface SaveInfo {
  scenarioId: string;
  updatedAt: number;
}

interface GameStore {
  world: World | null;
  screen: Screen;
  game: GameState | null;
  saves: SaveInfo[];
  selectedPortId: string | null;
  planning: Planning | null;
  paused: boolean;
  speed: 1 | 2 | 4;
  follow: boolean;
  toasts: Toast[];
  modals: Modal[];
  panel: Panel;
  codexFocus: string | null;
  /** 座標定位挑戰的回饋 */
  locateFeedback: string | null;
  mapMarks: MapMark[];
  /** 停泊時顯示城鎮（false 為海圖） */
  townView: boolean;
  /** 目前在哪棟建築裡 */
  building: BuildingKind | null;
  /** 剛離開的建築：回到城裡時站在它門口 */
  lastBuilding: BuildingKind | null;
  /** 正在用牽星板觀星（遊戲暫停） */
  stargazing: boolean;

  init: (world: World) => void;
  refreshSaves: () => Promise<void>;
  startNew: (scenarioId: string) => Promise<void>;
  continueGame: (scenarioId: string) => Promise<void>;
  /** fromDisk：狀態剛從存檔讀出，不需要再寫回 */
  loadGame: (state: GameState, fromDisk?: boolean) => void;
  backToMenu: () => void;

  selectPort: (id: string | null) => void;
  beginPlanning: () => void;
  addWaypoint: (p: LonLat, portId?: string) => void;
  undoWaypoint: () => void;
  cancelPlanning: () => void;
  setSail: () => void;

  advance: (realSeconds: number) => void;
  togglePause: () => void;
  setSpeed: (s: 1 | 2 | 4) => void;
  setFollow: (f: boolean) => void;
  anchor: () => void;
  /** 親手駕船 */
  depart: () => void;
  steer: (course: number) => void;
  trimSail: (sail: SailSetting) => void;
  toggleAnchor: () => void;
  dock: (portId: string) => void;
  hearRumor: (id: string) => void;
  openStargazing: (on: boolean) => void;
  sightStars: (zhi: number) => SightingResult | null;
  greetMerchant: (fleetId: number, choice: 'news' | 'supplies') => void;
  setTownView: (on: boolean) => void;
  enterBuilding: (kind: BuildingKind) => void;
  leaveBuilding: () => void;
  pray: () => void;
  buyGood: (good: string, qty: number) => void;
  sellGood: (good: string, qty: number) => void;
  investigate: (id: string) => void;

  accept: (questId: string) => void;
  closeDialogue: (questId: string) => void;
  answer: (questId: string, choice: number) => boolean;
  spend: (key: AttributeKey) => void;
  weatherStorm: (choice: StormChoice) => void;
  respondEvent: (response: { choiceId?: string; answer?: number }) => void;
  locate: (p: LonLat) => void;
  resupply: () => void;
  repair: () => void;
  learn: (skillId: string) => void;
  hire: (crewId: string) => void;
  dismiss: (crewId: string) => void;
  buy: (shipId: string) => void;
  chooseTitle: (achievementId: string | null) => void;
  customize: (patch: Partial<Omit<Appearance, 'paints'>>) => void;
  buyPaint: (kind: 'hull' | 'sail', id: string) => void;
  claimDaily: () => void;
  answerReview: (key: string, choice: number) => boolean;
  suggestRoute: (portId: string) => void;

  dismissModal: () => void;
  dismissToast: (id: number) => void;
  pushToast: (t: Omit<Toast, 'id'>) => void;
  openPanel: (panel: Panel, codexFocus?: string | null) => void;
}

// 迷霧變化不放在 React 狀態裡（每幀可能變動），改用訂閱通知渲染器
type FogListener = (changed: number[] | 'all') => void;
const fogListeners = new Set<FogListener>();
export function onFogChange(fn: FogListener): () => void {
  fogListeners.add(fn);
  return () => fogListeners.delete(fn);
}
function emitFog(changed: number[] | 'all') {
  if (changed === 'all' || changed.length) fogListeners.forEach((fn) => fn(changed));
}

// 本機存檔寫入後通知雲端同步（cloudSync.ts 訂閱，避免互相匯入）
type SaveListener = (scenarioId: string) => void;
const saveListeners = new Set<SaveListener>();
export function onLocalSave(fn: SaveListener): () => void {
  saveListeners.add(fn);
  return () => saveListeners.delete(fn);
}
// 最後一次寫進本機的狀態：沒有變化就不必重寫（重寫會讓同步誤以為本機有新進度）
let persisted: GameState | null = null;
async function persist(state: GameState) {
  const t = await writeSave(state);
  if (t === null) return;
  persisted = state;
  saveListeners.forEach((fn) => fn(state.scenarioId));
}

/** 同步前把海圖上尚未存檔的進度寫進本機 */
export async function flushSave(): Promise<void> {
  const { screen, game } = useGame.getState();
  if (screen === 'map' && game && game !== persisted) await persist(game);
}

let toastSeq = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let lastSave = 0;

export function planSummary(world: World, game: GameState, planning: Planning) {
  const est = estimateVoyage(world, game, planning.waypoints);
  const supplyDays = Math.min(game.condition.supplies.water, game.condition.supplies.food);
  return {
    km: Math.round(est.km),
    nm: Math.round(est.km / KM_PER_NM),
    days: Math.round(est.days * 10) / 10,
    tailwindPct: Math.round(est.tailwindShare * 100),
    headwindPct: Math.round(est.headwindShare * 100),
    storm: est.storm && est.storm.kind !== 'none' ? est.storm : null,
    supplyShort: est.days > supplyDays,
    supplyDays: Math.floor(supplyDays),
    destination: planning.destinationPortId
      ? world.ports.get(planning.destinationPortId)?.name
      : null,
  };
}

export const useGame = create<GameStore>((set, get) => {
  /** 套用引擎結果：更新狀態、轉換事件、通知迷霧、排程存檔 */
  function apply(input: StepResult) {
    const { world } = get();
    if (!world) return;
    // 每次狀態變化後檢查成就，並更新今日航程與航海紀錄
    const prev = get().game;
    const ach = checkAchievements(world, input.state);
    const events = [...input.events, ...ach.events];
    let state = ensureDaily(ach.state, Date.now());
    if (prev) state = trackDaily(prev, state, events);
    state = appendLog(world, state, events);
    const result: StepResult = { state, events, fogChanged: input.fogChanged };
    emitFog(result.fogChanged);
    const toasts: Toast[] = [];
    const modals: Modal[] = [];
    let selectedPortId = get().selectedPortId;
    for (const e of result.events)
      handleEvent(world, e, toasts, modals, (id) => (selectedPortId = id));
    set((s) => ({
      game: result.state,
      toasts: [...s.toasts, ...toasts].slice(-5),
      modals: [...s.modals, ...modals],
      selectedPortId,
    }));
    if (result.events.length) scheduleSave(true);
  }

  function scheduleSave(soon = false) {
    const now = Date.now();
    if (!soon && now - lastSave < AUTOSAVE_MS) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(
      () => {
        const g = get().game;
        if (g) {
          lastSave = Date.now();
          void persist(g);
        }
      },
      soon ? 300 : 0,
    );
  }

  /** 直接更新狀態（港口服務、招募、學技能等），同樣檢查成就並存檔 */
  function commit(state: GameState) {
    apply({ state, events: [], fogChanged: [] });
    scheduleSave(true);
  }

  function toast(t: Omit<Toast, 'id'>) {
    set((s) => ({ toasts: [...s.toasts, { ...t, id: ++toastSeq }].slice(-5) }));
  }

  return {
    world: null,
    screen: 'menu',
    game: null,
    saves: [],
    selectedPortId: null,
    planning: null,
    paused: false,
    speed: 1,
    follow: true,
    toasts: [],
    modals: [],
    panel: null,
    codexFocus: null,
    locateFeedback: null,
    mapMarks: [],
    townView: true,
    building: null,
    lastBuilding: null,
    stargazing: false,

    init: (world) => {
      set({ world });
      void get().refreshSaves();
    },

    refreshSaves: async () => set({ saves: await listSaves() }),

    startNew: async (scenarioId) => {
      const { world } = get();
      if (!world) return;
      await deleteSave(scenarioId);
      const { state } = newGame(world, scenarioId);
      get().loadGame(state);
      void persist(state);
    },

    continueGame: async (scenarioId) => {
      const saved = await loadSave(scenarioId);
      if (saved) get().loadGame(saved, true);
      else await get().startNew(scenarioId);
    },

    loadGame: (state, fromDisk = false) => {
      const game = ensureDaily(state, Date.now());
      if (fromDisk) persisted = game;
      set({
        townView: true,
        building: null,
        lastBuilding: null,
        screen: 'map',
        game,
        selectedPortId: state.dockedAt,
        planning: null,
        paused: false,
        toasts: [],
        modals: [],
        panel: null,
      });
      emitFog('all');
    },

    backToMenu: () => {
      const g = get().game;
      if (g) void persist(g);
      set({ screen: 'menu', selectedPortId: null, planning: null, panel: null, modals: [] });
      void get().refreshSaves();
    },

    selectPort: (id) => set({ selectedPortId: id }),

    beginPlanning: () => {
      const { world, game: g } = get();
      if (!world || !g || g.voyage || pendingInteraction(world, g)) return;
      set({
        planning: { waypoints: [g.ship.position], destinationPortId: null, error: null },
        selectedPortId: null,
      });
    },

    addWaypoint: (p, portId) => {
      const { world, game, planning } = get();
      if (!world || !game || !planning) return;
      const last = planning.waypoints[planning.waypoints.length - 1];
      const check = checkLeg(last, p, harborsFor(world, game));
      if (!check.ok) {
        set({
          planning: {
            ...planning,
            error: '這段航線會穿越陸地。請沿著海岸，在海面上多加幾個航點。',
            invalidAt: check.landAt,
          },
        });
        return;
      }
      set({
        planning: {
          waypoints: [...planning.waypoints, p],
          destinationPortId: portId ?? null,
          error: null,
        },
      });
    },

    undoWaypoint: () => {
      const { planning } = get();
      if (!planning || planning.waypoints.length <= 1) return;
      set({
        planning: {
          waypoints: planning.waypoints.slice(0, -1),
          destinationPortId: null,
          error: null,
        },
      });
    },

    cancelPlanning: () => set({ planning: null }),

    setSail: () => {
      const { game, planning } = get();
      if (!game || !planning || planning.waypoints.length < 2) return;
      set({
        game: startVoyage(game, planning.waypoints, planning.destinationPortId),
        planning: null,
        selectedPortId: null,
        paused: false,
        follow: true,
      });
      toast({ text: '起錨出航！', kind: 'info' });
      play('depart');
    },

    advance: (realSeconds) => {
      const { world, game, paused, speed, modals } = get();
      if (!world || !game || (!game.voyage && !game.helm) || paused || modals.length) return;
      if (get().stargazing) return;
      const perDay = game.helm ? SAIL_SECONDS_PER_DAY : SECONDS_PER_DAY;
      const days = (Math.min(realSeconds, 0.25) / perDay) * speed;
      apply(tick(world, game, days));
      scheduleSave();
    },

    togglePause: () => set((s) => ({ paused: !s.paused })),
    setSpeed: (speed) => set({ speed }),
    setFollow: (follow) => set({ follow }),

    anchor: () => {
      const g = get().game;
      if (g) apply(stopVoyage(g));
    },

    depart: () => {
      const { world, game } = get();
      if (!world || !game || pendingInteraction(world, game)) return;
      const next = departPort(world, game);
      if (next === game) return;
      set({ selectedPortId: null, paused: false, follow: true, planning: null, building: null });
      commit(next);
      play('depart');
      if (game.stats.voyages === 0) {
        // 第一次出海：說明舵盤與風（遊戲會暫停到按下繼續）
        set((s) => ({
          modals: [
            ...s.modals,
            {
              type: 'info',
              title: '親手掌舵',
              text: '帆船不能往任何方向都開得一樣快，要看風從哪裡吹來。',
              stats: [
                '拖曳右下角舵盤上的紅色圓點設定航向，或直接點一下海面，船頭就會轉過去。',
                '舵盤外圈的顏色：綠色最好開（順風到橫風），黃色開得動但慢（迎風），紅色是頂風，帆吃不到風，船會停住。',
                '藍色箭頭是風吹去的方向。想往紅色那邊走，就要走之字形：先偏左、再偏右，一段一段前進。',
                '收帆、半帆、滿帆控制速度；靠近港口會出現「入港」按鈕。',
              ],
              lesson:
                '冬天（11–3 月）南海與東海吹東北季風，往西南順風好走，往東北就是頂風。鄭和船隊都是冬天出發、夏天返航，就是順著季風航行。',
            },
          ],
        }));
      } else {
        toast({ text: '起錨出航！', kind: 'info' });
      }
    },

    steer: (course) => {
      const g = get().game;
      if (g?.helm) set({ game: setHelm(g, { course }) });
    },

    trimSail: (sail) => {
      const g = get().game;
      if (g?.helm) set({ game: setHelm(g, { sail }) });
    },

    toggleAnchor: () => {
      const g = get().game;
      if (g?.helm) set({ game: setHelm(g, { anchored: !g.helm.anchored }) });
    },

    dock: (portId) => {
      const { world, game } = get();
      if (!world || !game) return;
      const r = enterPort(world, game, portId);
      if (r.state === game) return;
      set({ follow: true, townView: true, building: null, lastBuilding: null });
      apply(r);
    },

    setTownView: (on) => set({ townView: on, building: null }),

    openStargazing: (on) => set({ stargazing: on }),

    sightStars: (zhi) => {
      const { world, game } = get();
      if (!world || !game) return null;
      const r = sightStars(world, game, zhi);
      if (!r) return null;
      apply({ state: r.state, events: r.events, fogChanged: [] });
      play(r.result.quality === 'miss' ? 'wrong' : 'correct');
      return r.result;
    },

    greetMerchant: (fleetId, choice) => {
      const { world, game } = get();
      if (!world || !game) return;
      const r = greetMerchant(world, game, fleetId, choice);
      if (!r) return;
      commit(r.state);
      set((s) => ({
        modals: [...s.modals, { type: 'info', title: r.title, text: r.text, lesson: r.lesson }],
      }));
    },
    enterBuilding: (kind) => set({ building: kind, lastBuilding: kind }),
    leaveBuilding: () => set({ building: null }),

    pray: () => {
      const g = get().game;
      if (!g) return;
      const next = pray(g);
      if (next === g) return;
      commit(next);
      toast({ text: '上香祈求航海平安，船員士氣回升了。', kind: 'success' });
    },

    buyGood: (good, qty) => {
      const { world, game } = get();
      if (!world || !game) return;
      const r = tradeBuy(world, game, good, qty);
      if (!r.qty) return;
      commit(r.state);
      play('arrive');
    },

    sellGood: (good, qty) => {
      const { world, game } = get();
      if (!world || !game) return;
      const r = tradeSell(world, game, good, qty);
      if (!r.qty) return;
      commit(r.state);
      const name = world.codex.get(good)?.name ?? good;
      toast({
        text:
          r.profit >= 0
            ? `賣出${name} ${r.qty} 單位，賺了 ${r.profit} 金幣`
            : `賣出${name} ${r.qty} 單位，虧了 ${-r.profit} 金幣`,
        kind: r.profit >= 0 ? 'success' : 'warn',
      });
      play(r.profit >= 0 ? 'questComplete' : 'warn');
    },

    hearRumor: (id) => {
      const { world, game } = get();
      if (!world || !game) return;
      const next = hearRumor(world, game, id);
      if (next === game) return;
      commit(next);
      toast({ text: '傳聞記下了。依線索推理位置，靠近後按「調查」。', kind: 'info' });
    },

    investigate: (id) => {
      const { world, game } = get();
      if (!world || !game) return;
      const r = investigate(world, game, id);
      if (r.state === game) return;
      apply(r);
      const c = world.codex.get(id)!;
      toast({ text: `調查成功！傳聞中的地方就是「${c.name}」`, kind: 'success' });
      play('achievement');
    },

    accept: (questId) => {
      const { world, game } = get();
      if (world && game) apply(acceptQuest(world, game, questId));
    },

    closeDialogue: (questId) => {
      const { world, game } = get();
      if (world && game) apply(finishDialogue(world, game, questId));
    },

    answer: (questId, choice) => {
      const { world, game } = get();
      if (!world || !game) return false;
      const r = answerQuiz(world, game, questId, choice);
      play(r.correct ? 'correct' : 'wrong');
      apply(r);
      if (!r.correct) scheduleSave(true);
      return r.correct;
    },

    respondEvent: (response) => {
      const { world, game } = get();
      if (world && game) apply(resolveEvent(world, game, response));
    },

    locate: (p) => {
      const { world, game } = get();
      if (!world || !game) return;
      const pending = pendingInteraction(world, game);
      if (pending?.data.type !== 'locate') return;
      const step = pending.data;
      const r = answerLocate(world, game, pending.questId, p);
      apply(r);
      const km = Math.round(r.result.distanceKm / 10) * 10;
      play(r.result.correct ? 'correct' : 'wrong');
      if (r.result.correct) {
        set((s) => ({
          locateFeedback: null,
          mapMarks: [{ lonLat: step.target, kind: 'answer' }],
          modals: [
            ...s.modals,
            {
              type: 'info',
              title: '定位正確！',
              text: `你點的位置離目標只有約 ${km} 公里。${r.attempts === 1 ? '一次就找到了，厲害！' : ''}`,
              lesson: step.explanation,
            },
          ],
        }));
      } else if (r.revealed) {
        set((s) => ({
          locateFeedback: null,
          mapMarks: [
            { lonLat: p, kind: 'guess' },
            { lonLat: step.target, kind: 'answer' },
          ],
          modals: [
            ...s.modals,
            {
              type: 'info',
              title: '公布答案',
              text: `正確位置在綠色圓圈處（${formatLonLat(step.target, 1)}）。你最後點的位置離它約 ${km} 公里。`,
              lesson: step.explanation,
            },
          ],
        }));
      } else {
        set({
          locateFeedback: `不對喔。正確位置在你點的地方的${r.result.direction}方，大約 ${km} 公里。（還有 ${3 - r.attempts} 次機會）`,
          mapMarks: [{ lonLat: p, kind: 'guess' }],
        });
      }
    },

    weatherStorm: (choice) => {
      const { world, game } = get();
      if (world && game) apply(resolveEncounter(world, game, choice));
    },

    resupply: () => {
      const g = get().game;
      if (!g) return;
      commit(portResupply(get().world!, g));
      toast({ text: '補給完成：淡水與糧食已裝滿', kind: 'info' });
    },

    repair: () => {
      const g = get().game;
      if (!g) return;
      commit(portRepair(get().world!, g));
      toast({ text: '船體修理完成', kind: 'info' });
    },

    learn: (id) => {
      const g = get().game;
      if (!g) return;
      const next = learnSkill(g, id);
      if (next === g) return;
      commit(next);
      toast({ text: `學會技能：${SKILLS.find((s) => s.id === id)?.name}`, kind: 'success' });
    },

    hire: (id) => {
      const { world, game } = get();
      if (!world || !game) return;
      const next = hireCrew(world, game, id);
      if (next === game) return;
      commit(next);
      toast({ text: `${world.crew.get(id)?.name} 加入船隊！`, kind: 'success' });
    },

    dismiss: (id) => {
      const { world, game } = get();
      if (!world || !game) return;
      commit(dismissCrew(game, id));
      toast({ text: `${world.crew.get(id)?.name} 回到家鄉港口`, kind: 'info' });
    },

    buy: (id) => {
      const { world, game } = get();
      if (!world || !game) return;
      const next = buyShip(world, game, id);
      if (next === game) return;
      commit(next);
      toast({ text: '新船下水！', kind: 'success' });
    },

    customize: (patch) => {
      const g = get().game;
      if (g) commit(setAppearance(g, patch));
    },

    buyPaint: (kind, id) => {
      const { world, game } = get();
      if (!world || !game) return;
      const next = buyPaint(world, game, kind, id);
      if (next === game) return;
      commit(next);
      toast({ text: '新塗裝完成！', kind: 'success' });
    },

    chooseTitle: (id) => {
      const g = get().game;
      if (g) commit(setTitle(g, id));
    },

    claimDaily: () => {
      const g = get().game;
      if (!g) return;
      const r = claimDaily(g);
      if (r.state === g) return;
      apply(r);
      scheduleSave(true);
      toast({ text: '今日航程完成！經驗 +30、金幣 +50', kind: 'success' });
    },

    answerReview: (key, choice) => {
      const g = get().game;
      if (!g) return false;
      const r = answerReviewItem(g, key, choice, Date.now());
      play(r.correct ? 'correct' : 'wrong');
      apply(r);
      scheduleSave(true);
      return r.correct;
    },

    suggestRoute: (portId) => {
      const { world, game, planning } = get();
      if (!world || !game || !planning) return;
      const port = world.ports.get(portId);
      if (!port) return;
      const path = findSeaPath(game.ship.position, port.location, harborsFor(world, game));
      if (!path) {
        set({ planning: { ...planning, error: '找不到可以抵達的海上航線。' } });
        return;
      }
      set({ planning: { waypoints: path, destinationPortId: portId, error: null } });
    },

    spend: (key) => {
      const g = get().game;
      if (!g) return;
      commit({ ...g, captain: spendPoint(g.captain, key) });
    },

    dismissModal: () =>
      set((s) => ({
        modals: s.modals.slice(1),
        // 看完定位結果後清除海圖上的標記
        mapMarks: s.modals[0]?.type === 'info' ? [] : s.mapMarks,
      })),
    dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    openPanel: (panel, codexFocus = null) => set({ panel, codexFocus }),
    pushToast: (t) => toast(t),
  };
});

function handleEvent(
  world: World,
  e: GameEvent,
  toasts: Toast[],
  modals: Modal[],
  select: (id: string) => void,
) {
  const push = (t: Omit<Toast, 'id'>) => toasts.push({ ...t, id: ++toastSeq });
  playFor(e);
  switch (e.type) {
    case 'arrived': {
      const name = world.ports.get(e.portId)?.name ?? e.portId;
      push({ text: e.firstVisit ? `首次抵達${name}！` : `抵達${name}`, kind: 'success' });
      select(e.portId);
      break;
    }
    case 'anchored':
      push({ text: '船隊在海上下錨', kind: 'info' });
      break;
    case 'discovered': {
      const c = world.codex.get(e.codexId);
      push({ text: `新發現：${c?.name ?? e.codexId}`, kind: 'discover', codexId: e.codexId });
      break;
    }
    case 'questAccepted':
      push({ text: `接下任務：${world.quests.get(e.questId)?.title}`, kind: 'info' });
      break;
    case 'questCompleted':
      modals.push({ type: 'questComplete', questId: e.questId, reward: e.reward });
      break;
    case 'levelUp':
      modals.push({ type: 'levelUp', level: e.level });
      break;
    case 'portUnlocked':
      break;
    case 'warning':
      push({ text: e.text, kind: 'warn' });
      break;
    case 'encounter':
      break;
    case 'achievement': {
      const a = ACHIEVEMENT_MAP.get(e.id);
      push({
        text: `🏆 成就解鎖：${a?.name}${a?.title ? `（稱號：${a.title}）` : ''}`,
        kind: 'success',
      });
      break;
    }
    case 'skillPoint':
      push({ text: '獲得 1 技能點！到「船長」面板學習新技能', kind: 'success' });
      break;
    case 'eventResolved':
      modals.push({
        type: 'info',
        title: e.effect.title,
        text: e.effect.text,
        lesson: e.effect.lesson,
        stats: effectStats(e.effect),
      });
      break;
    case 'stormResolved':
      push({
        text:
          e.hullLoss > 0
            ? `${STORM_CHOICES[e.choice].label}：船體受損 ${e.hullLoss}${e.days ? `，耽擱 ${e.days} 天` : ''}`
            : `${STORM_CHOICES[e.choice].label}：平安度過風暴${e.days ? `，耽擱 ${e.days} 天` : ''}`,
        kind: e.hullLoss >= 20 ? 'warn' : 'info',
      });
      break;
    case 'shipwreck':
      modals.push({
        type: 'shipwreck',
        cause: e.cause,
        lostGold: e.lostGold,
        portId: e.portId,
        month: e.month,
      });
      select(e.portId);
      break;
  }
}

function effectStats(e: EventEffect): string[] {
  const out: string[] = [];
  const sign = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  if (e.gold) out.push(`金幣 ${sign(e.gold)}`);
  if (e.xp) out.push(`經驗 ${sign(e.xp)}`);
  if (e.days) out.push(`耽擱 ${e.days} 天`);
  if (e.morale) out.push(`士氣 ${sign(e.morale)}`);
  if (e.food) out.push(`糧食 ${sign(e.food)} 天份`);
  if (e.water) out.push(`淡水 ${sign(e.water)} 天份`);
  return out;
}

/** 遊戲事件對應的音效 */
function playFor(e: GameEvent) {
  switch (e.type) {
    case 'arrived':
      return play('arrive');
    case 'discovered':
      return play('discover');
    case 'questCompleted':
      return play('questComplete');
    case 'levelUp':
      return play('levelUp');
    case 'achievement':
      return play('achievement');
    case 'warning':
      return play('warn');
    case 'encounter':
      return play(e.encounter.kind === 'storm' ? 'storm' : 'warn');
    case 'shipwreck':
      return play('storm');
    default:
      return undefined;
  }
}
