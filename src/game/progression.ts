/**
 * 成長系統的資料定義（企畫書 9.2 技能樹、9.3 船員職業、9.4 船隻）。
 * 這些是遊戲機制數值，放在程式裡；船員的人物與故事則是內容，放在 content/crew。
 */

// ---------------------------------------------------------------- 技能樹

export type SkillPath = 'explorer' | 'scholar' | 'merchant';

export interface SkillDef {
  id: string;
  path: SkillPath;
  name: string;
  effect: string;
  /** 需先學會的技能 */
  requires?: string;
  minLevel: number;
}

export const SKILL_PATHS: Record<SkillPath, string> = {
  explorer: '探險家',
  scholar: '學者',
  merchant: '商人',
};

export const SKILLS: SkillDef[] = [
  { id: 'eagle-eye', path: 'explorer', name: '鷹眼', effect: '瞭望範圍 +50%', minLevel: 3 },
  {
    id: 'surveyor',
    path: 'explorer',
    name: '地形記憶',
    effect: '地標發現範圍 +30%',
    requires: 'eagle-eye',
    minLevel: 5,
  },
  {
    id: 'trailblazer',
    path: 'explorer',
    name: '開路先鋒',
    effect: '航速 +10%',
    requires: 'surveyor',
    minLevel: 7,
  },
  {
    id: 'deduction',
    path: 'scholar',
    name: '推理',
    effect: '任務問答可排除一個錯誤選項',
    minLevel: 3,
  },
  {
    id: 'mentor',
    path: 'scholar',
    name: '良師',
    effect: '任務經驗 +20%',
    requires: 'deduction',
    minLevel: 5,
  },
  {
    id: 'navigator-scholar',
    path: 'scholar',
    name: '牽星術',
    effect: '不再迷航；觀星答對經驗加倍',
    requires: 'mentor',
    minLevel: 7,
  },
  {
    id: 'bargain',
    path: 'merchant',
    name: '殺價',
    effect: '補給與修船價格 -20%',
    minLevel: 3,
  },
  {
    id: 'network',
    path: 'merchant',
    name: '人脈',
    effect: '首次抵達港口時獲得 30 金幣見面禮',
    requires: 'bargain',
    minLevel: 5,
  },
  {
    id: 'silver-tongue',
    path: 'merchant',
    name: '三寸不爛之舌',
    effect: '與海盜談判時付出減半',
    requires: 'network',
    minLevel: 7,
  },
];

/** 3 級起每升 2 級獲得 1 技能點（3、5、7、9…） */
export function skillPointsEarned(level: number): number {
  return level >= 3 ? Math.floor((level - 1) / 2) : 0;
}

// ---------------------------------------------------------------- 船員職業

export const PROFESSIONS = {
  helmsman: { name: '舵手', effect: '航速 +5%' },
  lookout: { name: '瞭望員', effect: '瞭望範圍 +20%' },
  cook: { name: '廚師', effect: '淡水與糧食消耗 -15%' },
  naturalist: { name: '博物學家', effect: '地標發現範圍 +20%' },
  interpreter: { name: '翻譯官', effect: '補給與修船價格 -10%，海盜談判付出 -20%' },
  doctor: { name: '船醫', effect: '士氣流失 -25%，不會發生壞血病' },
} as const;

export type Profession = keyof typeof PROFESSIONS;

// ---------------------------------------------------------------- 船隻

export interface ShipDef {
  id: string;
  name: string;
  name_en: string;
  /** 淡水、糧食各可存放的天數 */
  supplyDays: number;
  speed: number;
  /** 船體強度：風暴損傷除以此值 */
  sturdiness: number;
  crewSlots: number;
  price: number;
  minLevel: number;
  /** 船隻小知識（企畫書 9.4） */
  lore: string;
}

export const SHIPS: Record<string, ShipDef> = {
  junk: {
    id: 'junk',
    name: '戎克船',
    name_en: 'Junk',
    supplyDays: 40,
    speed: 1,
    sturdiness: 1,
    crewSlots: 2,
    price: 0,
    minLevel: 1,
    lore: '中國傳統帆船的統稱，船帆以竹條撐開、可分段收放，船艙以隔艙板分成許多水密隔艙，一艙進水不致全船沉沒。',
  },
  fuchuan: {
    id: 'fuchuan',
    name: '福船',
    name_en: 'Fuchuan',
    supplyDays: 55,
    speed: 1.05,
    sturdiness: 1.25,
    crewSlots: 3,
    price: 600,
    minLevel: 3,
    lore: '福建沿海建造的尖底大船，吃水深、抗風浪，適合遠洋航行。明代許多遠航與海防船隻都屬於福船系統。',
  },
  baochuan: {
    id: 'baochuan',
    name: '寶船',
    name_en: 'Treasure Ship',
    supplyDays: 75,
    speed: 0.95,
    sturdiness: 1.5,
    crewSlots: 4,
    price: 1500,
    minLevel: 6,
    lore: '鄭和船隊的主力大船。史書記載最大的寶船長約四十四丈，但現代學者對實際尺寸仍有爭論。大船載貨多、穩定，但轉向較慢。',
  },
  caravel: {
    id: 'caravel',
    name: '卡拉維爾帆船',
    name_en: 'Caravel',
    supplyDays: 35,
    speed: 1.15,
    sturdiness: 0.9,
    crewSlots: 2,
    price: 0,
    minLevel: 1,
    lore: '15 世紀葡萄牙與西班牙的輕快帆船，使用三角帆能逆風斜行，適合沿著陌生海岸探險。哥倫布的尼尼亞號就是卡拉維爾帆船。',
  },
  carrack: {
    id: 'carrack',
    name: '克拉克帆船',
    name_en: 'Carrack',
    supplyDays: 60,
    speed: 1,
    sturdiness: 1.2,
    crewSlots: 3,
    price: 700,
    minLevel: 3,
    lore: '有高聳船樓的大型遠洋帆船，載貨量大。達伽馬航向印度、麥哲倫環球航行的旗艦都是克拉克帆船。',
  },
  galleon: {
    id: 'galleon',
    name: '蓋倫帆船',
    name_en: 'Galleon',
    supplyDays: 70,
    speed: 1.05,
    sturdiness: 1.4,
    crewSlots: 4,
    price: 1600,
    minLevel: 6,
    lore: '16 世紀發展出的大型帆船，船身較長、較穩定。西班牙的馬尼拉大帆船每年橫渡太平洋，連接亞洲與美洲。',
  },
};

export function shipDef(id: string): ShipDef {
  return SHIPS[id] ?? SHIPS.junk;
}
