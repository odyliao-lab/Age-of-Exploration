import { useEffect, useRef } from 'react';
import { isDebug } from '../debug';
import { drawFestival, type FestivalDecor } from '@/town/festivals';
import { COLORS, SKIN_TONES, colorOf, type Appearance } from '@/game/cosmetics';
import {
  drawGulls,
  drawMooredShip,
  drawLocalBoat,
  drawTownNight,
  drawPerson,
  drawTownBase,
  drawWater,
  type Facing,
  type PersonLook,
} from '@/town/art';
import {
  BUILDINGS,
  BUILDING_NAMES,
  SPAWN,
  TILE,
  TOWN_H,
  TOWN_W,
  destinationFor,
  findPath,
  isWalkable,
  type BuildingKind,
  type Culture,
  type Point,
} from '@/town/layout';

const W = TOWN_W * TILE;
const H = TOWN_H * TILE;
/** 走路速度：每秒幾格 */
const WALK_TILES_PER_SEC = 5;

interface Walker {
  /** 以像素計的位置（左上角） */
  x: number;
  y: number;
  path: Point[];
  facing: Facing;
  step: number;
  look: PersonLook;
}

const HAT_COLORS: Record<string, string | null> = {
  none: null,
  futou: '#2b2118',
  douli: '#c9a86a',
  turban: '#f4ecd8',
  barrete: '#9b2f1f',
  woolcap: '#6b5a3a',
  captain: '#2c4a7a',
  feather: '#6b3f1f',
};

function playerLook(a: Appearance): PersonLook {
  return {
    skin: SKIN_TONES[a.skin] ?? SKIN_TONES[1],
    coat: colorOf(COLORS, a.coat),
    hat: HAT_COLORS[a.hat] ?? null,
    hair: '#2b2118',
    hatStyle:
      a.hat === 'turban'
        ? 'turban'
        : a.hat === 'barrete' || a.hat === 'woolcap'
          ? 'cap'
          : undefined,
  };
}

