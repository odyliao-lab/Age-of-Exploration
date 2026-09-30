/**
 * 把 Natural Earth 1:110m 與 1:50m 陸地資料（world-atlas，公共領域）轉成
 * 世界座標中的多邊形環，供 Pixi 繪製。
 *
 * 透過 d3 geoPath 串流投影，d3 會在國際換日線處正確切開跨越 ±180° 的多邊形
 * （例如俄羅斯東端、斐濟），避免畫出橫跨整張地圖的長條。
 */
import { geoPath, type GeoContext } from 'd3-geo';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import land110m from 'world-atlas/land-110m.json';
import { worldProjection } from './projection';

export interface LandRing {
  /** 攤平的座標 [x0, y0, x1, y1, ...] */
  points: number[];
  /** true 為外環（陸地），false 為內環（湖泊等洞） */
  outer: boolean;
}

function signedArea(points: number[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i += 2) {
    const j = (i + 2) % points.length;
    sum += points[i] * points[j + 1] - points[j] * points[i + 1];
  }
  return sum / 2;
}

/** 收集 geoPath 輸出的每個環 */
class RingRecorder implements GeoContext {
  rings: number[][] = [];
  private current: number[] | null = null;
  beginPath() {
    this.current = null;
  }
  moveTo(x: number, y: number) {
    this.current = [x, y];
    this.rings.push(this.current);
  }
  lineTo(x: number, y: number) {
    this.current?.push(x, y);
  }
  closePath() {
    this.current = null;
  }
  arc() {
    // 只有繪製點狀幾何時才會呼叫，陸地資料不會用到
  }
}

function ringsFromTopology(topo: Topology<{ land: GeometryCollection }>): LandRing[] {
  const geo = feature(topo, topo.objects.land);
  const recorder = new RingRecorder();
  geoPath(worldProjection, recorder)(geo);

  const rings = recorder.rings.filter((r) => r.length >= 6);
  // 以面積最大的環（歐亞大陸）的方向作為外環方向的基準
  const largest = rings.reduce((a, b) =>
    Math.abs(signedArea(b)) > Math.abs(signedArea(a)) ? b : a,
  );
  const outerSign = Math.sign(signedArea(largest));
  return rings.map((points) => ({
    points,
    outer: Math.sign(signedArea(points)) === outerSign,
  }));
}

let cache: LandRing[] | null = null;

/** 1:110m 陸地（隨主程式載入）：航線規劃用的陸地遮罩與全世界縮圖 */
export function getLandRings(): LandRing[] {
  cache ??= ringsFromTopology(land110m as unknown as Topology<{ land: GeometryCollection }>);
  return cache;
}

let detailed: LandRing[] | null = null;
let detailedPromise: Promise<LandRing[]> | null = null;

/**
 * 1:50m 陸地（約 5 倍細節，另外載入）：近距離航行時的海岸線繪製與碰撞判定。
 */
export function loadDetailedLand(): Promise<LandRing[]> {
  detailedPromise ??= import('world-atlas/land-50m.json').then((m) => {
    detailed = ringsFromTopology(m.default as unknown as Topology<{ land: GeometryCollection }>);
    return detailed;
  });
  return detailedPromise;
}

export function getDetailedLand(): LandRing[] | null {
  return detailed;
}
