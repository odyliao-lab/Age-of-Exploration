/**
 * 看得見的海上遭遇（企畫書 v2 4.6，維持 Q10 非暴力）：海盜、商船、使節船在海圖上移動。
 *
 * - 海盜只在海盜出沒的海域出現；看見玩家就追上來。它們也是帆船，
 *   頂風一樣開不快，所以玩家可以利用風向逃跑，或逃進港口附近；
 * - 商船與使節船沿直線航行，靠近時可以打招呼。
 *
 * 純函式：亂數由呼叫端提供，陸地判定由呼叫端注入。
 */
import type { LonLat } from '@/data/schema';
import { bearingDeg, distanceKm } from '@/geo/geo';
import { destinationPoint, inPirateZone } from './events';
import type { Wind } from './environment';
import { angleOffWind, sailPolar, windPower } from './sailing';

export type TrafficKind = 'pirate' | 'merchant' | 'envoy';

export interface SeaShip {
  id: number;
  kind: TrafficKind;
  position: LonLat;
  heading: number;
  /** 超過這一天就駛離 */
  expireDay: number;
  /** 海盜：巡弋、追趕、放棄 */
  mode: 'roam' | 'chase' | 'giveUp';
  /** 開始追趕的天數 */
  chaseSince?: number;
  /** 商船的母港、使節船的國家 */
  from?: string;
}

/** 海盜發現玩家、開始追趕的距離 */
export const PIRATE_SPOT_KM = 50;
/** 拉開到這個距離，海盜就放棄 */
export const PIRATE_GIVE_UP_KM = 75;
/** 追趕超過這麼多天也會放棄 */
export const PIRATE_CHASE_DAYS = 1.5;
/** 距離港口這麼近，海盜不敢追 */
export const PIRATE_PORT_SAFE_KM = 30;
/** 被追上的距離 */
export const CATCH_KM = 5;
/** 商船、使節船打招呼的距離 */
export const HAIL_KM = 8;
/** 與玩家距離超過這個值就消失 */
const DESPAWN_KM = 220;

/** 海盜快船的基礎航速（公里／日），三角帆 */
const PIRATE_BASE = 175;
const ROAM_SPEED: Record<TrafficKind, number> = { pirate: 80, merchant: 110, envoy: 95 };

export interface TrafficContext {
  player: LonLat;
  day: number;
  wind: Wind;
  /** 玩家是否正在港口附近（海盜不敢靠近） */
  nearPort: boolean;
  isLand: (p: LonLat) => boolean;
}

export type TrafficEvent =
  | { type: 'caught'; ship: SeaShip }
  | { type: 'hail'; ship: SeaShip }
  | { type: 'spotted'; ship: SeaShip }
  | { type: 'escaped'; ship: SeaShip };

/** 海盜朝某方向前進的速度：頂風時要走之字形，實際前進很慢 */
function pirateSpeed(heading: number, wind: Wind): number {
  const eff = Math.max(sailPolar(angleOffWind(heading, wind), 'lateen'), 0.25);
  return PIRATE_BASE * eff * windPower(wind.strength);
}

/** 讓 NPC 船前進；碰到陸地時轉向 */
function sailOn(ship: SeaShip, km: number, ctx: TrafficContext): SeaShip {
  if (km <= 0) return ship;
  const next = destinationPoint(ship.position, ship.heading, km);
  if (!ctx.isLand(next)) return { ...ship, position: next };
  // 撞到陸地：轉 90 度（追趕中的海盜只是停下來）
  if (ship.mode === 'chase') return ship;
  return { ...ship, heading: (ship.heading + 90) % 360 };
}

/**
 * 推進 NPC 船隻 dt 天。回傳新的船隻列表與發生的事件（被追上、靠近打招呼、被發現、甩掉海盜）。
 * 一次最多回報一個需要玩家處理的遭遇（被追上或打招呼）。
 */
