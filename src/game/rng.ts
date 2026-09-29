/**
 * 可重現的亂數（mulberry32）。種子存在遊戲狀態裡，
 * 讓同一份存檔重玩時結果一致，也方便測試。
 */
export function nextRandom(seed: number): [value: number, nextSeed: number] {
  let t = (seed + 0x6d2b79f5) | 0;
  const next = t;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

export function newSeed(): number {
  return (Math.random() * 2 ** 32) | 0;
}
