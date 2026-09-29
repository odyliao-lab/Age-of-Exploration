import { useEffect, useRef } from 'react';
import { COLORS, SKIN_TONES, colorOf, type Appearance } from '@/game/cosmetics';
import {
  drawGulls,
  drawMooredShip,
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
  captain: '#2c4a7a',
  feather: '#6b3f1f',
};

function playerLook(a: Appearance): PersonLook {
  return {
    skin: SKIN_TONES[a.skin] ?? SKIN_TONES[1],
    coat: colorOf(COLORS, a.coat),
    hat: HAT_COLORS[a.hat] ?? null,
    hair: '#2b2118',
  };
}

const TOWNSFOLK: PersonLook[] = [
  { skin: '#e0b18a', coat: '#6b8e4e', hat: null, hair: '#2b2118' },
  { skin: '#c68f63', coat: '#b5482b', hat: '#c9a86a', hair: '#2b2118' },
  { skin: '#f3d2b3', coat: '#34507e', hat: null, hair: '#4a3020' },
  { skin: '#8d5a3b', coat: '#e0b94a', hat: '#f4ecd8', hair: '#1c1410' },
  { skin: '#e0b18a', coat: '#7a5a8a', hat: null, hair: '#2b2118' },
];

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
  ship: { hull: string; sail: string; flag: string };
  /** 走進建築物或走到船邊 */
  onEnter: (kind: BuildingKind) => void;
  /** 回到城裡時，玩家站在哪棟建築的門口 */
  returnFrom: BuildingKind | null;
}

/** 可以走動的港口城鎮：點地面走路，走進門口就進入建築 */
export function TownView({ culture, appearance, ship, onEnter, returnFrom }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onEnterRef = useRef(onEnter);
  const lookRef = useRef(playerLook(appearance));
  const shipRef = useRef(ship);
  useEffect(() => {
    onEnterRef.current = onEnter;
    lookRef.current = playerLook(appearance);
    shipRef.current = ship;
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
    const folks: Walker[] = TOWNSFOLK.map((look) => {
      const p = randomWalkable();
      return { x: p.x * TILE, y: p.y * TILE, path: [], facing: 'down', step: 0, look };
    });
    let marker: Point | null = null;
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
      for (const f of folks) {
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
      drawMooredShip(fctx, s.hull, s.sail, s.flag, time);
      if (marker) {
        fctx.strokeStyle = 'rgba(181,72,43,0.9)';
        fctx.lineWidth = 1;
        fctx.strokeRect(marker.x * TILE + 2.5, marker.y * TILE + 2.5, TILE - 5, TILE - 5);
      }
      for (const w of [...folks, player].sort((a, b) => a.y - b.y)) {
        drawPerson(fctx, w.x, w.y - 4, w.facing, w.step, w.look);
      }
      drawGulls(fctx, time);

      // 放大到畫面（不平滑，保留像素感）
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#4c84a4';
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
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const onPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      const lx = ((e.clientX - r.left) * view.dpr - view.ox) / view.scale;
      const ly = ((e.clientY - r.top) * view.dpr - view.oy) / view.scale;
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
  }, [culture, returnFrom]);

  return (
    <div className="town-view" ref={hostRef}>
      <canvas ref={canvasRef} aria-label="港口城鎮：點地面走路，走到門口進入建築，走到船邊出港" />
    </div>
  );
}
