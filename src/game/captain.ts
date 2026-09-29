/**
 * 船長成長（企畫書 9.1）：經驗、等級、屬性點。
 * 屬性只影響難度與便利性，不作為任務門檻。
 */

export const ATTRIBUTE_KEYS = [
  'navigation',
  'geography',
  'astronomy',
  'diplomacy',
  'leadership',
] as const;
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];
export type Attributes = Record<AttributeKey, number>;

export const ATTRIBUTE_INFO: Record<AttributeKey, { name: string; effect: string }> = {
  navigation: { name: '航海術', effect: '每點航速 +5%' },
  geography: { name: '地理學', effect: '每點瞭望與地標發現範圍 +10%' },
  astronomy: { name: '天文學', effect: '每點迷航機率 -15%、觀星答對經驗 +20%' },
  diplomacy: { name: '交涉', effect: '每點補給修船 -3%、海盜談判付出 -12%' },
  leadership: { name: '領導', effect: '每點士氣流失 -5%、風暴損傷 -3%' },
};

export interface Captain {
  level: number;
  xp: number;
  /** 尚未分配的屬性點 */
  points: number;
  attrs: Attributes;
}

export function newCaptain(): Captain {
  return {
    level: 1,
    xp: 0,
    points: 0,
    attrs: { navigation: 1, geography: 1, astronomy: 1, diplomacy: 1, leadership: 1 },
  };
}

/** 從目前等級升到下一級所需經驗 */
export function xpToNext(level: number): number {
  return 100 + 50 * (level - 1);
}

export function addXp(c: Captain, amount: number): { captain: Captain; levelsGained: number } {
  let { level, xp, points } = c;
  xp += amount;
  let levelsGained = 0;
  while (xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level += 1;
    points += 1;
    levelsGained += 1;
  }
  return { captain: { ...c, level, xp, points }, levelsGained };
}

export function spendPoint(c: Captain, key: AttributeKey): Captain {
  if (c.points <= 0) return c;
  return { ...c, points: c.points - 1, attrs: { ...c.attrs, [key]: c.attrs[key] + 1 } };
}