/** 各文化圈路人的穿著：衣服顏色、帽子與長袍（服飾也是文化地理） */
const TOWNSFOLK: Record<Culture, PersonLook[]> = {
  iberia: [
    { skin: '#e8c4a0', coat: '#2b2b3a', hat: '#2b2118', hair: '#3a2414', hatStyle: 'cap' },
    { skin: '#e0b58f', coat: '#7a2e2a', hat: null, hair: '#2b2118', robe: true },
    { skin: '#e8c4a0', coat: '#4a5a3a', hat: '#6b3f1f', hair: '#3a2414' },
    { skin: '#d9a57c', coat: '#5a4a7a', hat: null, hair: '#1c1410', robe: true },
    { skin: '#e8c4a0', coat: '#8a6a3a', hat: '#2b2118', hair: '#3a2414', hatStyle: 'cap' },
  ],
  norse: [
    { skin: '#efd2b8', coat: '#6b5a3a', hat: '#8a6a3a', hair: '#c9a86a', hatStyle: 'cap' },
    { skin: '#f3d2b3', coat: '#3f5a7a', hat: null, hair: '#b5482b', robe: true },
    { skin: '#efd2b8', coat: '#7a3a2a', hat: null, hair: '#e0c080' },
    { skin: '#f3d2b3', coat: '#4a6b4a', hat: null, hair: '#8a6a3a', robe: true },
    { skin: '#efd2b8', coat: '#8a8a7a', hat: '#5e4127', hair: '#c9a86a', hatStyle: 'cap' },
  ],
  taino: [
    { skin: '#a8714a', coat: '#c9a86a', hat: null, hair: '#1c1410' },
    { skin: '#9e6a44', coat: '#e0c080', hat: null, hair: '#1c1410', robe: true },
    { skin: '#a8714a', coat: '#b5482b', hat: '#e0b94a', hair: '#1c1410', hatStyle: 'cap' },
    { skin: '#94603f', coat: '#d9c9a0', hat: null, hair: '#1c1410' },
    { skin: '#a8714a', coat: '#3f7a4a', hat: null, hair: '#1c1410', robe: true },
  ],
  westafrica: [
    { skin: '#5a3a24', coat: '#c9402c', hat: null, hair: '#1c1410', robe: true },
    { skin: '#4e321f', coat: '#e0b94a', hat: null, hair: '#1c1410' },
    { skin: '#5a3a24', coat: '#2f6f5a', hat: '#e0b94a', hair: '#1c1410', hatStyle: 'cap' },
    { skin: '#63402a', coat: '#6b3f6f', hat: null, hair: '#1c1410', robe: true },
    { skin: '#4e321f', coat: '#f4ecd8', hat: null, hair: '#1c1410' },
  ],
  minnan: [
    { skin: '#e0b18a', coat: '#34507e', hat: null, hair: '#2b2118' },
    { skin: '#d9a57c', coat: '#7a5a3a', hat: '#c9a86a', hair: '#2b2118' },
    { skin: '#f0c9a4', coat: '#5c6670', hat: null, hair: '#1c1410' },
    { skin: '#e0b18a', coat: '#8f3e2b', hat: '#c9a86a', hair: '#2b2118' },
    { skin: '#e8bd96', coat: '#4f7d6a', hat: null, hair: '#2b2118', robe: true },
  ],
  ryukyu: [
    { skin: '#dcaa80', coat: '#2c3f6b', hat: '#c9402c', hair: '#1c1410', hatStyle: 'cap' },
    { skin: '#e0b18a', coat: '#a86a3a', hat: null, hair: '#2b2118', robe: true },
    { skin: '#d9a57c', coat: '#5a6b7a', hat: '#e0b94a', hair: '#1c1410', hatStyle: 'cap' },
    { skin: '#e0b18a', coat: '#3f6b8a', hat: null, hair: '#2b2118', robe: true },
    { skin: '#dcaa80', coat: '#7a4a3a', hat: null, hair: '#1c1410' },
  ],
  nanyang: [
    { skin: '#b07a52', coat: '#8a3b27', hat: '#1c1410', hair: '#1c1410', hatStyle: 'cap' },
    { skin: '#a8714a', coat: '#d0a23a', hat: null, hair: '#1c1410', robe: true },
    { skin: '#b98459', coat: '#2f6f5a', hat: '#1c1410', hair: '#1c1410', hatStyle: 'cap' },
    { skin: '#9e6a44', coat: '#6b3f6f', hat: null, hair: '#1c1410', robe: true },
    { skin: '#b07a52', coat: '#c0642b', hat: '#c9a86a', hair: '#1c1410' },
  ],
  southasia: [
    { skin: '#8d5a3b', coat: '#f4ecd8', hat: '#f4ecd8', hair: '#1c1410', hatStyle: 'turban' },
    { skin: '#7d4e33', coat: '#e08a2a', hat: null, hair: '#1c1410', robe: true },
    { skin: '#94603f', coat: '#f4ecd8', hat: null, hair: '#1c1410' },
    { skin: '#7d4e33', coat: '#b5305a', hat: null, hair: '#1c1410', robe: true },
    { skin: '#8d5a3b', coat: '#3f7a4a', hat: '#c9402c', hair: '#1c1410', hatStyle: 'turban' },
  ],
  arabia: [
    {
      skin: '#c68f63',
      coat: '#f4ecd8',
      hat: '#f4ecd8',
      hair: '#1c1410',
      hatStyle: 'turban',
      robe: true,
    },
    {
      skin: '#b98459',
      coat: '#e9dcc0',
      hat: '#b5482b',
      hair: '#1c1410',
      hatStyle: 'turban',
      robe: true,
    },
    { skin: '#c68f63', coat: '#2b2b3a', hat: null, hair: '#1c1410', robe: true },
    {
      skin: '#a8714a',
      coat: '#f4ecd8',
      hat: '#f4ecd8',
      hair: '#1c1410',
      hatStyle: 'turban',
      robe: true,
    },
    { skin: '#b98459', coat: '#6b5a3a', hat: null, hair: '#1c1410' },
  ],
  swahili: [
    {
      skin: '#6b442b',
      coat: '#f4ecd8',
      hat: '#f4ecd8',
      hair: '#1c1410',
      hatStyle: 'cap',
      robe: true,
    },
    { skin: '#5e3b25', coat: '#d9653a', hat: null, hair: '#1c1410', robe: true },
    { skin: '#6b442b', coat: '#2f5f8a', hat: null, hair: '#1c1410' },
    {
      skin: '#5e3b25',
      coat: '#f4ecd8',
      hat: '#f4ecd8',
      hair: '#1c1410',
      hatStyle: 'cap',
      robe: true,
    },
    { skin: '#734a2f', coat: '#e0b94a', hat: null, hair: '#1c1410', robe: true },
  ],
};

