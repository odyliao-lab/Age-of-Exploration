/**
 * 地理計算：距離、方位、沿航段內插。
 * 航段在等距圓柱海圖上畫成直線，因此移動也以經緯度線性內插，
 * 讓船的位置與畫面上的航線一致；距離則以大圓距離計算。
 */
import type { LonLat } from '@/data/schema';

export const EARTH_RADIUS_KM = 6371;
export const KM_PER_NM = 1.852;

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** 經度換算到 [-180, 180) 之間（海圖東西兩端在換日線接起來） */
export function wrapLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/** 從經度 a 到經度 b 的最短差值（-180～180）：跨過換日線時走近的那一邊 */
export function lonDelta(a: number, b: number): number {
  return wrapLon(b - a);
}

/** 兩點大圓距離（公里） */
export function distanceKm([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** 沿等距圓柱直線量測的航段長度（公里），分段累加大圓距離 */
export function legLengthKm(a: LonLat, b: LonLat): number {
  const steps = Math.max(1, Math.ceil(Math.hypot(lonDelta(a[0], b[0]), b[1] - a[1]) / 0.5));
  let total = 0;
  let prev = a;
  for (let i = 1; i <= steps; i++) {
    const p = lerpLonLat(a, b, i / steps);
    total += distanceKm(prev, p);
    prev = p;
  }
  return total;
}

export function lerpLonLat(a: LonLat, b: LonLat, t: number): LonLat {
  return [wrapLon(a[0] + lonDelta(a[0], b[0]) * t), a[1] + (b[1] - a[1]) * t];
}

/** 初始方位角（度，0 = 北，順時針） */
export function bearingDeg([lon1, lat1]: LonLat, [lon2, lat2]: LonLat): number {
  const y = Math.sin(rad(lon2 - lon1)) * Math.cos(rad(lat2));
  const x =
    Math.cos(rad(lat1)) * Math.sin(rad(lat2)) -
    Math.sin(rad(lat1)) * Math.cos(rad(lat2)) * Math.cos(rad(lon2 - lon1));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

const COMPASS_16 = [
  '北',
  '北北東',
  '東北',
  '東北東',
  '東',
  '東南東',
  '東南',
  '南南東',
  '南',
  '南南西',
  '西南',
  '西南西',
  '西',
  '西北西',
  '西北',
  '北北西',
];

/** 十六方位（企畫書 2.1 領域 A） */
export function compass16(bearing: number): string {
  return COMPASS_16[Math.round((((bearing % 360) + 360) % 360) / 22.5) % 16];
}

/** 等距圓柱海圖上的畫面方向（度，0 = 上，順時針），用於船頭朝向 */
export function screenHeadingDeg(a: LonLat, b: LonLat): number {
  return (deg(Math.atan2(lonDelta(a[0], b[0]), b[1] - a[1])) + 360) % 360;
}
