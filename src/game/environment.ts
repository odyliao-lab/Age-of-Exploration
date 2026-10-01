/**
 * 航海環境（企畫書 5.2）：風、洋流、熱帶氣旋季節。
 *
 * 這是教學用的簡化氣候模型，保留國中地理會學到的主要規律：
 * - 亞洲季風：冬季（11–3 月）吹東北季風，夏季（5–9 月）吹西南季風，4、10 月為轉換期
 * - 行星風系：信風（東北信風、東南信風）、赤道無風帶、盛行西風、極地東風
 * - 主要洋流：暖流與寒流的流向
 * - 熱帶氣旋：颱風、颶風、氣旋各有好發海域與季節
 *
 * 方向一律以「風或洋流吹向／流向的方位角」表示（0 = 北，順時針）。
 * 注意：氣象上的「東北風」是指從東北吹來的風，吹向西南（225°）。
 */
import type { LonLat } from '@/data/schema';

export interface Wind {
  /** 吹向的方位角 */
  toward: number;
  /** 0（無風）到 1（強勁） */
  strength: number;
  name: string;
  /** 氣象慣用名稱：從哪個方向吹來 */
  from: string;
}

export interface Current {
  id: string;
  name: string;
  /** 暖流、寒流；季風吹送、隨季節轉向的洋流不歸類（null） */
  warm: boolean | null;
  toward: number;
  strength: number;
}

export interface StormRisk {
  /** 每天遭遇風暴的機率 */
  chancePerDay: number;
  kind: 'typhoon' | 'hurricane' | 'cyclone' | 'gale' | 'none';
  name: string;
  /** 教學說明：為什麼這裡、這個季節有風暴 */
  lesson: string;
}

const inRange = (v: number, lo: number, hi: number) => v >= lo && v <= hi;

/** 亞洲季風區：阿拉伯海、孟加拉灣、南海、東海（北半球熱帶與副熱帶） */
function inAsianMonsoon([lon, lat]: LonLat): boolean {
  return inRange(lon, 40, 145) && inRange(lat, -2, 32);
}

export function windAt(p: LonLat, month: number): Wind {
  const [, lat] = p;
  if (inAsianMonsoon(p)) {
    if (month >= 11 || month <= 3) {
      return { toward: 225, strength: 0.8, name: '東北季風', from: '東北' };
    }
    if (month >= 5 && month <= 9) {
      return { toward: 45, strength: 0.85, name: '西南季風', from: '西南' };
    }
    return { toward: 0, strength: 0.15, name: '季風轉換期（風向不定）', from: '不定' };
  }
  // 大西洋東側（葡萄牙到加那利群島外海）：副熱帶高壓的東緣吹北風，往南沿非洲走順風，回程就要繞遠路
  const [lon] = p;
  if (inRange(lon, -25, -5) && inRange(lat, 28, 44)) {
    if (month >= 5 && month <= 9) {
      return { toward: 190, strength: 0.7, name: '葡萄牙北風（夏季）', from: '北' };
    }
    if (lat < 35) return { toward: 215, strength: 0.55, name: '東北信風', from: '東北' };
  }
  const a = Math.abs(lat);
  if (a < 5) return { toward: 270, strength: 0.1, name: '赤道無風帶', from: '不定' };
  if (a < 30) {
    return lat > 0
      ? { toward: 240, strength: 0.7, name: '東北信風', from: '東北' }
      : { toward: 300, strength: 0.7, name: '東南信風', from: '東南' };
  }
  if (a < 35) return { toward: 0, strength: 0.15, name: '副熱帶無風帶（馬緯度）', from: '不定' };
  if (a < 60) {
    return lat > 0
      ? { toward: 60, strength: 0.75, name: '盛行西風', from: '西南' }
      : { toward: 110, strength: 0.85, name: '盛行西風（咆哮西風帶）', from: '西北' };
  }
  return { toward: 270, strength: 0.5, name: '極地東風', from: '東' };
}

