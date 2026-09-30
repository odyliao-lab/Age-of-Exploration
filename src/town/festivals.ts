/**
 * 港口城鎮的節慶：在對的月份到港，城裡會掛起燈籠、鋪上花毯，路人會說起這個節日。
 * 農曆節日每年的國曆日期不同，這裡取「大約在這個月」。
 */
import { hijriOf } from '@/game/hijri';
import { TILE } from './layout';

export type FestivalDecor = 'lanterns' | 'pennants' | 'flowers' | 'lamps';

export interface Festival {
  name: string;
  /** 路人說的話 */
  text: string;
  decor: FestivalDecor;
}

const CHINESE_PORTS = ['quanzhou', 'fuzhou', 'guangzhou', 'ningbo', 'taicang'];
const KERALA_PORTS = ['calicut', 'cochin', 'quilon'];

const FESTIVALS: { ports: string[]; months: number[]; festival: Festival }[] = [
  {
    ports: CHINESE_PORTS,
    months: [2],
    festival: {
      name: '元宵節',
      text: '農曆正月十五是元宵節，家家戶戶掛起花燈，晚上大家提著燈籠逛街、猜燈謎。',
      decor: 'lanterns',
    },
  },
  {
    ports: CHINESE_PORTS,
    months: [6],
    festival: {
      name: '端午節',
      text: '農曆五月初五是端午節，河上在划龍舟，家家包粽子。這時正是梅雨季，又濕又熱。',
      decor: 'pennants',
    },
  },
  {
    ports: CHINESE_PORTS,
    months: [9],
    festival: {
      name: '中秋節',
      text: '中秋節的月亮最圓，大家一邊吃月餅一邊賞月，掛念在遠方航行的家人。',
      decor: 'lanterns',
    },
  },
  {
    ports: KERALA_PORTS,
    months: [8, 9],
    festival: {
      name: '歐南節',
      text: '歐南節是我們喀拉拉的豐收節。西南季風的大雨快停了，大家在門前用花瓣鋪成圓圓的花毯。',
      decor: 'flowers',
    },
  },
  {
    ports: ['siam'],
    months: [4],
    festival: {
      name: '新年潑水節',
      text: '四月是暹羅的新年，正是一年最熱的時候。大家互相潑水祝福，把舊年的不好洗掉，也消消暑氣。再過不久雨季就要來了。',
      decor: 'pennants',
    },
  },
  {
    ports: ['lisbon'],
    months: [6],
    festival: {
      name: '聖安東尼節',
      text: '六月是里斯本的聖安東尼節。大街小巷掛起彩旗，家家戶戶在門口烤沙丁魚，大家唱歌跳舞到深夜。夏天的里斯本幾乎不下雨，最適合在戶外過節。',
      decor: 'pennants',
    },
  },
  {
    ports: ['galle'],
    months: [5],
    festival: {
      name: '衛塞節',
      text: '衛塞節紀念佛陀的誕生、成道與涅槃。月圓那天，街上掛滿彩色的燈籠，還有人請大家吃東西。',
      decor: 'lamps',
    },
  },
];

/** 信奉伊斯蘭教的港口：齋月與開齋節依伊斯蘭曆，每年大約提早 11 天 */
const MUSLIM_PORTS = [
  'arguin',
  'mozambique',
  'hormuz',
  'dhofar',
  'aden',
  'jeddah',
  'mogadishu',
  'brava',
  'malindi',
  'kilwa',
  'maldives',
  'samudera',
  'chittagong',
];

const RAMADAN: Festival = {
  name: '齋月',
  text: '現在是齋月（伊斯蘭曆九月）。大家白天不吃不喝，太陽下山後才一起開齋吃飯，晚上街上點滿了燈。伊斯蘭曆是陰曆，一年比你們的曆法短大約 11 天，所以齋月每年都會提早。',
  decor: 'lamps',
};

const EID: Festival = {
  name: '開齋節',
  text: '齋月結束了，今天是開齋節！大家穿上新衣服，到清真寺禮拜，再互相拜訪、分享甜點。',
  decor: 'pennants',
};

/** 這個港口在這一天有沒有節慶 */
export function festivalAt(
  portId: string,
  date: { year: number; month: number; day: number },
): Festival | null {
  if (MUSLIM_PORTS.includes(portId)) {
    const h = hijriOf(date);
    if (h.month === 9) return RAMADAN;
    if (h.month === 10 && h.day <= 3) return EID;
    return null;
  }
  return (
    FESTIVALS.find((f) => f.ports.includes(portId) && f.months.includes(date.month))?.festival ??
    null
  );
}

/** 主街上方的燈串與中央空地的花毯（畫在城鎮的邏輯畫布上） */
export function drawFestival(ctx: CanvasRenderingContext2D, decor: FestivalDecor, time: number) {
  const y = 6.4 * TILE;
  if (decor === 'flowers') {
    // 花毯：一圈圈不同顏色的花瓣
    const cx = 12.5 * TILE;
    const cy = 10 * TILE;
    const rings = ['#f2c14e', '#e8743b', '#d94f4f', '#f7e8a4', '#7a3b8f', '#3f8f4f'];
    rings.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(cx, cy, 22 - i * 3.6, 0, Math.PI * 2);
      ctx.fill();
    });
    return;
  }
  // 燈串：兩端之間垂下的繩子
  ctx.strokeStyle = 'rgba(58,36,20,0.7)';
  ctx.lineWidth = 1;
  const from = 1.5 * TILE;
  const to = 30.5 * TILE;
  const n = 24;
  const sag = (x: number) => Math.sin(((x - from) / (to - from)) * Math.PI * 6) ** 2 * 3;
  ctx.beginPath();
  for (let x = from; x <= to; x += 2) ctx.lineTo(x, y + sag(x));
  ctx.stroke();
  const colors =
    decor === 'lamps'
      ? ['#e8743b', '#f2c14e', '#3f7fbf', '#d94f4f', '#5aa05a']
      : decor === 'pennants'
        ? ['#d94f4f', '#f2c14e', '#3f8f4f', '#3f7fbf', '#f4ecd8']
        : ['#d33a2c'];
  for (let i = 0; i <= n; i++) {
    const x = from + ((to - from) * i) / n;
    const sway = Math.sin(time * 2 + i) * 0.8;
    const top = y + sag(x);
    ctx.fillStyle = colors[i % colors.length];
    if (decor === 'pennants') {
      ctx.beginPath();
      ctx.moveTo(x - 3, top);
      ctx.lineTo(x + 3, top);
      ctx.lineTo(x + sway, top + 7);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(x - 2.5 + sway, top + 1, 5, 6);
      ctx.fillStyle = '#f2c14e';
      ctx.fillRect(x - 1.5 + sway, top + 7, 3, 1);
    }
  }
}
