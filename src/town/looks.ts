import type { PersonLook } from './art';

const SKINS = ['#f3d2b3', '#e0b18a', '#c68f63', '#8d5a3b'];
const COATS = ['#34507e', '#7a2e1b', '#2f7d4a', '#6b3f1f', '#7a7a6a', '#b5482b', '#c79a3a'];
const HATS = ['#2b2118', '#c9a86a', null, '#34507e'];
const HAIR = ['#2b2118', '#5a5a5a', '#e8e8e8', '#1c1410'];

/** 依名字固定產生的人物外觀：同一個人每次出場都長一樣 */
export function lookForName(name: string): PersonLook {
  let h = 7;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const pick = <T>(xs: T[], k: number) => xs[(h >>> k) % xs.length];
  // 官員與使節戴官帽、穿深色官服
  const official = /官|使|太監|鄭和|王|大人/.test(name);
  return {
    skin: pick(SKINS, 3),
    coat: official ? '#7a2e1b' : pick(COATS, 7),
    hat: official ? '#2b2118' : pick(HATS, 11),
    hair: /老/.test(name) ? '#e8e8e8' : pick(HAIR, 13),
  };
}
