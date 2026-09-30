/**
 * 城鎮像素美術（決策 R1）：全部用程式畫，不需要圖檔。
 * 邏輯解析度 512×288（32×18 格、每格 16 像素），再放大到畫面上，不做平滑。
 */
import {
  BUILDINGS,
  DOCK_SPOT,
  TILE,
  TOWN_H,
  TOWN_W,
  terrainAt,
  type Building,
  type Culture,
} from './layout';

type Ctx = CanvasRenderingContext2D;

interface Palette {
  ground: string;
  groundDot: string;
  road: string;
  roadLine: string;
  wall: string;
  wallShade: string;
  roof: string;
  roofLine: string;
  ridge: string;
  temple: string;
  office: string;
  leaf: string;
  leafDark: string;
  trunk: string;
  palm: boolean;
  /** 平屋頂（阿拉伯、斯瓦希里海岸的珊瑚石屋） */
  flat?: boolean;
  /** 客棧、市集、造船廠用椰葉編的斜屋頂（斯瓦希里海岸） */
  makuti?: boolean;
  /** 樹林裡夾雜猴麵包樹 */
  baobab?: boolean;
}

export const PALETTES: Record<Culture, Palette> = {
  southasia: {
    ground: '#d4b37a',
    groundDot: '#bf9a5e',
    road: '#c7a77a',
    roadLine: '#a9895e',
    wall: '#efe6d2',
    wallShade: '#c9b996',
    roof: '#b4553a',
    roofLine: '#8a3b27',
    ridge: '#6f2c1d',
    temple: '#d98a3a',
    office: '#b4553a',
    leaf: '#3f8a4a',
    leafDark: '#2c6a36',
    trunk: '#8a6a3a',
    palm: true,
  },
  arabia: {
    ground: '#dcc59a',
    groundDot: '#c9ae7e',
    road: '#d6c4a0',
    roadLine: '#b9a47e',
    wall: '#f1e9d8',
    wallShade: '#cfc2a4',
    roof: '#e8dcc2',
    roofLine: '#cdbd9a',
    ridge: '#b9a57c',
    temple: '#f4efe4',
    office: '#e8dcc2',
    leaf: '#6b8f3a',
    leafDark: '#4f6d2a',
    trunk: '#8a6a3a',
    palm: true,
    flat: true,
  },
  swahili: {
    ground: '#d9c392',
    groundDot: '#c4ab78',
    road: '#cfc0a0',
    roadLine: '#b2a27f',
    wall: '#e7e0cf',
    wallShade: '#bdb39b',
    roof: '#ddd3bd',
    roofLine: '#8a6a3a',
    ridge: '#a89a7a',
    temple: '#ece6d8',
    office: '#ddd3bd',
    leaf: '#6b8f3a',
    leafDark: '#4f6d2a',
    trunk: '#8a6a3a',
    palm: true,
    flat: true,
    makuti: true,
    baobab: true,
  },
  minnan: {
    ground: '#d8c08c',
    groundDot: '#c7ab75',
    road: '#b9ad99',
    roadLine: '#9b8f7c',
    wall: '#b9543b',
    wallShade: '#8f3e2b',
    roof: '#9c3a28',
    roofLine: '#7a2a1c',
    ridge: '#5e1f14',
    temple: '#c9702a',
    office: '#5c6670',
    leaf: '#4f7d3a',
    leafDark: '#3b6329',
    trunk: '#6b4a2a',
    palm: false,
  },
  ryukyu: {
    ground: '#d6c697',
    groundDot: '#c2b07c',
    road: '#c9bea8',
    roadLine: '#aa9e87',
    wall: '#d8cdb8',
    wallShade: '#b3a78f',
    roof: '#b5523b',
    roofLine: '#f1e6d6',
    ridge: '#f1e6d6',
    temple: '#c9702a',
    office: '#a8402c',
    leaf: '#3f7a3c',
    leafDark: '#2d5c2b',
    trunk: '#5e4127',
    palm: false,
  },
  nanyang: {
    ground: '#cdb27a',
    groundDot: '#b99c63',
    road: '#bda27a',
    roadLine: '#a48a62',
    wall: '#8a5a33',
    wallShade: '#6b4426',
    roof: '#b48c4c',
    roofLine: '#8f6a33',
    ridge: '#6f5226',
    temple: '#c9702a',
    office: '#a0763a',
    leaf: '#3f8a4a',
    leafDark: '#2c6a36',
    trunk: '#8a6a3a',
    palm: true,
  },
};

