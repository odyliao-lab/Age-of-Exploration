/**
 * 看得見的天氣（企畫書 v2 4.6）：風暴與霧是海圖上會移動的區域，玩家可以看見、選擇繞開。
 *
 * - 風暴依 environment.ts 的熱帶氣旋季節與海域生成，沿著典型路徑移動
 *   （北半球的颱風、颶風大致往西北走；西風帶的溫帶風暴往東走）；
 *   船駛進風暴範圍就要面對風暴（沿用風暴遭遇的選擇）；
 * - 春季的東海、台灣海峽常起霧：霧中看得不遠，推算位置的誤差累積更快。
 *
 * 純函式：亂數由呼叫端提供。
 */
import type { LonLat } from '@/data/schema';
import { bearingDeg, compass16, distanceKm } from '@/geo/geo';
import { destinationPoint } from './events';
import type { StormRisk, Wind } from './environment';

export interface WeatherCell {
  id: number;
  kind: 'storm' | 'fog';
  center: LonLat;
  radiusKm: number;
  /** 移動方向與速度 */
  toward: number;
  speedKmPerDay: number;
  expireDay: number;
  /** 風暴的種類與教學說明 */
  risk?: StormRisk;
  /** 已經提醒過玩家 */
  warned?: boolean;
}

/** 風暴的典型移動方向 */
export function stormTrack(kind: StormRisk['kind'], lat: number): number {
  const north = lat >= 0;
  switch (kind) {
    case 'typhoon':
      return 300;
    case 'hurricane':
      return 290;
    case 'cyclone':
      return north ? 330 : 220;
    case 'gale':
      return north ? 70 : 110;
    default:
      return 0;
  }
}

/** 風暴出現的頻率比原本「擲骰遭遇」略高，因為看得見、可以繞開 */
const STORM_SPAWN_FACTOR = 1.3;
/** 玩家在風暴範圍的這個比例以內才算闖進風暴 */
export const STORM_CORE = 0.8;
/** 風暴接近到這個距離時提醒 */
export const STORM_WARN_KM = 160;

/** 春季的東海、台灣海峽、黃海多霧 */
export function fogChancePerDay([lon, lat]: LonLat, month: number): number {
  const eastChinaSea = lon >= 117 && lon <= 128 && lat >= 22 && lat <= 38;
  if (eastChinaSea && month >= 3 && month <= 5) return 0.3;
  if (Math.abs(lat) >= 35) return 0.12;
  return 0.03;
}

export interface WeatherContext {
  player: LonLat;
  day: number;
  month: number;
  wind: Wind;
  /** 玩家所在位置的風暴風險 */
  risk: StormRisk;
  rand: () => number;
  nextId: number;
}

/** 依機率生成新的風暴與霧 */
export function spawnWeather(cells: WeatherCell[], dt: number, ctx: WeatherContext): WeatherCell[] {
  const roll = (perDay: number) => ctx.rand() < 1 - Math.pow(1 - perDay, dt);
  const out = [...cells];
  if (
    ctx.risk.kind !== 'none' &&
    !cells.some((c) => c.kind === 'storm') &&
    roll(ctx.risk.chancePerDay * STORM_SPAWN_FACTOR)
  ) {
    const toward = stormTrack(ctx.risk.kind, ctx.player[1]);
    // 從上游生成，大致會掃過玩家附近
    const from = toward + 180 + (ctx.rand() - 0.5) * 70;
    const km = 200 + ctx.rand() * 80;
    out.push({
      id: ctx.nextId,
      kind: 'storm',
      center: destinationPoint(ctx.player, from, km),
      radiusKm: 70 + ctx.rand() * 40,
      toward,
      speedKmPerDay: 110 + ctx.rand() * 40,
      expireDay: ctx.day + 5,
      risk: ctx.risk,
    });
  } else if (!cells.some((c) => c.kind === 'fog') && roll(fogChancePerDay(ctx.player, ctx.month))) {
    out.push({
      id: ctx.nextId,
      kind: 'fog',
      center: destinationPoint(ctx.player, ctx.rand() * 360, 30 + ctx.rand() * 80),
      radiusKm: 40 + ctx.rand() * 35,
      toward: ctx.wind.toward,
      speedKmPerDay: 40,
      expireDay: ctx.day + 2.5,
    });
  }
  return out;
}

export type WeatherEvent =
  | { type: 'enterStorm'; cell: WeatherCell }
  | { type: 'stormNear'; cell: WeatherCell; direction: string };

/** 移動天氣；回報玩家闖進風暴、風暴接近 */
export function moveWeather(
  cells: WeatherCell[],
  dt: number,
  player: LonLat,
  day: number,
): { cells: WeatherCell[]; events: WeatherEvent[] } {
  const events: WeatherEvent[] = [];
  const out: WeatherCell[] = [];
  for (let c of cells) {
    if (day > c.expireDay) continue;
    c = { ...c, center: destinationPoint(c.center, c.toward, c.speedKmPerDay * dt) };
    const d = distanceKm(c.center, player);
    if (d > 600) continue;
    if (c.kind === 'storm') {
      if (d <= c.radiusKm * STORM_CORE) {
        events.push({ type: 'enterStorm', cell: c });
        continue; // 面對過的風暴不再出現
      }
      if (!c.warned && d <= STORM_WARN_KM + c.radiusKm) {
        c = { ...c, warned: true };
        events.push({
          type: 'stormNear',
          cell: c,
          direction: compass16(bearingDeg(player, c.center)),
        });
      }
    }
    out.push(c);
  }
  return { cells: out, events };
}

/** 玩家是否在霧裡 */
export function inFog(cells: WeatherCell[], p: LonLat): boolean {
  return cells.some((c) => c.kind === 'fog' && distanceKm(c.center, p) <= c.radiusKm);
}

/** 霧中的瞭望距離倍率 */
export const FOG_SIGHT = 0.4;
/** 霧中的推算誤差累積倍率 */
export const FOG_DRIFT = 2;
