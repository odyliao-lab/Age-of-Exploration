/**
 * 貿易（企畫書 v2 4.7，決策 R3）：價差來自地理。
 *
 * - 每個港口只賣自己的特產（港口 goods），產地價格便宜；
 * - 任何港口都收購所有貨物，離最近的產地越遠，收購價越高；
 * - 玩家大量買進會讓售價上漲、大量賣出會讓收購價下跌，隨時間慢慢恢復。
 *
 * 所以要賺錢，就得知道「什麼東西產在哪裡、哪裡缺」，這正是物產與文化的地理知識。
 */
import type { Port } from '@/data/schema';
import { distanceKm } from '@/geo/geo';

/** 貨物的基準價（每單位金幣）；產地約為基準價的一半多 */
export const GOODS_PRICE: Record<string, number> = {
  silk: 40,
  porcelain: 36,
  tea: 26,
  pepper: 30,
  cloves: 46,
  nutmeg: 50,
  tin: 22,
  sandalwood: 40,
  sappanwood: 18,
  agarwood: 56,
  'champa-rice': 8,
  'borneo-camphor': 46,
  'birds-nest': 60,
  sulfur: 16,
  cinnamon: 44,
  gemstones: 90,
  'cotton-cloth': 22,
  cowrie: 12,
  pearl: 85,
  frankincense: 48,
  myrrh: 42,
  dates: 10,
  ambergris: 95,
};

const PRODUCER_FACTOR = 0.55;
/** 離產地 4000 公里以上時的最高加價 */
const DISTANCE_PREMIUM = 0.95;
const DISTANCE_FULL_KM = 4000;
/** 每買賣一單位造成的價格波動 */
const PRESSURE_PER_UNIT = 0.025;
/** 價格波動每天恢復的比例 */
const RECOVERY_PER_DAY = 0.15;

export interface CargoLot {
  qty: number;
  /** 買進的總成本（算平均成本與利潤用） */
  cost: number;
}

export type Cargo = Record<string, CargoLot>;

/** 某港某貨的價格波動：記錄當時的值與遊戲日，讀取時依經過天數衰減 */
export interface Pressure {
  value: number;
  day: number;
}

export type Market = Record<string, Pressure>;

const key = (portId: string, good: string) => `${portId}:${good}`;

export function pressureNow(market: Market, portId: string, good: string, day: number): number {
  const p = market[key(portId, good)];
  if (!p) return 0;
  return p.value * Math.exp(-RECOVERY_PER_DAY * Math.max(0, day - p.day));
}

/** 不含波動的港口價格：產地便宜，離產地越遠越貴 */
export function basePrice(ports: Port[], port: Port, good: string): number {
  const base = GOODS_PRICE[good];
  if (base === undefined) return 0;
  if (port.goods.includes(good)) return base * PRODUCER_FACTOR;
  const producers = ports.filter((p) => p.goods.includes(good));
  const nearest = producers.length
    ? Math.min(...producers.map((p) => distanceKm(p.location, port.location)))
    : DISTANCE_FULL_KM;
  return base * (1 + DISTANCE_PREMIUM * Math.min(1, nearest / DISTANCE_FULL_KM));
}

export interface Quote {
  good: string;
  /** 買一單位要付的錢（只有產地有） */
  buy: number | null;
  /** 賣一單位拿到的錢 */
  sell: number;
}

export function quote(ports: Port[], port: Port, good: string, market: Market, day: number): Quote {
  const b = basePrice(ports, port, good);
  const f = Math.min(2.5, Math.max(0.4, 1 + pressureNow(market, port.id, good, day)));
  // 買價略高於賣價（商人要賺一點）
  return {
    good,
    buy: port.goods.includes(good) ? Math.max(1, Math.round(b * f * 1.08)) : null,
    sell: Math.max(1, Math.round(b * f * 0.92)),
  };
}

export function cargoUsed(cargo: Cargo): number {
  return Object.values(cargo).reduce((n, l) => n + l.qty, 0);
}

function push(market: Market, portId: string, good: string, day: number, delta: number): Market {
  const now = pressureNow(market, portId, good, day);
  return { ...market, [key(portId, good)]: { value: now + delta, day } };
}

export interface TradeState {
  gold: number;
  cargo: Cargo;
  market: Market;
}

/** 買進（一單位一單位計價，價格隨買進上漲）；錢或貨艙不夠時買到能買的量為止 */
export function buyGoods(
  ports: Port[],
  port: Port,
  t: TradeState,
  good: string,
  qty: number,
  capacity: number,
  day: number,
): TradeState & { bought: number; spent: number } {
  let { gold, market } = t;
  let bought = 0;
  let spent = 0;
  let room = capacity - cargoUsed(t.cargo);
  while (bought < qty && room > 0) {
    const q = quote(ports, port, good, market, day);
    if (q.buy === null || q.buy > gold) break;
    gold -= q.buy;
    spent += q.buy;
    bought++;
    room--;
    market = push(market, port.id, good, day, PRESSURE_PER_UNIT);
  }
  if (!bought) return { ...t, bought, spent };
  const lot = t.cargo[good] ?? { qty: 0, cost: 0 };
  return {
    gold,
    market,
    cargo: { ...t.cargo, [good]: { qty: lot.qty + bought, cost: lot.cost + spent } },
    bought,
    spent,
  };
}

/** 賣出（價格隨賣出下跌）；回傳收入與這批貨的利潤 */
export function sellGoods(
  ports: Port[],
  port: Port,
  t: TradeState,
  good: string,
  qty: number,
  day: number,
): TradeState & { sold: number; earned: number; profit: number } {
  const lot = t.cargo[good];
  if (!lot || lot.qty <= 0) return { ...t, sold: 0, earned: 0, profit: 0 };
  let { gold, market } = t;
  const n = Math.min(qty, lot.qty);
  let earned = 0;
  for (let i = 0; i < n; i++) {
    const q = quote(ports, port, good, market, day);
    gold += q.sell;
    earned += q.sell;
    market = push(market, port.id, good, day, -PRESSURE_PER_UNIT);
  }
  const avg = lot.cost / lot.qty;
  const costOfSold = Math.round(avg * n);
  const rest = lot.qty - n;
  const cargo = { ...t.cargo };
  if (rest > 0) cargo[good] = { qty: rest, cost: lot.cost - costOfSold };
  else delete cargo[good];
  return { gold, market, cargo, sold: n, earned, profit: earned - costOfSold };
}
