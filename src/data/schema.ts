/**
 * 內容資料 schema（Zod）。
 * 所有 content/ 下的 JSON 檔都必須通過這裡的驗證；
 * 企畫書對應章節標註於各 schema 註解。
 */
import { z } from 'zod';

/** 六大學習領域（企畫書 2.1） */
export const LearningDomain = z.enum(['A', 'B', 'C', 'D', 'E', 'F']);
export type LearningDomain = z.infer<typeof LearningDomain>;

export const LEARNING_DOMAIN_LABELS: Record<LearningDomain, string> = {
  A: '位置與座標',
  B: '陸與海的形狀',
  C: '地形與河流',
  D: '氣候與環境',
  E: '國家與城市',
  F: '物產與文化',
};

/** 難度階梯 0～4（企畫書 2.4） */
export const Tier = z.number().int().min(0).max(4);
export type Tier = z.infer<typeof Tier>;

const Id = z.string().regex(/^[a-z0-9-]+$/, 'id 只能包含小寫字母、數字與連字號');

/** 經緯度：[lon, lat]，與 GeoJSON 一致 */
export const LonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
export type LonLat = z.infer<typeof LonLat>;

/** 學習目標卡（企畫書 2.2） */
export const LearningObjective = z.object({
  domain: LearningDomain,
  text: z.string().min(1),
});

/** 海域區（企畫書 4.3） */
export const SeaRegion = z.object({
  id: Id,
  name: z.string(),
  name_en: z.string(),
  description: z.string().optional(),
  /** 用來在地圖上標示區域中心與大致範圍 */
  center: LonLat,
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
});
export type SeaRegion = z.infer<typeof SeaRegion>;

/** 港口（企畫書 4.4） */
export const Port = z.object({
  id: Id,
  name: z.string(),
  name_en: z.string(),
  historical_names: z.array(z.string()).default([]),
  country: z.string(),
  country_en: z.string(),
  region: Id,
  location: LonLat,
  kind: z.enum(['hub', 'port', 'landmark']),
  /** 特產（物產 codex id） */
  goods: z.array(Id).default([]),
  /** 名勝、文化、生物等，抵達港口時登錄圖鑑（codex id） */
  sights: z.array(Id).default([]),
  climate: z.string().optional(),
  blurb: z.string().optional(),
  /** 酒館裡聽得到的閒聊：當地的地理、歷史小知識 */
  gossip: z.array(z.string()).default([]),
});
export type Port = z.infer<typeof Port>;

/** 圖鑑知識卡（企畫書 6.1） */
export const CodexEntry = z.object({
  id: Id,
  category: z.enum([
    'landmark',
    'island',
    'river',
    'mountain',
    'wildlife',
    'culture',
    'goods',
    'phenomenon',
    'legend',
  ]),
  name: z.string(),
  name_en: z.string(),
  location: LonLat.optional(),
  /** 航行經過多少公里內自動發現（landmark 類常用） */
  discover_radius_km: z.number().positive().optional(),
  /** 航行穿越這條緯線時發現（赤道、回歸線、極圈） */
  line: z
    .enum([
      'equator',
      'tropic-of-cancer',
      'tropic-of-capricorn',
      'arctic-circle',
      'antarctic-circle',
    ])
    .optional(),
  domains: z.array(LearningDomain).min(1),
  body: z.string().min(20, '知識卡內容至少 20 字'),
  source: z.string().min(1, '每張知識卡必須標註資料來源'),
  /** 傳說類必附科學對照（企畫書 10.3） */
  science_note: z.string().optional(),
  /**
   * 傳聞（企畫書 v2 4.5）：在港口聽到的地理線索。
   * 有傳聞的知識卡不會自動發現，玩家要依線索推理位置、航行到附近後「調查」。
   */
  rumor: z
    .object({
      /** 在哪個港口聽到 */
      port: Id,
      /** 說話的人 */
      from: z.string(),
      text: z.string().min(20),
      /** 離 location 多近可以調查 */
      investigate_km: z.number().positive(),
    })
    .optional(),
  reviewed: z.boolean().default(false),
});
export type CodexEntry = z.infer<typeof CodexEntry>;

/** 任務步驟（企畫書 7.3） */
export const QuestStep = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('navigate'),
    target: Id,
    /** 提示等級 1～4，對應 Tier 的輔助程度 */
    hint_level: z.number().int().min(1).max(4).default(1),
    text: z.string().optional(),
  }),
  z.object({ type: z.literal('discover'), target: Id, text: z.string().optional() }),
  z.object({
    type: z.literal('quiz'),
    question: z.string(),
    choices: z.array(z.string()).min(2).max(4),
    answer: z.number().int().min(0),
    explanation: z.string().optional(),
  }),
  /** 座標定位挑戰（企畫書 5.4）：在海圖上點出指定位置 */
  z.object({
    type: z.literal('locate'),
    prompt: z.string(),
    target: LonLat,
    tolerance_km: z.number().positive().default(250),
    explanation: z.string().optional(),
  }),
  z.object({
    type: z.literal('dialogue'),
    speaker: z.string(),
    lines: z.array(z.string()).min(1),
  }),
  /** 運貨：把幾擔某種貨運到指定港口（貨物要自己在產地買） */
  z.object({
    type: z.literal('deliver'),
    good: Id,
    qty: z.number().int().positive(),
    target: Id,
    text: z.string().optional(),
  }),
]);
export type QuestStep = z.infer<typeof QuestStep>;

