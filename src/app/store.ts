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
  buyShip,
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
import type { World } from '@/game/world';

/** 1 倍速時，現實 1.2 秒 = 遊戲 1 天 */
export const SECONDS_PER_DAY = 1.2;
const AUTOSAVE_MS = 4000;

type Screen = 'menu' | 'map';
export type Panel = 'codex' | 'captain' | 'fleet' | null;

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

  init: (world: World) => void;
  refreshSaves: () => Promise<void>;
  startNew: (scenarioId: string) => Promise<void>;
  continueGame: (scenarioId: string) => Promise<void>;
  loadGame: (state: GameState) => void;
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

  dismissModal: () => void;
  dismissToast: (id: number) => void;
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
    // 每次狀態變化後檢查成就
    const ach = checkAchievements(world, input.state);
    const result: StepResult = {
      state: ach.state,
      events: [...input.events, ...ach.events],
      fogChanged: input.fogChanged,
    };
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
          void writeSave(g);
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
      void writeSave(state);
    },

    continueGame: async (scenarioId) => {
      const saved = await loadSave(scenarioId);
      if (saved) get().loadGame(saved);
      else await get().startNew(scenarioId);
    },

    loadGame: (state) => {
      set({
        screen: 'map',
        game: state,
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
      if (g) void writeSave(g);
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
    },

    advance: (realSeconds) => {
      const { world, game, paused, speed, modals } = get();
      if (!world || !game?.voyage || paused || modals.length) return;
      const days = (Math.min(realSeconds, 0.25) / SECONDS_PER_DAY) * speed;
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

    chooseTitle: (id) => {
      const g = get().game;
      if (g) commit(setTitle(g, id));
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
