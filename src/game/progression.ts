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
  interpreter: {
    name: '翻譯官',
    effect: '補給與修船價格 -10%，海盜談判付出 -20%，會說各地的問候語，海上賣貨多賺 10%',
  },
  doctor: { name: '船醫', effect: '士氣流失 -25%，不會發生壞血病' },
} as const;

export type Profession = keyof typeof PROFESSIONS;

// ---------------------------------------------------------------- 船隻

/**
 * 帆裝種類：
 * - lug：中國帆船的竹條撐帆（硬帆），能相當接近逆風
 * - lateen：三角帆，最能逆風
 * - square：橫帆，順風快，但無法接近逆風
 */
export type Rig = 'lug' | 'lateen' | 'square';

export interface ShipDef {
  id: string;
  name: string;
  name_en: string;
  /** 淡水、糧食各可存放的天數 */
  supplyDays: number;
  speed: number;
  /** 帆裝：決定能多接近逆風航行（親手駕船） */
  rig: Rig;
  /** 船體強度：風暴損傷除以此值 */
  sturdiness: number;
  crewSlots: number;
  /** 貨艙容量（貨物單位） */
  cargo: number;
  price: number;
  minLevel: number;
  /** 船隻小知識（企畫書 9.4） */
  lore: string;
  /** 海圖上的特殊畫法（雙體獨木舟） */
  look?: 'vaka';
}

export const SHIPS: Record<string, ShipDef> = {
  junk: {
    id: 'junk',
    rig: 'lug',
    name: '戎克船',
    name_en: 'Junk',
    supplyDays: 40,
    speed: 1,
    sturdiness: 1,
    crewSlots: 2,
    cargo: 20,
    price: 0,
    minLevel: 1,
    lore: '中國傳統帆船的統稱，船帆以竹條撐開、可分段收放，船艙以隔艙板分成許多水密隔艙，一艙進水不致全船沉沒。',
  },
  fuchuan: {
    id: 'fuchuan',
    rig: 'lug',
    name: '福船',
    name_en: 'Fuchuan',
    supplyDays: 55,
    speed: 1.05,
    sturdiness: 1.25,
    crewSlots: 3,
    cargo: 30,
    price: 600,
    minLevel: 3,
    lore: '福建沿海建造的尖底大船，吃水深、抗風浪，適合遠洋航行。明代許多遠航與海防船隻都屬於福船系統。',
  },
  baochuan: {
    id: 'baochuan',
    rig: 'lug',
    name: '寶船',
    name_en: 'Treasure Ship',
    supplyDays: 75,
    speed: 0.95,
    sturdiness: 1.5,
    crewSlots: 4,
    cargo: 60,
    price: 1500,
    minLevel: 6,
    lore: '鄭和船隊的主力大船。史書記載最大的寶船長約四十四丈，但現代學者對實際尺寸仍有爭論。大船載貨多、穩定，但轉向較慢。',
  },
  'sewn-dhow': {
    id: 'sewn-dhow',
    rig: 'lateen',
    name: '縫合三角帆船',
    name_en: 'Sewn Dhow',
    supplyDays: 35,
    speed: 1.1,
    sturdiness: 0.9,
    crewSlots: 2,
    cargo: 20,
    price: 0,
    minLevel: 1,
    lore: '阿拉伯海與印度西岸常見的木帆船：船板不用鐵釘，而是鑽孔後用椰子纖維搓成的繩子縫起來，船身有彈性、擱淺時不易撞裂。長長的斜桁上掛著三角帆，很能逆風斜行。馬可波羅和伊本·巴圖塔都在遊記裡寫過這種「縫合船」。',
  },
  'large-dhow': {
    id: 'large-dhow',
    rig: 'lateen',
    name: '雙桅遠洋商船',
    name_en: 'Ocean-going Dhow',
    supplyDays: 55,
    speed: 1.05,
    sturdiness: 1.15,
    crewSlots: 3,
    cargo: 35,
    price: 650,
    minLevel: 3,
    lore: '印度洋貿易用的大型三角帆船，兩根桅杆都掛著三角帆。阿拉伯與波斯商人用這類船把馬匹運到印度，把胡椒、棉布、瓷器運回波斯灣和紅海；每年順著季風往返一趟。',
  },
  vaka: {
    id: 'vaka',
    rig: 'lateen',
    look: 'vaka',
    name: '雙體獨木舟',
    name_en: 'Vaka (double canoe)',
    supplyDays: 30,
    speed: 1.15,
    sturdiness: 1,
    crewSlots: 2,
    cargo: 16,
    price: 0,
    minLevel: 1,
    lore: '兩條獨木舟用橫木綁在一起，中間鋪上平台，掛著像蟹鉗一樣的三角帆（蟹爪帆）。雙船身又穩又快，平台上可以載家人、豬、雞、種子和幼苗——玻里尼西亞人就是開著它，把整個家族和生活搬到新的島上。',
  },
  'voyaging-vaka': {
    id: 'voyaging-vaka',
    rig: 'lateen',
    look: 'vaka',
    name: '遠航大雙體舟',
    name_en: 'Voyaging Canoe',
    supplyDays: 45,
    speed: 1.1,
    sturdiness: 1.2,
    crewSlots: 3,
    cargo: 26,
    price: 500,
    minLevel: 3,
    lore: "二十公尺長的遠航雙體舟，可以載二三十個人和幾個星期的食物、淡水。1976 年仿造的霍庫雷阿號（Hōkūle'a）不用任何現代儀器，從夏威夷航行到大溪地，證明了古代玻里尼西亞人有能力刻意遠航，而不是隨波漂流。",
  },
  knarr: {
    id: 'knarr',
    rig: 'square',
    name: '諾爾船',
    name_en: 'Knarr',
    supplyDays: 30,
    speed: 1,
    sturdiness: 1,
    crewSlots: 2,
    cargo: 22,
    price: 0,
    minLevel: 1,
    lore: '維京人的遠洋貨船：船身寬、吃水深，一面大大的方帆，船員不多也能開。船板一片疊一片釘在一起（疊板造船法），又輕又有彈性，能在北大西洋的大浪裡航行。維京人就是開著諾爾船移民冰島、格陵蘭，甚至到了北美洲。',
  },
  longship: {
    id: 'longship',
    rig: 'square',
    name: '維京長船',
    name_en: 'Longship',
    supplyDays: 22,
    speed: 1.25,
    sturdiness: 0.9,
    crewSlots: 3,
    cargo: 10,
    price: 450,
    minLevel: 3,
    lore: '又長又窄的戰船，船頭常雕著龍頭。有風時掛方帆，沒風時幾十個人一起划槳，吃水很淺，可以一路開進河流深處。速度快，但載的貨和補給都少，不適合橫渡大洋。',
  },
  caravel: {
    id: 'caravel',
    rig: 'lateen',
    name: '卡拉維爾帆船',
    name_en: 'Caravel',
    supplyDays: 35,
    speed: 1.15,
    sturdiness: 0.9,
    crewSlots: 2,
    cargo: 25,
    price: 0,
    minLevel: 1,
    lore: '15 世紀葡萄牙與西班牙的輕快帆船，使用三角帆能逆風斜行，適合沿著陌生海岸探險。哥倫布的尼尼亞號就是卡拉維爾帆船。',
  },
  nao: {
    id: 'nao',
    rig: 'square',
    name: '納奧帆船',
    name_en: 'Nao',
    supplyDays: 75,
    speed: 1,
    sturdiness: 1.1,
    crewSlots: 3,
    cargo: 40,
    price: 0,
    minLevel: 1,
    lore: '16 世紀西班牙的遠洋帆船，比卡拉維爾大、比克拉克小，船艙裝得下好幾個月的補給。麥哲倫船隊的五艘船大多是納奧帆船，最後繞地球一圈回到西班牙的維多利亞號也是其中之一。',
  },
  carrack: {
    id: 'carrack',
    rig: 'square',
    name: '克拉克帆船',
    name_en: 'Carrack',
    supplyDays: 60,
    speed: 1,
    sturdiness: 1.2,
    crewSlots: 3,
    cargo: 45,
    price: 700,
    minLevel: 3,
    lore: '有高聳船樓的大型遠洋帆船，載貨量大。達伽馬航向印度、麥哲倫環球航行的旗艦都是克拉克帆船。',
  },
  galleon: {
    id: 'galleon',
    rig: 'square',
    name: '蓋倫帆船',
    name_en: 'Galleon',
    supplyDays: 70,
    speed: 1.05,
    sturdiness: 1.4,
    crewSlots: 4,
    cargo: 60,
    price: 1600,
    minLevel: 6,
    lore: '16 世紀發展出的大型帆船，船身較長、較穩定。西班牙的馬尼拉大帆船每年橫渡太平洋，連接亞洲與美洲。',
  },
};

