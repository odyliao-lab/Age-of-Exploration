/**
 * 看得見的海上遭遇（企畫書 v2 4.6，決策 R4 維持非暴力）：
 *
 * - 海盜快船在地圖上游蕩，發現你就追上來。它們的航速同樣受風向限制，
 *   所以把船轉到好開的角度、趁順風拉開距離，就甩得掉；被追上才需要交涉。
 * - 商船可以靠過去打招呼，交換消息或買補給。
 * - 風暴是會漂移的雲團，看到了可以繞開；待在雲團裡才會遇上風暴。
 *
 * 全部是純函式；亂數與「是不是陸地」由呼叫端提供，方便測試。
 */
import type { LonLat } from '@/data/schema';
import { bearingDeg, distanceKm } from '@/geo/geo';
import type { Wind, StormRisk } from './environment';
import { destinationPoint } from './events';
import { motion, normDeg } from './sailing';

export type FleetKind = 'pirate' | 'merchant';

export interface SeaFleet {
  id: number;
  kind: FleetKind;
  position: LonLat;
  heading: number;
  /** 游蕩、追擊、離開 */
  mode: 'roam' | 'chase' | 'leave';
  /** 出現的遊戲日（太久就離開） */
  spawnDay: number;
  /** 商船：已經打過招呼 */
  greeted: boolean;
}

export interface StormCell {
  id: number;
  center: LonLat;
  radiusKm: number;
  kind: StormRisk['kind'];
  name: string;
  /** 移動方向與速度（公里／日） */
  toward: number;
  speed: number;
  endDay: number;
  /** 地理小教室（風暴對話框用） */
  lesson: string;
}

/** 海盜多的海域：麻六甲海峽、南海南部、蘇祿海、亞丁灣；其他有名字的海域偶爾也有 */
const PIRATE_ZONES: [number, number, number, number][] = [
  [98, 0, 105, 7],
  [105, 0, 112, 6],
  [117, 4, 123, 10],
  // 亞丁灣
  [43, 10, 52, 15],
];

export function pirateChancePerDay([lon, lat]: LonLat, inNamedSea: boolean): number {
  if (PIRATE_ZONES.some((b) => lon >= b[0] && lat >= b[1] && lon <= b[2] && lat <= b[3]))
    return 0.3;
  return inNamedSea ? 0.05 : 0;
}

export const MERCHANT_CHANCE_PER_DAY = 0.35;
export const MAX_FLEETS = 2;
/** 海盜發現你並開始追的距離 */
export const PIRATE_SPOT_KM = 55;
/** 追擊中拉開到這個距離就算甩掉 */
export const PIRATE_GIVE_UP_KM = 90;
/** 被追上的距離 */
export const CONTACT_KM = 4;
/** 可以和商船打招呼的距離 */
export const HAIL_KM = 10;
/** 超過這個距離的船會消失 */
const DESPAWN_KM = 180;
const FLEET_LIFETIME_DAYS = 6;
const PIRATE_BASE_KM_PER_DAY = 175;
const MERCHANT_BASE_KM_PER_DAY = 120;

export type Rand = () => number;
export type IsLand = (p: LonLat) => boolean;

/** 在玩家周圍 70–100 公里的海面上找一個出生點 */
function spawnPoint(player: LonLat, rand: Rand, isLand: IsLand): LonLat | null {
  for (let k = 0; k < 8; k++) {
    const p = destinationPoint(player, rand() * 360, 70 + rand() * 30);
    if (!isLand(p)) return p;
  }
  return null;
}

export function spawnFleet(
  kind: FleetKind,
  id: number,
  player: LonLat,
  day: number,
  rand: Rand,
  isLand: IsLand,
): SeaFleet | null {
  const position = spawnPoint(player, rand, isLand);
  if (!position) return null;
  return {
    id,
    kind,
    position,
    heading: rand() * 360,
    mode: 'roam',
    spawnDay: day,
    greeted: false,
  };
}

export type FleetEvent =
  | { type: 'pirateChase'; fleet: SeaFleet }
  | { type: 'pirateEscaped'; fleet: SeaFleet }
  | { type: 'pirateContact'; fleet: SeaFleet };

