/**
 * 遊戲曆法：劇本有開始日期，遊戲天數換算成年月日，月份決定季風與風暴季節。
 * 使用 UTC 計算避免時區影響（歷史日期以西曆表示）。
 */

export interface GameDate {
  year: number;
  month: number;
  day: number;
}

const DAY_MS = 86_400_000;

export function dateOf(startIso: string, day: number): GameDate {
  const [y, m, d] = startIso.split('-').map(Number);
  const t = Date.UTC(2000, m - 1, d) + Math.floor(day) * DAY_MS;
  const dt = new Date(t);
  // 以 2000 年為基準計算月日，再加回年份差，避免 Date 對極早年份的處理差異
  const yearOffset = dt.getUTCFullYear() - 2000;
  return { year: y + yearOffset, month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

export function formatDate(d: GameDate): string {
  return `${d.year} 年 ${d.month} 月 ${d.day} 日`;
}

export const SEASON_OF_MONTH = [
  '',
  '冬',
  '冬',
  '春',
  '春',
  '春',
  '夏',
  '夏',
  '夏',
  '秋',
  '秋',
  '秋',
  '冬',
];