/** 以格子座標決定的偽亂數（同一格每次都一樣） */
function hash(x: number, y: number, k = 0): number {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function px(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

function drawGround(ctx: Ctx, tx: number, ty: number, p: Palette) {
  const x = tx * TILE;
  const y = ty * TILE;
  px(ctx, x, y, TILE, TILE, p.ground);
  for (let k = 0; k < 5; k++) {
    px(
      ctx,
      x + Math.floor(hash(tx, ty, k) * 15),
      y + Math.floor(hash(tx, ty, k + 9) * 15),
      1,
      1,
      p.groundDot,
    );
  }
}

function drawRoad(ctx: Ctx, tx: number, ty: number, p: Palette) {
  const x = tx * TILE;
  const y = ty * TILE;
  px(ctx, x, y, TILE, TILE, p.road);
  // 石板：錯縫排列
  for (let r = 0; r < 4; r++) {
    px(ctx, x, y + r * 4, TILE, 1, p.roadLine);
    const off = r % 2 ? 4 : 0;
    for (let c = off; c < TILE; c += 8) px(ctx, x + c, y + r * 4, 1, 4, p.roadLine);
  }
}

function drawDock(ctx: Ctx, tx: number, ty: number) {
  const x = tx * TILE;
  const y = ty * TILE;
  px(ctx, x, y, TILE, TILE, '#9a6b3d');
  for (let c = 0; c < TILE; c += 4) px(ctx, x + c, y, 1, TILE, '#6f4a28');
  px(ctx, x, y + TILE - 2, TILE, 2, '#5a3b20');
  if (hash(tx, ty) > 0.7) px(ctx, x + 6, y + 6, 2, 2, '#4a301a');
}

function drawTree(ctx: Ctx, tx: number, ty: number, p: Palette) {
  drawGround(ctx, tx, ty, p);
  const x = tx * TILE;
  const y = ty * TILE;
  if (p.baobab && hash(tx, ty, 9) > 0.7) {
    // 猴麵包樹：粗胖的樹幹，頂上稀疏的枝葉
    px(ctx, x + 5, y + 6, 6, 9, '#9a7a58');
    px(ctx, x + 4, y + 9, 8, 5, '#9a7a58');
    px(ctx, x + 6, y + 6, 1, 8, '#7d6043');
    px(ctx, x + 3, y + 3, 3, 3, p.trunk);
    px(ctx, x + 10, y + 3, 3, 3, p.trunk);
    px(ctx, x + 1, y + 1, 5, 3, p.leafDark);
    px(ctx, x + 9, y + 1, 6, 3, p.leaf);
    px(ctx, x + 6, y + 2, 4, 3, p.leafDark);
    return;
  }
  if (p.palm) {
    px(ctx, x + 7, y + 6, 2, 9, p.trunk);
    const leaves = [
      [1, 4, 6, 2],
      [9, 4, 6, 2],
      [3, 2, 4, 2],
      [9, 2, 4, 2],
      [6, 1, 4, 3],
      [2, 6, 3, 1],
      [11, 6, 3, 1],
    ];
    for (const [a, b, w, h] of leaves)
      px(ctx, x + a, y + b, w, h, hash(tx, ty, a) > 0.5 ? p.leaf : p.leafDark);
  } else {
    px(ctx, x + 7, y + 10, 2, 5, p.trunk);
    px(ctx, x + 3, y + 2, 10, 9, p.leafDark);
    px(ctx, x + 2, y + 4, 12, 5, p.leafDark);
    px(ctx, x + 4, y + 3, 7, 5, p.leaf);
    px(ctx, x + 5, y + 2, 3, 2, '#6f9d4f');
  }
}

function drawCrate(ctx: Ctx, tx: number, ty: number, p: Palette) {
  drawGround(ctx, tx, ty, p);
  const x = tx * TILE;
  const y = ty * TILE;
  px(ctx, x + 2, y + 4, 12, 10, '#8a5a2b');
  px(ctx, x + 2, y + 4, 12, 1, '#b07a3f');
  px(ctx, x + 2, y + 8, 12, 1, '#5e3c1c');
  px(ctx, x + 7, y + 4, 1, 10, '#5e3c1c');
}

/** 海面：依時間移動的波光 */
export function drawWater(ctx: Ctx, time: number) {
  for (let ty = 0; ty < TOWN_H; ty++) {
    for (let tx = 0; tx < TOWN_W; tx++) {
      if (terrainAt(tx, ty) !== 'water') continue;
      const x = tx * TILE;
      const y = ty * TILE;
      px(ctx, x, y, TILE, TILE, ty === 14 ? '#5b93b0' : '#4c84a4');
      const phase = Math.floor(time * 2 + hash(tx, ty) * 4) % 4;
      const wx = x + Math.floor(hash(tx, ty, 3) * 10);
      const wy = y + 3 + ((phase * 3) % 10);
      px(ctx, wx, wy, 4, 1, '#8fc0d6');
      px(ctx, wx + 1, wy - 1, 2, 1, '#bfe0ee');
    }
  }
}

function drawBuilding(ctx: Ctx, b: Building, p: Palette, culture: Culture) {
  const x = b.x * TILE;
  const y = b.y * TILE;
  const w = b.w * TILE;
  const h = b.h * TILE;
  const thatched = p.makuti && ['tavern', 'market', 'shipyard'].includes(b.kind);
  const roofColor = thatched
    ? '#a8834c'
    : b.kind === 'temple'
      ? p.temple
      : b.kind === 'office'
        ? p.office
        : p.roof;
  const wallH = TILE + 2;
  const roofH = h - wallH + 4;

  // 牆面（正面）
  const wall = b.kind === 'office' || b.kind === 'academy' ? '#eee4d2' : p.wall;
  px(ctx, x + 1, y + h - wallH, w - 2, wallH, wall);
  px(ctx, x + 1, y + h - 2, w - 2, 2, p.wallShade);
  // 柱子
  const pillar = b.kind === 'temple' || b.kind === 'office' ? '#a8322a' : p.wallShade;
  for (let c = x + 3; c < x + w - 3; c += 16) px(ctx, c, y + h - wallH, 2, wallH - 2, pillar);
  // 窗戶
  for (let c = x + 8; c < x + w - 8; c += 16) {
    if (Math.abs(c - (b.door.x * TILE + 4)) < 10) continue;
    px(ctx, c, y + h - wallH + 5, 6, 5, '#3a2a1c');
    px(ctx, c + 1, y + h - wallH + 6, 4, 1, '#6a5238');
  }
  // 門
  const dx = b.door.x * TILE + 3;
  px(ctx, dx, y + h - 12, 10, 12, '#3a2414');
  px(
    ctx,
    dx + 1,
    y + h - 11,
    8,
    11,
    b.kind === 'temple' || b.kind === 'office' ? '#a8322a' : '#6b3f1f',
  );
  px(ctx, dx + 4, y + h - 11, 1, 11, '#3a2414');

  if (p.flat && !thatched) {
    // 平屋頂：珊瑚石牆頂著矮女兒牆；清真寺加上白色圓頂與宣禮塔
    const ry = y;
    px(ctx, x, ry, w, roofH, p.roof);
    px(ctx, x, ry, w, 2, p.ridge);
    px(ctx, x, ry + roofH - 2, w, 2, 'rgba(0,0,0,0.25)');
    for (let c = x + 3; c < x + w - 3; c += 6) px(ctx, c, ry - 2, 3, 2, p.ridge);
    if (b.kind === 'temple') {
      const cx = x + w / 2;
      const cy = ry + roofH / 2;
      for (let k = 0; k < 10; k++) {
        const half = Math.round(Math.sqrt(100 - k * k));
        px(ctx, cx - half, cy - k, half * 2, 1, k < 2 ? '#d8d0bf' : '#fbf8f1');
      }
      px(ctx, cx - 1, cy - 13, 2, 3, '#c9a13a');
      px(ctx, x + w - 10, ry - 12, 6, roofH + 12, '#fbf8f1');
      px(ctx, x + w - 11, ry - 13, 8, 2, '#c9a13a');
    }
  } else {
    // 屋頂
    const ry = y;
    px(ctx, x, ry, w, roofH, roofColor);
    if ((culture === 'nanyang' && b.kind !== 'temple') || thatched) {
      // 茅草屋頂：斜線紋
      for (let k = 0; k < w; k += 3) px(ctx, x + k, ry + ((k * 7) % roofH), 1, 4, p.roofLine);
      for (let r = ry + 3; r < ry + roofH; r += 4) px(ctx, x, r, w, 1, p.roofLine);
    } else {
      // 瓦片：一排一排
      for (let r = ry + 2; r < ry + roofH; r += 3)
        px(ctx, x, r, w, 1, culture === 'ryukyu' ? '#f1e6d6' : p.roofLine);
      for (let c = x + 2; c < x + w; c += 4) px(ctx, c, ry, 1, roofH, 'rgba(0,0,0,0.12)');
    }
    // 屋脊與屋簷陰影
    px(ctx, x + 2, ry + Math.floor(roofH / 2) - 1, w - 4, 2, p.ridge);
    px(ctx, x, ry + roofH - 1, w, 2, 'rgba(0,0,0,0.3)');
    // 燕尾脊：閩南屋頂兩端翹起
    if (culture === 'minnan' && !p.palm) {
      const ridgeY = ry + Math.floor(roofH / 2) - 1;
      px(ctx, x - 2, ridgeY - 3, 3, 2, p.ridge);
      px(ctx, x - 3, ridgeY - 5, 2, 2, p.ridge);
      px(ctx, x + w - 1, ridgeY - 3, 3, 2, p.ridge);
      px(ctx, x + w + 1, ridgeY - 5, 2, 2, p.ridge);
    }
    // 廟宇屋脊上的金色裝飾
    if (b.kind === 'temple') {
      const ridgeY = ry + Math.floor(roofH / 2) - 1;
      px(ctx, x + w / 2 - 3, ridgeY - 4, 6, 4, '#e0b94a');
      px(ctx, x + w / 2 - 1, ridgeY - 6, 2, 2, '#e0b94a');
    }
  }
  // 造船廠：門前堆著木材
  if (b.kind === 'shipyard') {
    for (let k = 0; k < 3; k++)
      px(ctx, x + w - 26 + k * 2, y + h - 6 - k * 3, 20, 3, k % 2 ? '#b07a3f' : '#8a5a2b');
  }
  // 市集：門前的布篷攤子
  if (b.kind === 'market') {
    for (let k = 0; k < 2; k++) {
      const sx = x + 6 + k * 70;
      px(ctx, sx, y + h - 20, 22, 5, k ? '#2f7d6a' : '#c0642b');
      for (let s = 0; s < 22; s += 4) px(ctx, sx + s, y + h - 20, 2, 5, '#f1e6d6');
    }
  }
}

/** 靜態圖層：地面、道路、樹、碼頭與建築（每個文化圈畫一次） */
export function drawTownBase(ctx: Ctx, culture: Culture) {
  const p = PALETTES[culture];
  for (let ty = 0; ty < TOWN_H; ty++) {
    for (let tx = 0; tx < TOWN_W; tx++) {
      const t = terrainAt(tx, ty);
      if (t === 'ground') drawGround(ctx, tx, ty, p);
      else if (t === 'road') drawRoad(ctx, tx, ty, p);
      else if (t === 'dock') drawDock(ctx, tx, ty);
      else if (t === 'tree') drawTree(ctx, tx, ty, p);
      else if (t === 'crate') drawCrate(ctx, tx, ty, p);
    }
  }
  for (const b of BUILDINGS) drawBuilding(ctx, b, p, culture);
}

export interface PersonLook {
  skin: string;
  coat: string;
  hat: string | null;
  hair: string;
  /** 帽子樣式：寬邊斗笠（預設）、纏頭巾、無邊小帽 */
  hatStyle?: 'brim' | 'turban' | 'cap';
  /** 長袍：衣服蓋到腳踝 */
  robe?: boolean;
}

export type Facing = 'down' | 'up' | 'left' | 'right';

/** 16×16 的人物（俯視帶一點正面），兩格走路動畫 */
export function drawPerson(
  ctx: Ctx,
  x: number,
  y: number,
  facing: Facing,
  step: number,
  look: PersonLook,
) {
  const X = Math.round(x);
  const Y = Math.round(y);
  // 影子
  px(ctx, X + 4, Y + 14, 8, 2, 'rgba(0,0,0,0.25)');
  // 腳
  const a = step % 2 === 0;
  px(ctx, X + 5, Y + 11, 2, a ? 4 : 3, '#3a2a1c');
  px(ctx, X + 9, Y + 11, 2, a ? 3 : 4, '#3a2a1c');
  // 身體（長袍蓋到腳踝）
  px(ctx, X + 4, Y + 6, 8, look.robe ? 8 : 6, look.coat);
  px(ctx, X + 4, Y + (look.robe ? 13 : 11), 8, 1, 'rgba(0,0,0,0.25)');
  // 手
  const arm = a ? 0 : 1;
  px(ctx, X + 3, Y + 7 + arm, 1, 4, look.skin);
  px(ctx, X + 12, Y + 8 - arm, 1, 4, look.skin);
  // 頭
  px(ctx, X + 5, Y + 1, 6, 6, look.skin);
  px(ctx, X + 5, Y + 1, 6, 2, look.hair);
  if (facing === 'up') px(ctx, X + 5, Y + 1, 6, 5, look.hair);
  else if (facing === 'down') {
    px(ctx, X + 6, Y + 4, 1, 1, '#2b2118');
    px(ctx, X + 9, Y + 4, 1, 1, '#2b2118');
  } else {
    px(ctx, X + (facing === 'left' ? 6 : 9), Y + 4, 1, 1, '#2b2118');
  }
  if (look.hat) {
    if (look.hatStyle === 'turban') {
      // 纏頭巾：圓鼓鼓地包住頭頂
      px(ctx, X + 4, Y - 1, 8, 3, look.hat);
      px(ctx, X + 5, Y - 2, 6, 1, look.hat);
      px(ctx, X + 5, Y, 6, 1, 'rgba(0,0,0,0.12)');
    } else if (look.hatStyle === 'cap') {
      // 無邊小帽（宋谷帽、庫菲帽）
      px(ctx, X + 5, Y - 1, 6, 2, look.hat);
    } else {
      px(ctx, X + 3, Y + 1, 10, 2, look.hat);
      px(ctx, X + 5, Y - 1, 6, 2, look.hat);
    }
  }
}

/** 停在棧橋盡頭的戎克船（俯視，船頭朝下） */
export function drawMooredShip(ctx: Ctx, hull: string, sail: string, flag: string, time: number) {
  const x = DOCK_SPOT.x * TILE + 20;
  const y = 14 * TILE + 2 + Math.round(Math.sin(time * 1.6));
  px(ctx, x + 2, y + 2, 16, 44, 'rgba(0,0,0,0.2)');
  px(ctx, x, y, 16, 42, hull);
  px(ctx, x + 2, y + 40, 12, 3, hull);
  px(ctx, x, y, 16, 2, '#3a2414');
  px(ctx, x + 1, y + 2, 14, 7, '#8a5a33');
  for (let k = 0; k < 3; k++) {
    const sy = y + 12 + k * 10;
    px(ctx, x - 3, sy, 22, 3, sail);
    px(ctx, x - 3, sy + 3, 22, 1, 'rgba(0,0,0,0.25)');
    px(ctx, x + 7, sy - 1, 2, 5, '#3a2414');
  }
  px(ctx, x + 16, y - 4, 6, 4, flag);
  px(ctx, x + 15, y - 4, 1, 8, '#3a2414');
}

/** 海鷗：在海面上空繞圈 */
export function drawGulls(ctx: Ctx, time: number) {
  for (let k = 0; k < 3; k++) {
    const t = time * (0.25 + k * 0.07) + k * 2;
    const gx = 80 + k * 150 + Math.cos(t) * 60;
    const gy = 236 + Math.sin(t * 1.3) * 16;
    const flap = Math.floor(time * 6 + k) % 2;
    px(ctx, gx, gy, 2, 1, '#f5f5f0');
    px(ctx, gx + 4, gy, 2, 1, '#f5f5f0');
    px(ctx, gx + 2, gy + (flap ? 1 : -1), 2, 1, '#f5f5f0');
  }
}
