/**
 * 港口城鎮（企畫書 v2 4.4，決策 R1：像素風）：可以走動的小地圖。
 *
 * 地形用一張字元格網描述，建築物另外以矩形定義（門的格子可以走進去）。
 * 所有港口共用同一張版面，依文化圈換顏色與屋頂樣式；純資料與純函式，方便測試。
 */

export const TILE = 16;
export const TOWN_W = 32;
export const TOWN_H = 18;

export type Terrain = 'ground' | 'road' | 'tree' | 'dock' | 'water' | 'crate';

/**
 * T 樹、. 空地、: 石板路、= 碼頭木棧、~ 海、x 貨箱
 * 建築物的位置由 BUILDINGS 覆蓋，這裡先畫成空地。
 */
const MAP = [
  'TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT',
  'T..............................T',
  'T..............................T',
  'T..............................T',
  'T..............................T',
  'T..............................T',
  'T...:......:......:.....:......T',
  'T::::::::::::::::::::::::::::::T',
  'T..:......:.......:......:.....T',
  'T..............................T',
  'T..............................T',
  'T..............................T',
  'T....:.......:.......:.......xxT',
  '===============================T',
  '~~~~~~~~~~~~~==~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~==~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~==~~~~~~~~~~~~~~~~~',
  '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
];

const CODE: Record<string, Terrain> = {
  T: 'tree',
  '.': 'ground',
  ':': 'road',
  '=': 'dock',
  '~': 'water',
  x: 'crate',
};

export type BuildingKind =
  'office' | 'academy' | 'temple' | 'tavern' | 'market' | 'shipyard' | 'dock';

export interface Building {
  kind: BuildingKind;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 門（最下面一排的某一格） */
  door: { x: number; y: number };
}

/** 建築物：門在最下排，正對石板路 */
export const BUILDINGS: Building[] = [
  { kind: 'office', x: 2, y: 2, w: 6, h: 4, door: { x: 4, y: 5 } },
  { kind: 'academy', x: 9, y: 3, w: 5, h: 3, door: { x: 11, y: 5 } },
  { kind: 'temple', x: 15, y: 1, w: 7, h: 5, door: { x: 18, y: 5 } },
  { kind: 'tavern', x: 23, y: 2, w: 6, h: 4, door: { x: 25, y: 5 } },
  { kind: 'market', x: 2, y: 8, w: 7, h: 4, door: { x: 5, y: 11 } },
  { kind: 'shipyard', x: 16, y: 8, w: 8, h: 4, door: { x: 20, y: 11 } },
];

/** 碼頭：棧橋盡頭，船停在這裡；走到這裡就是「上船」 */
export const DOCK_SPOT = { x: 13, y: 16 };
/** 玩家下船後出現的位置 */
export const SPAWN = { x: 14, y: 13 };

export function terrainAt(x: number, y: number): Terrain {
  const row = MAP[y];
  if (!row || x < 0 || x >= TOWN_W) return 'water';
  return CODE[row[x]] ?? 'ground';
}

export function buildingAt(x: number, y: number): Building | null {
  return BUILDINGS.find((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h) ?? null;
}

export function isWalkable(x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= TOWN_W || y >= TOWN_H) return false;
  const b = buildingAt(x, y);
  if (b) return b.door.x === x && b.door.y === y;
  const t = terrainAt(x, y);
  return t === 'ground' || t === 'road' || t === 'dock';
}

export type Point = { x: number; y: number };

/** 四方向的廣度優先搜尋；找不到路時回傳 null。路徑不含起點。 */
export function findPath(from: Point, to: Point): Point[] | null {
  if (!isWalkable(to.x, to.y)) return null;
  const key = (p: Point) => p.y * TOWN_W + p.x;
  const prev = new Map<number, number>();
  const start = key(from);
  prev.set(start, -1);
  const queue: Point[] = [from];
  while (queue.length) {
    const p = queue.shift()!;
    if (p.x === to.x && p.y === to.y) {
      const path: Point[] = [];
      let k = key(p);
      while (k !== start) {
        path.unshift({ x: k % TOWN_W, y: Math.floor(k / TOWN_W) });
        k = prev.get(k)!;
      }
      return path;
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const n = { x: p.x + dx, y: p.y + dy };
      if (!isWalkable(n.x, n.y) || prev.has(key(n))) continue;
      prev.set(key(n), key(p));
      queue.push(n);
    }
  }
  return null;
}

/** 點到某一格時，實際要走去的目的地：點建築物就走到門口，點船就走到碼頭 */
export function destinationFor(
  x: number,
  y: number,
): { target: Point; enter: BuildingKind | null } | null {
  const b = buildingAt(x, y);
  if (b) return { target: b.door, enter: b.kind };
  if (terrainAt(x, y) === 'water' && Math.abs(x - DOCK_SPOT.x) <= 3 && y >= 14) {
    return { target: DOCK_SPOT, enter: 'dock' };
  }
  if (x === DOCK_SPOT.x && y === DOCK_SPOT.y) return { target: DOCK_SPOT, enter: 'dock' };
  if (!isWalkable(x, y)) return null;
  return { target: { x, y }, enter: null };
}

/** 文化圈：決定建築顏色、屋頂、樹與招牌文字 */
export type Culture = 'minnan' | 'nanyang' | 'ryukyu';

export function cultureOf(country: string): Culture {
  // 琉球王國在今日本沖繩
  if (country.includes('琉球') || country.includes('日本')) return 'ryukyu';
  if (country.includes('中國') || country.includes('明')) return 'minnan';
  return 'nanyang';
}

export const BUILDING_NAMES: Record<Culture, Record<BuildingKind, string>> = {
  minnan: {
    office: '官府',
    academy: '書院',
    temple: '天妃宮',
    tavern: '酒館',
    market: '市集',
    shipyard: '造船廠',
    dock: '碼頭',
  },
  ryukyu: {
    office: '王府',
    academy: '學堂',
    temple: '天妃宮',
    tavern: '酒館',
    market: '市集',
    shipyard: '造船廠',
    dock: '碼頭',
  },
  nanyang: {
    office: '王宮',
    academy: '學者之家',
    temple: '廟宇',
    tavern: '茶棚',
    market: '市集',
    shipyard: '造船廠',
    dock: '碼頭',
  },
};