/**
 * 推進一艘船：海盜發現玩家就追，拉開距離就放棄；撞到陸地就轉向。
 * 回傳 null 表示這艘船離開了畫面。
 */
export function stepFleet(
  f: SeaFleet,
  player: LonLat,
  wind: Wind,
  dt: number,
  day: number,
  rand: Rand,
  isLand: IsLand,
  spotKm = PIRATE_SPOT_KM,
): { fleet: SeaFleet | null; event: FleetEvent | null } {
  const dist = distanceKm(f.position, player);
  let mode = f.mode;
  let heading = f.heading;
  let event: FleetEvent | null = null;

  if (f.kind === 'pirate') {
    if (mode === 'roam' && dist < spotKm) {
      mode = 'chase';
      event = { type: 'pirateChase', fleet: f };
    } else if (mode === 'chase' && dist > PIRATE_GIVE_UP_KM) {
      mode = 'leave';
      event = { type: 'pirateEscaped', fleet: f };
    }
    if (mode === 'chase' && dist <= CONTACT_KM) {
      return { fleet: null, event: { type: 'pirateContact', fleet: f } };
    }
  }
  if (mode === 'chase') heading = bearingDeg(f.position, player);
  else if (mode === 'leave') heading = normDeg(bearingDeg(player, f.position));
  else heading = normDeg(heading + (rand() - 0.5) * 40 * dt);

  if (dist > DESPAWN_KM || day - f.spawnDay > FLEET_LIFETIME_DAYS) return { fleet: null, event };

  const base = f.kind === 'pirate' ? PIRATE_BASE_KM_PER_DAY : MERCHANT_BASE_KM_PER_DAY;
  // 海盜用三角帆快船，一樣吃不到頂風；追擊時會自己找得到風的角度
  let mv = motion(heading, 2, wind, null, f.kind === 'pirate' ? 'lateen' : 'lug', base);
  if (mode === 'chase' && mv.speed < base * 0.3) {
    // 頂風時海盜也只能斜著走（之字形），實際逼近速度變慢
    const tack = [normDeg(heading + 50), normDeg(heading - 50)]
      .map((h) => ({ h, m: motion(h, 2, wind, null, 'lateen', base) }))
      .sort((a, b) => b.m.speed - a.m.speed)[0];
    mv = { ...tack.m, speed: tack.m.speed * Math.cos((50 * Math.PI) / 180) };
    mv = { ...mv, course: heading };
  }
  const next = destinationPoint(f.position, mv.course, mv.speed * dt);
  if (isLand(next)) {
    return { fleet: { ...f, mode, heading: normDeg(heading + 90 + rand() * 90) }, event };
  }
  return { fleet: { ...f, mode, heading, position: next }, event };
}

// ---------------------------------------------------------------- 風暴雲團

/** 依這裡的風暴風險，決定每天出現一團風暴雲的機率 */
export function stormSpawnChance(risk: StormRisk): number {
  return risk.kind === 'none' ? 0 : Math.min(0.6, risk.chancePerDay * 5);
}

export function spawnStorm(
  id: number,
  player: LonLat,
  risk: StormRisk,
  wind: Wind,
  day: number,
  rand: Rand,
): StormCell {
  // 熱帶氣旋大多往西北移動；季風帶的強風跟著風走
  const tropical = risk.kind === 'typhoon' || risk.kind === 'hurricane' || risk.kind === 'cyclone';
  const toward = tropical ? normDeg(300 + rand() * 30) : wind.toward;
  // 出現在玩家「上游」120–180 公里處，會漂過來，給玩家時間繞開
  const from = normDeg(toward + 180 + (rand() - 0.5) * 80);
  return {
    id,
    center: destinationPoint(player, from, 120 + rand() * 60),
    radiusKm: tropical ? 55 + rand() * 25 : 35 + rand() * 20,
    kind: risk.kind,
    name: risk.name,
    toward,
    speed: tropical ? 140 : 90,
    endDay: day + 2.5 + rand() * 1.5,
    lesson: risk.lesson,
  };
}

