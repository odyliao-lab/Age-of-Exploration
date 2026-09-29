/**
 * 辨位（企畫書 v2 4.2）：推算航法、牽星術與沿岸目視定位。純函式。
 *
 * - 在看不見陸地的海上，船長只能用「航向 × 航速 × 時間」推算位置（推算航法），
 *   誤差會隨天數累積，以一個向量（東、北兩個分量，公里）表示；
 * - 夜晚用牽星板量北辰星（北極星）的高度，可以知道緯度，把南北方向的誤差歸零；
 *   但經度量不出來，東西方向的誤差仍在（這正是大航海時代最難的問題）；
 * - 看得見陸地時，對照岸形與山形就知道自己在哪裡，誤差很快縮小。
 */
import type { LonLat } from '@/data/schema';
import { destinationPoint } from './events';

export interface NavState {
  /** 推算位置相對於真實位置的偏差（公里），東為正、北為正 */
  errorE: number;
  errorN: number;
  /** 上一次觀星的夜晚編號（每晚只能量一次） */
  lastSightDay: number;
  /** 上一次更新時看得見陸地（用來在剛看見陸地時提醒） */
  landInSight?: boolean;
}

export const NAV_FIXED: NavState = { errorE: 0, errorN: 0, lastSightDay: -1 };

/** 遠洋每天累積的推算誤差（公里），再乘上天文學等加成的迷航倍率 */
export const DR_ERROR_KM_PER_DAY = 14;
/** 看得見陸地時每天縮小的比例（指數衰減速率） */
export const COAST_FIX_RATE = 3;
/** 看得見陸地時誤差不會小於這個值 */
export const COAST_FIX_FLOOR_KM = 4;
/** 位置誤差超過這個值就無法確認傳聞地點 */
export const INVESTIGATE_MAX_ERROR_KM = 60;

/**
 * 牽星板的「指」：鄭和船隊用 12 塊大小不同的烏木板量星高，1 指約 1.9°（學者推算，各家略有差異），
 * 另有象牙小片量「角」，1 指 = 4 角。
 */
export const ZHI_DEG = 1.9;
export const JIAO_PER_ZHI = 4;
export const MAX_ZHI = 12;

export function navErrorKm(nav: NavState): number {
  return Math.hypot(nav.errorE, nav.errorN);
}

/** 由真實位置與誤差得到船長以為自己所在的位置 */
export function estimatedPosition(truth: LonLat, nav: NavState): LonLat {
  const km = navErrorKm(nav);
  if (km < 0.01) return truth;
  const bearing = (Math.atan2(nav.errorE, nav.errorN) * 180) / Math.PI;
  return destinationPoint(truth, bearing, km);
}

/**
 * 以天數決定的偽隨機方向（可重現，不消耗遊戲亂數）。
 * 誤差主要來自摸不清的洋流與風壓，方向幾天才變一次，所以誤差會穩定累積。
 */
function driftBearing(day: number): number {
  const k = Math.floor(day / 4);
  const h = Math.sin(k * 12.9898 + 78.233) * 43758.5453;
  return (h - Math.floor(h)) * 360;
}

/**
 * 推算誤差隨時間變化。
 * @param rate 迷航倍率（天文學、技能、船員）；在霧中另外加倍
 * @param landInSight 看得見陸地時用岸形校正
 */
export function advanceNav(
  nav: NavState,
  day: number,
  days: number,
  rate: number,
  landInSight: boolean,
): NavState {
  if (days <= 0) return nav;
  if (landInSight) {
    const k = Math.exp(-COAST_FIX_RATE * days);
    const km = navErrorKm(nav);
    if (km <= COAST_FIX_FLOOR_KM) return nav;
    const target = Math.max(COAST_FIX_FLOOR_KM, km * k);
    const s = target / km;
    return { ...nav, errorE: nav.errorE * s, errorN: nav.errorN * s };
  }
  const grow = DR_ERROR_KM_PER_DAY * rate * days;
  const b = (driftBearing(day) * Math.PI) / 180;
  return {
    ...nav,
    errorE: nav.errorE + Math.sin(b) * grow,
    errorN: nav.errorN + Math.cos(b) * grow,
  };
}

// ---------------------------------------------------------------- 牽星術

export type StarKind = 'polaris' | 'crux';

export interface StarTarget {
  kind: StarKind;
  /** 星名（鄭和航海圖的稱呼） */
  name: string;
  /** 真實仰角（度） */
  altitude: number;
  /** 由仰角換算緯度的方式說明 */
  howTo: string;
}

