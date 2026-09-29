/**
 * 辨位（企畫書 v2 4.2）：日夜、牽星術、航位推算的誤差。
 *
 * - 遊戲第 0 天從早上 6 點開始；晚上 7 點到清晨 5 點是夜晚，才看得到星星。
 * - 牽星術：鄭和船隊用「牽星板」量星星離海平面的高度。北極星的高度約等於所在的緯度，
 *   所以量出北極星有幾「指」高，就能算出緯度。一指約 1.9°（學界說法約 1.6°～1.9°，這裡取整數好算的近似）。
 * - 航位推算：沒有定位時，只能靠航向、航速與時間推算位置，誤差隨天數累積；
 *   靠近認得的港口或觀星成功時，誤差重新變小。
 */

/** 第 0 天從早上幾點開始 */
export const DAY_START_HOUR = 6;
/** 一指等於幾度（近似） */
export const DEG_PER_ZHI = 1.9;
/** 一指分四角 */
export const JIAO_PER_ZHI = 4;
/** 沒有定位時，每天累積的位置誤差（公里） */
export const DRIFT_KM_PER_DAY = 14;
/** 北極星要在海平面上至少這個高度才量得準 */
export const MIN_POLARIS_LAT = 3;

export function hourOfDay(day: number): number {
  return (((day * 24 + DAY_START_HOUR) % 24) + 24) % 24;
}

export function isNight(day: number): boolean {
  const h = hourOfDay(day);
  return h >= 19 || h < 5;
}

/** 第幾個夜晚（每晚只能觀星一次） */
export function nightIndex(day: number): number {
  return Math.floor((day * 24 + DAY_START_HOUR - 19) / 24);
}

/** 畫面用的黑暗程度 0（白天）到 1（深夜），黃昏與黎明漸變 */
export function darkness(day: number): number {
  const h = hourOfDay(day);
  if (h >= 7 && h < 17) return 0;
  if (h >= 17 && h < 20) return (h - 17) / 3;
  if (h >= 4 && h < 7) return 1 - (h - 4) / 3;
  return 1;
}

export function timeLabel(day: number): string {
  const h = Math.floor(hourOfDay(day));
  const part =
    h < 5
      ? '深夜'
      : h < 7
        ? '黎明'
        : h < 11
          ? '上午'
          : h < 13
            ? '中午'
            : h < 17
              ? '下午'
              : h < 19
                ? '黃昏'
                : '夜晚';
  return `${part} ${String(h).padStart(2, '0')}:00`;
}

export function canSightPolaris(lat: number): boolean {
  return lat >= MIN_POLARIS_LAT;
}

/** 在某緯度看到的北極星高度，換算成指 */
export function polarisZhi(lat: number): number {
  return Math.max(0, lat) / DEG_PER_ZHI;
}

export function latitudeFromZhi(zhi: number): number {
  return zhi * DEG_PER_ZHI;
}

export interface NavFix {
  /** 上次定位的遊戲日 */
  day: number;
  /** 當時的誤差（公里） */
  errorKm: number;
}

/** 目前的位置誤差：從上次定位開始累積；drift 為倍率（天文學、領航員會降低） */
export function positionError(fix: NavFix, day: number, drift = 1): number {
  return fix.errorKm + Math.max(0, day - fix.day) * DRIFT_KM_PER_DAY * drift;
}

export type SightingQuality = 'good' | 'ok' | 'miss';

export interface SightingResult {
  quality: SightingQuality;
  /** 量到的緯度 */
  latitude: number;
  /** 與真實緯度的差（度） */
  diffDeg: number;
  /** 觀星後的位置誤差（公里） */
  errorKm: number;
}

/** 依量到的指數判斷觀星結果：差半指以內很準，差一指以內還可以，更多就沒量準 */
export function judgeSighting(trueLat: number, measuredZhi: number): SightingResult {
  const latitude = latitudeFromZhi(measuredZhi);
  const diffZhi = Math.abs(measuredZhi - polarisZhi(trueLat));
  const diffDeg = Math.abs(latitude - trueLat);
  if (diffZhi <= 0.5) return { quality: 'good', latitude, diffDeg, errorKm: 15 };
  if (diffZhi <= 1) return { quality: 'ok', latitude, diffDeg, errorKm: 45 };
  return { quality: 'miss', latitude, diffDeg, errorKm: Infinity };
}
