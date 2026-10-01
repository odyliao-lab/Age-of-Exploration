/**
 * 精確的海岸判定：以 1:50m 陸地多邊形做射線法（奇偶規則），
 * 讓親手駕船時的碰撞與畫面上的海岸線一致。
 *
 * 多邊形的邊依緯度分帶建立索引，查詢時只檢查同一帶的邊，每次查詢只需數百次比較。
 */
import type { LonLat } from '@/data/schema';
import type { LandRing } from '@/map/land';
import { DEG_PX, WORLD_HEIGHT } from '@/map/projection';
import { wrapLon } from './geo';

/** 每一帶的高度（世界座標像素；2 像素 = 0.25°） */
const BAND_PX = 2;
const BANDS = Math.ceil(WORLD_HEIGHT / BAND_PX);

export class CoastIndex {
  /** 每條邊的端點 [x1, y1, x2, y2]，依序攤平 */
  private edges: Float64Array;
  private bands: Uint32Array[];

  constructor(rings: LandRing[]) {
    const edges: number[] = [];
    const lists: number[][] = Array.from({ length: BANDS }, () => []);
    for (const { points } of rings) {
      const n = points.length / 2;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const x1 = points[i * 2];
        const y1 = points[i * 2 + 1];
        const x2 = points[j * 2];
        const y2 = points[j * 2 + 1];
        if (y1 === y2) continue;
        const id = edges.length / 4;
        edges.push(x1, y1, x2, y2);
        const b0 = Math.max(0, Math.floor(Math.min(y1, y2) / BAND_PX));
        const b1 = Math.min(BANDS - 1, Math.floor(Math.max(y1, y2) / BAND_PX));
        for (let b = b0; b <= b1; b++) lists[b].push(id);
      }
    }
    this.edges = Float64Array.from(edges);
    this.bands = lists.map((l) => Uint32Array.from(l));
  }

  isLand([lon, lat]: LonLat): boolean {
    const x = (wrapLon(lon) + 180) * DEG_PX;
    const y = (90 - lat) * DEG_PX;
    const band = this.bands[Math.min(BANDS - 1, Math.max(0, Math.floor(y / BAND_PX)))];
    const e = this.edges;
    let inside = false;
    for (let k = 0; k < band.length; k++) {
      const i = band[k] * 4;
      const y1 = e[i + 1];
      const y2 = e[i + 3];
      if (y1 > y === y2 > y) continue;
      const xi = e[i] + ((y - y1) / (y2 - y1)) * (e[i + 2] - e[i]);
      if (xi > x) inside = !inside;
    }
    return inside;
  }
}