/**
 * 要量的星：北半球量北辰星（北極星）；到了南半球北辰星沉到地平線下，
 * 改用燈籠骨星（南十字星）找出南天極，量南天極的高度。
 */
export function starTarget(lat: number): StarTarget {
  if (lat >= 0) {
    return {
      kind: 'polaris',
      name: '北辰星（北極星）',
      altitude: lat,
      howTo: '北辰星的高度約等於所在地的北緯度數。',
    };
  }
  return {
    kind: 'crux',
    name: '燈籠骨星（南十字星）所指的南天極',
    altitude: -lat,
    howTo: '南天極的高度約等於所在地的南緯度數。',
  };
}

export function jiaoToDeg(jiao: number): number {
  return (jiao / JIAO_PER_ZHI) * ZHI_DEG;
}

export function degToJiao(deg: number): number {
  return Math.round((deg / ZHI_DEG) * JIAO_PER_ZHI);
}

/** 「4 指 2 角」 */
export function formatZhi(jiao: number): string {
  const zhi = Math.floor(jiao / JIAO_PER_ZHI);
  const rest = jiao % JIAO_PER_ZHI;
  if (zhi === 0 && rest === 0) return '0 指';
  if (rest === 0) return `${zhi} 指`;
  if (zhi === 0) return `${rest} 角`;
  return `${zhi} 指 ${rest} 角`;
}

export type SightQuality = 'exact' | 'good' | 'poor';

export interface SightResult {
  /** 量得的仰角換算的緯度（南緯為負） */
  measuredLat: number;
  /** 量得的仰角與真實仰角的差（度，正值表示量高了） */
  errorDeg: number;
  quality: SightQuality;
  /** 誤差換算的公里數 */
  errorKm: number;
}

const KM_PER_DEG_LAT = 111.2;

export function takeSight(trueLat: number, jiao: number): SightResult {
  const target = starTarget(trueLat);
  const measured = jiaoToDeg(jiao);
  const errorDeg = measured - target.altitude;
  const abs = Math.abs(errorDeg);
  const quality: SightQuality = abs <= 0.5 ? 'exact' : abs <= 1.2 ? 'good' : 'poor';
  const measuredLat = target.kind === 'polaris' ? measured : -measured;
  return { measuredLat, errorDeg, quality, errorKm: abs * KM_PER_DEG_LAT };
}

/**
 * 觀星後的推算誤差：南北方向改用量得的緯度（量得準就幾乎沒有誤差）；
 * 經度量不出來，東西方向的誤差保留。
 */
export function applySight(nav: NavState, trueLat: number, sight: SightResult, day: number) {
  const errorN = (sight.measuredLat - trueLat) * KM_PER_DEG_LAT;
  return { ...nav, errorN, lastSightDay: nightIndex(day) };
}

export const SIGHT_XP: Record<SightQuality, number> = { exact: 25, good: 15, poor: 5 };

// ---------------------------------------------------------------- 晝夜

/** 一天中的時刻（0–24），第 0 天從午夜開始 */
export function hourOf(day: number): number {
  return (((day % 1) + 1) % 1) * 24;
}

/** 可以觀星的夜晚：晚上 7 點到清晨 5 點 */
export function isNight(day: number): boolean {
  const h = hourOf(day);
  return h >= 19 || h < 5;
}

/** 距離下一次入夜還有幾天（已經是夜晚回傳 0） */
export function daysUntilNight(day: number): number {
  if (isNight(day)) return 0;
  return (19 - hourOf(day)) / 24;
}

/** 今晚能不能觀星：同一個夜晚只能量一次（清晨 5 點前算前一晚） */
export function canSightTonight(nav: NavState, day: number): boolean {
  return nightIndex(day) !== nav.lastSightDay;
}

/** 夜晚編號：晚上 7 點到隔天清晨 5 點算同一晚 */
export function nightIndex(day: number): number {
  return Math.floor(day - 5 / 24);
}

/** 夜色濃淡 0–1（畫面用）：黃昏與黎明漸變 */
export function darkness(day: number): number {
  const h = hourOf(day);
  if (h >= 20 || h < 4) return 1;
  if (h >= 18) return (h - 18) / 2;
  if (h < 6) return (6 - h) / 2;
  return 0;
}

/** 介面顯示的時刻，例如「晚上 8 點」 */
export function timeLabel(day: number): string {
  const h = Math.floor(hourOf(day));
  if (h < 5) return `凌晨 ${h === 0 ? 12 : h} 點`;
  if (h < 12) return `上午 ${h} 點`;
  if (h === 12) return '中午 12 點';
  if (h < 18) return `下午 ${h - 12} 點`;
  return `晚上 ${h - 12} 點`;
}