interface CurrentZone extends Current {
  /** [西經度, 南緯度, 東經度, 北緯度] */
  box: [number, number, number, number];
  /** 只在這些月份出現（季風洋流） */
  months?: number[];
}

/** 主要洋流（以矩形近似其主流位置） */
const CURRENTS: CurrentZone[] = [
  { id: 'kuroshio', name: '黑潮', warm: true, toward: 35, strength: 0.8, box: [121, 22, 142, 36] },
  {
    id: 'scs-winter',
    name: '南海冬季季風流',
    warm: null,
    toward: 220,
    strength: 0.4,
    box: [105, 5, 120, 23],
    months: [11, 12, 1, 2, 3],
  },
  {
    id: 'scs-summer',
    name: '南海夏季季風流',
    warm: null,
    toward: 40,
    strength: 0.4,
    box: [105, 5, 120, 23],
    months: [5, 6, 7, 8, 9],
  },
  {
    id: 'gulf-stream',
    name: '墨西哥灣流',
    warm: true,
    toward: 45,
    strength: 0.9,
    box: [-80, 25, -50, 42],
  },
  {
    id: 'north-atlantic',
    name: '北大西洋暖流',
    warm: true,
    toward: 60,
    strength: 0.5,
    box: [-50, 42, -5, 60],
  },
  {
    id: 'canary',
    name: '加那利寒流',
    warm: false,
    toward: 200,
    strength: 0.5,
    box: [-25, 15, -10, 35],
  },
  {
    id: 'benguela',
    name: '本格拉寒流',
    warm: false,
    toward: 340,
    strength: 0.5,
    box: [5, -35, 18, -15],
  },
  {
    id: 'agulhas',
    name: '厄加勒斯暖流',
    warm: true,
    toward: 225,
    strength: 0.8,
    box: [26, -38, 40, -25],
  },
  {
    id: 'humboldt',
    name: '秘魯寒流（洪保德海流）',
    warm: false,
    toward: 350,
    strength: 0.6,
    box: [-82, -40, -70, -5],
  },
  {
    id: 'brazil',
    name: '巴西暖流',
    warm: true,
    toward: 200,
    strength: 0.4,
    box: [-48, -35, -32, -10],
  },
  {
    id: 'california',
    name: '加利福尼亞寒流',
    warm: false,
    toward: 160,
    strength: 0.4,
    box: [-130, 22, -115, 45],
  },
  {
    id: 'east-australian',
    name: '東澳暖流',
    warm: true,
    toward: 180,
    strength: 0.5,
    box: [150, -38, 158, -20],
  },
  {
    id: 'nio-winter',
    name: '北印度洋冬季季風流',
    warm: null,
    toward: 270,
    strength: 0.4,
    box: [60, 2, 95, 9],
    months: [11, 12, 1, 2, 3],
  },
  {
    id: 'nio-summer',
    name: '北印度洋夏季季風流',
    warm: null,
    toward: 90,
    strength: 0.45,
    box: [60, 2, 95, 9],
    months: [5, 6, 7, 8, 9],
  },
  {
    id: 'somali-summer',
    name: '索馬利洋流（夏季）',
    warm: false,
    toward: 30,
    strength: 0.8,
    box: [43, -2, 55, 12],
    months: [5, 6, 7, 8, 9],
  },
];

export function currentAt([lon, lat]: LonLat, month: number): Current | null {
  const c = CURRENTS.find(
    (z) =>
      inRange(lon, z.box[0], z.box[2]) &&
      inRange(lat, z.box[1], z.box[3]) &&
      (!z.months || z.months.includes(month)),
  );
  if (!c) return null;
  return { id: c.id, name: c.name, warm: c.warm, toward: c.toward, strength: c.strength };
}

function alignment(heading: number, toward: number): number {
  return Math.cos(((heading - toward) * Math.PI) / 180);
}

