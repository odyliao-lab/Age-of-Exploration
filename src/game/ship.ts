/**
 * 船況（企畫書 5.3、5.5）：淡水、糧食、士氣、船體耐久，
 * 港口補給與修理，以及風暴遭遇與沉船。
 */
import type { LonLat } from '@/data/schema';
import type { StormRisk } from './environment';

/** 船隻規格（第 4 週會擴充成可升級的船型） */
export interface ShipType {
  id: string;
  name: string;
  /** 淡水、糧食各可存放的天數 */
  supplyDays: number;
  /** 速度倍率 */
  speed: number;
}

export const SHIP_TYPES: Record<string, ShipType> = {
  junk: { id: 'junk', name: '戎克船', supplyDays: 40, speed: 1 },
};

export function shipType(id: string): ShipType {
  return SHIP_TYPES[id] ?? SHIP_TYPES.junk;
}

export interface Supplies {
  water: number;
  food: number;
}

export interface ShipCondition {
  supplies: Supplies;
  /** 0–100 */
  morale: number;
  /** 0–100，歸零即沉船 */
  hull: number;
  /** 自上次停泊後在海上的天數 */
  daysAtSea: number;
}

export const WATER_PRICE = 1;
export const FOOD_PRICE = 2;
export const REPAIR_PRICE = 2;
/** 補給低於這個天數時提醒 */
export const LOW_SUPPLY_DAYS = 5;
export const LOW_MORALE = 30;

export function fullCondition(type: ShipType): ShipCondition {
  return {
    supplies: { water: type.supplyDays, food: type.supplyDays },
    morale: 100,
    hull: 100,
    daysAtSea: 0,
  };
}

/** 海上經過 dt 天：消耗補給、影響士氣。領導每點減少 5% 士氣流失。 */
export function passTime(c: ShipCondition, dt: number, leadership: number): ShipCondition {
  const water = Math.max(0, c.supplies.water - dt);
  const food = Math.max(0, c.supplies.food - dt);
  const daysAtSea = c.daysAtSea + dt;
  let decay = 0;
  if (daysAtSea > 10) decay += 1.5 * dt;
  if (water === 0 || food === 0) decay += 6 * dt;
  decay *= Math.max(0.5, 1 - 0.05 * (leadership - 1));
  return {
    ...c,
    supplies: { water, food },
    daysAtSea,
    morale: Math.max(0, c.morale - decay),
  };
}

/** 船況造成的航速懲罰 */
export function conditionSpeedFactor(c: ShipCondition): number {
  let f = 1;
  if (c.supplies.water === 0 || c.supplies.food === 0) f *= 0.8;
  if (c.morale < LOW_MORALE) f *= 0.85;
  return f;
}

// ---------------------------------------------------------------- 港口服務

export function resupplyCost(c: ShipCondition, type: ShipType): number {
  return (
    Math.ceil(type.supplyDays - c.supplies.water) * WATER_PRICE +
    Math.ceil(type.supplyDays - c.supplies.food) * FOOD_PRICE
  );
}

/** 在預算內盡量補滿：先補淡水，再補糧食 */
export function resupply(
  c: ShipCondition,
  type: ShipType,
  gold: number,
): { condition: ShipCondition; cost: number } {
  let budget = gold;
  const waterNeed = Math.ceil(type.supplyDays - c.supplies.water);
  const waterBuy = Math.min(waterNeed, Math.floor(budget / WATER_PRICE));
  budget -= waterBuy * WATER_PRICE;
  const foodNeed = Math.ceil(type.supplyDays - c.supplies.food);
  const foodBuy = Math.min(foodNeed, Math.floor(budget / FOOD_PRICE));
  budget -= foodBuy * FOOD_PRICE;
  return {
    condition: {
      ...c,
      supplies: {
        water: Math.min(type.supplyDays, c.supplies.water + waterBuy),
        food: Math.min(type.supplyDays, c.supplies.food + foodBuy),
      },
    },
    cost: gold - budget,
  };
}

export function repairCost(c: ShipCondition): number {
  return Math.ceil(100 - c.hull) * REPAIR_PRICE;
}

export function repair(c: ShipCondition, gold: number): { condition: ShipCondition; cost: number } {
  const points = Math.min(Math.ceil(100 - c.hull), Math.floor(gold / REPAIR_PRICE));
  return {
    condition: { ...c, hull: Math.min(100, c.hull + points) },
    cost: points * REPAIR_PRICE,
  };
}

/** 停泊休息：士氣恢復 */
export function rest(c: ShipCondition): ShipCondition {
  return { ...c, morale: 100, daysAtSea: 0 };
}

// ---------------------------------------------------------------- 風暴

export type StormChoice = 'push' | 'detour' | 'wait';

export interface StormEncounter {
  kind: 'storm';
  risk: StormRisk;
  position: LonLat;
  month: number;
}

export interface StormOutcome {
  condition: ShipCondition;
  /** 額外耗費的天數 */
  days: number;
  hullLoss: number;
  moraleLoss: number;
}

export const STORM_CHOICES: Record<StormChoice, { label: string; hint: string }> = {
  push: { label: '迎風硬闖', hint: '不耽誤行程，但船體可能嚴重受損' },
  detour: { label: '繞道避開', hint: '多花約 1.5 天，船體輕微受損' },
  wait: { label: '下錨等待風暴過去', hint: '多花約 2.5 天、消耗補給，但最安全' },
};

/** roll 是 0–1 的亂數，決定損傷落在範圍內的哪裡；領導每點減少 3% 損傷 */
export function resolveStormChoice(
  c: ShipCondition,
  choice: StormChoice,
  roll: number,
  leadership: number,
  severity: number,
): StormOutcome {
  const range: Record<StormChoice, [number, number, number, number]> = {
    // [最低船損, 最高船損, 士氣損失, 耗費天數]
    push: [18, 38, 10, 0],
    detour: [4, 12, 5, 1.5],
    wait: [0, 5, 3, 2.5],
  };
  const [lo, hi, morale, days] = range[choice];
  const reduce = Math.max(0.6, 1 - 0.03 * (leadership - 1));
  const hullLoss = Math.round((lo + (hi - lo) * roll) * severity * reduce);
  const next = passTime({ ...c, hull: Math.max(0, c.hull - hullLoss) }, days, leadership);
  return {
    condition: { ...next, morale: Math.max(0, next.morale - morale) },
    days,
    hullLoss,
    moraleLoss: morale,
  };
}

/** 沉船時損失的金幣比例：Tier 0 為 20%，每升一個 Tier 加 7.5%，Tier 4 為 50% */
export function shipwreckLoss(tier: number): number {
  return 0.2 + 0.075 * Math.max(0, Math.min(4, tier));
}

/** 沉船後被救回港口時的船況 */
export function afterShipwreck(type: ShipType): ShipCondition {
  return {
    supplies: { water: type.supplyDays / 2, food: type.supplyDays / 2 },
    morale: 60,
    hull: 60,
    daysAtSea: 0,
  };
}
