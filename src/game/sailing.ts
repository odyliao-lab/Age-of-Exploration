/**
 * 親手駕船（企畫書 v2 4.1）：純函式的帆船物理。
 *
 * - 航向由玩家設定，船以有限的轉向速度轉過去；
 * - 船速取決於「帆與風的角度」（帆船極線圖）、帆裝種類、升帆程度與風力；
 * - 洋流另外把船往流向推送，所以實際航跡可能和船頭方向不同；
 * - 風在季風、信風等大尺度規律上，加上隨時間與地點緩慢變化的偏移，讓掌舵有事可做。
 *
 * 角度一律是方位角（0 = 北，順時針）。
 */
import type { LonLat } from '@/data/schema';
import type { Current, Wind } from './environment';
import type { Rig } from './progression';

/** 0 收帆、1 半帆、2 滿帆 */
export type SailSetting = 0 | 1 | 2;

export interface Helm {
  /** 玩家設定的航向 */
  course: number;
  sail: SailSetting;
}

export const SAIL_POWER: Record<SailSetting, number> = { 0: 0, 1: 0.55, 2: 1 };

/** 每天最多轉向的角度（船越大轉得越慢，之後可依船型調整） */
export const TURN_DEG_PER_DAY = 360;

/** 洋流強度 1 時每天把船推送的距離 */
export const CURRENT_KM_PER_DAY = 70;

export function normDeg(d: number): number {
  return ((d % 360) + 360) % 360;
}

/** 兩個方位角的差（-180, 180] */
export function angleDiff(to: number, from: number): number {
  const d = normDeg(to - from);
  return d > 180 ? d - 360 : d;
}

/** 朝目標航向轉動，一步最多轉 maxDeg 度 */
export function turnToward(heading: number, course: number, maxDeg: number): number {
  const d = angleDiff(course, heading);
  if (Math.abs(d) <= maxDeg) return normDeg(course);
  return normDeg(heading + Math.sign(d) * maxDeg);
}

/**
 * 船頭與「風吹來的方向」的夾角：0° 是正對著風（頂風），180° 是風從正後方吹來（順風）。
 */
export function angleOffWind(heading: number, wind: Wind): number {
  const from = normDeg(wind.toward + 180);
  return Math.abs(angleDiff(heading, from));
}

export type PointOfSail = '頂風' | '迎風' | '橫風' | '後側風' | '順風';

export function pointOfSail(angle: number, rig: Rig): PointOfSail {
  if (angle < NO_GO[rig]) return '頂風';
  if (angle < 75) return '迎風';
  if (angle < 110) return '橫風';
  if (angle < 155) return '後側風';
  return '順風';
}

/** 各帆裝能航行的最小夾角：小於這個角度帆會失去動力（頂風區） */
export const NO_GO: Record<Rig, number> = { lateen: 40, lug: 45, square: 65 };

/**
 * 帆船極線圖（簡化）：回傳 0–1 的效率。
 * 中式硬帆與三角帆在橫風到後側風最快；橫帆則是順風最快。
 */
export function sailPolar(angle: number, rig: Rig): number {
  const pts: Record<Rig, [number, number][]> = {
    lateen: [
      [40, 0],
      [50, 0.5],
      [90, 0.95],
      [130, 1],
      [180, 0.75],
    ],
    lug: [
      [45, 0],
      [55, 0.45],
      [90, 0.85],
      [125, 1],
      [180, 0.85],
    ],
    square: [
      [65, 0],
      [80, 0.4],
      [110, 0.8],
      [150, 1],
      [180, 1],
    ],
  };
  const p = pts[rig];
  if (angle <= p[0][0]) return 0;
  for (let i = 1; i < p.length; i++) {
    if (angle <= p[i][0]) {
      const [a0, v0] = p[i - 1];
      const [a1, v1] = p[i];
      return v0 + ((angle - a0) / (a1 - a0)) * (v1 - v0);
    }
  }
  return p[p.length - 1][1];
}

/** 風力換算成航速倍率：無風時幾乎不動，強風最多 1.1 倍 */
export function windPower(strength: number): number {
  if (strength <= 0.05) return 0.03;
  return Math.min(1.1, 0.15 + 1.05 * strength);
}

/**
 * 緩慢變化的風：大尺度風系加上偏移。風越弱（季風轉換期、無風帶）方向越不穩定。
 * 以位置與日數決定，同樣的時間地點永遠得到同樣的風（可重現、可測試）。
 */
export function gustyWind(base: Wind, [lon, lat]: LonLat, day: number): Wind {
  const wobble =
    Math.sin(day * 0.9 + lon * 0.37) * 0.6 + Math.sin(day * 0.31 + lat * 0.53 + 1.7) * 0.4;
  const range = base.strength < 0.3 ? 120 : 18;
  const gust = 1 + 0.15 * Math.sin(day * 1.7 + lat * 0.8 + lon * 0.2);
  return {
    ...base,
    toward: normDeg(base.toward + wobble * range),
    strength: Math.max(0, Math.min(1, base.strength * gust)),
  };
}

export interface Motion {
  /** 相對於水的船速（公里／日） */
  throughWater: number;
  /** 對地航向與航速（含洋流） */
  course: number;
  speed: number;
  /** 帆的效率 0–1，介面用來顯示「帆吃不吃得到風」 */
  efficiency: number;
  pointOfSail: PointOfSail;
}

export function motion(
  heading: number,
  sail: SailSetting,
  wind: Wind,
  current: Current | null,
  rig: Rig,
  baseKmPerDay: number,
): Motion {
  const angle = angleOffWind(heading, wind);
  const efficiency = sailPolar(angle, rig);
  const throughWater = baseKmPerDay * SAIL_POWER[sail] * efficiency * windPower(wind.strength);
  // 向量相加：船速（沿船頭）＋洋流
  const h = (heading * Math.PI) / 180;
  let east = Math.sin(h) * throughWater;
  let north = Math.cos(h) * throughWater;
  if (current) {
    const c = (current.toward * Math.PI) / 180;
    east += Math.sin(c) * current.strength * CURRENT_KM_PER_DAY;
    north += Math.cos(c) * current.strength * CURRENT_KM_PER_DAY;
  }
  const speed = Math.hypot(east, north);
  return {
    throughWater,
    course: speed > 0 ? normDeg((Math.atan2(east, north) * 180) / Math.PI) : heading,
    speed,
    efficiency,
    pointOfSail: pointOfSail(angle, rig),
  };
}

/** 公里／日換算成節（海里／小時），介面顯示用 */
export function knots(kmPerDay: number): number {
  return kmPerDay / 1.852 / 24;
}
