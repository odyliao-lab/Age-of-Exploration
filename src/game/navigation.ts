/**
 * 辨位（企畫書 v2 4.2）：日夜、牽星術、航位推算的誤差。
 *
 * - 遊戲第 0 天從早上 6 點開始；晚上 7 點到清晨 5 點是夜晚，才看得到星星。
 * - 牽星術：鄭和船隊用「牽星板」量星星離海平面的高度。北極星的高度約等於所在的緯度，
 *   所以量出北極星有幾「指」高，就能算出緯度。一指約 1.9°（學界說法約 1.6°～1.9°，這裡取整數好算的近似）。
 * - 航位推算：沒有定位時，只能靠航向、航速與時間推算位置，誤差隨天數累積；
 *   靠近認得的港口或觀星成功時，誤差重新變小。
 */
import type { LonLat } from '@/data/schema';
import { compass16 } from '@/geo/geo';
import { destinationPoint } from './events';

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

/** 正午量太陽定位後的誤差（公里） */
export const SUN_FIX_KM = 45;

/** 某月某日太陽直射的緯度（赤緯，近似公式）：夏至約北緯 23.4°、冬至約南緯 23.4° */
export function solarDeclination(month: number, dayOfMonth: number): number {
  const DAYS = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const doy = DAYS[month - 1] + dayOfMonth;
  return 23.44 * Math.sin((2 * Math.PI * (doy - 81)) / 365);
}

/** 正午太陽的高度（仰角）：90° 減去所在緯度與太陽直射緯度的差 */
export function noonSunAltitude(lat: number, declination: number): number {
  return 90 - Math.abs(lat - declination);
}

/** 現在是不是正午前後（11～13 點），太陽最高、量得最準 */
export function isNoon(day: number): boolean {
  const h = hourOfDay(day);
  return h >= 11 && h <= 13;
}

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

// ---------------------------------------------------------------- 測深

/** 一托（兩臂張開的長度）約幾公尺；明代針路簿用「打水幾托」記錄水深 */
export const METERS_PER_TUO = 1.7;
/** 測深繩的長度（托） */
export const SOUNDING_LINE_TUO = 100;
/** 陸地在這個距離以內，測深就能幫忙確認位置 */
export const SOUNDING_FIX_KM = 25;
/** 靠測深確認位置後的誤差上限（公里） */
export const SOUNDING_FIX_ERROR_KM = 25;

/** 寬廣的大陸棚：水很淺，但可能看不到岸 */
const SHELVES: { box: [number, number, number, number]; name: string }[] = [
  { box: [117, 22, 125, 35], name: '東海與臺灣海峽的大陸棚' },
  { box: [99, -7, 117, 8], name: '巽他陸棚' },
  { box: [99, 5, 105, 13.5], name: '巽他陸棚' },
  { box: [48, 24, 56.5, 30], name: '波斯灣的淺海' },
];

export function shelfAt([lon, lat]: LonLat): string | null {
  const s = SHELVES.find(({ box: b }) => lon >= b[0] && lat >= b[1] && lon <= b[2] && lat <= b[3]);
  return s?.name ?? null;
}

export interface Sounding {
  /** 水深（托）；null 表示放完繩子還探不到底 */
  tuo: number | null;
  /** 海底底質 */
  bottom: string | null;
  /** 最近的陸地距離與方位（120 公里內） */
  landKm: number | null;
  landBearing: number | null;
  /** 位在哪個大陸棚上 */
  shelf: string | null;
}

const PROBE_KM = [3, 6, 10, 15, 20, 30, 45, 60, 80, 100, 120];

/**
 * 放下測深錘：由離陸地多遠推估水深與底質（簡化模型）。
 * 大陸棚上水淺而平；離開陸棚後水深隨離岸距離快速增加。
 */
export function soundAt(pos: LonLat, isLand: (p: LonLat) => boolean): Sounding {
  let landKm: number | null = null;
  let landBearing: number | null = null;
  for (const km of PROBE_KM) {
    for (let b = 0; b < 360; b += 22.5) {
      if (isLand(destinationPoint(pos, b, km))) {
        landKm = km;
        landBearing = b;
        break;
      }
    }
    if (landKm !== null) break;
  }
  const shelf = shelfAt(pos);
  const tropical = Math.abs(pos[1]) < 23.5;
  let tuo: number | null;
  if (shelf) tuo = Math.round(Math.min(45, 4 + (landKm ?? 120) * 0.35));
  else if (landKm !== null) tuo = Math.round(3 + landKm * 1.6);
  else tuo = null;
  if (tuo !== null && tuo > SOUNDING_LINE_TUO) tuo = null;
  let bottom: string | null = null;
  if (tuo !== null) {
    if (landKm !== null && landKm <= 10 && tropical && !shelf) bottom = '白色的珊瑚碎屑';
    else if (landKm !== null && landKm <= 8) bottom = '細沙和碎貝殼';
    else bottom = '灰黑色的軟泥';
  }
  return { tuo, bottom, landKm, landBearing, shelf };
}

/** 測深結果的一段話 */
export function soundingText(s: Sounding): string {
  if (s.tuo === null) {
    return `放完 ${SOUNDING_LINE_TUO} 托長的測深繩還探不到底——這裡是深海，離陸地還遠。`;
  }
  let text = `打水 ${s.tuo} 托（約 ${Math.round(s.tuo * METERS_PER_TUO)} 公尺），測深錘底沾上了${s.bottom}。`;
  if (s.landKm !== null && s.landBearing !== null && s.landKm <= 60) {
    text += `水越來越淺，陸地應該在${compass16(s.landBearing)}方約 ${s.landKm} 公里內。`;
  }
  if (s.shelf && (s.landKm === null || s.landKm > 60)) {
    text += `看不到岸，水卻這麼淺——我們正在${s.shelf}上。`;
  }
  return text;
}
