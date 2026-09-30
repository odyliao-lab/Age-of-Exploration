/**
 * 名聲等級：回報發現、完成委託、向使節與艦隊致意都會累積名聲。
 * 名聲越高，各港商人越願意給好價錢，委託的酬勞也越高。
 */
export interface ReputationRank {
  index: number;
  title: string;
  /** 這一級的起點 */
  min: number;
  /** 下一級的起點（最高級時為 null） */
  next: number | null;
}

const RANKS: { min: number; title: string }[] = [
  { min: 0, title: '無名小卒' },
  { min: 30, title: '小有名氣' },
  { min: 80, title: '遠近馳名' },
  { min: 150, title: '名揚四海' },
  { min: 250, title: '海上傳奇' },
];

/** 每一級：買價便宜、賣價提高的比例 */
export const PRICE_PER_RANK = 0.02;
/** 每一級：委託酬勞提高的比例 */
export const CONTRACT_BONUS_PER_RANK = 0.05;

export function reputationRank(reputation: number): ReputationRank {
  let i = 0;
  while (i + 1 < RANKS.length && reputation >= RANKS[i + 1].min) i++;
  return {
    index: i,
    title: RANKS[i].title,
    min: RANKS[i].min,
    next: RANKS[i + 1]?.min ?? null,
  };
}
