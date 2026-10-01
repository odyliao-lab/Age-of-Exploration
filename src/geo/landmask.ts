/**
 * 陸地遮罩：把陸地多邊形點陣化成經緯度格網，用來判斷航線是否穿越陸地。
 *
 * 解析度 0.25°（約 28 公里）。以掃描線在格子中心做奇偶填色，
 * 外環與湖泊內環交錯時自然形成洞。
 */
import type { LonLat } from '@/data/schema';
import { getLandRings } from '@/map/land';
import { DEG_PX } from '@/map/projection';
import { wrapLon } from './geo';

export const MASK_RES = 0.25;
export const MASK_COLS = Math.round(360 / MASK_RES);
export const MASK_ROWS = Math.round(180 / MASK_RES);

let mask: Uint8Array | null = null;

function build(): Uint8Array {
  const grid = new Uint8Array(MASK_COLS * MASK_ROWS);
  const rings = getLandRings();
  const cellPx = MASK_RES * DEG_PX;
  // 依列收集所有邊的交點
  const crossings: number[][] = Array.from({ length: MASK_ROWS }, () => []);
  for (const { points } of rings) {
    const n = points.length / 2;
    for (let i = 0; i < n; i++) {
      const x1 = points[i * 2];
      const y1 = points[i * 2 + 1];
      const j = (i + 1) % n;
      const x2 = points[j * 2];
      const y2 = points[j * 2 + 1];
      if (y1 === y2) continue;
      const yMin = Math.min(y1, y2);
      const yMax = Math.max(y1, y2);
      const rStart = Math.max(0, Math.ceil(yMin / cellPx - 0.5));
      const rEnd = Math.min(MASK_ROWS - 1, Math.floor(yMax / cellPx - 0.5));
      for (let r = rStart; r <= rEnd; r++) {
        const yc = (r + 0.5) * cellPx;
        if (yc < yMin || yc >= yMax) continue;
        crossings[r].push(x1 + ((yc - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
  }
  for (let r = 0; r < MASK_ROWS; r++) {
    const xs = crossings[r].sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const cStart = Math.max(0, Math.ceil(xs[k] / cellPx - 0.5));
      const cEnd = Math.min(MASK_COLS - 1, Math.floor(xs[k + 1] / cellPx - 0.5));
      grid.fill(1, r * MASK_COLS + cStart, r * MASK_COLS + cEnd + 1);
    }
  }
  return grid;
}

function getMask(): Uint8Array {
  if (!mask) mask = build();
  return mask;
}

export function cellOf([lon, lat]: LonLat): [number, number] {
  const c = Math.min(MASK_COLS - 1, Math.max(0, Math.floor((wrapLon(lon) + 180) / MASK_RES)));
  const r = Math.min(MASK_ROWS - 1, Math.max(0, Math.floor((90 - lat) / MASK_RES)));
  return [c, r];
}

export function isLand(p: LonLat): boolean {
  const [c, r] = cellOf(p);
  return getMask()[r * MASK_COLS + c] === 1;
}
