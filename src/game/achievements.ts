/**
 * 成就與稱號（企畫書 8）。
 * 成就只看玩家「做到了什麼」：探索、知識、技能、蒐集、毅力；不以答錯率懲罰。
 */
import type { LonLat } from '@/data/schema';
import { exploredAreaKm2, FOG_COLS, FOG_RES } from './fog';
import { destinationPoint } from './events';
import { greetingFor } from '@/town/folkTalk';

export type AchievementCategory = '探索' | '知識' | '技能' | '蒐集' | '成長' | '隱藏';

export interface AchievementStats {
  voyages: number;
  stormsSurvived: number;
  starsCorrect: number;
  piratesOutwitted: number;
  crossedEquator: boolean;
  crossedTropic: boolean;
  /** 貿易累計利潤（只計賺錢的交易） */
  tradeProfit: number;
  /** 測深次數 */
  soundings: number;
  /** 穿過海霧的次數 */
  mistsCrossed: number;
  /** 完成的商人委託 */
  contracts: number;
  /** 正午量太陽的次數 */
  sunSights: number;
  /** 上岸取水（找到淡水）的次數 */
  watering: number;
}

export const EMPTY_STATS: AchievementStats = {
  voyages: 0,
  stormsSurvived: 0,
  starsCorrect: 0,
  piratesOutwitted: 0,
  crossedEquator: false,
  crossedTropic: false,
  tradeProfit: 0,
  soundings: 0,
  mistsCrossed: 0,
  contracts: 0,
  sunSights: 0,
  watering: 0,
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
  /** 向學者回報過的傳聞發現 */
  reported: string[];
  /** 熟悉航線（兩個方向各算一條） */
  routes: Record<string, unknown>;
  /** 和對手船長比賽的戰績 */
  rival: { wins: number };
  /** 參加過的節慶（港口:年:節慶名） */
  festivalsSeen: string[];
  /** 看過的教學提示（撒網的漁場記在 fish-*） */
  hinted: string[];
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

/** 造訪過的港口說幾種語言 */
export function languagesHeard(visitedPorts: string[]): number {
  return new Set(visitedPorts.map((id) => greetingFor(id)?.lang).filter(Boolean)).size;
}

const completed = (s: AchievementInput) =>
  Object.values(s.quests).filter((q) => q.status === 'completed').length;

/** 在海上下錨，而四周大多仍是未探索的迷霧（古地圖上「此處有龍」的地方） */
function atEdgeOfKnownWorld(s: AchievementInput): boolean {
  if (s.dockedAt || s.voyage) return false;
  // 要真的航行過一大段，才算走到已知世界的邊緣（剛出港時四周本來就還沒畫）
  if (s.visitedPorts.length < 6 || exploredAreaKm2(s.fog) < 1_500_000) return false;
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
    description: '海圖畫出 50 萬平方公里',
    category: '探索',
    check: (s) => exploredAreaKm2(s.fog) >= 500_000,
  },
  {
    id: 'explore-5',
    name: '地圖繪製師',
    description: '海圖畫出 300 萬平方公里',
    category: '探索',
    title: '繪圖師',
    check: (s) => exploredAreaKm2(s.fog) >= 3_000_000,
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
    id: 'sun-sights-3',
    name: '太陽的學徒',
    description: '正午量太陽定位 3 次',
    category: '知識',
    title: '領航員',
    check: (s) => s.stats.sunSights >= 3,
  },
  {
    id: 'desert-coast',
    name: '一滴水也沒有',
    description: '在沙漠海岸上岸找水，才知道那裡為什麼叫沙漠',
    category: '隱藏',
    hidden: true,
    check: (s) => s.hinted.includes('water-desert'),
  },
  {
    id: 'watering-5',
    name: '水桶總是滿的',
    description: '上岸取水成功 5 次',
    category: '技能',
    check: (s) => s.stats.watering >= 5,
  },
  {
    id: 'stargazer',
    name: '觀星者',
    description: '用牽星術準確定位 3 次',
    category: '知識',
    title: '觀星者',
    check: (s) => s.stats.starsCorrect >= 3,
  },
  {
    id: 'pirate-scholar',
    name: '以智退敵',
    description: '用知識或風向甩開海盜',
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
    id: 'rumor-3',
    name: '追尋傳聞的人',
    description: '依傳聞找到並回報 3 個地方',
    category: '探索',
    check: (s) => s.reported.length >= 3,
  },
  {
    id: 'rumor-10',
    name: '解開地圖之謎',
    description: '依傳聞找到並回報 10 個地方',
    category: '探索',
    title: '探險家',
    check: (s) => s.reported.length >= 10,
  },
  {
    id: 'star-10',
    name: '牽星大師',
    description: '用牽星術準確定位 10 次',
    category: '知識',
    title: '牽星師',
    check: (s) => s.stats.starsCorrect >= 10,
  },
  {
    id: 'escape-3',
    name: '乘風而去',
    description: '甩開或智退海盜 3 次',
    category: '知識',
    check: (s) => s.stats.piratesOutwitted >= 3,
  },
  {
    id: 'routes-5',
    name: '熟門熟路',
    description: '親手開出 5 條熟悉航線',
    category: '探索',
    check: (s) => Object.keys(s.routes).length / 2 >= 5,
  },
  {
    id: 'indian-ocean',
    name: '寶石之島',
    description: '抵達錫蘭島的加勒',
    category: '探索',
    check: (s) => s.visitedPorts.includes('galle'),
  },
  {
    id: 'africa',
    name: '西洋盡頭',
    description: '抵達東非的港口',
    category: '探索',
    title: '西洋航海家',
    check: (s) => s.visitedPorts.some((p) => ['mogadishu', 'malindi', 'kilwa'].includes(p)),
  },
  {
    id: 'cape',
    name: '海的盡頭',
    description: '看見非洲大陸的最南端',
    category: '隱藏',
    hidden: true,
    check: (s) => s.discovered.includes('cape-of-good-hope'),
  },
  {
    id: 'first-profit',
    name: '第一筆生意',
    description: '做一次賺錢的貿易',
    category: '成長',
    check: (s) => s.stats.tradeProfit > 0,
  },
  {
    id: 'merchant-500',
    name: '海上商人',
    description: '貿易累計賺進 500 金幣',
    category: '成長',
    title: '海商',
    check: (s) => s.stats.tradeProfit >= 500,
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
    id: 'ports-20',
    name: '萬里行舟',
    description: '造訪 20 個港口',
    category: '探索',
    title: '萬里行舟',
    check: (s) => s.visitedPorts.length >= 20,
  },
  {
    id: 'codex-50',
    name: '百科全書',
    description: '圖鑑收集 50 項',
    category: '蒐集',
    title: '百科船長',
    check: (s) => s.discovered.length >= 50,
  },
  {
    id: 'rumor-25',
    name: '地理大發現',
    description: '依傳聞找到並回報 25 個地方',
    category: '探索',
    title: '地理大發現者',
    check: (s) => s.reported.length >= 25,
  },
  {
    id: 'sounding-5',
    name: '打水幾托',
    description: '測深 5 次',
    category: '技能',
    check: (s) => s.stats.soundings >= 5,
  },
  {
    id: 'mist',
    name: '霧裡看花',
    description: '穿過一片海霧',
    category: '技能',
    check: (s) => s.stats.mistsCrossed >= 1,
  },
  {
    id: 'polyglot',
    name: '通曉四方',
    description: '在說 6 種不同語言的港口聽過當地的問候',
    category: '知識',
    title: '通譯',
    check: (s) => languagesHeard(s.visitedPorts) >= 6,
  },
  {
    id: 'festivals-3',
    name: '四海同歡',
    description: '在 3 個不同的港口參加當地的節慶',
    category: '探索',
    title: '節慶旅人',
    check: (s) => new Set(s.festivalsSeen.map((k) => k.split(':')[0])).size >= 3,
  },
  {
    id: 'fishing-grounds',
    name: '四方漁場',
    description: '在 4 種不同的漁場撒網（大陸棚、河口、珊瑚礁、湧升流、近岸、遠洋）',
    category: '探索',
    title: '討海人',
    check: (s) => s.hinted.filter((h) => h.startsWith('fish-')).length >= 4,
  },
  {
    id: 'contracts-5',
    name: '信用可靠',
    description: '完成 5 件商人的委託',
    category: '成長',
    title: '可靠的海商',
    check: (s) => s.stats.contracts >= 5,
  },
  {
    id: 'rival-1',
    name: '搶先一步',
    description: '比對手船長先回報傳聞地點',
    category: '探索',
    check: (s) => s.rival.wins >= 1,
  },
  {
    id: 'rival-3',
    name: '青出於藍',
    description: '在傳聞競賽中贏過對手船長 3 次',
    category: '探索',
    title: '海上新星',
    check: (s) => s.rival.wins >= 3,
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
