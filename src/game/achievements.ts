/**
 * 成就與稱號（企畫書 8）。
 * 成就只看玩家「做到了什麼」：探索、知識、技能、蒐集、毅力；不以答錯率懲罰。
 */
import type { LonLat } from '@/data/schema';
import { exploredFraction, FOG_COLS, FOG_RES } from './fog';
import { destinationPoint } from './events';

export type AchievementCategory = '探索' | '知識' | '技能' | '蒐集' | '成長' | '隱藏';

export interface AchievementStats {
  voyages: number;
  stormsSurvived: number;
  starsCorrect: number;
  piratesOutwitted: number;
  crossedEquator: boolean;
  crossedTropic: boolean;
}

export const EMPTY_STATS: AchievementStats = {
  voyages: 0,
  stormsSurvived: 0,
  starsCorrect: 0,
  piratesOutwitted: 0,
  crossedEquator: false,
  crossedTropic: false,
};

/** 判斷成就所需的狀態（state.ts 的 GameState 符合這個介面） */
export interface AchievementInput {
  stats: AchievementStats;
  visitedPorts: string[];
  discovered: string[];
  quests: Record<string, { status: string }>;
  quizLog: { firstTry: boolean }[];
  captain: { level: number };
  crew: string[];
  shipTypeId: string;
  startingShip: string;
  shipwrecks: number;
  fog: Uint8Array;
  ship: { position: LonLat };
  dockedAt: string | null;
  voyage: unknown;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  /** 解鎖後可選用的稱號 */
  title?: string;
  /** 隱藏成就：解鎖前不顯示條件 */
  hidden?: boolean;
  check: (s: AchievementInput) => boolean;
}

const completed = (s: AchievementInput) =>
  Object.values(s.quests).filter((q) => q.status === 'completed').length;

/** 在海上下錨，而四周大多仍是未探索的迷霧（古地圖上「此處有龍」的地方） */
function atEdgeOfKnownWorld(s: AchievementInput): boolean {
  if (s.dockedAt || s.voyage) return false;
  let unknown = 0;
  for (let b = 0; b < 360; b += 45) {
    const [lon, lat] = destinationPoint(s.ship.position, b, 450);
    const r = Math.floor((90 - lat) / FOG_RES);
    const c = Math.floor((lon + 180) / FOG_RES);
    if (!s.fog[r * FOG_COLS + c]) unknown++;
  }
  return unknown >= 5;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first-voyage',
    name: '初次出航',
    description: '完成第一趟航行',
    category: '探索',
    title: '見習水手',
    check: (s) => s.stats.voyages >= 1,
  },
  {
    id: 'first-quest',
    name: '小試身手',
    description: '完成第一個任務',
    category: '成長',
    title: '新手船長',
    check: (s) => completed(s) >= 1,
  },
  {
    id: 'quests-5',
    name: '使命必達',
    description: '完成 5 個任務',
    category: '成長',
    title: '可靠的船長',
    check: (s) => completed(s) >= 5,
  },
  {
    id: 'ports-3',
    name: '港口常客',
    description: '造訪 3 個港口',
    category: '探索',
    check: (s) => s.visitedPorts.length >= 3,
  },
  {
    id: 'ports-10',
    name: '四海為家',
    description: '造訪 10 個港口',
    category: '探索',
    title: '四海為家',
    check: (s) => s.visitedPorts.length >= 10,
  },
  {
    id: 'explore-1',
    name: '開拓者',
    description: '揭開世界 1% 的迷霧',
    category: '探索',
    check: (s) => exploredFraction(s.fog) >= 0.01,
  },
  {
    id: 'explore-5',
    name: '地圖繪製師',
    description: '揭開世界 5% 的迷霧',
    category: '探索',
    title: '繪圖師',
    check: (s) => exploredFraction(s.fog) >= 0.05,
  },
  {
    id: 'tropic',
    name: '跨越回歸線',
    description: '航行穿越北回歸線或南回歸線',
    category: '探索',
    check: (s) => s.stats.crossedTropic,
  },
  {
    id: 'equator',
    name: '赤道勇士',
    description: '航行穿越赤道',
    category: '探索',
    title: '赤道勇士',
    check: (s) => s.stats.crossedEquator,
  },
  {
    id: 'codex-5',
    name: '博物新手',
    description: '圖鑑收集 5 項',
    category: '蒐集',
    check: (s) => s.discovered.length >= 5,
  },
  {
    id: 'codex-20',
    name: '博物學家',
    description: '圖鑑收集 20 項',
    category: '蒐集',
    title: '博物學家',
    check: (s) => s.discovered.length >= 20,
  },
  {
    id: 'quiz-5',
    name: '學霸',
    description: '一次答對 5 題問答',
    category: '知識',
    title: '航海學者',
    check: (s) => s.quizLog.filter((q) => q.firstTry).length >= 5,
  },
  {
    id: 'stargazer',
    name: '觀星者',
    description: '在觀星之夜答對 3 次',
    category: '知識',
    title: '觀星者',
    check: (s) => s.stats.starsCorrect >= 3,
  },
  {
    id: 'pirate-scholar',
    name: '以智退敵',
    description: '用知識挑戰讓海盜放行',
    category: '知識',
    check: (s) => s.stats.piratesOutwitted >= 1,
  },
  {
    id: 'storm-survivor',
    name: '風暴生還者',
    description: '平安度過一次風暴',
    category: '技能',
    title: '不沉之舟',
    check: (s) => s.stats.stormsSurvived >= 1,
  },
  {
    id: 'level-5',
    name: '資深船長',
    description: '船長等級達到 5',
    category: '成長',
    title: '資深船長',
    check: (s) => s.captain.level >= 5,
  },
  {
    id: 'crew-3',
    name: '同舟共濟',
    description: '同時有 3 名船員',
    category: '成長',
    check: (s) => s.crew.length >= 3,
  },
  {
    id: 'new-ship',
    name: '新船下水',
    description: '買下第一艘新船',
    category: '成長',
    check: (s) => s.shipTypeId !== s.startingShip,
  },
  {
    id: 'phoenix',
    name: '浴火重生',
    description: '經歷船難後重新出發',
    category: '隱藏',
    hidden: true,
    check: (s) => s.shipwrecks >= 1,
  },
  {
    id: 'here-be-dragons',
    name: '此處有龍',
    description: '在未知海域的邊緣下錨',
    category: '隱藏',
    title: '無畏探險家',
    hidden: true,
    check: atEdgeOfKnownWorld,
  },
];

export const ACHIEVEMENT_MAP = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

export function newlyUnlocked(s: AchievementInput, unlocked: string[]): string[] {
  return ACHIEVEMENTS.filter((a) => !unlocked.includes(a.id) && a.check(s)).map((a) => a.id);
}
