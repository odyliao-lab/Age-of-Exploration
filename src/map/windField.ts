/**
 * 風與洋流圖：在目前看得到的海面上，每隔一段距離畫一個箭頭。
 * 深藍色是風（吹去的方向），淺藍色是洋流；箭頭越長越強。
 */
import { Graphics } from 'pixi.js';
import type { LonLat } from '@/data/schema';
import { worldToLonLat } from './projection';
import type { View } from './viewport';

export interface FieldSample {
  land: boolean;
  wind: { toward: number; strength: number };
  current: { toward: number; strength: number } | null;
}

export type FieldSampler = (p: LonLat) => FieldSample;

/** 畫面上大約每隔多少像素一個箭頭 */
const SPACING_PX = 90;

function arrow(
  g: Graphics,
  x: number,
  y: number,
  toward: number,
  len: number,
  px: number,
  color: number,
  width: number,
) {
  const rad = (toward * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = -Math.cos(rad);
  const x0 = x - (dx * len) / 2;
  const y0 = y - (dy * len) / 2;
  const x1 = x + (dx * len) / 2;
  const y1 = y + (dy * len) / 2;
  const head = 6 * px;
  g.moveTo(x0, y0)
    .lineTo(x1, y1)
    .stroke({ width: width * px, color, alpha: 0.75 });
  g.poly(
    [
      x1 + dx * head * 0.6,
      y1 + dy * head * 0.6,
      x1 - dx * head + -dy * head * 0.6,
      y1 - dy * head + dx * head * 0.6,
      x1 - dx * head - -dy * head * 0.6,
      y1 - dy * head - dx * head * 0.6,
    ],
    true,
  ).fill({ color, alpha: 0.8 });
}

export function drawWindField(
  g: Graphics,
  sampler: FieldSampler | null,
  view: View,
  size: { width: number; height: number },
) {
  g.clear();
  if (!sampler) return;
  const px = 1 / view.scale;
  const step = SPACING_PX * px;
  const left = -view.x * px;
  const top = -view.y * px;
  const right = left + size.width * px;
  const bottom = top + size.height * px;
  // 對齊世界座標的格子，平移地圖時箭頭不會跳動
  const x0 = Math.floor(left / step) * step + step / 2;
  const y0 = Math.floor(top / step) * step + step / 2;
  for (let x = x0; x < right; x += step) {
    for (let y = y0; y < bottom; y += step) {
      const ll = worldToLonLat({ x, y });
      if (Math.abs(ll[1]) > 70) continue;
      const s = sampler(ll);
      if (s.land) continue;
      const p = { x, y };
      if (s.wind.strength > 0.05) {
        arrow(g, p.x, p.y, s.wind.toward, (18 + 30 * s.wind.strength) * px, px, 0x2c4a7a, 2.2);
      }
      if (s.current) {
        arrow(
          g,
          p.x + 14 * px,
          p.y + 14 * px,
          s.current.toward,
          (10 + 18 * s.current.strength) * px,
          px,
          0x2f9fc4,
          1.6,
        );
      }
    }
  }
}