export function shipDef(id: string): ShipDef {
  return SHIPS[id] ?? SHIPS.junk;
}

/** 造船廠的改裝：裝在目前這艘船上，換船時留給舊船 */
export interface ShipUpgrade {
  id: string;
  name: string;
  effect: string;
  price: number;
  /** 造船小知識 */
  lore: string;
}

export const UPGRADES: ShipUpgrade[] = [
  {
    id: 'hold',
    name: '擴建貨艙',
    effect: '貨艙容量 +50%',
    price: 250,
    lore: '中國帆船用隔艙板把船艙分成許多艙，不同的貨分開裝，一艙進水也不會淹掉全船。',
  },
  {
    id: 'tanks',
    name: '加裝水櫃',
    effect: '淡水與糧食多帶 15 天',
    price: 200,
    lore: '遠洋航行最怕缺淡水。大船會在艙底放大水櫃，下雨時也用帆布接雨水。',
  },
  {
    id: 'sails',
    name: '改良帆具',
    effect: '航速 +6%',
    price: 300,
    lore: '中國帆船的硬帆用竹條撐開，可以一段一段升降，調整角度也比軟帆容易，逆風時更好用。',
  },
  {
    id: 'hull',
    name: '加固船殼',
    effect: '風暴損傷 -20%',
    price: 300,
    lore: '福船的船殼用好幾層木板釘合，縫隙塞進麻絲，再塗上桐油和石灰調成的油灰，防水又防蟲。',
  },
];

/** 加上改裝之後的船隻數值 */
export function shipWithUpgrades(id: string, upgrades: string[]): ShipDef {
  const base = shipDef(id);
  const has = (u: string) => upgrades.includes(u);
  return {
    ...base,
    cargo: has('hold') ? Math.round(base.cargo * 1.5) : base.cargo,
    supplyDays: base.supplyDays + (has('tanks') ? 15 : 0),
    speed: base.speed * (has('sails') ? 1.06 : 1),
    sturdiness: base.sturdiness * (has('hull') ? 1.25 : 1),
  };
}
