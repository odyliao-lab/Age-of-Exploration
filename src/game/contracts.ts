/**
 * 商人的委託：每個港口的官府每週會貼出兩張委託，要你把「這裡不產、別處才有」的貨運來。
 * 期限內送到，拿到比市價高的酬勞；過期只是委託作廢，沒有懲罰。
 * 委託都是依港口與週數算出來的，同一週看到的都一樣。
 */
import type { Port } from '@/data/schema';
import { distanceKm } from '@/geo/geo';
import { nextRandom } from './rng';
import { quote, type Market } from './trade';

export interface Contract {
  id: string;
  /** 交貨的港口（也是接委託的港口） */
  portId: string;
  good: string;
  qty: number;
  reward: number;
  /** 期限（遊戲日） */
  due: number;
}

export const MAX_CONTRACTS = 3;
/** 酬勞是目的港收購價的幾倍 */
const REWARD_FACTOR = 1.3;

function seedOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h | 0;
}

/**
 * 這個港口本週的委託。貨物要在玩家知道的港口（去過或標在海圖上）買得到，
 * 而且離這裡夠遠，才值得跑一趟。
 */
export function contractOffers(
  ports: Port[],
  portId: string,
  day: number,
  knownPorts: string[],
  market: Market,
  exclude: string[],
): Contract[] {
  const port = ports.find((p) => p.id === portId);
  if (!port) return [];
  const week = Math.floor(day / 7);
  let seed = seedOf(`${portId}#${week}`);
  const rand = () => {
    const [v, n] = nextRandom(seed);
    seed = n;
    return v;
  };
  const sources = new Map<string, number>();
  for (const p of ports) {
    if (!knownPorts.includes(p.id) || p.id === portId) continue;
    const km = distanceKm(p.location, port.location);
    for (const g of p.goods) {
      if (port.goods.includes(g) || km < 500) continue;
      sources.set(g, Math.min(sources.get(g) ?? Infinity, km));
    }
  }
  const goods = [...sources.keys()].sort();
  // 先決定這週的兩張委託，再拿掉已經接過或做完的，其他委託才不會跟著改變
  const offers: Contract[] = [];
  while (offers.length < 2 && goods.length) {
    const good = goods.splice(Math.floor(rand() * goods.length), 1)[0];
    const id = `${portId}-${week}-${good}`;
    const qty = 6 + Math.floor(rand() * 10);
    const price = quote(ports, port, good, market, day).sell;
    const reward = Math.round((price * qty * REWARD_FACTOR) / 10) * 10;
    // 期限從這週的最後一天算起，同一週看到的委託完全一樣
    const due = (week + 1) * 7 + 15 + Math.round(sources.get(good)! / 120);
    offers.push({ id, portId, good, qty, reward, due });
  }
  return offers.filter((o) => !exclude.includes(o.id));
}
