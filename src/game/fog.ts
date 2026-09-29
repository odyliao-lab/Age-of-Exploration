/**
 * 探索迷霧（企畫書 4.2）：0.5° 格網的已探索旗標。
 * 以位元組陣列保存，存檔時轉成 base64。
 */
import type { LonLat } from '@/data/schema';
import { EARTH_RADIUS_KM } from '@/geo/geo';

export const FOG_RES = 0.5;
export const FOG_COLS = Math.round(360 / FOG_RES);
export const FOG_ROWS = Math.round(180 / FOG_RES);

export function createFog(): Uint8Array {
  return new Uint8Array(FOG_COLS * FOG_ROWS);
}

/**
 * 揭開以 center 為圓心、radiusKm 為半徑的範圍。
 * 回傳新揭開的格子索引（沒有新揭開時為空陣列），供渲染端局部更新。
 */
export function revealAround(fog: Uint8Array, [lon, lat]: LonLat, radiusKm: number): number[] {
  const changed: number[] = [];
  const dLat = (radiusKm / EARTH_RADIUS_KM) * (180 / Math.PI);
  const cosLat = Math.max(0.05, Math.cos((lat * Math.PI) / 180));
  const dLon = dLat / cosLat;
  const r0 = Math.max(0, Math.floor((90 - (lat + dLat)) / FOG_RES));
  const r1 = Math.min(FOG_ROWS - 1, Math.floor((90 - (lat - dLat)) / FOG_RES));
  for (let r = r0; r <= r1; r++) {
    const cellLat = 90 - (r + 0.5) * FOG_RES;
    const ny = (cellLat - lat) / dLat;
    if (Math.abs(ny) > 1) continue;
    const half = dLon * Math.sqrt(1 - ny * ny);
    const c0 = Math.floor((lon - half + 180) / FOG_RES);
    const c1 = Math.floor((lon + half + 180) / FOG_RES);
    for (let c = c0; c <= c1; c++) {
      const cc = ((c % FOG_COLS) + FOG_COLS) % FOG_COLS;
      const i = r * FOG_COLS + cc;
      if (!fog[i]) {
        fog[i] = 1;
        changed.push(i);
      }
    }
  }
  return changed;
}

export function exploredFraction(fog: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < fog.length; i++) n += fog[i];
  return n / fog.length;
}

export function encodeFog(fog: Uint8Array): string {
  const bits = new Uint8Array(Math.ceil(fog.length / 8));
  for (let i = 0; i < fog.length; i++) if (fog[i]) bits[i >> 3] |= 1 << (i & 7);
  let s = '';
  for (let i = 0; i < bits.length; i++) s += String.fromCharCode(bits[i]);
  return btoa(s);
}

export function decodeFog(data: string): Uint8Array {
  const fog = createFog();
  const s = atob(data);
  for (let i = 0; i < fog.length; i++) {
    if (s.charCodeAt(i >> 3) & (1 << (i & 7))) fog[i] = 1;
  }
  return fog;
}