function randomWalkable(): Point {
  for (;;) {
    const x = Math.floor(Math.random() * TOWN_W);
    const y = 6 + Math.floor(Math.random() * 8);
    if (isWalkable(x, y) && !BUILDINGS.some((b) => b.door.x === x && b.door.y === y))
      return { x, y };
  }
}

interface Props {
  culture: Culture;
  appearance: Appearance;
  ship: { hull: string; sail: string; flag: string; lateen?: boolean };
  /** 走進建築物或走到船邊 */
  onEnter: (kind: BuildingKind) => void;
  /** 回到城裡時，玩家站在哪棟建築的門口 */
  returnFrom: BuildingKind | null;
  /** 點路人時說的話（第一句是當地語言的問候） */
  talk: string[];
  /** 節慶的裝飾 */
  festival: FestivalDecor | null;
  /** 天色：0 白天到 1 深夜（依到港的時間） */
  darkness: number;
}

/** 對話泡泡：最多幾個字換行 */
const BUBBLE_CHARS = 15;

function wrapText(text: string, n: number): string[] {
  const out: string[] = [];
  const chars = [...text];
  for (let i = 0; i < chars.length; i += n) out.push(chars.slice(i, i + n).join(''));
  return out;
}

/** 可以走動的港口城鎮：點地面走路，走進門口就進入建築 */
export function TownView({
  culture,
  appearance,
  ship,
  onEnter,
  returnFrom,
  talk,
  festival,
  darkness,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onEnterRef = useRef(onEnter);
  const lookRef = useRef(playerLook(appearance));
  const shipRef = useRef(ship);
  const talkRef = useRef(talk);
  const darkRef = useRef(darkness);
  useEffect(() => {
    onEnterRef.current = onEnter;
    lookRef.current = playerLook(appearance);
    shipRef.current = ship;
    talkRef.current = talk;
    darkRef.current = darkness;
  });

  useEffect(() => {
    const canvas = canvasRef.current!;
    const host = hostRef.current!;
    const ctx = canvas.getContext('2d')!;
    // 靜態底圖只畫一次
    const base = document.createElement('canvas');
    base.width = W;
    base.height = H;
    drawTownBase(base.getContext('2d')!, culture);
    const frame = document.createElement('canvas');
    frame.width = W;
    frame.height = H;
    const fctx = frame.getContext('2d')!;

    const start =
      (returnFrom && returnFrom !== 'dock' && BUILDINGS.find((b) => b.kind === returnFrom)?.door) ||
      SPAWN;
    const player: Walker = {
      x: start.x * TILE,
      y: start.y * TILE,
      path: [],
      facing: 'down',
      step: 0,
      look: lookRef.current,
    };
    // 從門口出來時先往下走一格，免得馬上又走進去
    let pendingEnter: BuildingKind | null = null;
    if (returnFrom && returnFrom !== 'dock') {
      const below = { x: start.x, y: start.y + 1 };
      if (isWalkable(below.x, below.y)) player.path = [below];
    }
    const folks: Walker[] = TOWNSFOLK[culture].map((look) => {
      const p = randomWalkable();
      return { x: p.x * TILE, y: p.y * TILE, path: [], facing: 'down', step: 0, look };
    });
    let marker: Point | null = null;
    // 自動化測試用：?debug 時可以查到路人的位置
    if (isDebug()) Object.assign(window, { __townFolks: folks, __townView: () => view });
    let bubble: { who: Walker; lines: string[]; until: number } | null = null;
    let nextLine = 0;
    let view = { scale: 1, ox: 0, oy: 0, dpr: 1 };

    const resize = () => {
      const r = host.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      const scale = Math.min(canvas.width / W, canvas.height / H);
      view = {
        scale,
        ox: (canvas.width - W * scale) / 2,
        oy: (canvas.height - H * scale) / 2,
        dpr,
      };
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(host);

    const move = (w: Walker, dt: number, speed: number) => {
      const next = w.path[0];
      if (!next) return false;
      const tx = next.x * TILE;
      const ty = next.y * TILE;
      const dx = tx - w.x;
      const dy = ty - w.y;
      const dist = Math.hypot(dx, dy);
      const stepPx = speed * TILE * dt;
      if (Math.abs(dx) > Math.abs(dy)) w.facing = dx > 0 ? 'right' : 'left';
      else if (dy !== 0) w.facing = dy > 0 ? 'down' : 'up';
      if (dist <= stepPx) {
        w.x = tx;
        w.y = ty;
        w.path.shift();
      } else {
        w.x += (dx / dist) * stepPx;
        w.y += (dy / dist) * stepPx;
      }
      return true;
    };

    let raf = 0;
    let last = performance.now();
    let time = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      time += dt;

      player.look = lookRef.current;
      const walking = move(player, dt, WALK_TILES_PER_SEC);
      player.step = walking ? Math.floor(time * 8) : 0;
      if (!walking && pendingEnter) {
        const kind = pendingEnter;
        pendingEnter = null;
        marker = null;
        onEnterRef.current(kind);
      }
      if (!walking && marker) marker = null;
      if (bubble && time > bubble.until) bubble = null;
      for (const f of folks) {
        if (bubble?.who === f) continue;
        if (!f.path.length && Math.random() < dt * 0.4) {
          const from = { x: Math.round(f.x / TILE), y: Math.round(f.y / TILE) };
          f.path = findPath(from, randomWalkable())?.slice(0, 8) ?? [];
        }
        const w = move(f, dt, 2);
        f.step = w ? Math.floor(time * 6) : 0;
      }

      // 畫一幀到邏輯畫布
      fctx.drawImage(base, 0, 0);
      drawWater(fctx, time);
      const s = shipRef.current;
      drawMooredShip(fctx, s.hull, s.sail, s.flag, time, s.lateen);
      // 港裡還停著幾艘當地的船
      drawLocalBoat(fctx, culture, 3 * TILE, 14 * TILE + 4, time);
      drawLocalBoat(fctx, culture, 21 * TILE, 15 * TILE, time);
      if (festival) drawFestival(fctx, festival, time);
      if (marker) {
        fctx.strokeStyle = 'rgba(181,72,43,0.9)';
        fctx.lineWidth = 1;
        fctx.strokeRect(marker.x * TILE + 2.5, marker.y * TILE + 2.5, TILE - 5, TILE - 5);
      }
      for (const w of [...folks, player].sort((a, b) => a.y - b.y)) {
        drawPerson(fctx, w.x, w.y - 4, w.facing, w.step, w.look);
      }
      drawGulls(fctx, time);
      drawTownNight(fctx, darkRef.current, time);

      // 放大到畫面（不平滑，保留像素感）
      ctx.imageSmoothingEnabled = false;
      // 畫面邊緣的海也跟著天色變暗
      const d = Math.min(1, darkRef.current) * 0.6;
      ctx.fillStyle = `rgb(${Math.round(76 - 56 * d)}, ${Math.round(132 - 92 * d)}, ${Math.round(164 - 94 * d)})`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(frame, view.ox, view.oy, W * view.scale, H * view.scale);

      // 招牌：用清楚的字體畫在放大後的畫面上
      const fs = Math.max(11, Math.round(5.2 * view.scale));
      ctx.font = `700 ${fs}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const b of BUILDINGS) {
        const name = BUILDING_NAMES[culture][b.kind];
        const cx = view.ox + (b.door.x * TILE + 8) * view.scale;
        const cy = view.oy + (b.door.y * TILE - 7) * view.scale;
        const tw = ctx.measureText(name).width + fs;
        ctx.fillStyle = '#3a2414';
        ctx.fillRect(cx - tw / 2 - 2, cy - fs * 0.75 - 2, tw + 4, fs * 1.5 + 4);
        ctx.fillStyle = '#f4e3b8';
        ctx.fillRect(cx - tw / 2, cy - fs * 0.75, tw, fs * 1.5);
        ctx.fillStyle = '#3a2414';
        ctx.fillText(name, cx, cy + 1);
      }
      // 路人說話的泡泡
      if (bubble) {
        const bfs = Math.max(12, Math.round(4.6 * view.scale));
        ctx.font = `500 ${bfs}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
        const lh = bfs * 1.35;
        const bw = Math.max(...bubble.lines.map((l) => ctx.measureText(l).width)) + bfs * 1.2;
        const bh = lh * bubble.lines.length + bfs * 0.8;
        const px = view.ox + (bubble.who.x + TILE / 2) * view.scale;
        const py = view.oy + (bubble.who.y - 8) * view.scale;
        const bx = Math.min(Math.max(4, px - bw / 2), canvas.width - bw - 4);
        const by = Math.max(4, py - bh - 10);
        ctx.fillStyle = 'rgba(58,36,20,0.9)';
        ctx.fillRect(bx - 2, by - 2, bw + 4, bh + 4);
        ctx.fillStyle = '#fbf6ea';
        ctx.fillRect(bx, by, bw, bh);
        ctx.beginPath();
        ctx.moveTo(px - 7, by + bh);
        ctx.lineTo(px + 7, by + bh);
        ctx.lineTo(px, by + bh + 10);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#2b2118';
        ctx.textAlign = 'left';
        bubble.lines.forEach((l, i) =>
          ctx.fillText(l, bx + bfs * 0.6, by + bfs * 0.4 + lh * (i + 0.5)),
        );
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const lx = ((e.clientX - r.left) * view.dpr - view.ox) / view.scale;
      const ly = ((e.clientY - r.top) * view.dpr - view.oy) / view.scale;
      // 點到路人：停下來說一句話
      const who = folks.find(
        (f) =>
          Math.abs(f.x + TILE / 2 - lx) < TILE * 0.8 && Math.abs(f.y + TILE / 2 - 4 - ly) < TILE,
      );
      const lines = talkRef.current;
      if (who && lines.length) {
        const text = lines[nextLine % lines.length];
        nextLine = nextLine === 0 ? 1 + Math.floor(Math.random() * lines.length) : nextLine + 1;
        who.path = [];
        who.step = 0;
        const dx = player.x - who.x;
        const dy = player.y - who.y;
        who.facing =
          Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
        bubble = { who, lines: wrapText(text, BUBBLE_CHARS), until: time + 5 };
        return;
      }
      const tx = Math.floor(lx / TILE);
      const ty = Math.floor(ly / TILE);
      const dest = destinationFor(tx, ty);
      if (!dest) return;
      const from = { x: Math.round(player.x / TILE), y: Math.round(player.y / TILE) };
      const path = findPath(from, dest.target);
      if (!path) return;
      player.path = path;
      pendingEnter = dest.enter;
      marker = dest.target;
      // 已經站在門口：直接進去
      if (!path.length && dest.enter) {
        pendingEnter = null;
        onEnterRef.current(dest.enter);
      }
    };
    canvas.addEventListener('pointerdown', onPointer);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointer);
    };
  }, [culture, returnFrom, festival]);

  return (
    <div className="town-view" ref={hostRef}>
      <canvas ref={canvasRef} aria-label="港口城鎮：點地面走路，走到門口進入建築，走到船邊出港" />
    </div>
  );
}