export function moveTraffic(
  ships: SeaShip[],
  dt: number,
  ctx: TrafficContext,
): { ships: SeaShip[]; events: TrafficEvent[] } {
  const events: TrafficEvent[] = [];
  const out: SeaShip[] = [];
  let met = false;
  for (let ship of ships) {
    const dist = distanceKm(ship.position, ctx.player);
    if (ctx.day > ship.expireDay || dist > DESPAWN_KM) continue;
    if (ship.kind === 'pirate') {
      if (ship.mode === 'roam' && dist < PIRATE_SPOT_KM && !ctx.nearPort) {
        ship = { ...ship, mode: 'chase', chaseSince: ctx.day };
        events.push({ type: 'spotted', ship });
      }
      if (ship.mode === 'chase') {
        const tooLong = ctx.day - (ship.chaseSince ?? ctx.day) > PIRATE_CHASE_DAYS;
        if (dist > PIRATE_GIVE_UP_KM || ctx.nearPort || tooLong) {
          ship = {
            ...ship,
            mode: 'giveUp',
            heading: (bearingDeg(ctx.player, ship.position) + 360) % 360,
            expireDay: Math.min(ship.expireDay, ctx.day + 1),
          };
          events.push({ type: 'escaped', ship });
        } else {
          const heading = bearingDeg(ship.position, ctx.player);
          const km = Math.min(dist, pirateSpeed(heading, ctx.wind) * dt);
          ship = sailOn({ ...ship, heading }, km, ctx);
          if (!met && distanceKm(ship.position, ctx.player) <= CATCH_KM) {
            met = true;
            events.push({ type: 'caught', ship });
            continue; // 被追上的海盜在遭遇結束後離開
          }
        }
      }
      if (ship.mode !== 'chase') ship = sailOn(ship, ROAM_SPEED.pirate * dt, ctx);
    } else {
      ship = sailOn(ship, ROAM_SPEED[ship.kind] * dt, ctx);
      if (!met && distanceKm(ship.position, ctx.player) <= HAIL_KM) {
        met = true;
        events.push({ type: 'hail', ship });
        continue;
      }
    }
    out.push(ship);
  }
  return { ships: out, events };
}

export interface SpawnContext extends TrafficContext {
  rand: () => number;
  /** 下一艘船的編號 */
  nextId: number;
  /** 船隻母港候選（商船）與國家候選（使節船） */
  ports: { id: string; location: LonLat }[];
  envoyCountries: string[];
  /** 玩家在已知海域內（有商船往來） */
  inRegion: boolean;
}

/** 每天出現新船的機率 */
export const SPAWN_PER_DAY = { pirate: 0.35, merchant: 0.45, envoy: 0.06 };
const MAX_SHIPS = 3;

/**
 * 依機率在玩家附近生出新的船。海盜在出沒海域外圍出現並朝玩家大致方向巡弋；
 * 商船與使節船的航線大致經過玩家附近，玩家可以選擇迎上去或避開。
 */
export function spawnTraffic(ships: SeaShip[], dt: number, ctx: SpawnContext): SeaShip[] {
  if (ships.length >= MAX_SHIPS) return ships;
  const roll = (perDay: number) => ctx.rand() < 1 - Math.pow(1 - perDay, dt);
  const has = (k: TrafficKind) => ships.some((s) => s.kind === k);
  let kind: TrafficKind | null = null;
  if (inPirateZone(ctx.player) && !has('pirate') && roll(SPAWN_PER_DAY.pirate)) kind = 'pirate';
  else if (ctx.inRegion && ships.filter((s) => s.kind === 'merchant').length < 2) {
    if (roll(SPAWN_PER_DAY.merchant)) kind = 'merchant';
  }
  if (!kind && ctx.inRegion && !has('envoy') && roll(SPAWN_PER_DAY.envoy)) kind = 'envoy';
  if (!kind) return ships;

  const bearing = ctx.rand() * 360;
  const km = kind === 'pirate' ? 60 + ctx.rand() * 20 : 45 + ctx.rand() * 35;
  const position = destinationPoint(ctx.player, bearing, km);
  if (ctx.isLand(position)) return ships;

  let heading: number;
  let from: string | undefined;
  if (kind === 'pirate') {
    // 大致朝玩家方向巡弋，偏個角度
    heading = (bearingDeg(position, ctx.player) + (ctx.rand() - 0.5) * 80 + 360) % 360;
  } else if (kind === 'merchant') {
    from = ctx.ports[Math.floor(ctx.rand() * ctx.ports.length)]?.id;
    // 航線大致經過玩家附近，玩家可以選擇迎上去或避開
    heading = (bearingDeg(position, ctx.player) + (ctx.rand() - 0.5) * 50 + 360) % 360;
  } else {
    from = ctx.envoyCountries[Math.floor(ctx.rand() * ctx.envoyCountries.length)];
    heading = (bearingDeg(position, ctx.player) + (ctx.rand() - 0.5) * 30 + 360) % 360;
  }
  return [
    ...ships,
    {
      id: ctx.nextId,
      kind,
      position,
      heading,
      expireDay: ctx.day + 3,
      mode: 'roam',
      from,
    },
  ];
}
