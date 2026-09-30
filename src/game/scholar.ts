/**
 * 學者的每日小考：用你知道的港口出題，每天三題，考物產、方位、緯度與氣候。
 * 題目依遊戲日與第幾題決定（同一題重新打開不會變），答錯會排進錯題複習。
 */
import type { LearningDomain, Port } from '@/data/schema';
import { bearingDeg } from '@/geo/geo';
import { nextRandom } from './rng';

export const SCHOLAR_PER_DAY = 3;
export const SCHOLAR_REWARD = { xp: 15, gold: 10 };

export interface ScholarQuestion {
  prompt: string;
  choices: string[];
  answer: number;
  explanation: string;
  domain: LearningDomain;
}

const COMPASS_8 = ['北', '東北', '東', '東南', '南', '西南', '西', '西北'];

function compass8(b: number): number {
  return Math.round((((b % 360) + 360) % 360) / 45) % 8;
}

function shuffle(items: string[], rand: () => number): { choices: string[]; answer: number } {
  const order = items.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { choices: order.map((i) => items[i]), answer: order.indexOf(0) };
}

/**
 * 出一題。goodName 把貨物 id 轉成名字。
 * 知道的港口不到三個時沒辦法出題（回傳 null）。
 */
export function scholarQuestion(
  known: Port[],
  goodName: (id: string) => string,
  day: number,
  index: number,
): ScholarQuestion | null {
  if (known.length < 3) return null;
  let seed = (Math.floor(day) * 7919 + index * 104729) | 0;
  const rand = () => {
    const [v, n] = nextRandom(seed);
    seed = n;
    return v;
  };
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const kinds = ['goods', 'bearing', 'equator', 'climate'] as const;
  for (let attempt = 0; attempt < 8; attempt++) {
    const kind = pick([...kinds]);
    if (kind === 'goods') {
      const withGoods = known.filter((p) => p.goods.length);
      if (!withGoods.length) continue;
      const port = pick(withGoods);
      const good = pick(port.goods);
      const wrong = known.filter((p) => !p.goods.includes(good) && p.id !== port.id);
      if (wrong.length < 2) continue;
      const w1 = pick(wrong);
      const w2 = pick(wrong.filter((p) => p.id !== w1.id));
      if (!w2) continue;
      const { choices, answer } = shuffle([port.name, w1.name, w2.name], rand);
      return {
        prompt: `學者問：「${goodName(good)}」是哪一個港口的特產？`,
        choices,
        answer,
        explanation: `${port.name}出產${goodName(good)}。記住各地的物產，做生意時就知道該去哪裡買、運到哪裡賣。`,
        domain: 'F',
      };
    }
    if (kind === 'bearing') {
      const a = pick(known);
      const b = pick(known.filter((p) => p.id !== a.id));
      const dir = compass8(bearingDeg(a.location, b.location));
      // 錯誤選項避開相鄰的方位，免得太難分
      const far = [2, 4, 6].map((d) => COMPASS_8[(dir + d) % 8]);
      const { choices, answer } = shuffle([COMPASS_8[dir], far[0], far[1]], rand);
      return {
        prompt: `學者問：從${a.name}看，${b.name}大約在哪個方位？`,
        choices,
        answer,
        explanation: `${b.name}在${a.name}的${COMPASS_8[dir]}方。在海圖上找到兩個港口，從出發點往目的地畫一條線，就能判斷方位。`,
        domain: 'A',
      };
    }
    if (kind === 'equator') {
      const a = pick(known);
      const b = pick(
        known.filter((p) => Math.abs(Math.abs(p.location[1]) - Math.abs(a.location[1])) > 3),
      );
      if (!b) continue;
      const near = Math.abs(a.location[1]) < Math.abs(b.location[1]) ? a : b;
      const other = near === a ? b : a;
      const { choices, answer } = shuffle([near.name, other.name], rand);
      return {
        prompt: `學者問：${a.name}和${b.name}，哪一個比較靠近赤道？`,
        choices,
        answer,
        explanation: `${near.name}在緯度約 ${Math.abs(near.location[1]).toFixed(0)}°，${other.name}約 ${Math.abs(other.location[1]).toFixed(0)}°。緯度的數字越小，離赤道越近，通常也越熱。`,
        domain: 'A',
      };
    }
    const withClimate = known.filter((p) => p.climate);
    const climates = [...new Set(withClimate.map((p) => p.climate!))];
    if (climates.length < 3) continue;
    const port = pick(withClimate);
    const wrong = climates.filter((c) => c !== port.climate);
    const w1 = pick(wrong);
    const w2 = pick(wrong.filter((c) => c !== w1));
    if (!w2) continue;
    const { choices, answer } = shuffle([port.climate!, w1, w2], rand);
    return {
      prompt: `學者問：${port.name}屬於哪一種氣候？`,
      choices,
      answer,
      explanation: `${port.name}是${port.climate}。氣候和緯度、季風、洋流都有關係，也決定了當地長出什麼作物。`,
      domain: 'D',
    };
  }
  return null;
}