export const Quest = z.object({
  id: Id,
  title: z.string(),
  scenario: Id,
  chapter: z.number().int().min(0),
  tier: Tier,
  kind: z.enum(['main', 'region', 'academy', 'daily', 'pack', 'hidden']),
  giver_port: Id,
  objectives: z.array(LearningObjective).min(1, '每個任務至少一個學習目標'),
  prerequisites: z.array(Id).default([]),
  steps: z.array(QuestStep).min(1),
  reward: z
    .object({
      xp: z.number().int().nonnegative().default(0),
      gold: z.number().int().nonnegative().default(0),
      reputation: z.number().int().nonnegative().default(0),
      unlock_ports: z.array(Id).default([]),
      /** 完成任務時登錄的知識卡（例如沒有地點的氣候現象） */
      codex: z.array(Id).default([]),
    })
    .default({ xp: 0, gold: 0, reputation: 0, unlock_ports: [], codex: [] }),
});
export type Quest = z.infer<typeof Quest>;

/** 船員（企畫書 9.3）：虛構人物，各有職業與家鄉港口 */
export const CrewMember = z.object({
  id: Id,
  name: z.string(),
  profession: z.enum(['helmsman', 'lookout', 'cook', 'naturalist', 'interpreter', 'doctor']),
  /** 在這個港口的酒館招募 */
  home_port: Id,
  hire_cost: z.number().int().nonnegative(),
  bio: z.string().min(10),
  /** 會說的語言或專長，顯示在招募卡上 */
  specialty: z.string().optional(),
  /** 航行中會說的話：家鄉與專長的小知識 */
  lines: z.array(z.string()).default([]),
});
export type CrewMember = z.infer<typeof CrewMember>;

/** 劇本（企畫書 3.3） */
export const Scenario = z.object({
  id: Id,
  name: z.string(),
  name_en: z.string(),
  tagline: z.string(),
  description: z.string(),
  culture: z.string(),
  era: z.string(),
  inspiration: z.string(),
  home_port: Id,
  home_region: Id,
  /** 這個劇本可購買的船型（第一個是起始船） */
  ships: z.array(z.string()).default([]),
  /** 開局即解鎖、顯示在海圖上的港口（家鄉港口一定包含在內） */
  starting_ports: z.array(Id).default([]),
  /** 各海域區在此劇本中的 Tier */
  region_tiers: z.record(Id, Tier),
  starting_ship: z.string(),
  /** 劇本開始日期（西曆 YYYY-MM-DD），決定出發時的季節與季風 */
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '日期格式為 YYYY-MM-DD'),
  recommended: z.boolean().default(false),
  /** 涵蓋的學習領域 */
  domains: z.array(LearningDomain).min(1),
  estimated_hours: z.number().positive(),
  chapters: z
    .array(
      z.object({
        index: z.number().int().min(0),
        title: z.string(),
        tier: Tier,
        summary: z.string(),
      }),
    )
    .min(1),
  /** 酒館裡的對手船長（虛構人物） */
  rival: z
    .object({
      name: z.string(),
      /** 從哪裡來 */
      from: z.string(),
      /** 第一次見面的樣子 */
      look: z.string(),
    })
    .default({ name: '陸天行', from: '廣州', look: '一位穿著綢緞長袍的年輕船長' }),
  /** 從這個劇本的文化視角怎麼稱呼各港口（沒列的用港口資料的名字） */
  port_names: z.record(Id, z.string()).default({}),
  /** 共用文字（知識卡、船員、路人、事件）裡的地名換成這個劇本的叫法：舊名 → 新名 */
  text_names: z.record(z.string(), z.string()).default({}),
  /** 船長一開始戴的帽子（沒有則戴幞頭） */
  start_hat: z.string().optional(),
  /** 第一次出海時的季風小教室（沒有則用東亞的冬季風說明） */
  first_voyage_lesson: z.string().optional(),
  /** 海圖上可以打開的歷史航線（依港口順序連成海上航線） */
  historic_routes: z
    .array(
      z.object({
        name: z.string(),
        ports: z.array(Id).min(2),
      }),
    )
    .default([]),
  /** 歷史航線的說明與資料來源 */
  historic_note: z.string().optional(),
  /** 完成某個主線任務時的結局文字 */
  endings: z.record(Id, z.object({ title: z.string(), text: z.string() })).default({}),
});
export type Scenario = z.infer<typeof Scenario>;

/** 整包內容，供載入後做交叉參照驗證 */
export interface ContentBundle {
  regions: SeaRegion[];
  ports: Port[];
  codex: CodexEntry[];
  quests: Quest[];
  scenarios: Scenario[];
  crew: CrewMember[];
}
