/**
 * 探索迷霧（企畫書 4.2、v2 的「地圖逐步繪出」）：0.125° 格網的已探索旗標。
 * 格子大小等於世界座標的 1 像素，近距離航行時海岸線也能一點一點畫出來。
 * 以位元組陣列保存；存檔時以連續長度編碼（RLE）壓縮，已探索區域通常是幾塊連續範圍，壓縮後很小。
 */
import type { LonLat } from '@/data/schema';
import { EARTH_RADIUS_KM } from '@/geo/geo';

export const FOG_RES = 0.125;
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
  const n = counts.get(fog);
  if (n !== undefined) counts.set(fog, n + changed.length);
  const a = areas.get(fog);
  if (a !== undefined)
    areas.set(
      fog,
      changed.reduce((sum, i) => sum + cellArea(i), a),
    );
  return changed;
}

// 已探索格數與面積的快取，避免每次檢查成就都掃描四百萬格
const counts = new WeakMap<Uint8Array, number>();
const areas = new WeakMap<Uint8Array, number>();

/** 赤道上一格的面積（平方公里）；越往高緯度越小 */
const CELL_KM2_AT_EQUATOR = (FOG_RES * 111.32) ** 2;

function cellArea(index: number): number {
  const row = Math.floor(index / FOG_COLS);
  const lat = 90 - (row + 0.5) * FOG_RES;
  return CELL_KM2_AT_EQUATOR * Math.cos((lat * Math.PI) / 180);
}

/** 已經揭開（畫進海圖）的面積，平方公里 */
export function exploredAreaKm2(fog: Uint8Array): number {
  let a = areas.get(fog);
  if (a === undefined) {
    a = 0;
    for (let i = 0; i < fog.length; i++) if (fog[i]) a += cellArea(i);
    areas.set(fog, a);
  }
  return a;
}

export function exploredFraction(fog: Uint8Array): number {
  let n = counts.get(fog);
  if (n === undefined) {
    n = 0;
    for (let i = 0; i < fog.length; i++) n += fog[i];
    counts.set(fog, n);
  }
  return n / fog.length;
}

const RLE_PREFIX = 'r8:';

/** 存檔格式：交替記錄「未探索、已探索」的連續長度，以 varint 寫成位元組後轉 base64 */
export function encodeFog(fog: Uint8Array): string {
  const bytes: number[] = [];
  const varint = (v: number) => {
    while (v >= 0x80) {
      bytes.push((v & 0x7f) | 0x80);
      v = Math.floor(v / 0x80);
    }
    bytes.push(v);
  };
  let value = 0;
  let run = 0;
  for (let i = 0; i < fog.length; i++) {
    if (fog[i] === value) run++;
    else {
      varint(run);
      value = fog[i];
      run = 1;
    }
  }
  varint(run);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.slice(i, i + 0x8000));
  }
  return RLE_PREFIX + btoa(s);
}

/** 舊版（第 6 版以前）存檔：0.5° 格網的位元陣列 */
const LEGACY_RES = 0.5;
const LEGACY_COLS = 720;
const LEGACY_ROWS = 360;

export function decodeFog(data: string): Uint8Array {
  const fog = createFog();
  if (data.startsWith(RLE_PREFIX)) {
    const s = atob(data.slice(RLE_PREFIX.length));
    let pos = 0;
    let value = 0;
    let at = 0;
    while (at < s.length && pos < fog.length) {
      let run = 0;
      let mul = 1;
      let b: number;
      do {
        b = s.charCodeAt(at++);
        run += (b & 0x7f) * mul;
        mul *= 0x80;
      } while (b & 0x80);
      if (value) fog.fill(1, pos, Math.min(fog.length, pos + run));
      pos += run;
      value ^= 1;
    }
    return fog;
  }
  // 舊版格網：每格放大成 4×4 個新格子
  const s = atob(data);
  const k = LEGACY_RES / FOG_RES;
  for (let r = 0; r < LEGACY_ROWS; r++) {
    for (let c = 0; c < LEGACY_COLS; c++) {
      const i = r * LEGACY_COLS + c;
      if (!(s.charCodeAt(i >> 3) & (1 << (i & 7)))) continue;
      for (let dr = 0; dr < k; dr++) {
        const row = (r * k + dr) * FOG_COLS;
        fog.fill(1, row + c * k, row + c * k + k);
      }
    }
  }
  return fog;
}
