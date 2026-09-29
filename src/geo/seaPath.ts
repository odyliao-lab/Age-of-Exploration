/**
 * 海上航線搜尋：在陸地遮罩格網上以 A* 找出不穿越陸地的路線，
 * 再以「可直線到達」的方式化簡成少量航點。
 *
 * 用途：
 * - 測試：確認每個任務目的地都能從海上到達（內容檢查）
 * - 遊戲：Tier 0 與提示等級 1 的任務提供「建議航線」（企畫書 2.4 鷹架）
 */
import type { LonLat } from '@/data/schema';
import type { Harbor } from '@/game/voyage';
import { checkLeg } from '@/game/voyage';
import { distanceKm } from './geo';
import { MASK_RES, isLand } from './landmask';

const PAD_DEG = 12;
const CELL_HALF_DIAG_KM = 20;

interface Node {
  c: number;
  r: number;
}

function toLonLat(c: number, r: number): LonLat {
  return [-180 + (c + 0.5) * MASK_RES, 90 - (r + 0.5) * MASK_RES];
}

function toCell([lon, lat]: LonLat): Node {
  return { c: Math.floor((lon + 180) / MASK_RES), r: Math.floor((90 - lat) / MASK_RES) };
}

/** 最小堆積 */
class Heap {
  private items: { key: number; f: number }[] = [];
  push(key: number, f: number) {
    const a = this.items;
    a.push({ key, f });
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number | undefined {
    const a = this.items;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top.key;
  }
  get size() {
    return this.items.length;
  }
}

/**
 * 找出 from → to 的海上航線（含起終點），找不到時回傳 null。
 * harbors：允許通過的港區（港口常位於河口或海灣深處）。
 */
export function findSeaPath(from: LonLat, to: LonLat, harbors: Harbor[]): LonLat[] | null {
  // 先在兩端附近搜尋；繞遠路（例如從東海繞過馬來半島到孟加拉灣）時放大搜尋範圍再試
  return searchSeaPath(from, to, harbors, PAD_DEG) ?? searchSeaPath(from, to, harbors, PAD_DEG * 3);
}

function searchSeaPath(from: LonLat, to: LonLat, harbors: Harbor[], pad: number): LonLat[] | null {
  const start = toCell(from);
  const goal = toCell(to);
  const minC = Math.min(start.c, goal.c) - pad / MASK_RES;
  const maxC = Math.max(start.c, goal.c) + pad / MASK_RES;
  const minR = Math.max(0, Math.min(start.r, goal.r) - pad / MASK_RES);
  const maxR = Math.min(180 / MASK_RES - 1, Math.max(start.r, goal.r) + pad / MASK_RES);
  const W = maxC - minC + 1;
  const key = (c: number, r: number) => (r - minR) * W + (c - minC);
  const passable = (c: number, r: number) => {
    const p = toLonLat(c, r);
    if (!isLand(p)) return true;
    // 以格子中心判斷時扣掉半個格子對角線（約 20 公里），確保整段航線都在港區內，
    // 與 checkLeg 逐點取樣的判斷一致
    return harbors.some((h) => distanceKm(h.center, p) <= h.radiusKm - CELL_HALF_DIAG_KM);
  };

  const g = new Map<number, number>();
  const came = new Map<number, number>();
  const heap = new Heap();
  const h = (c: number, r: number) => Math.hypot(c - goal.c, r - goal.r);
  const sk = key(start.c, start.r);
  g.set(sk, 0);
  heap.push(sk, h(start.c, start.r));
  const goalKey = key(goal.c, goal.r);
  const dirs = [
    [1, 0, 1],
    [-1, 0, 1],
    [0, 1, 1],
    [0, -1, 1],
    [1, 1, Math.SQRT2],
    [1, -1, Math.SQRT2],
    [-1, 1, Math.SQRT2],
    [-1, -1, Math.SQRT2],
  ];
  let found = false;
  let guard = 0;
  while (heap.size && guard++ < 400_000) {
    const k = heap.pop()!;
    if (k === goalKey) {
      found = true;
      break;
    }
    const c = (k % W) + minC;
    const r = Math.floor(k / W) + minR;
    for (const [dc, dr, cost] of dirs) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < minC || nc > maxC || nr < minR || nr > maxR) continue;
      if (!passable(nc, nr)) continue;
      // 斜向移動時兩側都必須是海，避免從兩塊陸地的角落「擠」過去
      if (dc && dr && (!passable(c + dc, r) || !passable(c, r + dr))) continue;
      const nk = key(nc, nr);
      const ng = g.get(k)! + cost;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        came.set(nk, k);
        heap.push(nk, ng + h(nc, nr));
      }
    }
  }
  if (!found) return null;

  const cells: LonLat[] = [];
  for (let k: number | undefined = goalKey; k !== undefined; k = came.get(k)) {
    cells.push(toLonLat((k % W) + minC, Math.floor(k / W) + minR));
  }
  cells.reverse();
  cells[0] = from;
  cells[cells.length - 1] = to;
  return simplify(cells, harbors);
}

/** 從起點盡量往遠處直線連接，只要不碰陸地就跳過中間的格子 */
function simplify(path: LonLat[], harbors: Harbor[]): LonLat[] {
  const out: LonLat[] = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let j = path.length - 1;
    while (j > i + 1 && !checkLeg(path[i], path[j], harbors).ok) j--;
    out.push(path[j]);
    i = j;
  }
  return out;
}

/** 找出離某地點最近的海面位置（地標常在陸地上，例如島嶼的中心） */
export function nearestSea(p: LonLat, maxKm = 400): LonLat | null {
  if (!isLand(p)) return p;
  let best: LonLat | null = null;
  let bestD = Infinity;
  const steps = Math.ceil(maxKm / 111 / MASK_RES);
  for (let dy = -steps; dy <= steps; dy++) {
    for (let dx = -steps; dx <= steps; dx++) {
      const q: LonLat = [p[0] + dx * MASK_RES, p[1] + dy * MASK_RES];
      if (isLand(q)) continue;
      const d = distanceKm(p, q);
      if (d < bestD && d <= maxKm) {
        bestD = d;
        best = q;
      }
    }
  }
  return best;
}