export interface SpeedFactors {
  wind: number;
  current: number;
  total: number;
  windLabel: '順風' | '逆風' | '側風' | '無風';
  currentLabel: '順流' | '逆流' | '橫流' | null;
}

/**
 * 風與洋流對航速的影響：順風最多 +30%、逆風最多 -30%（企畫書 5.2），
 * 無風帶再打六折；洋流最多 ±15%。
 */
export function speedFactors(heading: number, wind: Wind, current: Current | null): SpeedFactors {
  const wa = alignment(heading, wind.toward);
  let windF = 1 + 0.3 * wind.strength * wa;
  const calm = wind.strength < 0.2;
  if (calm) windF *= 0.6;
  const ca = current ? alignment(heading, current.toward) : 0;
  const curF = current ? 1 + 0.15 * current.strength * ca : 1;
  return {
    wind: windF,
    current: curF,
    total: windF * curF,
    windLabel: calm ? '無風' : wa > 0.4 ? '順風' : wa < -0.4 ? '逆風' : '側風',
    currentLabel: current ? (ca > 0.4 ? '順流' : ca < -0.4 ? '逆流' : '橫流') : null,
  };
}

/** 熱帶氣旋與強風的好發海域、季節（企畫書 5.2、10.1） */
export function stormRiskAt([lon, lat]: LonLat, month: number): StormRisk {
  // 西北太平洋與南海：颱風，6–11 月，8–9 月最盛
  if (inRange(lon, 105, 170) && inRange(lat, 5, 35) && month >= 6 && month <= 11) {
    const peak = month === 8 || month === 9;
    return {
      chancePerDay: peak ? 0.07 : 0.035,
      kind: 'typhoon',
      name: '颱風',
      lesson:
        '西北太平洋與南海在夏秋（6–11 月）海水溫度高，容易生成颱風，8、9 月最多。古代船隊會避開這個季節出海。',
    };
  }
  // 北大西洋與加勒比海：颶風，6–11 月
  if (inRange(lon, -100, -40) && inRange(lat, 10, 35) && month >= 6 && month <= 11) {
    return {
      chancePerDay: month >= 8 && month <= 10 ? 0.06 : 0.03,
      kind: 'hurricane',
      name: '颶風',
      lesson:
        '大西洋的熱帶氣旋叫做颶風，6–11 月是颶風季，8–10 月最強。加勒比海與墨西哥灣首當其衝。',
    };
  }
  // 北印度洋：氣旋，季風轉換期（4–5 月、10–12 月）
  if (
    inRange(lon, 50, 100) &&
    inRange(lat, 5, 23) &&
    (month === 4 || month === 5 || (month >= 10 && month <= 12))
  ) {
    return {
      chancePerDay: 0.04,
      kind: 'cyclone',
      name: '氣旋',
      lesson: '印度洋的熱帶氣旋叫做氣旋。孟加拉灣與阿拉伯海的氣旋多出現在季風轉換的春末與秋末。',
    };
  }
  // 南印度洋：氣旋，11–4 月
  if (inRange(lon, 40, 115) && inRange(lat, -25, -5) && (month >= 11 || month <= 4)) {
    return {
      chancePerDay: 0.035,
      kind: 'cyclone',
      name: '氣旋',
      lesson:
        '南半球的夏季是 11–4 月，南印度洋在這段時間容易生成熱帶氣旋，馬達加斯加一帶常受影響。',
    };
  }
  // 西風帶的溫帶風暴
  if (Math.abs(lat) >= 40 && Math.abs(lat) < 65) {
    return {
      chancePerDay: 0.02,
      kind: 'gale',
      name: '溫帶風暴',
      lesson: '中高緯度的盛行西風帶常有強烈的溫帶氣旋，南半球的「咆哮四十度」風浪尤其兇猛。',
    };
  }
  return { chancePerDay: 0, kind: 'none', name: '', lesson: '' };
}
