/**
 * 世界座標系統（企畫書 4.1）。
 *
 * 採等距圓柱投影（Plate Carrée）：經緯度與畫面座標呈線性關係，
 * 方便學生直接對照經緯度格線。世界座標原點在左上角，
 * x 向右（東）、y 向下（南），每 1 度等於 DEG_PX 個世界單位。
 */
import { geoEquirectangular } from 'd3-geo';
import type { LonLat } from '@/data/schema';
import { wrapLon } from '@/geo/geo';

export const DEG_PX = 8;
export const WORLD_WIDTH = 360 * DEG_PX;
export const WORLD_HEIGHT = 180 * DEG_PX;

/** 與 lonLatToWorld 一致的 d3 投影，供繪製海岸線使用 */
export const worldProjection = geoEquirectangular()
  .scale((DEG_PX * 180) / Math.PI)
  .translate([WORLD_WIDTH / 2, WORLD_HEIGHT / 2])
  .precision(0.1);

export interface Point {
  x: number;
  y: number;
}

export function lonLatToWorld([lon, lat]: LonLat): Point {
  return { x: (lon + 180) * DEG_PX, y: (90 - lat) * DEG_PX };
}

export function worldToLonLat({ x, y }: Point): LonLat {
  return [wrapLon(x / DEG_PX - 180), 90 - y / DEG_PX];
}

/**
 * 海圖的東西兩端在換日線接起來：世界座標的 x 可以超出 0～WORLD_WIDTH，
 * 同一個經度每隔 WORLD_WIDTH 重複一次。畫面上的東西都畫在「離鏡頭中心最近的那一圈」。
 */
let wrapAnchor = WORLD_WIDTH / 2;

/** 鏡頭中心的世界 x（WorldMap 每次移動鏡頭時更新） */
export function setWrapAnchor(x: number) {
  wrapAnchor = x;
}

/** 把世界 x 移到離鏡頭中心最近的那一圈 */
export function wrapX(x: number): number {
  return x + Math.round((wrapAnchor - x) / WORLD_WIDTH) * WORLD_WIDTH;
}

/** 經緯度 → 離鏡頭最近那一圈的世界座標 */
export function lonLatToView(lonLat: LonLat): Point {
  const p = lonLatToWorld(lonLat);
  return { x: wrapX(p.x), y: p.y };
}

/** 一串經緯度 → 連續的世界座標：跨過換日線的航線不會被拉成橫跨整張海圖的線 */
export function viewPath(points: LonLat[]): Point[] {
  const out: Point[] = [];
  for (const ll of points) {
    const p = lonLatToWorld(ll);
    const prev = out[out.length - 1];
    const ref = prev ? prev.x : wrapAnchor;
    out.push({ x: p.x + Math.round((ref - p.x) / WORLD_WIDTH) * WORLD_WIDTH, y: p.y });
  }
  return out;
}

/**
 * 以中文方位格式化經緯度，例如「北緯 24.9° 東經 118.7°」（中間以全形空白分隔）。
 * 赤道與本初子午線上不標示方位。
 */
export function formatLonLat([lon, lat]: LonLat, digits = 1): string {
  const fmt = (v: number) => Math.abs(v).toFixed(digits);
  const latText =
    Math.abs(lat) < 0.5 * 10 ** -digits ? `緯度 0°` : `${lat > 0 ? '北' : '南'}緯 ${fmt(lat)}°`;
  const lonText =
    Math.abs(lon) < 0.5 * 10 ** -digits
      ? `經度 0°`
      : Math.abs(Math.abs(lon) - 180) < 0.5 * 10 ** -digits
        ? `經度 180°`
        : `${lon > 0 ? '東' : '西'}經 ${fmt(lon)}°`;
  return `${latText}\u3000${lonText}`;
}
