/**
 * 航線規劃與航行（企畫書 5.1）。
 * 航線由航點組成，每一段在海圖上是直線；規劃時逐段檢查是否穿越陸地。
 */
import type { LonLat } from '@/data/schema';
import { distanceKm, legLengthKm, lerpLonLat, screenHeadingDeg } from '@/geo/geo';
import { isLand } from '@/geo/landmask';

/** 港口的「港區」：港區內允許穿越陸地格（港口常位於河口或海灣深處） */
export interface Harbor {
  center: LonLat;
  radiusKm: number;
}

export interface LegCheck {
  ok: boolean;
  /** 第一個碰到陸地的位置 */
  landAt?: LonLat;
}

const SAMPLE_DEG = 0.1;

export function checkLeg(a: LonLat, b: LonLat, harbors: Harbor[]): LegCheck {
  const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / SAMPLE_DEG));
  for (let i = 0; i <= steps; i++) {
    const p = lerpLonLat(a, b, i / steps);
    if (!isLand(p)) continue;
    if (harbors.some((h) => distanceKm(h.center, p) <= h.radiusKm)) continue;
    return { ok: false, landAt: p };
  }
  return { ok: true };
}

export interface Voyage {
  /** 包含起點的所有航點 */
  waypoints: LonLat[];
  legKm: number[];
  totalKm: number;
  traveledKm: number;
  /** 終點若是港口，抵達時停泊 */
  destinationPortId: string | null;
}

export function createVoyage(waypoints: LonLat[], destinationPortId: string | null): Voyage {
  const legKm = waypoints.slice(1).map((p, i) => legLengthKm(waypoints[i], p));
  return {
    waypoints,
    legKm,
    totalKm: legKm.reduce((a, b) => a + b, 0),
    traveledKm: 0,
    destinationPortId,
  };
}

export interface VoyagePosition {
  position: LonLat;
  /** 畫面上的船頭方向（度，0 = 上） */
  heading: number;
  legIndex: number;
}

export function positionAt(v: Voyage, km: number): VoyagePosition {
  let remaining = Math.max(0, Math.min(km, v.totalKm));
  for (let i = 0; i < v.legKm.length; i++) {
    const a = v.waypoints[i];
    const b = v.waypoints[i + 1];
    if (remaining <= v.legKm[i] || i === v.legKm.length - 1) {
      const t = v.legKm[i] === 0 ? 1 : Math.min(1, remaining / v.legKm[i]);
      return { position: lerpLonLat(a, b, t), heading: screenHeadingDeg(a, b), legIndex: i };
    }
    remaining -= v.legKm[i];
  }
  return { position: v.waypoints[0], heading: 0, legIndex: 0 };
}

export function isFinished(v: Voyage): boolean {
  return v.traveledKm >= v.totalKm - 1e-6;
}
