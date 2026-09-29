/**
 * 所有加成的彙總：屬性、技能、船員、船隻。
 * 遊戲規則只透過這裡讀取加成，避免數值散落在各處。
 */
import type { Captain } from './captain';
import { shipDef, type Profession } from './progression';

export interface Modifiers {
  /** 航速倍率（不含風、洋流、船況） */
  speed: number;
  /** 瞭望（揭霧）範圍倍率 */
  sight: number;
  /** 地標發現範圍倍率 */
  discovery: number;
  /** 淡水糧食消耗倍率 */
  supplyUse: number;
  /** 士氣流失倍率 */
  moraleDecay: number;
  /** 風暴損傷倍率 */
  stormDamage: number;
  /** 補給、修船價格倍率 */
  price: number;
  /** 海盜談判付出倍率 */
  pirateToll: number;
  /** 逃離海盜成功率加成 */
  fleeBonus: number;
  /** 任務經驗倍率 */
  questXp: number;
  /** 觀星答對經驗倍率 */
  starXp: number;
  /** 迷航事件機率倍率 */
  lostChance: number;
  scurvyImmune: boolean;
  /** 任務問答可排除一個錯誤選項 */
  eliminateOption: boolean;
  /** 首次抵達港口的見面禮 */
  firstVisitGold: number;
}

export interface ModifierSource {
  captain: Captain;
  skills: string[];
  crewProfessions: Profession[];
  shipTypeId: string;
}

export function modifiersFor(src: ModifierSource): Modifiers {
  const a = src.captain.attrs;
  const has = (id: string) => src.skills.includes(id);
  const crew = (p: Profession) => src.crewProfessions.filter((x) => x === p).length;
  const ship = shipDef(src.shipTypeId);
  return {
    speed:
      ship.speed *
      (1 + 0.05 * (a.navigation - 1)) *
      (1 + 0.05 * crew('helmsman')) *
      (has('trailblazer') ? 1.1 : 1),
    sight:
      (1 + 0.1 * (a.geography - 1)) * (has('eagle-eye') ? 1.5 : 1) * (1 + 0.2 * crew('lookout')),
    discovery:
      (1 + 0.1 * (a.geography - 1)) * (has('surveyor') ? 1.3 : 1) * (1 + 0.2 * crew('naturalist')),
    supplyUse: Math.pow(0.85, crew('cook')),
    moraleDecay: Math.max(0.3, 1 - 0.05 * (a.leadership - 1)) * Math.pow(0.75, crew('doctor')),
    stormDamage: Math.max(0.5, 1 - 0.03 * (a.leadership - 1)) / ship.sturdiness,
    price:
      Math.max(0.5, 1 - 0.03 * (a.diplomacy - 1)) *
      (has('bargain') ? 0.8 : 1) *
      Math.pow(0.9, crew('interpreter')),
    pirateToll:
      Math.max(0.2, 1 - 0.12 * (a.diplomacy - 1)) *
      (has('silver-tongue') ? 0.5 : 1) *
      Math.pow(0.8, crew('interpreter')),
    fleeBonus: 0.08 * (a.navigation - 1),
    questXp: has('mentor') ? 1.2 : 1,
    starXp: (1 + 0.2 * (a.astronomy - 1)) * (has('navigator-scholar') ? 2 : 1),
    lostChance: has('navigator-scholar') ? 0 : Math.max(0.2, 1 - 0.15 * (a.astronomy - 1)),
    scurvyImmune: crew('doctor') > 0,
    eliminateOption: has('deduction'),
    firstVisitGold: has('network') ? 30 : 0,
  };
}