export function stepStorm(s: StormCell, dt: number, day: number): StormCell | null {
  if (day > s.endDay) return null;
  return { ...s, center: destinationPoint(s.center, s.toward, s.speed * dt) };
}

export function insideStorm(storms: StormCell[], p: LonLat): StormCell | null {
  return storms.find((s) => distanceKm(s.center, p) <= s.radiusKm) ?? null;
}

/** 在風暴雲團裡每天遇上風暴的機率（邊緣較低、中心較高） */
export function stormHitChancePerDay(s: StormCell, p: LonLat): number {
  const k = 1 - distanceKm(s.center, p) / s.radiusKm;
  return 1.5 + 4 * Math.max(0, k);
}

// ---------------------------------------------------------------- 海霧

/**
 * 看得見的海霧：暖濕的空氣吹過冷的海面，水氣凝結成霧（平流霧）。
 * 待在霧裡看不遠（地圖開得少）、看不到岸形與星星、推算誤差累積更快，
 * 但海盜也不容易發現你。這時可以測深確認離岸遠近。
 */
export interface MistBank {
  id: number;
  center: LonLat;
  radiusKm: number;
  toward: number;
  speed: number;
  endDay: number;
  lesson: string;
}

interface MistZone {
  box: [number, number, number, number];
  /** 起霧的月份（含） */
  months: number[];
  chancePerDay: number;
  lesson: string;
}

const MIST_ZONES: MistZone[] = [
  {
    box: [117, 23, 127, 36],
    months: [3, 4, 5, 6, 7],
    chancePerDay: 0.35,
    lesson:
      '春天到初夏，溫暖潮濕的南風吹過東海與臺灣海峽還很冷的海面，空氣冷卻、水氣凝結，就形成濃濃的海霧（平流霧）。',
  },
  {
    box: [52, 14.5, 60, 20],
    months: [6, 7, 8, 9],
    chancePerDay: 0.45,
    lesson:
      '夏季西南季風把阿拉伯半島南岸的表層海水吹走，底下的冷水湧上來（湧升流）；潮濕的季風吹過冷水面就起霧，佐法兒沿岸的山也因此變得一片翠綠。',
  },
  {
    box: [8, -35, 19, -15],
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    chancePerDay: 0.3,
    lesson:
      '非洲西南岸外有從南極方向北上的寒冷本格拉洋流，海面很冷，吹過的空氣冷卻成霧，岸上則是乾燥的納米比沙漠。',
  },
];

export function mistZoneAt([lon, lat]: LonLat, month: number): MistZone | null {
  return (
    MIST_ZONES.find(
      (z) =>
        z.months.includes(month) &&
        lon >= z.box[0] &&
        lat >= z.box[1] &&
        lon <= z.box[2] &&
        lat <= z.box[3],
    ) ?? null
  );
}

/** 在霧裡，每天多累積的位置誤差（公里） */
export const MIST_DRIFT_KM_PER_DAY = 20;
/** 在霧裡，海盜只有這麼近才看得到你 */
export const MIST_PIRATE_SPOT_KM = 12;
/** 在霧裡的瞭望距離（公里） */
export const MIST_SIGHT_KM = 18;

export function spawnMist(
  id: number,
  player: LonLat,
  zone: MistZone,
  wind: Wind,
  day: number,
  rand: Rand,
): MistBank {
  // 霧跟著風慢慢飄，出現在玩家上風處 40–110 公里
  const from = normDeg(wind.toward + 180 + (rand() - 0.5) * 90);
  return {
    id,
    center: destinationPoint(player, from, 40 + rand() * 70),
    radiusKm: 45 + rand() * 30,
    toward: wind.toward,
    speed: 25 + rand() * 25,
    endDay: day + 1.5 + rand() * 1.5,
    lesson: zone.lesson,
  };
}

export function stepMist(m: MistBank, dt: number, day: number): MistBank | null {
  if (day > m.endDay) return null;
  return { ...m, center: destinationPoint(m.center, m.toward, m.speed * dt) };
}

export function insideMist(mists: MistBank[], p: LonLat): MistBank | null {
  return mists.find((m) => distanceKm(m.center, p) <= m.radiusKm) ?? null;
}
