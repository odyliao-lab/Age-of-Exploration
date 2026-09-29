/**
 * 外觀自訂（企畫書 9.5，Q12）：船長頭像、船旗、船身配色三項。
 * 部分樣式由成就解鎖，船身塗裝在主港造船廠購買。
 */

export interface Appearance {
  skin: number;
  hat: string;
  coat: string;
  flagColor: string;
  emblem: string;
  hull: string;
  sail: string;
  /** 已擁有的塗裝（hull:xxx / sail:xxx） */
  paints: string[];
}

export interface StyleOption {
  id: string;
  name: string;
  color?: string;
  /** 需要的成就；沒有則一開始就能用 */
  achievement?: string;
}

export const SKIN_TONES = ['#f3d2b3', '#e0b18a', '#c68f63', '#8d5a3b'];

export const HATS: StyleOption[] = [
  { id: 'none', name: '不戴帽' },
  { id: 'futou', name: '幞頭' },
  { id: 'douli', name: '斗笠' },
  { id: 'turban', name: '頭巾', achievement: 'ports-3' },
  { id: 'captain', name: '船長帽', achievement: 'level-5' },
  { id: 'feather', name: '羽飾帽', achievement: 'here-be-dragons' },
];

export const COLORS: StyleOption[] = [
  { id: 'indigo', name: '靛藍', color: '#2c4a7a' },
  { id: 'crimson', name: '朱紅', color: '#b5482b' },
  { id: 'jade', name: '青綠', color: '#2f7d6a' },
  { id: 'ochre', name: '赭黃', color: '#c79a3a' },
  { id: 'ink', name: '墨黑', color: '#2b2118' },
  { id: 'ivory', name: '象牙白', color: '#f4ecd8' },
];

export const EMBLEMS: StyleOption[] = [
  { id: 'compass', name: '羅盤' },
  { id: 'anchor', name: '船錨' },
  { id: 'star', name: '北極星', achievement: 'stargazer' },
  { id: 'wave', name: '浪花', achievement: 'storm-survivor' },
  { id: 'book', name: '書卷', achievement: 'quiz-5' },
  { id: 'sun', name: '太陽', achievement: 'tropic' },
  { id: 'globe', name: '地球', achievement: 'equator' },
  { id: 'dragon', name: '龍', achievement: 'here-be-dragons' },
];

export const HULL_PAINTS: StyleOption[] = [
  { id: 'wood', name: '原木', color: '#6b3f1f' },
  { id: 'lacquer', name: '朱漆', color: '#8e2a1c' },
  { id: 'black', name: '墨漆', color: '#2b2118' },
  { id: 'jade', name: '青漆', color: '#2f6b5a', achievement: 'codex-20' },
];

export const SAIL_PAINTS: StyleOption[] = [
  { id: 'canvas', name: '帆布', color: '#fbf6ea' },
  { id: 'ochre', name: '赭紅', color: '#c0642b' },
  { id: 'indigo', name: '靛藍', color: '#34507e' },
  { id: 'gold', name: '金黃', color: '#e0b94a', achievement: 'ports-10' },
];

export const PAINT_PRICE = 60;

export function defaultAppearance(): Appearance {
  return {
    skin: 1,
    hat: 'futou',
    coat: 'indigo',
    flagColor: 'crimson',
    emblem: 'compass',
    hull: 'wood',
    sail: 'canvas',
    paints: ['hull:wood', 'sail:canvas'],
  };
}

export function colorOf(list: StyleOption[], id: string): string {
  return list.find((o) => o.id === id)?.color ?? list[0].color ?? '#000';
}

export function optionUnlocked(o: StyleOption, achievements: string[]): boolean {
  return !o.achievement || achievements.includes(o.achievement);
}

/** 塗裝是否可用：已購買，或由成就免費解鎖 */
export function paintOwned(
  kind: 'hull' | 'sail',
  o: StyleOption,
  a: Appearance,
  achievements: string[],
): boolean {
  if (o.achievement) return achievements.includes(o.achievement);
  return a.paints.includes(`${kind}:${o.id}`);
}
