/**
 * 介面狀態（Zustand）：包住純函式的遊戲引擎，負責時間推進、
 * 航線規劃、事件轉提示、對話框佇列與自動存檔。
 */
import { create } from 'zustand';
import type { LonLat } from '@/data/schema';
import { KM_PER_NM } from '@/geo/geo';
import type { StormRisk } from '@/game/environment';
import type { StormChoice } from '@/game/ship';
import { STORM_CHOICES } from '@/game/ship';
import { spendPoint, type AttributeKey } from '@/game/captain';
import { deleteSave, listSaves, loadSave, writeSave } from '@/game/save';
import {
  acceptQuest,
  answerQuiz,
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
import type { World } from '@/game/world';

/** 1 倍速時，現實 1.2 秒 = 遊戲 1 天 */
export const SECONDS_PER_DAY = 1.2;
const AUTOSAVE_MS = 4000;

type Screen = 'menu' | 'map';
export type Panel = 'codex' | 'captain' | null;

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'discover' | 'success' | 'warn';
  codexId?: string;
}

export type Modal =
  | { type: 'questComplete'; questId: string; reward: QuestReward }
  | { type: 'levelUp'; level: number }
  | { type: 'shipwreck'; cause: StormRisk; lostGold: number; portId: string; month: number };

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
  resupply: () => void;
  repair: () => void;

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
  const est = estimateVoyage(game, planning.waypoints);
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
  function apply(result: StepResult) {
    const { world } = get();
    if (!world) return;
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
      const g = get().game;
      if (!g || g.voyage) return;
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

    weatherStorm: (choice) => {
      const { world, game } = get();
      if (world && game) apply(resolveEncounter(world, game, choice));
    },

    resupply: () => {
      const g = get().game;
      if (!g) return;
      set({ game: portResupply(g) });
      toast({ text: '補給完成：淡水與糧食已裝滿', kind: 'info' });
      scheduleSave(true);
    },

    repair: () => {
      const g = get().game;
      if (!g) return;
      set({ game: portRepair(g) });
      toast({ text: '船體修理完成', kind: 'info' });
      scheduleSave(true);
    },

    spend: (key) => {
      const g = get().game;
      if (!g) return;
      set({ game: { ...g, captain: spendPoint(g.captain, key) } });
      scheduleSave(true);
    },

    dismissModal: () => set((s) => ({ modals: s.modals.slice(1) })),
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
