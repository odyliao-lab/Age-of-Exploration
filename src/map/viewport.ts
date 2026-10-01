/**
 * 地圖視角的純函式：縮放、平移與邊界限制。
 * 畫面座標 = 世界座標 × scale + (x, y)。
 */
import { WORLD_HEIGHT, WORLD_WIDTH, type Point } from './projection';

export interface View {
  x: number;
  y: number;
  scale: number;
}

export interface Size {
  width: number;
  height: number;
}

/** 最大縮放：近距離航行時約 3° 見方填滿平板畫面 */
export const MAX_SCALE = 64;

/** 最小縮放：整個世界剛好塞滿畫面的長邊 */
export function minScale(size: Size): number {
  return Math.max(size.width / WORLD_WIDTH, size.height / WORLD_HEIGHT);
}

export function clampScale(scale: number, size: Size): number {
  return Math.min(MAX_SCALE, Math.max(minScale(size), scale));
}

/** 限制平移：南北不露出地圖外的空白；東西可以無限捲動 */
export function clampView(view: View, size: Size): View {
  const scale = clampScale(view.scale, size);
  const h = WORLD_HEIGHT * scale;
  const clampAxis = (v: number, content: number, viewport: number) =>
    content <= viewport ? (viewport - content) / 2 : Math.min(0, Math.max(viewport - content, v));
  // 東西方向不限制：海圖在換日線接起來，可以一直往東或往西捲動
  return {
    scale,
    x: view.x,
    y: clampAxis(view.y, h, size.height),
  };
}

/** 以畫面上的某一點為中心縮放（滑鼠滾輪、雙指縮放用） */
export function zoomAt(view: View, factor: number, anchor: Point, size: Size): View {
  const scale = clampScale(view.scale * factor, size);
  const ratio = scale / view.scale;
  return clampView(
    {
      scale,
      x: anchor.x - (anchor.x - view.x) * ratio,
      y: anchor.y - (anchor.y - view.y) * ratio,
    },
    size,
  );
}

/** 讓某個世界座標點位於畫面中央 */
export function centerOn(world: Point, scale: number, size: Size): View {
  const s = clampScale(scale, size);
  return clampView(
    { scale: s, x: size.width / 2 - world.x * s, y: size.height / 2 - world.y * s },
    size,
  );
}

export function screenToWorld(p: Point, view: View): Point {
  return { x: (p.x - view.x) / view.scale, y: (p.y - view.y) / view.scale };
}
